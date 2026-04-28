create extension if not exists pgcrypto;

create table if not exists public.dispute_messages (
  id uuid primary key default gen_random_uuid(),
  order_id uuid not null references public.orders(id) on delete cascade,
  sender_id uuid not null references public.users(id) on delete cascade,
  sender_role text not null check (sender_role in ('buyer', 'seller', 'admin')),
  -- Keep message nullable to match the existing RPC + trigger flow,
  -- which already allows image-only dispute updates.
  message text,
  images text[] not null default '{}'::text[],
  created_at timestamptz not null default now(),
  constraint dispute_messages_content_check check (
    nullif(btrim(coalesce(message, '')), '') is not null
    or coalesce(array_length(images, 1), 0) > 0
  )
);

create index if not exists dispute_messages_order_id_idx
  on public.dispute_messages (order_id, created_at asc);

alter table public.dispute_messages enable row level security;

revoke all on public.dispute_messages from public;
revoke all on public.dispute_messages from anon;
grant select, insert on public.dispute_messages to authenticated;
grant all on public.dispute_messages to service_role;

do $$
begin
  if exists (
    select 1
    from pg_policies
    where schemaname = 'public'
      and tablename = 'dispute_messages'
      and policyname = 'buyers can read own dispute messages'
  ) then
    drop policy "buyers can read own dispute messages" on public.dispute_messages;
  end if;

  create policy "buyers can read own dispute messages"
  on public.dispute_messages
  for select
  to authenticated
  using (
    exists (
      select 1
      from public.orders
      where orders.id = dispute_messages.order_id
        and orders.buyer_id = auth.uid()
    )
  );
end $$;

do $$
begin
  if exists (
    select 1
    from pg_policies
    where schemaname = 'public'
      and tablename = 'dispute_messages'
      and policyname = 'sellers can read own dispute messages'
  ) then
    drop policy "sellers can read own dispute messages" on public.dispute_messages;
  end if;

  create policy "sellers can read own dispute messages"
  on public.dispute_messages
  for select
  to authenticated
  using (
    exists (
      select 1
      from public.orders
      where orders.id = dispute_messages.order_id
        and orders.seller_id = auth.uid()
    )
  );
end $$;

do $$
begin
  if exists (
    select 1
    from pg_policies
    where schemaname = 'public'
      and tablename = 'dispute_messages'
      and policyname = 'admins can read all dispute messages'
  ) then
    drop policy "admins can read all dispute messages" on public.dispute_messages;
  end if;

  create policy "admins can read all dispute messages"
  on public.dispute_messages
  for select
  to authenticated
  using (
    exists (
      select 1
      from public.users
      where users.id = auth.uid()
        and users.role = 'admin'
    )
  );
end $$;

do $$
begin
  if exists (
    select 1
    from pg_policies
    where schemaname = 'public'
      and tablename = 'dispute_messages'
      and policyname = 'parties can insert dispute messages'
  ) then
    drop policy "parties can insert dispute messages" on public.dispute_messages;
  end if;

  create policy "parties can insert dispute messages"
  on public.dispute_messages
  for insert
  to authenticated
  with check (
    sender_id = auth.uid()
    and exists (
      select 1
      from public.orders
      where orders.id = dispute_messages.order_id
        and orders.status = 'DISPUTED'
        and (
          orders.buyer_id = auth.uid()
          or orders.seller_id = auth.uid()
        )
    )
  );
end $$;

do $$
begin
  if exists (
    select 1
    from pg_policies
    where schemaname = 'public'
      and tablename = 'dispute_messages'
      and policyname = 'admins can insert dispute messages'
  ) then
    drop policy "admins can insert dispute messages" on public.dispute_messages;
  end if;

  create policy "admins can insert dispute messages"
  on public.dispute_messages
  for insert
  to authenticated
  with check (
    sender_id = auth.uid()
    and exists (
      select 1
      from public.users
      where users.id = auth.uid()
        and users.role = 'admin'
    )
  );
end $$;

