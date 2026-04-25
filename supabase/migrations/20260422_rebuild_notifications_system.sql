create extension if not exists pgcrypto;

create table if not exists public.notifications (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.users(id) on delete cascade,
  type text not null,
  title text not null,
  body text not null,
  link text,
  is_read boolean not null default false,
  read_at timestamptz,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

alter table public.notifications
  add column if not exists user_id uuid references public.users(id) on delete cascade,
  add column if not exists type text,
  add column if not exists title text,
  add column if not exists body text,
  add column if not exists link text,
  add column if not exists is_read boolean not null default false,
  add column if not exists read_at timestamptz,
  add column if not exists metadata jsonb not null default '{}'::jsonb,
  add column if not exists created_at timestamptz not null default now();

drop trigger if exists dispute_messages_create_notifications on public.dispute_messages;
drop trigger if exists orders_create_status_notifications on public.orders;

drop function if exists public.create_dispute_message_notifications();
drop function if exists public.order_notification_message(text, text, text);
drop function if exists public.create_order_status_notifications();
drop function if exists public.insert_admin_notifications(text, text, text, text, jsonb);
drop function if exists public.insert_notification(uuid, text, text, text, text, text, jsonb);
drop function if exists public.current_user_role(uuid);

drop policy if exists "users can view own notifications" on public.notifications;
drop policy if exists "users can update own notifications" on public.notifications;
drop policy if exists "users can delete own notifications" on public.notifications;
drop policy if exists "service role can insert notifications" on public.notifications;

do $$
begin
  if exists (
    select 1
    from information_schema.columns
    where table_schema = 'public'
      and table_name = 'notifications'
      and column_name = 'message'
  ) then
    update public.notifications
    set body = coalesce(nullif(body, ''), message)
    where body is null
       or btrim(body) = '';
  end if;
end $$;

update public.notifications
set type = coalesce(nullif(btrim(type), ''), 'other'),
    title = coalesce(nullif(btrim(title), ''), 'Notification'),
    body = coalesce(nullif(btrim(body), ''), 'You have a new notification.'),
    metadata = coalesce(metadata, '{}'::jsonb);

update public.notifications
set read_at = coalesce(read_at, created_at, now())
where is_read = true
  and read_at is null;

do $$
begin
  if exists (
    select 1
    from information_schema.columns
    where table_schema = 'public'
      and table_name = 'notifications'
      and column_name = 'message'
  ) then
    alter table public.notifications
      drop column message;
  end if;

  if exists (
    select 1
    from information_schema.columns
    where table_schema = 'public'
      and table_name = 'notifications'
      and column_name = 'role'
  ) then
    alter table public.notifications
      drop column role;
  end if;
end $$;

alter table public.notifications
  alter column user_id set not null,
  alter column type set not null,
  alter column title set not null,
  alter column body set not null,
  alter column is_read set default false,
  alter column metadata set default '{}'::jsonb,
  alter column created_at set default now();

create index if not exists notifications_user_id_idx
  on public.notifications (user_id, created_at desc);

create index if not exists notifications_user_unread_idx
  on public.notifications (user_id, is_read)
  where is_read = false;

create or replace function public.create_notification(
  p_user_id uuid,
  p_type text,
  p_title text,
  p_body text,
  p_link text default null,
  p_metadata jsonb default '{}'::jsonb
)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  if p_user_id is null then
    raise exception 'Notification user is required.';
  end if;

  if coalesce(btrim(p_type), '') = '' then
    raise exception 'Notification type is required.';
  end if;

  if coalesce(btrim(p_title), '') = '' then
    raise exception 'Notification title is required.';
  end if;

  if coalesce(btrim(p_body), '') = '' then
    raise exception 'Notification body is required.';
  end if;

  insert into public.notifications (
    user_id,
    type,
    title,
    body,
    link,
    metadata
  )
  values (
    p_user_id,
    lower(btrim(p_type)),
    btrim(p_title),
    btrim(p_body),
    nullif(btrim(coalesce(p_link, '')), ''),
    coalesce(p_metadata, '{}'::jsonb)
  );
end;
$$;

create or replace function public.create_admin_notifications(
  p_type text,
  p_title text,
  p_body text,
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
    perform public.create_notification(
      v_admin.id,
      p_type,
      p_title,
      p_body,
      p_link,
      p_metadata
    );
  end loop;
end;
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
  insert into public.notifications (
    user_id,
    type,
    title,
    body,
    link,
    metadata
  )
  values (
    p_user_id,
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
begin
  perform public.create_admin_notifications(
    p_type,
    p_title,
    p_message,
    p_link,
    p_metadata
  );
end;
$$;

create or replace function public.order_notification_context(
  p_order_id uuid
)
returns jsonb
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  v_first_item_name text;
  v_item_count integer := 0;
begin
  select coalesce(nullif(oi.product_snapshot->>'name', ''), p.name)
  into v_first_item_name
  from public.order_items oi
  left join public.products p
    on p.id = oi.product_id
  where oi.order_id = p_order_id
  order by oi.id
  limit 1;

  select coalesce(sum(quantity), 0)::integer
  into v_item_count
  from public.order_items
  where order_id = p_order_id;

  return jsonb_build_object(
    'first_item_name', coalesce(v_first_item_name, 'your item'),
    'item_count', v_item_count
  );
end;
$$;

create or replace function public.send_order_placed_notifications(
  p_order_id uuid,
  p_buyer_id uuid,
  p_seller_id uuid,
  p_order_number text
)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_context jsonb := public.order_notification_context(p_order_id);
  v_first_item_name text := coalesce(v_context->>'first_item_name', 'your item');
  v_item_count integer := coalesce((v_context->>'item_count')::integer, 0);
  v_buyer_link text := format('/buyer/orders/%s', p_order_id);
  v_seller_link text := format('/seller/orders/%s', p_order_id);
  v_metadata jsonb := jsonb_build_object(
    'order_id', p_order_id,
    'order_number', p_order_number,
    'product_name', v_first_item_name,
    'item_count', v_item_count
  );
begin
  perform public.create_notification(
    p_buyer_id,
    'order_placed',
    'Order placed successfully',
    format('Your order %s was placed successfully and is now awaiting fulfillment.', p_order_number),
    v_buyer_link,
    v_metadata
  );

  perform public.create_notification(
    p_seller_id,
    'new_order',
    'New order received',
    case
      when v_item_count > 1 then format('Someone just ordered %s and %s other item(s).', v_first_item_name, greatest(v_item_count - 1, 0))
      else format('Someone just ordered %s.', v_first_item_name)
    end,
    v_seller_link,
    v_metadata
  );
end;
$$;

create or replace function public.create_order_insert_notifications()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_order_number text := coalesce(new.order_number, left(new.id::text, 8));
begin
  if new.status = 'PAID_ESCROW' then
    perform public.send_order_placed_notifications(
      new.id,
      new.buyer_id,
      new.seller_id,
      v_order_number
    );
  end if;

  return new;
end;
$$;

create or replace function public.create_order_status_notifications()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_order_number text := coalesce(new.order_number, left(new.id::text, 8));
  v_buyer_link text := format('/buyer/orders/%s', new.id);
  v_seller_link text := format('/seller/orders/%s', new.id);
  v_admin_link text := '/admin/disputes';
  v_metadata jsonb := jsonb_build_object(
    'order_id', new.id,
    'order_number', v_order_number,
    'buyer_id', new.buyer_id,
    'seller_id', new.seller_id,
    'status', new.status
  );
begin
  if tg_op <> 'UPDATE' then
    return new;
  end if;

  if new.status is not distinct from old.status then
    return new;
  end if;

  if new.status = 'PAID_ESCROW' and old.status is distinct from 'PAID_ESCROW' then
    perform public.send_order_placed_notifications(
      new.id,
      new.buyer_id,
      new.seller_id,
      v_order_number
    );
    return new;
  end if;

  if old.status = 'PAID_ESCROW' and new.status = 'SHIPPED' then
    perform public.create_notification(
      new.buyer_id,
      'order_shipped',
      'Order shipped',
      format('Your order %s has been marked as shipped.', v_order_number),
      v_buyer_link,
      v_metadata
    );
  end if;

  if old.status = 'PAID_ESCROW' and new.status = 'READY_FOR_PICKUP' then
    perform public.create_notification(
      new.buyer_id,
      'order_ready_pickup',
      'Order ready for pickup',
      format('Your order %s is ready for pickup.', v_order_number),
      v_buyer_link,
      v_metadata
    );
  end if;

  if new.status = 'COMPLETED' and old.status is distinct from 'COMPLETED' then
    perform public.create_notification(
      new.buyer_id,
      'order_completed',
      'Order completed',
      format('Your order %s has been completed.', v_order_number),
      v_buyer_link,
      v_metadata
    );

    perform public.create_notification(
      new.seller_id,
      'order_completed',
      'Order completed',
      format('The buyer confirmed delivery for order %s.', v_order_number),
      v_seller_link,
      v_metadata
    );
  end if;

  if new.status = 'CANCELLED' and old.status is distinct from 'CANCELLED' then
    perform public.create_notification(
      new.buyer_id,
      'order_cancelled',
      'Order cancelled',
      format('Your order %s has been cancelled.', v_order_number),
      v_buyer_link,
      v_metadata
    );
  end if;

  if new.status = 'DISPUTED' and old.status is distinct from 'DISPUTED' then
    perform public.create_admin_notifications(
      'dispute_raised',
      'Dispute raised on an order',
      format('Order %s has entered dispute review.', v_order_number),
      v_admin_link,
      v_metadata
    );
  end if;

  return new;
end;
$$;

create or replace function public.sync_order_for_refund_request()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_order_number text;
  v_deadline timestamptz := new.created_at + interval '10 days';
  v_remaining_seconds integer;
  v_seller_link text := format('/seller/orders/%s', new.order_id);
  v_buyer_link text := format('/buyer/orders/%s', new.order_id);
  v_admin_link text := '/admin/refund-requests';
begin
  select coalesce(order_number, left(id::text, 8))
  into v_order_number
  from public.orders
  where id = new.order_id;

  if tg_op = 'INSERT' then
    if new.status = 'pending' then
      update public.orders
      set ship_deadline = null
      where id = new.order_id
        and status = 'PAID_ESCROW';

      perform public.create_notification(
        new.seller_id,
        'refund_requested',
        'Refund requested',
        format('The buyer requested a refund for order %s.', v_order_number),
        v_seller_link,
        jsonb_build_object(
          'refund_request_id', new.id,
          'order_id', new.order_id,
          'order_number', v_order_number
        )
      );

      perform public.create_admin_notifications(
        'refund_pending',
        'Refund request needs review',
        format(
          'Order %s has a pending refund request. Review should finish by %s.',
          v_order_number,
          to_char(v_deadline, 'FMMon DD, YYYY HH12:MI AM')
        ),
        v_admin_link,
        jsonb_build_object(
          'refund_request_id', new.id,
          'order_id', new.order_id,
          'order_number', v_order_number
        )
      );
    end if;

    return new;
  end if;

  if new.status = old.status then
    return new;
  end if;

  v_remaining_seconds := coalesce(new.ship_deadline_remaining_seconds, old.ship_deadline_remaining_seconds);

  if old.status = 'pending' and new.status in ('cancelled', 'rejected') then
    update public.orders
    set ship_deadline = case
      when v_remaining_seconds is null then ship_deadline
      when v_remaining_seconds <= 0 then now()
      else now() + make_interval(secs => v_remaining_seconds)
    end
    where id = new.order_id
      and status = 'PAID_ESCROW'
      and ship_deadline is null;
  end if;

  if old.status = 'pending' and new.status = 'approved' then
    perform public.create_notification(
      new.buyer_id,
      'refund_approved',
      'Refund approved',
      format('Your refund request for order %s was approved.', v_order_number),
      v_buyer_link,
      jsonb_build_object(
        'refund_request_id', new.id,
        'order_id', new.order_id,
        'order_number', v_order_number
      )
    );
  elsif old.status = 'pending' and new.status = 'rejected' then
    perform public.create_notification(
      new.buyer_id,
      'refund_rejected',
      'Refund rejected',
      case
        when coalesce(btrim(new.admin_notes), '') <> ''
          then format('Your refund request for order %s was rejected. Reason: %s', v_order_number, btrim(new.admin_notes))
        else format('Your refund request for order %s was rejected.', v_order_number)
      end,
      v_buyer_link,
      jsonb_build_object(
        'refund_request_id', new.id,
        'order_id', new.order_id,
        'order_number', v_order_number
      )
    );
  end if;

  return new;
end;
$$;

create or replace function public.create_product_submission_notifications()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_seller_name text;
begin
  if coalesce(new.is_approved, false) then
    return new;
  end if;

  select coalesce(nullif(btrim(business_name), ''), email, 'Seller')
  into v_seller_name
  from public.users
  where id = new.seller_id;

  perform public.create_admin_notifications(
    'product_pending',
    'Product pending approval',
    format('"%s" from %s is waiting for approval.', coalesce(new.name, 'Untitled product'), coalesce(v_seller_name, 'Seller')),
    '/admin/products',
    jsonb_build_object(
      'product_id', new.id,
      'seller_id', new.seller_id,
      'product_name', new.name
    )
  );

  return new;
end;
$$;

create or replace function public.create_product_review_notifications()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_seller_link text := format('/seller/products/%s/edit', new.id);
  v_reason text := nullif(btrim(coalesce(new.reapproval_reason, '')), '');
begin
  if coalesce(new.is_approved, false) = true
     and coalesce(old.is_approved, false) = false then
    perform public.create_notification(
      new.seller_id,
      'product_approved',
      'Product approved',
      format('Your product "%s" has been approved and is now live.', coalesce(new.name, 'Untitled product')),
      v_seller_link,
      jsonb_build_object(
        'product_id', new.id,
        'seller_id', new.seller_id,
        'product_name', new.name
      )
    );
  elsif coalesce(new.is_approved, false) = false
    and v_reason is not null
    and (
      coalesce(old.is_approved, false) = true
      or old.reapproval_reason is distinct from new.reapproval_reason
    ) then
    perform public.create_notification(
      new.seller_id,
      'product_rejected',
      'Product requires review',
      format('Your product "%s" needs attention. Reason: %s', coalesce(new.name, 'Untitled product'), v_reason),
      v_seller_link,
      jsonb_build_object(
        'product_id', new.id,
        'seller_id', new.seller_id,
        'product_name', new.name,
        'reason', v_reason
      )
    );
  end if;

  return new;
end;
$$;

create or replace function public.create_bank_pending_notifications()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_seller_name text := coalesce(nullif(btrim(new.business_name), ''), new.email, 'Seller');
begin
  if coalesce(new.role, '') <> 'seller' then
    return new;
  end if;

  if old.bank_details_pending is null and new.bank_details_pending is not null then
    perform public.create_admin_notifications(
      'bank_pending',
      'Bank details need approval',
      format('%s submitted bank details for approval.', v_seller_name),
      '/admin/bank-approvals',
      jsonb_build_object(
        'seller_id', new.id,
        'seller_name', v_seller_name
      )
    );
  end if;

  return new;
end;
$$;

create or replace function public.create_bank_review_notifications()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if coalesce(new.role, '') <> 'seller' then
    return new;
  end if;

  if coalesce(new.bank_details_approved, false) = true
     and coalesce(old.bank_details_approved, false) = false then
    perform public.create_notification(
      new.id,
      'bank_approved',
      'Bank details approved',
      'Your bank details were approved and are now active for payouts.',
      '/profile',
      jsonb_build_object('seller_id', new.id)
    );
  elsif old.bank_details_pending is not null
    and new.bank_details_pending is null
    and coalesce(new.bank_details_approved, false) = false
    and coalesce(old.bank_details_approved, false) = false then
    perform public.create_notification(
      new.id,
      'bank_rejected',
      'Bank details rejected',
      'Your submitted bank details were rejected. Please review them and submit again.',
      '/profile',
      jsonb_build_object('seller_id', new.id)
    );
  end if;

  return new;
end;
$$;

create or replace function public.create_support_ticket_notifications()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_user_name text;
begin
  select coalesce(nullif(btrim(business_name), ''), email, 'User')
  into v_user_name
  from public.users
  where id = new.user_id;

  perform public.create_admin_notifications(
    'support_ticket',
    'New support ticket',
    format('"%s" was opened by %s.', coalesce(new.subject, 'Support ticket'), coalesce(v_user_name, 'User')),
    '/admin/support',
    jsonb_build_object(
      'support_ticket_id', new.id,
      'user_id', new.user_id,
      'subject', new.subject
    )
  );

  return new;
end;
$$;

create or replace function public.create_low_stock_notifications()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_stock integer := coalesce(new.stock_quantity, 0);
  v_old_stock integer := coalesce(old.stock_quantity, 0);
begin
  if v_old_stock >= 5 and v_stock < 5 then
    perform public.create_notification(
      new.seller_id,
      'low_stock',
      'Low stock alert',
      format('Your product ''%s'' has only %s units left.', coalesce(new.name, 'Untitled product'), greatest(v_stock, 0)),
      format('/seller/products/%s/edit', new.id),
      jsonb_build_object(
        'product_id', new.id,
        'product_name', new.name,
        'stock_quantity', v_stock
      )
    );
  end if;

  return new;
end;
$$;

create or replace function public.maybe_create_flash_sale_ending_notification(
  p_product_id uuid
)
returns boolean
language plpgsql
security definer
set search_path = public
as $$
declare
  v_product public.products%rowtype;
  v_sale_end_key text;
begin
  select *
  into v_product
  from public.products
  where id = p_product_id;

  if not found then
    return false;
  end if;

  if not coalesce(v_product.is_flash_sale, false)
     or v_product.sale_end is null
     or v_product.sale_end <= now()
     or v_product.sale_end > now() + interval '2 hours' then
    return false;
  end if;

  v_sale_end_key := to_char(v_product.sale_end at time zone 'utc', 'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"');

  if exists (
    select 1
    from public.notifications n
    where n.user_id = v_product.seller_id
      and n.type = 'flash_sale_ending'
      and n.metadata->>'product_id' = v_product.id::text
      and n.metadata->>'sale_end' = v_sale_end_key
  ) then
    return false;
  end if;

  perform public.create_notification(
    v_product.seller_id,
    'flash_sale_ending',
    'Flash sale ending soon',
    format('Your flash sale for "%s" ends in less than 2 hours.', coalesce(v_product.name, 'Untitled product')),
    format('/seller/products/%s/edit', v_product.id),
    jsonb_build_object(
      'product_id', v_product.id,
      'product_name', v_product.name,
      'sale_end', v_sale_end_key
    )
  );

  return true;
end;
$$;

create or replace function public.create_flash_sale_ending_notifications()
returns integer
language plpgsql
security definer
set search_path = public
as $$
declare
  v_product record;
  v_created_count integer := 0;
begin
  for v_product in
    select id
    from public.products
    where coalesce(is_flash_sale, false) = true
      and sale_end is not null
      and sale_end > now()
      and sale_end <= now() + interval '2 hours'
  loop
    if public.maybe_create_flash_sale_ending_notification(v_product.id) then
      v_created_count := v_created_count + 1;
    end if;
  end loop;

  return v_created_count;
end;
$$;

create or replace function public.create_flash_sale_window_entry_notifications()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  perform public.maybe_create_flash_sale_ending_notification(new.id);
  return new;
end;
$$;

drop trigger if exists orders_create_insert_notifications on public.orders;
create trigger orders_create_insert_notifications
after insert on public.orders
for each row
execute function public.create_order_insert_notifications();

create trigger orders_create_status_notifications
after update of status on public.orders
for each row
execute function public.create_order_status_notifications();

drop trigger if exists refund_requests_sync_order_state on public.refund_requests;
create trigger refund_requests_sync_order_state
after insert or update on public.refund_requests
for each row
execute function public.sync_order_for_refund_request();

drop trigger if exists products_create_submission_notifications on public.products;
create trigger products_create_submission_notifications
after insert on public.products
for each row
execute function public.create_product_submission_notifications();

drop trigger if exists products_create_review_notifications on public.products;
create trigger products_create_review_notifications
after update of is_approved, reapproval_reason on public.products
for each row
execute function public.create_product_review_notifications();

drop trigger if exists users_create_bank_pending_notifications on public.users;
create trigger users_create_bank_pending_notifications
after update of bank_details_pending on public.users
for each row
execute function public.create_bank_pending_notifications();

drop trigger if exists users_create_bank_review_notifications on public.users;
create trigger users_create_bank_review_notifications
after update of bank_details_approved, bank_details_pending on public.users
for each row
execute function public.create_bank_review_notifications();

drop trigger if exists support_tickets_create_notifications on public.support_tickets;
create trigger support_tickets_create_notifications
after insert on public.support_tickets
for each row
execute function public.create_support_ticket_notifications();

drop trigger if exists products_create_low_stock_notifications on public.products;
create trigger products_create_low_stock_notifications
after update of stock_quantity on public.products
for each row
execute function public.create_low_stock_notifications();

drop trigger if exists products_create_flash_sale_window_entry_notifications on public.products;
create trigger products_create_flash_sale_window_entry_notifications
after insert or update of is_flash_sale, sale_start, sale_end on public.products
for each row
execute function public.create_flash_sale_window_entry_notifications();

alter table public.notifications enable row level security;

create policy "users can view own notifications"
  on public.notifications for select
  to authenticated
  using (user_id = auth.uid());

create policy "users can update own notifications"
  on public.notifications for update
  to authenticated
  using (user_id = auth.uid())
  with check (user_id = auth.uid());

create policy "service role can insert notifications"
  on public.notifications for insert
  to service_role
  with check (true);

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
