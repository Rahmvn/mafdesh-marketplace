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
  v_internal_actor text := current_setting('app.refund_system_actor', true);
begin
  select coalesce(order_number, left(id::text, 8))
  into v_order_number
  from public.orders
  where id = new.order_id;

  if tg_op = 'INSERT' then
    if new.status = 'pending' then
      perform set_config(
        'app.refund_system_actor',
        coalesce(nullif(v_internal_actor, ''), 'refund_pending_hold'),
        true
      );

      update public.orders
      set ship_deadline = null
      where id = new.order_id
        and status = 'PAID_ESCROW';

      perform set_config('app.refund_system_actor', coalesce(v_internal_actor, ''), true);

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
    perform set_config(
      'app.refund_system_actor',
      coalesce(nullif(v_internal_actor, ''), 'refund_hold_release'),
      true
    );

    update public.orders
    set ship_deadline = case
      when v_remaining_seconds is null then ship_deadline
      when v_remaining_seconds <= 0 then now()
      else now() + make_interval(secs => v_remaining_seconds)
    end
    where id = new.order_id
      and status = 'PAID_ESCROW'
      and ship_deadline is null;

    perform set_config('app.refund_system_actor', coalesce(v_internal_actor, ''), true);
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
exception
  when others then
    perform set_config('app.refund_system_actor', coalesce(v_internal_actor, ''), true);
    raise;
end;
$$;
 