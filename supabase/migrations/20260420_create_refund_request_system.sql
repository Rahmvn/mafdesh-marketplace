create extension if not exists pgcrypto;

create table if not exists public.refund_requests (
  id uuid primary key default gen_random_uuid(),
  order_id uuid not null references public.orders(id) on delete cascade,
  buyer_id uuid not null references public.users(id) on delete cascade,
  seller_id uuid not null references public.users(id) on delete cascade,
  status text not null default 'pending',
  reason text not null,
  admin_notes text,
  reviewed_by uuid references public.users(id) on delete set null,
  reviewed_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table public.refund_requests
  add column if not exists order_id uuid references public.orders(id) on delete cascade,
  add column if not exists buyer_id uuid references public.users(id) on delete cascade,
  add column if not exists seller_id uuid references public.users(id) on delete cascade,
  add column if not exists status text not null default 'pending',
  add column if not exists reason text,
  add column if not exists admin_notes text,
  add column if not exists reviewed_by uuid references public.users(id) on delete set null,
  add column if not exists reviewed_at timestamptz,
  add column if not exists created_at timestamptz not null default now(),
  add column if not exists updated_at timestamptz not null default now();

update public.refund_requests
set status = 'pending'
where status is null;

update public.refund_requests
set created_at = now()
where created_at is null;

update public.refund_requests
set updated_at = coalesce(updated_at, created_at, now())
where updated_at is null;

do $$
begin
  if not exists (
    select 1
    from pg_constraint
    where conname = 'refund_requests_status_check'
  ) then
    alter table public.refund_requests
      add constraint refund_requests_status_check
      check (status in ('pending', 'approved', 'rejected', 'cancelled'));
  end if;
end $$;

create index if not exists refund_requests_order_id_idx
  on public.refund_requests (order_id);

create index if not exists refund_requests_buyer_id_idx
  on public.refund_requests (buyer_id);

create index if not exists refund_requests_seller_id_idx
  on public.refund_requests (seller_id);

create index if not exists refund_requests_status_idx
  on public.refund_requests (status, created_at desc);

create unique index if not exists refund_requests_one_active_per_order_idx
  on public.refund_requests (order_id)
  where status = 'pending';

create or replace function public.is_admin_user(p_user_id uuid default auth.uid())
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1
    from public.users
    where id = p_user_id
      and role = 'admin'
  );
$$;

create or replace function public.assert_refund_request_eligible(
  p_order_id uuid,
  p_buyer_id uuid,
  p_reason text default null
)
returns public.orders
language plpgsql
security definer
set search_path = public
as $$
declare
  v_order public.orders%rowtype;
  v_reason text := btrim(coalesce(p_reason, ''));
begin
  if p_buyer_id is null then
    raise exception 'Authenticated session required to request a refund.';
  end if;

  if char_length(v_reason) < 20 then
    raise exception 'Refund reason must be at least 20 characters.';
  end if;

  select *
  into v_order
  from public.orders
  where id = p_order_id;

  if not found then
    raise exception 'Order not found.';
  end if;

  if v_order.buyer_id is distinct from p_buyer_id then
    raise exception 'You can only request a refund for your own orders.';
  end if;

  if v_order.status in ('CANCELLED', 'REFUNDED', 'COMPLETED', 'DISPUTED') then
    raise exception 'This order is no longer eligible for a refund request.';
  end if;

  if v_order.status in ('SHIPPED', 'READY_FOR_PICKUP', 'DELIVERED') then
    raise exception 'The seller has already acted on this order, so a refund request is not available.';
  end if;

  if v_order.status <> 'PAID_ESCROW' then
    raise exception 'Refund requests are only available for paid orders awaiting seller fulfillment.';
  end if;

  if v_order.created_at > now() - interval '48 hours' then
    raise exception 'Refund requests become available 48 hours after the order was placed.';
  end if;

  if exists (
    select 1
    from public.refund_requests
    where order_id = p_order_id
      and status = 'pending'
  ) then
    raise exception 'A refund request is already pending for this order.';
  end if;

  return v_order;
end;
$$;

create or replace function public.prepare_refund_request_write()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_actor_id uuid := auth.uid();
  v_is_admin boolean := public.is_admin_user(v_actor_id);
  v_internal_actor text := current_setting('app.refund_system_actor', true);
  v_order public.orders%rowtype;