do $$
begin
  if to_regprocedure('public.prepare_dispute_message_write()') is not null then
    execute '
      drop trigger if exists dispute_messages_prepare_write on public.dispute_messages;
      create trigger dispute_messages_prepare_write
      before insert or update or delete on public.dispute_messages
      for each row
      execute function public.prepare_dispute_message_write();
    ';
  end if;

  if to_regprocedure('public.create_dispute_message_notifications()') is not null then
    execute '
      drop trigger if exists dispute_messages_create_notifications on public.dispute_messages;
      create trigger dispute_messages_create_notifications
      after insert on public.dispute_messages
      for each row
      execute function public.create_dispute_message_notifications();
    ';
  end if;
end $$;

drop view if exists public.user_dispute_history;

create view public.user_dispute_history
with (security_invoker = true)
as
select
  u.id as user_id,
  u.email,
  u.role,
  coalesce(buyer_history.total_disputes_as_buyer, 0) as total_disputes_as_buyer,
  coalesce(seller_history.total_disputes_as_seller, 0) as total_disputes_as_seller,
  coalesce(buyer_history.total_disputes_as_buyer, 0) as disputes_as_buyer,
  coalesce(seller_history.total_disputes_as_seller, 0) as disputes_as_seller,
  coalesce(buyer_history.refunds_received, 0) as refunds_received,
  coalesce(buyer_history.partial_refunds_received, 0) as partial_refunds_received,
  coalesce(seller_history.refunds_paid_as_seller, 0) as refunds_paid_as_seller,
  coalesce(
    greatest(buyer_history.last_buyer_dispute_at, seller_history.last_seller_dispute_at),
    buyer_history.last_buyer_dispute_at,
    seller_history.last_seller_dispute_at
  ) as last_dispute_at,
  coalesce(buyer_history.buyer_disputes, '[]'::jsonb) as buyer_disputes,
  coalesce(seller_history.seller_disputes, '[]'::jsonb) as seller_disputes
from public.users u
left join lateral (
  select
    count(*)::bigint as total_disputes_as_buyer,
    count(*) filter (where o.resolution_type = 'full_refund')::bigint as refunds_received,
    count(*) filter (where o.resolution_type = 'partial_refund')::bigint as partial_refunds_received,
    max(o.disputed_at) as last_buyer_dispute_at,
    coalesce(
      jsonb_agg(
        jsonb_build_object(
          'order_id', o.id,
          'order_number', o.order_number,
          'status', o.status,
          'dispute_status', o.dispute_status,
          'disputed_at', o.disputed_at,
          'resolved_at', o.resolved_at,
          'resolution_type', o.resolution_type,
          'resolution_amount', o.resolution_amount,
          'constitution_section', o.constitution_section
        )
        order by o.disputed_at desc nulls last, o.created_at desc
      ) filter (where o.id is not null),
      '[]'::jsonb
    ) as buyer_disputes
  from public.orders o
  where o.buyer_id = u.id
    and (
      o.status = 'DISPUTED'
      or coalesce(o.dispute_status, 'none') <> 'none'
      or o.disputed_at is not null
      or o.resolution_type is not null
    )
) as buyer_history on true
left join lateral (
  select
    count(*)::bigint as total_disputes_as_seller,
    count(*) filter (
      where o.resolution_type in ('full_refund', 'partial_refund')
    )::bigint as refunds_paid_as_seller,
    max(o.disputed_at) as last_seller_dispute_at,
    coalesce(
      jsonb_agg(
        jsonb_build_object(
          'order_id', o.id,
          'order_number', o.order_number,
          'status', o.status,
          'dispute_status', o.dispute_status,
          'disputed_at', o.disputed_at,
          'resolved_at', o.resolved_at,
          'resolution_type', o.resolution_type,
          'resolution_amount', o.resolution_amount,
          'constitution_section', o.constitution_section
        )
        order by o.disputed_at desc nulls last, o.created_at desc
      ) filter (where o.id is not null),
      '[]'::jsonb
    ) as seller_disputes
  from public.orders o
  where o.seller_id = u.id
    and (
      o.status = 'DISPUTED'
      or coalesce(o.dispute_status, 'none') <> 'none'
      or o.disputed_at is not null
      or o.resolution_type is not null
    )
) as seller_history on true;

revoke all on public.user_dispute_history from public;
revoke all on public.user_dispute_history from anon;
grant select on public.user_dispute_history to authenticated;
grant select on public.user_dispute_history to service_role;
