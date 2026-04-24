create extension if not exists pgcrypto;

create table if not exists public.order_admin_holds (
  id uuid primary key default gen_random_uuid(),
  order_id uuid not null references public.orders(id) on delete cascade,
  seller_id uuid not null references public.users(id) on delete cascade,
  buyer_id uuid not null references public.users(id) on delete cascade,
  source_type text not null check (source_type in ('product', 'seller')),
  source_id uuid not null,
  trigger_action text not null check (
    trigger_action in ('UNAPPROVE_PRODUCT', 'ARCHIVE_PRODUCT', 'SUSPEND_USER')
  ),
  reason text not null,
  status text not null default 'active' check (
    status in ('active', 'released', 'refunded', 'cancelled')
  ),
  deadline_snapshot jsonb not null default '{}'::jsonb,
  created_by uuid references public.users(id) on delete set null,
  resolved_by uuid references public.users(id) on delete set null,
  created_at timestamptz not null default now(),
  resolved_at timestamptz,
  resolution_type text,
  resolution_notes text
);

create index if not exists order_admin_holds_order_id_idx
  on public.order_admin_holds (order_id, created_at desc);

create index if not exists order_admin_holds_status_idx
  on public.order_admin_holds (status, created_at desc);

create index if not exists order_admin_holds_seller_id_idx
  on public.order_admin_holds (seller_id, status, created_at desc);

create index if not exists order_admin_holds_buyer_id_idx
  on public.order_admin_holds (buyer_id, status, created_at desc);

create unique index if not exists order_admin_holds_one_active_per_source_idx
  on public.order_admin_holds (order_id, source_type, source_id)
  where status = 'active';

alter table if exists public.seller_payouts
  add column if not exists admin_hold_active boolean not null default false,
  add column if not exists admin_hold_reason text,
  add column if not exists admin_hold_source text,
  add column if not exists admin_hold_updated_at timestamptz;

create or replace function public.user_account_status(p_user_id uuid)
returns text
language sql
stable
security definer
set search_path = public
as $$
  select coalesce(
    nullif(btrim(account_status), ''),
    nullif(btrim(status), ''),
    'active'
  )
  from public.users
  where id = p_user_id
$$;

create or replace function public.is_user_account_active(p_user_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select coalesce(public.user_account_status(p_user_id), 'active') = 'active'
$$;

create or replace function public.is_seller_marketplace_active(p_seller_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1
    from public.users
    where id = p_seller_id
      and role = 'seller'
      and coalesce(
        nullif(btrim(account_status), ''),
        nullif(btrim(status), ''),
        'active'
      ) = 'active'
  )
$$;

create or replace function public.assert_seller_marketplace_active(p_seller_id uuid)
returns void
language plpgsql
stable
security definer
set search_path = public
as $$
begin
  if p_seller_id is null then
    raise exception 'Seller is required.';
  end if;

  if not public.is_seller_marketplace_active(p_seller_id) then
    raise exception 'This seller account is not active for marketplace orders.';
  end if;
end;
$$;

create or replace function public.order_has_active_admin_hold(p_order_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1
    from public.order_admin_holds
    where order_id = p_order_id
      and status = 'active'
  )
$$;

create or replace function public.order_has_other_active_admin_holds(
  p_order_id uuid,
  p_hold_id uuid
)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1
    from public.order_admin_holds
    where order_id = p_order_id
      and status = 'active'
      and id is distinct from p_hold_id
  )
$$;

create or replace function public.apply_seller_payout_hold_state(
  p_seller_id uuid,
  p_hold_active boolean,
  p_reason text,
  p_source text
)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  if to_regclass('public.seller_payouts') is null then
    return;
  end if;

  update public.seller_payouts
  set
    admin_hold_active = p_hold_active,
    admin_hold_reason = case when p_hold_active then nullif(btrim(coalesce(p_reason, '')), '') else null end,
    admin_hold_source = case when p_hold_active then nullif(btrim(coalesce(p_source, '')), '') else null end,
    admin_hold_updated_at = now()
  where seller_id = p_seller_id
    and upper(coalesce(status, 'PENDING')) <> 'PAID';