begin
  if tg_op = 'INSERT' then
    v_order := public.assert_refund_request_eligible(new.order_id, v_actor_id, new.reason);

    new.buyer_id := v_order.buyer_id;
    new.seller_id := v_order.seller_id;
    new.status := 'pending';
    new.reason := btrim(new.reason);
    new.admin_notes := null;
    new.reviewed_by := null;
    new.reviewed_at := null;
    new.created_at := coalesce(new.created_at, now());
    new.updated_at := now();
    return new;
  end if;

  new.updated_at := now();

  if new.id is distinct from old.id
    or new.order_id is distinct from old.order_id
    or new.buyer_id is distinct from old.buyer_id
    or new.seller_id is distinct from old.seller_id
    or new.reason is distinct from old.reason
    or new.created_at is distinct from old.created_at
  then
    raise exception 'Refund request details cannot be changed after submission.';
  end if;

  if coalesce(v_internal_actor, '') = 'auto_cancel' then
    if old.status <> 'pending' or new.status <> 'cancelled' then
      raise exception 'Automatic refund cancellation is only allowed for pending requests.';
    end if;

    new.admin_notes := old.admin_notes;
    new.reviewed_by := old.reviewed_by;
    new.reviewed_at := old.reviewed_at;
    return new;
  end if;

  if v_is_admin then
    if old.status <> 'pending' then
      raise exception 'Only pending refund requests can be reviewed.';
    end if;

    if new.status = 'approved' then
      new.admin_notes := nullif(btrim(coalesce(new.admin_notes, '')), '');
      new.reviewed_by := v_actor_id;
      new.reviewed_at := coalesce(new.reviewed_at, now());
      return new;
    end if;

    if new.status = 'rejected' then
      if char_length(btrim(coalesce(new.admin_notes, ''))) = 0 then
        raise exception 'A rejection reason is required.';
      end if;

      new.admin_notes := btrim(new.admin_notes);
      new.reviewed_by := v_actor_id;
      new.reviewed_at := coalesce(new.reviewed_at, now());
      return new;
    end if;

    raise exception 'Admins can only approve or reject pending refund requests.';
  end if;

  if v_actor_id is not null and v_actor_id = old.buyer_id then
    if old.status <> 'pending' or new.status <> 'cancelled' then
      raise exception 'You can only cancel a pending refund request.';
    end if;

    new.admin_notes := old.admin_notes;
    new.reviewed_by := old.reviewed_by;
    new.reviewed_at := old.reviewed_at;
    return new;
  end if;

  raise exception 'You are not allowed to modify this refund request.';
end;
$$;

create or replace function public.handle_refund_request_status_change()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_order public.orders%rowtype;
  v_reason text;
begin
  if new.status = old.status then
    return new;
  end if;

  if new.status = 'approved' and old.status = 'pending' then
    select *
    into v_order
    from public.orders
    where id = new.order_id
    for update;

    if not found then
      raise exception 'Order not found for this refund request.';
    end if;

    if v_order.status <> 'PAID_ESCROW' then
      raise exception 'Refund request can no longer be approved because the order status is %.', v_order.status;
    end if;

    update public.orders
    set status = 'REFUNDED',
        cancelled_at = coalesce(cancelled_at, now()),
        ship_deadline = null,
        auto_cancel_at = null,
        auto_complete_at = null,
        dispute_deadline = null
    where id = new.order_id;

    v_reason := coalesce(new.admin_notes, 'Approved refund request after seller inactivity.');

    insert into public.admin_actions (
      admin_id,
      target_type,
      target_id,
      action_type,
      reason,
      metadata,
      previous_state,
      new_state,
      source,
      requires_reason,
      automated
    )
    values (
      new.reviewed_by,
      'order',
      new.order_id::text,
      'APPROVE_REFUND_REQUEST',
      v_reason,
      jsonb_build_object(
        'refund_request_id', new.id,
        'order_id', new.order_id,
        'buyer_id', new.buyer_id,
        'seller_id', new.seller_id,
        'refund_reason', new.reason
      ),
      jsonb_build_object(
        'order_status', v_order.status,
        'refund_request_status', old.status
      ),
      jsonb_build_object(
        'order_status', 'REFUNDED',
        'refund_request_status', new.status
      ),
      'refund_request',
      false,
      false
    );
  elsif new.status = 'rejected' and old.status = 'pending' then
    insert into public.admin_actions (
      admin_id,
      target_type,
      target_id,
      action_type,
      reason,
      metadata,
      previous_state,
      new_state,
      source,
      requires_reason,
      automated
    )
    values (
      new.reviewed_by,
      'order',
      new.order_id::text,
      'REJECT_REFUND_REQUEST',
      new.admin_notes,
      jsonb_build_object(
        'refund_request_id', new.id,
        'order_id', new.order_id,
        'buyer_id', new.buyer_id,
        'seller_id', new.seller_id,
        'refund_reason', new.reason
      ),
      jsonb_build_object(
        'refund_request_status', old.status
      ),
      jsonb_build_object(
        'refund_request_status', new.status
      ),
      'refund_request',
      true,
      false
    );
  end if;

  return new;
