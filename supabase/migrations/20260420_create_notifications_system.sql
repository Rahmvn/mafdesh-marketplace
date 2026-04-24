create extension if not exists pgcrypto;

create table if not exists public.notifications (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.users(id) on delete cascade,
  role text not null,
  type text not null,
  title text not null,
  message text not null,
  link text,
  is_read boolean not null default false,
  created_at timestamptz not null default now(),
  metadata jsonb not null default '{}'::jsonb
);

alter table public.notifications
  add column if not exists user_id uuid references public.users(id) on delete cascade,
  add column if not exists role text,
  add column if not exists type text,
  add column if not exists title text,
  add column if not exists message text,
  add column if not exists link text,
  add column if not exists is_read boolean not null default false,
  add column if not exists created_at timestamptz not null default now(),
  add column if not exists metadata jsonb not null default '{}'::jsonb;

update public.notifications
set role = coalesce(nullif(role, ''), 'buyer')
where role is null or btrim(role) = '';

update public.notifications
set type = coalesce(nullif(type, ''), 'system')
where type is null or btrim(type) = '';

update public.notifications
set title = coalesce(nullif(title, ''), 'Notification')
where title is null or btrim(title) = '';

update public.notifications
set message = coalesce(nullif(message, ''), 'You have a new update.')
where message is null or btrim(message) = '';

update public.notifications
set metadata = '{}'::jsonb
where metadata is null;

do $$
begin
  if not exists (
    select 1
    from pg_constraint
    where conname = 'notifications_role_check'
  ) then
    alter table public.notifications
      add constraint notifications_role_check
      check (role in ('buyer', 'seller', 'admin'));
  end if;
end $$;

create index if not exists idx_notifications_user_id
  on public.notifications(user_id);

create index if not exists idx_notifications_role
  on public.notifications(role);

create index if not exists idx_notifications_unread
  on public.notifications(user_id, is_read);

create index if not exists idx_notifications_created_at
  on public.notifications(created_at desc);

create or replace function public.current_user_role(
  p_user_id uuid default auth.uid()
)
returns text
language sql
stable
security definer
set search_path = public
as $$
  select role
  from public.users
  where id = p_user_id;
$$;

create or replace function public.insert_notification(
  p_user_id uuid,
  p_role text,
  p_type text,
  p_title text,
  p_message text,
  p_link text default null,
  p_metadata jsonb default '{}'::jsonb
)
returns public.notifications
language plpgsql
security definer
set search_path = public
as $$
declare
  v_notification public.notifications%rowtype;
begin
  if p_user_id is null then
    raise exception 'Notification user is required.';
  end if;

  if coalesce(btrim(p_role), '') not in ('buyer', 'seller', 'admin') then
    raise exception 'Notification role must be buyer, seller, or admin.';
  end if;

  if coalesce(btrim(p_type), '') = '' then
    raise exception 'Notification type is required.';
  end if;

  if coalesce(btrim(p_title), '') = '' then
    raise exception 'Notification title is required.';
  end if;

  if coalesce(btrim(p_message), '') = '' then
    raise exception 'Notification message is required.';
  end if;

  insert into public.notifications (
    user_id,
    role,
    type,
    title,
    message,
    link,
    metadata
  )
  values (
    p_user_id,
    lower(btrim(p_role)),
    lower(btrim(p_type)),
    btrim(p_title),
    btrim(p_message),
    nullif(btrim(coalesce(p_link, '')), ''),
    coalesce(p_metadata, '{}'::jsonb)
  )
  returning *
  into v_notification;

  return v_notification;
end;
$$;

create or replace function public.insert_admin_notifications(
  p_type text,
  p_title text,
  p_message text,
  p_link text default null,
  p_metadata jsonb default '{}'::jsonb
)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_admin record;
begin
  for v_admin in
    select id
    from public.users
    where role = 'admin'
  loop
    perform public.insert_notification(
      v_admin.id,
      'admin',
      p_type,
      p_title,
      p_message,
      p_link,
      p_metadata
    );
  end loop;
end;
$$;

create or replace function public.order_notification_message(
  p_status text,
  p_order_number text,
  p_delivery_type text default null
)
returns jsonb
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  v_order_number text := coalesce(nullif(btrim(p_order_number), ''), 'your order');
  v_delivery_type text := lower(coalesce(p_delivery_type, 'delivery'));