end;
$$;

create or replace function public.sync_seller_payout_hold_state_for_user(p_seller_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_hold record;
  v_has_active_seller_holds boolean := false;
begin
  select exists (
    select 1
    from public.order_admin_holds
    where seller_id = p_seller_id
      and status = 'active'
      and (source_type = 'seller' or trigger_action = 'SUSPEND_USER')
  )
  into v_has_active_seller_holds;

  if public.is_seller_marketplace_active(p_seller_id) and not v_has_active_seller_holds then
    perform public.apply_seller_payout_hold_state(
      p_seller_id,
      false,
      null,
      null
    );
    return;
  end if;

  select reason, trigger_action
  into v_hold
  from public.order_admin_holds
  where seller_id = p_seller_id
    and status = 'active'
    and (source_type = 'seller' or trigger_action = 'SUSPEND_USER')
  order by created_at desc
  limit 1;

  perform public.apply_seller_payout_hold_state(
    p_seller_id,
    true,
    coalesce(v_hold.reason, 'Seller account is under admin review.'),
    coalesce(v_hold.trigger_action, 'SUSPEND_USER')
  );
end;
$$;

create or replace function public.create_order_admin_hold(
  p_order_id uuid,
  p_source_type text,
  p_source_id uuid,
  p_trigger_action text,
  p_reason text,
  p_created_by uuid
)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_order public.orders%rowtype;
  v_existing_hold_id uuid;
  v_hold_id uuid;
  v_reason text := nullif(btrim(coalesce(p_reason, '')), '');
  v_snapshot jsonb;
begin
  if p_order_id is null then
    raise exception 'Order is required.';
  end if;

  if p_source_type not in ('product', 'seller') then
    raise exception 'Hold source must be product or seller.';
  end if;

  if p_trigger_action not in ('UNAPPROVE_PRODUCT', 'ARCHIVE_PRODUCT', 'SUSPEND_USER') then
    raise exception 'Unsupported moderation hold trigger.';
  end if;

  if v_reason is null then
    raise exception 'A moderation hold reason is required.';
  end if;

  select *
  into v_order
  from public.orders
  where id = p_order_id
  for update;

  if not found then
    raise exception 'Order not found.';
  end if;

  if v_order.status in ('COMPLETED', 'REFUNDED', 'CANCELLED') then
    return null;
  end if;

  select id
  into v_existing_hold_id
  from public.order_admin_holds
  where order_id = p_order_id
    and source_type = p_source_type
    and source_id = p_source_id
    and status = 'active'
  limit 1;

  if v_existing_hold_id is not null then
    return v_existing_hold_id;
  end if;

  v_snapshot := jsonb_build_object(
    'ship_deadline_remaining_seconds',
    case
      when v_order.ship_deadline is null then null
      else greatest(0, floor(extract(epoch from (v_order.ship_deadline - now()))))::integer
    end,
    'delivery_deadline_remaining_seconds',
    case
      when v_order.delivery_deadline is null then null
      else greatest(0, floor(extract(epoch from (v_order.delivery_deadline - now()))))::integer
    end,
    'auto_cancel_remaining_seconds',
    case
      when v_order.auto_cancel_at is null then null
      else greatest(0, floor(extract(epoch from (v_order.auto_cancel_at - now()))))::integer
    end,
    'dispute_deadline_remaining_seconds',
    case
      when v_order.dispute_deadline is null then null
      else greatest(0, floor(extract(epoch from (v_order.dispute_deadline - now()))))::integer
    end,
    'captured_order_status',
    v_order.status
  );

  insert into public.order_admin_holds (
    order_id,
    seller_id,
    buyer_id,
    source_type,
    source_id,
    trigger_action,
    reason,
    status,
    deadline_snapshot,
    created_by
  )
  values (
    v_order.id,
    v_order.seller_id,
    v_order.buyer_id,
    p_source_type,
    p_source_id,
    p_trigger_action,
    v_reason,
    'active',
    v_snapshot,
    p_created_by
  )
  returning id into v_hold_id;

  update public.orders
  set
    ship_deadline = null,
    delivery_deadline = null,
    auto_cancel_at = null,
    dispute_deadline = null
  where id = v_order.id;

  if p_source_type = 'seller' then
    perform public.apply_seller_payout_hold_state(
      v_order.seller_id,
      true,
      v_reason,
      p_trigger_action
    );
  end if;

  return v_hold_id;
end;
$$;

create or replace function public.create_product_order_admin_holds(
  p_product_id uuid,
  p_trigger_action text,
  p_reason text,
  p_created_by uuid
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_order record;
  v_hold_id uuid;
  v_hold_ids uuid[] := '{}';
  v_hold_count integer := 0;
begin
  for v_order in
    select distinct o.id
    from public.orders o
    left join public.order_items oi
      on oi.order_id = o.id
    where o.status not in ('COMPLETED', 'REFUNDED', 'CANCELLED')
      and (
        o.product_id = p_product_id
        or oi.product_id = p_product_id
      )
  loop
    v_hold_id := public.create_order_admin_hold(
      v_order.id,
      'product',
      p_product_id,
      p_trigger_action,
      p_reason,
      p_created_by
    );

    if v_hold_id is not null and not (v_hold_id = any(v_hold_ids)) then
      v_hold_ids := array_append(v_hold_ids, v_hold_id);
      v_hold_count := v_hold_count + 1;
    end if;
  end loop;

  return jsonb_build_object(
    'hold_count', v_hold_count,
    'hold_ids', to_jsonb(coalesce(v_hold_ids, '{}'::uuid[]))
  );
end;
$$;

create or replace function public.create_seller_order_admin_holds(
  p_seller_id uuid,
  p_reason text,
  p_created_by uuid
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_order record;
  v_hold_id uuid;
  v_hold_ids uuid[] := '{}';
  v_hold_count integer := 0;
begin
  for v_order in
    select id
    from public.orders
    where seller_id = p_seller_id
      and status not in ('COMPLETED', 'REFUNDED', 'CANCELLED')
  loop
    v_hold_id := public.create_order_admin_hold(
      v_order.id,
      'seller',
      p_seller_id,
      'SUSPEND_USER',
      p_reason,
      p_created_by
    );

    if v_hold_id is not null and not (v_hold_id = any(v_hold_ids)) then
      v_hold_ids := array_append(v_hold_ids, v_hold_id);
      v_hold_count := v_hold_count + 1;
    end if;
  end loop;

  perform public.sync_seller_payout_hold_state_for_user(p_seller_id);

  return jsonb_build_object(
    'hold_count', v_hold_count,
    'hold_ids', to_jsonb(coalesce(v_hold_ids, '{}'::uuid[]))
  );
end;
$$;

create or replace function public.create_order_admin_hold_notifications()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_order_id uuid;
  v_order_number text;
  v_buyer_link text;
  v_seller_link text;
  v_admin_link text;
  v_title text;
  v_buyer_message text;
  v_seller_message text;
  v_admin_message text;
  v_metadata jsonb;
begin
  v_order_id := case when tg_op = 'INSERT' then new.order_id else old.order_id end;
  v_buyer_link := format('/buyer/orders/%s', v_order_id);
  v_seller_link := format('/seller/orders/%s', v_order_id);
  v_admin_link := format('/admin/order/%s', v_order_id);
  v_metadata := jsonb_build_object(
    'hold_id', case when tg_op = 'INSERT' then new.id else old.id end,
    'order_id', v_order_id,
    'source_type', case when tg_op = 'INSERT' then new.source_type else old.source_type end,
    'source_id', case when tg_op = 'INSERT' then new.source_id else old.source_id end,
    'trigger_action', case when tg_op = 'INSERT' then new.trigger_action else old.trigger_action end,
    'reason', case when tg_op = 'INSERT' then new.reason else old.reason end,
    'status', case when tg_op = 'INSERT' then new.status else new.status end
  );

  select coalesce(order_number, left(id::text, 8))
  into v_order_number
  from public.orders
  where id = v_order_id;

  if tg_op = 'INSERT' and new.status = 'active' then
    v_title := 'Order on admin review hold';
    v_buyer_message := format(
      'Order %s is paused while admin reviews this order. We will update you after review.',
      v_order_number
    );
    v_seller_message := format(
      'Order %s is on admin review hold. You cannot continue fulfillment until admin resolves it.',
      v_order_number
    );
    v_admin_message := format(
      'Order %s is on moderation hold and needs review. Reason: %s',
      v_order_number,
      new.reason
    );

    perform public.create_notification(
      new.buyer_id,
      'buyer',
      'order_admin_hold',
      v_title,
      v_buyer_message,
      v_buyer_link,
      v_metadata
    );

    perform public.create_notification(
      new.seller_id,
      'seller',
      'order_admin_hold',
      v_title,
      v_seller_message,
      v_seller_link,
      v_metadata
    );

    perform public.create_admin_notifications(
      'order_admin_hold',
      'Moderation hold requires review',
      v_admin_message,
      v_admin_link,
      v_metadata
    );

    return new;
  end if;

  if tg_op = 'UPDATE' and new.status is distinct from old.status then
    if new.status = 'released' then
      perform public.create_notification(
        new.buyer_id,
        'buyer',
        'order_admin_hold_released',
        'Order review completed',
        format('Admin completed the review for order %s. The order can continue.', v_order_number),
        v_buyer_link,
        v_metadata || jsonb_build_object('resolution_type', new.resolution_type)
      );

      perform public.create_notification(
        new.seller_id,
        'seller',
        'order_admin_hold_released',
        'Order review completed',
        format('Admin completed the review for order %s. The order can continue.', v_order_number),
        v_seller_link,
        v_metadata || jsonb_build_object('resolution_type', new.resolution_type)
      );
    elsif new.status = 'refunded' then
      perform public.create_notification(
        new.buyer_id,
        'buyer',
        'order_admin_hold_refunded',
        'Order refunded after review',
        format('Admin refunded order %s after review.', v_order_number),
        v_buyer_link,
        v_metadata || jsonb_build_object('resolution_type', new.resolution_type)
      );

      perform public.create_notification(
        new.seller_id,
        'seller',
        'order_admin_hold_refunded',
        'Order refunded after review',
        format('Admin refunded order %s after review.', v_order_number),
        v_seller_link,
        v_metadata || jsonb_build_object('resolution_type', new.resolution_type)
      );
    elsif new.status = 'cancelled' then
      perform public.create_notification(
        new.buyer_id,
        'buyer',
        'order_admin_hold_cancelled',
        'Order cancelled after review',
        format('Admin cancelled order %s after review.', v_order_number),
        v_buyer_link,
        v_metadata || jsonb_build_object('resolution_type', new.resolution_type)
      );

      perform public.create_notification(
        new.seller_id,
        'seller',
        'order_admin_hold_cancelled',
        'Order cancelled after review',
        format('Admin cancelled order %s after review.', v_order_number),
        v_seller_link,
        v_metadata || jsonb_build_object('resolution_type', new.resolution_type)
      );
    end if;
  end if;

  if tg_op = 'INSERT' then
    return new;
  end if;

  return new;
end;
$$;

drop trigger if exists order_admin_holds_create_notifications on public.order_admin_holds;
create trigger order_admin_holds_create_notifications
after insert or update of status on public.order_admin_holds
for each row
execute function public.create_order_admin_hold_notifications();

create or replace function public.prevent_order_progress_while_admin_hold_active()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if tg_op <> 'UPDATE' then
    return new;
  end if;

  if new.status is distinct from old.status
     and coalesce(current_setting('app.order_admin_hold_resolution', true), '') <> 'enabled'
     and exists (
       select 1
       from public.order_admin_holds
       where order_id = new.id
         and status = 'active'
     )
  then
    raise exception 'This order is on admin review hold. Admin must resolve it before the order can continue.';
  end if;

  return new;
end;
$$;

drop trigger if exists orders_prevent_progress_while_admin_hold_active on public.orders;
create trigger orders_prevent_progress_while_admin_hold_active
before update of status on public.orders
for each row
execute function public.prevent_order_progress_while_admin_hold_active();

create or replace function public.admin_resolve_order_admin_hold(
  p_hold_id uuid,
  p_resolution_type text,
  p_resolution_notes text default null
)
returns public.order_admin_holds
language plpgsql
security definer
set search_path = public
as $$
declare
  v_actor_id uuid := auth.uid();
  v_now timestamptz := now();
  v_hold public.order_admin_holds%rowtype;
  v_order public.orders%rowtype;
  v_remaining_ship integer;
  v_remaining_delivery integer;
  v_remaining_auto_cancel integer;
  v_remaining_dispute integer;
  v_next_status text;
begin
  if not public.is_admin_user(v_actor_id) then
    raise exception 'Only admins can resolve moderation holds.';
  end if;

  if p_resolution_type not in ('continue_order', 'refund_order', 'cancel_order') then
    raise exception 'Unsupported moderation hold resolution.';
  end if;

  select *
  into v_hold
  from public.order_admin_holds
  where id = p_hold_id
  for update;

  if not found then
    raise exception 'Moderation hold not found.';
  end if;

  if v_hold.status <> 'active' then
    raise exception 'Only active moderation holds can be resolved.';
  end if;

  select *
  into v_order
  from public.orders
  where id = v_hold.order_id
  for update;

  if not found then
    raise exception 'Order not found.';
  end if;

  if p_resolution_type = 'continue_order'
     and v_hold.trigger_action = 'SUSPEND_USER'
     and not public.is_seller_marketplace_active(v_hold.seller_id)
  then
    raise exception 'Reactivate the seller account before continuing this order.';
  end if;

  perform set_config('app.order_admin_hold_resolution', 'enabled', true);

  if p_resolution_type = 'continue_order' then
    update public.order_admin_holds
    set
      status = 'released',
      resolved_by = v_actor_id,
      resolved_at = v_now,
      resolution_type = p_resolution_type,
      resolution_notes = nullif(btrim(coalesce(p_resolution_notes, '')), '')
    where id = v_hold.id
    returning *
    into v_hold;

    if not public.order_has_other_active_admin_holds(v_hold.order_id, v_hold.id) then
      v_remaining_ship := nullif(v_hold.deadline_snapshot->>'ship_deadline_remaining_seconds', '')::integer;
      v_remaining_delivery := nullif(v_hold.deadline_snapshot->>'delivery_deadline_remaining_seconds', '')::integer;
      v_remaining_auto_cancel := nullif(v_hold.deadline_snapshot->>'auto_cancel_remaining_seconds', '')::integer;
      v_remaining_dispute := nullif(v_hold.deadline_snapshot->>'dispute_deadline_remaining_seconds', '')::integer;

      update public.orders
      set
        ship_deadline = case
          when status = 'PAID_ESCROW' and v_remaining_ship is not null
            then case when v_remaining_ship <= 0 then v_now else v_now + make_interval(secs => v_remaining_ship) end
          else ship_deadline
        end,
        delivery_deadline = case
          when status = 'SHIPPED' and delivery_type = 'delivery' and v_remaining_delivery is not null
            then case when v_remaining_delivery <= 0 then v_now else v_now + make_interval(secs => v_remaining_delivery) end
          else delivery_deadline
        end,
        auto_cancel_at = case
          when status = 'READY_FOR_PICKUP' and v_remaining_auto_cancel is not null
            then case when v_remaining_auto_cancel <= 0 then v_now else v_now + make_interval(secs => v_remaining_auto_cancel) end
          else auto_cancel_at
        end,
        dispute_deadline = case
          when status = 'DELIVERED' and v_remaining_dispute is not null
            then case when v_remaining_dispute <= 0 then v_now else v_now + make_interval(secs => v_remaining_dispute) end
          else dispute_deadline
        end
      where id = v_hold.order_id
      returning *
      into v_order;
    end if;
  else
    v_next_status := case
      when p_resolution_type = 'refund_order' then 'REFUNDED'
      else 'CANCELLED'
    end;

    update public.orders
    set
      status = v_next_status,
      cancelled_at = case when v_next_status in ('REFUNDED', 'CANCELLED') then v_now else cancelled_at end,
      completed_at = case when v_next_status = 'COMPLETED' then v_now else completed_at end,
      ship_deadline = null,
      delivery_deadline = null,
      auto_cancel_at = null,
      dispute_deadline = null
    where id = v_hold.order_id
    returning *
    into v_order;

    update public.order_admin_holds
    set
      status = case when p_resolution_type = 'refund_order' then 'refunded' else 'cancelled' end,
      resolved_by = v_actor_id,
      resolved_at = v_now,
      resolution_type = p_resolution_type,
      resolution_notes = nullif(btrim(coalesce(p_resolution_notes, '')), '')
    where order_id = v_hold.order_id
      and status = 'active';

    select *
    into v_hold
    from public.order_admin_holds
    where id = p_hold_id;
  end if;

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
    automated,
    requires_reason
  )
  values (
    v_actor_id,
    'order',
    v_hold.order_id,
    'RESOLVE_ORDER_HOLD',
    coalesce(nullif(btrim(coalesce(p_resolution_notes, '')), ''), v_hold.reason),
    jsonb_build_object(
      'hold_id', v_hold.id,
      'resolution_type', p_resolution_type,
      'trigger_action', v_hold.trigger_action,
      'source_type', v_hold.source_type,
      'source_id', v_hold.source_id
    ),
    jsonb_build_object(
      'hold_status', 'active',
      'order_status', v_order.status
    ),
    jsonb_build_object(
      'hold_status', v_hold.status,
      'order_status', v_order.status
    ),
    'rpc:admin_resolve_order_admin_hold',
    false,
    true
  );

  perform set_config('app.order_admin_hold_resolution', '', true);

  if v_hold.source_type = 'seller' or v_hold.trigger_action = 'SUSPEND_USER' then
    perform public.sync_seller_payout_hold_state_for_user(v_hold.seller_id);
  end if;

  return v_hold;
exception
  when others then
    perform set_config('app.order_admin_hold_resolution', '', true);
    raise;
end;
$$;

create or replace function public.sync_seller_hold_state_after_user_update()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if coalesce(new.role, '') = 'seller'
     and coalesce(
       nullif(btrim(new.account_status), ''),
       nullif(btrim(new.status), ''),
       'active'
     ) is distinct from coalesce(
       nullif(btrim(old.account_status), ''),
       nullif(btrim(old.status), ''),
       'active'
     )
  then
    perform public.sync_seller_payout_hold_state_for_user(new.id);
  end if;

  return new;
end;
$$;

drop trigger if exists users_sync_seller_hold_state_after_update on public.users;
create trigger users_sync_seller_hold_state_after_update
after update of status, account_status on public.users
for each row
execute function public.sync_seller_hold_state_after_user_update();

create or replace function public.prevent_suspended_seller_workspace_write()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_actor_id uuid := auth.uid();
  v_actor_role text;
  v_request_role text := coalesce(
    nullif(auth.role(), ''),
    current_setting('request.jwt.claim.role', true)
  );
  v_seller_id uuid;
begin
  v_seller_id := case
    when tg_op = 'DELETE' then old.seller_id
    else new.seller_id
  end;

  if v_request_role = 'service_role' then
    if tg_op = 'DELETE' then
      return old;
    end if;

    return new;
  end if;

  if v_actor_id is null or v_seller_id is null then
    if tg_op = 'DELETE' then
      return old;
    end if;

    return new;
  end if;

  select role
  into v_actor_role
  from public.users
  where id = v_actor_id;

  if v_actor_role = 'admin' then
    if tg_op = 'DELETE' then
      return old;
    end if;

    return new;
  end if;

  if v_actor_id = v_seller_id and not public.is_seller_marketplace_active(v_seller_id) then
    raise exception 'Seller account is suspended. Seller workspace changes are disabled until admin reactivates the account.';
  end if;

  if tg_op = 'DELETE' then
    return old;
  end if;

  return new;
end;
$$;

drop trigger if exists products_prevent_suspended_seller_workspace_write on public.products;
create trigger products_prevent_suspended_seller_workspace_write
before insert or update or delete on public.products
for each row
execute function public.prevent_suspended_seller_workspace_write();

do $$
begin
  if to_regclass('public.seller_fulfillment_settings') is not null then
    execute '
      drop trigger if exists seller_fulfillment_settings_prevent_suspended_seller_workspace_write on public.seller_fulfillment_settings;
      create trigger seller_fulfillment_settings_prevent_suspended_seller_workspace_write
      before insert or update or delete on public.seller_fulfillment_settings
      for each row
      execute function public.prevent_suspended_seller_workspace_write();
    ';
  end if;

  if to_regclass('public.seller_pickup_locations') is not null then
    execute '
      drop trigger if exists seller_pickup_locations_prevent_suspended_seller_workspace_write on public.seller_pickup_locations;
      create trigger seller_pickup_locations_prevent_suspended_seller_workspace_write
      before insert or update or delete on public.seller_pickup_locations
      for each row
      execute function public.prevent_suspended_seller_workspace_write();
    ';
  end if;
end $$;

create or replace function public.ensure_order_uses_active_seller()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if new.seller_id is not null then
    perform public.assert_seller_marketplace_active(new.seller_id);
  end if;

  return new;
end;
$$;

drop trigger if exists orders_ensure_active_seller on public.orders;
create trigger orders_ensure_active_seller
before insert or update of seller_id on public.orders
for each row
execute function public.ensure_order_uses_active_seller();

alter table public.order_admin_holds enable row level security;

do $$
begin
  if not exists (
    select 1
    from pg_policies
    where schemaname = 'public'
      and tablename = 'order_admin_holds'
      and policyname = 'buyers can view own moderation holds'
  ) then
    create policy "buyers can view own moderation holds"
    on public.order_admin_holds
    for select
    to authenticated
    using (buyer_id = auth.uid());
  end if;

  if not exists (
    select 1
    from pg_policies
    where schemaname = 'public'
      and tablename = 'order_admin_holds'
      and policyname = 'sellers can view own moderation holds'
  ) then
    create policy "sellers can view own moderation holds"
    on public.order_admin_holds
    for select
    to authenticated
    using (seller_id = auth.uid());
  end if;

  if not exists (
    select 1
    from pg_policies
    where schemaname = 'public'
      and tablename = 'order_admin_holds'
      and policyname = 'admins can view moderation holds'
  ) then
    create policy "admins can view moderation holds"
    on public.order_admin_holds
    for select
    to authenticated
    using (public.is_admin_user(auth.uid()));
  end if;
end $$;

revoke all on function public.create_order_admin_hold(uuid, text, uuid, text, text, uuid) from public;
revoke all on function public.create_order_admin_hold(uuid, text, uuid, text, text, uuid) from anon;
revoke all on function public.create_order_admin_hold(uuid, text, uuid, text, text, uuid) from authenticated;
grant execute on function public.create_order_admin_hold(uuid, text, uuid, text, text, uuid) to service_role;

revoke all on function public.create_product_order_admin_holds(uuid, text, text, uuid) from public;
revoke all on function public.create_product_order_admin_holds(uuid, text, text, uuid) from anon;
revoke all on function public.create_product_order_admin_holds(uuid, text, text, uuid) from authenticated;
grant execute on function public.create_product_order_admin_holds(uuid, text, text, uuid) to service_role;

revoke all on function public.create_seller_order_admin_holds(uuid, text, uuid) from public;
revoke all on function public.create_seller_order_admin_holds(uuid, text, uuid) from anon;
revoke all on function public.create_seller_order_admin_holds(uuid, text, uuid) from authenticated;
grant execute on function public.create_seller_order_admin_holds(uuid, text, uuid) to service_role;

revoke all on function public.admin_resolve_order_admin_hold(uuid, text, text) from public;
revoke all on function public.admin_resolve_order_admin_hold(uuid, text, text) from anon;
grant execute on function public.admin_resolve_order_admin_hold(uuid, text, text) to authenticated;