end;
$$;

drop trigger if exists refund_requests_prepare_write on public.refund_requests;
create trigger refund_requests_prepare_write
before insert or update on public.refund_requests
for each row
execute function public.prepare_refund_request_write();

drop trigger if exists refund_requests_handle_status_change on public.refund_requests;
create trigger refund_requests_handle_status_change
after update on public.refund_requests
for each row
execute function public.handle_refund_request_status_change();

create or replace function public.create_refund_request(
  p_order_id uuid,
  p_reason text
)
returns public.refund_requests
language plpgsql
security definer
set search_path = public
as $$
declare
  v_actor_id uuid := auth.uid();
  v_order public.orders%rowtype;
  v_request public.refund_requests%rowtype;
begin
  v_order := public.assert_refund_request_eligible(p_order_id, v_actor_id, p_reason);

  insert into public.refund_requests (
    order_id,
    buyer_id,
    seller_id,
    reason
  )
  values (
    v_order.id,
    v_order.buyer_id,
    v_order.seller_id,
    btrim(p_reason)
  )
  returning *
  into v_request;

  return v_request;
end;
$$;

create or replace function public.cancel_refund_request(
  p_request_id uuid
)
returns public.refund_requests
language plpgsql
security definer
set search_path = public
as $$
declare
  v_actor_id uuid := auth.uid();
  v_request public.refund_requests%rowtype;
begin
  if v_actor_id is null then
    raise exception 'Authenticated session required to cancel a refund request.';
  end if;

  select *
  into v_request
  from public.refund_requests
  where id = p_request_id
  for update;

  if not found then
    raise exception 'Refund request not found.';
  end if;

  if v_request.buyer_id is distinct from v_actor_id then
    raise exception 'You can only cancel your own refund request.';
  end if;

  if v_request.status <> 'pending' then
    raise exception 'Only pending refund requests can be cancelled.';
  end if;

  update public.refund_requests
  set status = 'cancelled'
  where id = p_request_id
  returning *
  into v_request;

  return v_request;
end;
$$;

create or replace function public.approve_refund_request(
  p_request_id uuid,
  p_admin_notes text default null
)
returns public.refund_requests
language plpgsql
security definer
set search_path = public
as $$
declare
  v_actor_id uuid := auth.uid();
  v_request public.refund_requests%rowtype;
begin
  if not public.is_admin_user(v_actor_id) then
    raise exception 'Only admins can approve refund requests.';
  end if;

  select *
  into v_request
  from public.refund_requests
  where id = p_request_id
  for update;

  if not found then
    raise exception 'Refund request not found.';
  end if;

  if v_request.status <> 'pending' then
    raise exception 'Only pending refund requests can be approved.';
  end if;

  update public.refund_requests
  set status = 'approved',
      admin_notes = nullif(btrim(coalesce(p_admin_notes, '')), ''),
      reviewed_by = v_actor_id,
      reviewed_at = now()
  where id = p_request_id
  returning *
  into v_request;

  return v_request;
end;
$$;

create or replace function public.reject_refund_request(
  p_request_id uuid,
  p_admin_notes text
)
returns public.refund_requests
language plpgsql
security definer
set search_path = public
as $$
declare
  v_actor_id uuid := auth.uid();
  v_request public.refund_requests%rowtype;
  v_notes text := btrim(coalesce(p_admin_notes, ''));
