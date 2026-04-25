alter table public.refund_requests
  add column if not exists ship_deadline_remaining_seconds integer;

update public.refund_requests rr
set ship_deadline_remaining_seconds = greatest(
  0,
  floor(extract(epoch from (o.ship_deadline - rr.created_at)))
)::integer
from public.orders o
where rr.order_id = o.id
  and rr.ship_deadline_remaining_seconds is null
  and o.ship_deadline is not null;

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
    new.ship_deadline_remaining_seconds := case
      when v_order.ship_deadline is null then null
      else greatest(0, floor(extract(epoch from (v_order.ship_deadline - now()))))::integer
    end;
    return new;
  end if;

  new.updated_at := now();

  if new.id is distinct from old.id
    or new.order_id is distinct from old.order_id
    or new.buyer_id is distinct from old.buyer_id
    or new.seller_id is distinct from old.seller_id
    or new.reason is distinct from old.reason
    or new.created_at is distinct from old.created_at
    or new.ship_deadline_remaining_seconds is distinct from old.ship_deadline_remaining_seconds
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
    new.ship_deadline_remaining_seconds := old.ship_deadline_remaining_seconds;
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
      new.ship_deadline_remaining_seconds := old.ship_deadline_remaining_seconds;
      return new;
    end if;

    if new.status = 'rejected' then
      if char_length(btrim(coalesce(new.admin_notes, ''))) = 0 then
        raise exception 'A rejection reason is required.';
      end if;

      new.admin_notes := btrim(new.admin_notes);
      new.reviewed_by := v_actor_id;
      new.reviewed_at := coalesce(new.reviewed_at, now());
      new.ship_deadline_remaining_seconds := old.ship_deadline_remaining_seconds;
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
    new.ship_deadline_remaining_seconds := old.ship_deadline_remaining_seconds;
    return new;
  end if;

  raise exception 'You are not allowed to modify this refund request.';
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

      perform public.insert_notification(
        new.buyer_id,
        'buyer',
        'refund_processing',
        'Refund request is processing',
        format('Your refund request for order %s is now under admin review.', v_order_number),
        format('/buyer/orders/%s', new.order_id),
        jsonb_build_object('refund_request_id', new.id, 'order_id', new.order_id)
      );

      perform public.insert_notification(
        new.seller_id,
        'seller',
        'refund_processing',
        'Order on hold for refund review',
        format('Order %s is on hold while admin reviews the buyer refund request.', v_order_number),
        format('/seller/orders/%s', new.order_id),
        jsonb_build_object('refund_request_id', new.id, 'order_id', new.order_id)
      );

      perform public.insert_admin_notifications(
        'refund_processing',
        'Refund request needs review',
        format(
          'Order %s has a refund request pending. Review should be completed by %s.',
          v_order_number,
          to_char(v_deadline, 'FMMon DD, YYYY HH12:MI AM')
        ),
        format('/admin/order/%s', new.order_id),
        jsonb_build_object('refund_request_id', new.id, 'order_id', new.order_id)
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

  if old.status = 'pending' and new.status = 'rejected' then
    perform public.insert_notification(
      new.buyer_id,
      'buyer',
      'refund_rejected',
      'Refund request rejected',
      format('Admin rejected the refund request for order %s.', v_order_number),
      format('/buyer/orders/%s', new.order_id),
      jsonb_build_object('refund_request_id', new.id, 'order_id', new.order_id)
    );

    perform public.insert_notification(
      new.seller_id,
      'seller',
      'refund_rejected',
      'Refund request rejected',
      format('Admin rejected the refund request for order %s. Fulfillment can continue.', v_order_number),
      format('/seller/orders/%s', new.order_id),
      jsonb_build_object('refund_request_id', new.id, 'order_id', new.order_id)
    );
  elsif old.status = 'pending' and new.status = 'cancelled' then
    perform public.insert_notification(
      new.buyer_id,
      'buyer',
      'refund_cancelled',
      'Refund request cancelled',
      format('Your refund request for order %s has been cancelled.', v_order_number),
      format('/buyer/orders/%s', new.order_id),
      jsonb_build_object('refund_request_id', new.id, 'order_id', new.order_id)
    );

    perform public.insert_notification(
      new.seller_id,
      'seller',
      'refund_cancelled',
      'Refund request cancelled',
      format('The buyer cancelled the refund request for order %s.', v_order_number),
      format('/seller/orders/%s', new.order_id),
      jsonb_build_object('refund_request_id', new.id, 'order_id', new.order_id)
    );
  end if;

  return new;
end;
$$;

drop trigger if exists refund_requests_sync_order_state on public.refund_requests;
create trigger refund_requests_sync_order_state
after insert or update on public.refund_requests
for each row
execute function public.sync_order_for_refund_request();

create or replace function public.prevent_fulfillment_while_refund_request_pending()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if new.status in ('SHIPPED', 'READY_FOR_PICKUP')
    and new.status is distinct from old.status
    and exists (
      select 1
      from public.refund_requests
      where order_id = new.id
        and status = 'pending'
    )
  then
    raise exception 'This order has a refund request pending review. Admin must resolve it before fulfillment continues.';
  end if;

  return new;
end;
$$;

drop trigger if exists orders_auto_cancel_refund_on_fulfillment on public.orders;
drop trigger if exists orders_prevent_fulfillment_while_refund_request_pending on public.orders;
create trigger orders_prevent_fulfillment_while_refund_request_pending
before update of status on public.orders
for each row
execute function public.prevent_fulfillment_while_refund_request_pending();