begin
  case upper(coalesce(p_status, ''))
    when 'PAID_ESCROW' then
      return jsonb_build_object(
        'buyer_title', 'Payment received',
        'buyer_message', format('Payment for order %s is confirmed and held in escrow while the seller prepares it.', v_order_number),
        'seller_title', 'New order placed',
        'seller_message', format('Order %s has been paid. Please prepare it within 48 hours.', v_order_number)
      );
    when 'SHIPPED' then
      return jsonb_build_object(
        'buyer_title', 'Order shipped',
        'buyer_message', format('Order %s has been marked as shipped by the seller.', v_order_number),
        'seller_title', 'Order shipped',
        'seller_message', format('You marked order %s as shipped.', v_order_number)
      );
    when 'READY_FOR_PICKUP' then
      return jsonb_build_object(
        'buyer_title', 'Order ready for pickup',
        'buyer_message', format('Order %s is ready for pickup. Inspect everything before confirming receipt.', v_order_number),
        'seller_title', 'Order ready for pickup',
        'seller_message', format('You marked order %s as ready for pickup.', v_order_number)
      );
    when 'DELIVERED' then
      return jsonb_build_object(
        'buyer_title', 'Order delivered',
        'buyer_message', format('Order %s has been marked as delivered. Please confirm receipt or report an issue.', v_order_number),
        'seller_title', 'Delivery recorded',
        'seller_message', format('Order %s has been marked as delivered.', v_order_number)
      );
    when 'COMPLETED' then
      return jsonb_build_object(
        'buyer_title', 'Order completed',
        'buyer_message', format('Order %s is complete. Thank you for shopping on Mafdesh.', v_order_number),
        'seller_title', 'Funds released',
        'seller_message', format('Order %s is complete and your payout can now move toward release.', v_order_number)
      );
    when 'REFUNDED' then
      return jsonb_build_object(
        'buyer_title', 'Refund processed',
        'buyer_message', format('Order %s has been refunded.', v_order_number),
        'seller_title', 'Refund processed',
        'seller_message', format('Order %s was refunded.', v_order_number)
      );
    when 'CANCELLED' then
      return jsonb_build_object(
        'buyer_title', 'Order cancelled',
        'buyer_message', format('Order %s has been cancelled.', v_order_number),
        'seller_title', 'Order cancelled',
        'seller_message', format('Order %s has been cancelled.', v_order_number)
      );
    when 'DISPUTED' then
      return jsonb_build_object(
        'buyer_title', 'Dispute opened',
        'buyer_message', format('A dispute has been opened for order %s. Our team will review it.', v_order_number),
        'seller_title', 'Dispute opened',
        'seller_message', format('A dispute has been opened for order %s. Please review and respond in the dispute thread.', v_order_number)
      );
    else
      return jsonb_build_object(
        'buyer_title', 'Order updated',
        'buyer_message', format('Order %s has a new update.', v_order_number),
        'seller_title', 'Order updated',
        'seller_message', format('Order %s has a new update.', v_order_number)
      );
  end case;
end;
$$;

create or replace function public.create_order_status_notifications()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_copy jsonb;
  v_order_number text := coalesce(new.order_number, left(new.id::text, 8));
  v_buyer_link text := format('/buyer/orders/%s', new.id);
  v_seller_link text := format('/seller/orders/%s', new.id);
  v_admin_link text := format('/admin/order/%s', new.id);
  v_metadata jsonb := jsonb_build_object(
    'order_id', new.id,
    'order_number', v_order_number,
    'status', new.status,
    'buyer_id', new.buyer_id,
    'seller_id', new.seller_id
  );
begin
  if tg_op <> 'UPDATE' then
    return new;
  end if;

  if new.status is not distinct from old.status then
    return new;
  end if;

  v_copy := public.order_notification_message(new.status, v_order_number, new.delivery_type);

  if new.status = 'PAID_ESCROW' then
    perform public.insert_notification(
      new.buyer_id,
      'buyer',
      'payment_receipt',
      v_copy->>'buyer_title',
      v_copy->>'buyer_message',
      v_buyer_link,
      v_metadata
    );

    perform public.insert_notification(
      new.seller_id,
      'seller',
      'order_update',
      v_copy->>'seller_title',
      v_copy->>'seller_message',
      v_seller_link,
      v_metadata
    );

    return new;
  end if;

  if new.status in ('SHIPPED', 'READY_FOR_PICKUP', 'DELIVERED', 'COMPLETED', 'REFUNDED', 'CANCELLED', 'DISPUTED') then
    perform public.insert_notification(
      new.buyer_id,
      'buyer',
      case when new.status = 'REFUNDED' then 'payment_receipt' else 'order_update' end,
      v_copy->>'buyer_title',
      v_copy->>'buyer_message',
      v_buyer_link,
      v_metadata
    );
  end if;

  if new.status in ('COMPLETED', 'REFUNDED', 'CANCELLED', 'DISPUTED') then
    perform public.insert_notification(
      new.seller_id,
      'seller',
      case when new.status in ('COMPLETED', 'REFUNDED') then 'payout_update' else 'order_update' end,
      v_copy->>'seller_title',
      v_copy->>'seller_message',
      v_seller_link,
      v_metadata
    );
  end if;

  if new.status = 'DISPUTED' then
    perform public.insert_admin_notifications(
      'admin_alert',
      'New dispute opened',
      format('Order %s has entered dispute review.', v_order_number),
      v_admin_link,
      v_metadata
    );
  end if;

  return new;