begin
  if not public.is_admin_user(v_actor_id) then
    raise exception 'Only admins can reject refund requests.';
  end if;

  if char_length(v_notes) = 0 then
    raise exception 'A rejection reason is required.';
  end if;

  select *
  into v_request
  from public.refund_requests
  where id = p_request_id
  for update;

  if not found then
    raise exception 'Refund request not found.';
  end if;

  if v_request.status <> 'pending' then
    raise exception 'Only pending refund requests can be rejected.';
  end if;

  update public.refund_requests
  set status = 'rejected',
      admin_notes = v_notes,
      reviewed_by = v_actor_id,
      reviewed_at = now()
  where id = p_request_id
  returning *
  into v_request;

  return v_request;
end;
$$;

create or replace function public.auto_cancel_refund_on_fulfillment()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if new.status in ('SHIPPED', 'READY_FOR_PICKUP')
    and old.status = 'PAID_ESCROW'
    and new.status is distinct from old.status
  then
    perform set_config('app.refund_system_actor', 'auto_cancel', true);

    update public.refund_requests
    set status = 'cancelled'
    where order_id = new.id
      and status = 'pending';

    perform set_config('app.refund_system_actor', '', true);
  end if;

  return new;
end;
$$;

drop trigger if exists orders_auto_cancel_refund_on_fulfillment on public.orders;
create trigger orders_auto_cancel_refund_on_fulfillment
after update of status on public.orders
for each row
execute function public.auto_cancel_refund_on_fulfillment();

alter table public.refund_requests enable row level security;

do $$
begin
  if not exists (
    select 1
    from pg_policies
    where schemaname = 'public'
      and tablename = 'refund_requests'
      and policyname = 'buyers can view own refund requests'
  ) then
    create policy "buyers can view own refund requests"
    on public.refund_requests
    for select
    to authenticated
    using (buyer_id = auth.uid());
  end if;

  if not exists (
    select 1
    from pg_policies
    where schemaname = 'public'
      and tablename = 'refund_requests'
      and policyname = 'sellers can view refund requests for own orders'
  ) then
    create policy "sellers can view refund requests for own orders"
    on public.refund_requests
    for select
    to authenticated
    using (seller_id = auth.uid());
  end if;

  if not exists (
    select 1
    from pg_policies
    where schemaname = 'public'
      and tablename = 'refund_requests'
      and policyname = 'admins can view all refund requests'
  ) then
    create policy "admins can view all refund requests"
    on public.refund_requests
    for select
    to authenticated
    using (public.is_admin_user(auth.uid()));
  end if;

  if not exists (
    select 1
    from pg_policies
    where schemaname = 'public'
      and tablename = 'refund_requests'
      and policyname = 'buyers can insert own refund requests'
  ) then
    create policy "buyers can insert own refund requests"
    on public.refund_requests
    for insert
    to authenticated
    with check (buyer_id = auth.uid());
  end if;

  if not exists (
    select 1
    from pg_policies
    where schemaname = 'public'
      and tablename = 'refund_requests'
      and policyname = 'buyers can update own refund requests'
  ) then
    create policy "buyers can update own refund requests"
    on public.refund_requests
    for update
    to authenticated
    using (buyer_id = auth.uid())
    with check (buyer_id = auth.uid());
  end if;

  if not exists (
    select 1
    from pg_policies
    where schemaname = 'public'
      and tablename = 'refund_requests'
      and policyname = 'admins can review refund requests'
  ) then
    create policy "admins can review refund requests"
    on public.refund_requests
    for update
    to authenticated
    using (public.is_admin_user(auth.uid()))
    with check (public.is_admin_user(auth.uid()));
  end if;
end $$;

revoke all on function public.create_refund_request(uuid, text) from public;
revoke all on function public.cancel_refund_request(uuid) from public;
revoke all on function public.approve_refund_request(uuid, text) from public;
revoke all on function public.reject_refund_request(uuid, text) from public;

grant execute on function public.create_refund_request(uuid, text) to authenticated;
grant execute on function public.cancel_refund_request(uuid) to authenticated;
grant execute on function public.approve_refund_request(uuid, text) to authenticated;
grant execute on function public.reject_refund_request(uuid, text) to authenticated;