end;
$$;

create or replace function public.create_dispute_message_notifications()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_order public.orders%rowtype;
  v_order_number text;
  v_preview text;
  v_metadata jsonb;
begin
  select *
  into v_order
  from public.orders
  where id = new.order_id;

  if not found then
    return new;
  end if;

  if new.sender_role = 'buyer' and coalesce(v_order.status, '') <> 'DISPUTED' then
    return new;
  end if;

  v_order_number := coalesce(v_order.order_number, left(v_order.id::text, 8));
  v_preview := left(coalesce(nullif(btrim(new.message), ''), 'New evidence was attached to the dispute.'), 140);
  v_metadata := jsonb_build_object(
    'order_id', v_order.id,
    'order_number', v_order_number,
    'dispute_message_id', new.id,
    'sender_id', new.sender_id,
    'sender_role', new.sender_role
  );

  if new.sender_role = 'buyer' then
    perform public.insert_notification(
      v_order.seller_id,
      'seller',
      'dispute_update',
      'Buyer replied in a dispute',
      format('Order %s: %s', v_order_number, v_preview),
      format('/seller/orders/%s', v_order.id),
      v_metadata
    );

    perform public.insert_admin_notifications(
      'admin_alert',
      'Buyer dispute message',
      format('Order %s: %s', v_order_number, v_preview),
      format('/admin/order/%s', v_order.id),
      v_metadata
    );
  elsif new.sender_role = 'seller' then
    perform public.insert_notification(
      v_order.buyer_id,
      'buyer',
      'dispute_update',
      'Seller replied in a dispute',
      format('Order %s: %s', v_order_number, v_preview),
      format('/buyer/orders/%s', v_order.id),
      v_metadata
    );

    perform public.insert_admin_notifications(
      'admin_alert',
      'Seller dispute message',
      format('Order %s: %s', v_order_number, v_preview),
      format('/admin/order/%s', v_order.id),
      v_metadata
    );
  elsif new.sender_role = 'admin' then
    perform public.insert_notification(
      v_order.buyer_id,
      'buyer',
      'dispute_update',
      'Admin update on your dispute',
      format('Order %s: %s', v_order_number, v_preview),
      format('/buyer/orders/%s', v_order.id),
      v_metadata
    );

    perform public.insert_notification(
      v_order.seller_id,
      'seller',
      'dispute_update',
      'Admin update on a dispute',
      format('Order %s: %s', v_order_number, v_preview),
      format('/seller/orders/%s', v_order.id),
      v_metadata
    );
  end if;

  return new;
end;
$$;

drop trigger if exists orders_create_status_notifications on public.orders;
create trigger orders_create_status_notifications
after update of status on public.orders
for each row
execute function public.create_order_status_notifications();

drop trigger if exists dispute_messages_create_notifications on public.dispute_messages;
create trigger dispute_messages_create_notifications
after insert on public.dispute_messages
for each row
execute function public.create_dispute_message_notifications();

alter table public.notifications enable row level security;

do $$
begin
  if not exists (
    select 1
    from pg_policies
    where schemaname = 'public'
      and tablename = 'notifications'
      and policyname = 'users can view own notifications'
  ) then
    create policy "users can view own notifications"
    on public.notifications
    for select
    to authenticated
    using (
      user_id = auth.uid()
      and role = coalesce(public.current_user_role(auth.uid()), role)
    );
  end if;

  if not exists (
    select 1
    from pg_policies
    where schemaname = 'public'
      and tablename = 'notifications'
      and policyname = 'users can update own notifications'
  ) then
    create policy "users can update own notifications"
    on public.notifications
    for update
    to authenticated
    using (
      user_id = auth.uid()
      and role = coalesce(public.current_user_role(auth.uid()), role)
    )
    with check (
      user_id = auth.uid()
      and role = coalesce(public.current_user_role(auth.uid()), role)
    );
  end if;

  if not exists (
    select 1
    from pg_policies
    where schemaname = 'public'
      and tablename = 'notifications'
      and policyname = 'users can delete own notifications'
  ) then
    create policy "users can delete own notifications"
    on public.notifications
    for delete
    to authenticated
    using (
      user_id = auth.uid()
      and role = coalesce(public.current_user_role(auth.uid()), role)
    );
  end if;
end $$;

do $$
begin
  if exists (
    select 1
    from pg_publication
    where pubname = 'supabase_realtime'
  ) and not exists (
    select 1
    from pg_publication_tables
    where pubname = 'supabase_realtime'
      and schemaname = 'public'
      and tablename = 'notifications'
  ) then
    alter publication supabase_realtime add table public.notifications;
  end if;
end $$;
