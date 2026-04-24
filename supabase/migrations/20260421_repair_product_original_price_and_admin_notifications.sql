alter table public.products
  add column if not exists original_price numeric;

update public.products
set original_price = null
where original_price = 0;

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
  v_admin_title text;
  v_admin_message text;
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

  if new.status in ('PAID_ESCROW', 'SHIPPED', 'READY_FOR_PICKUP', 'DELIVERED', 'COMPLETED', 'REFUNDED', 'CANCELLED', 'DISPUTED') then
    v_admin_title :=
      case new.status
        when 'PAID_ESCROW' then 'New paid order'
        when 'SHIPPED' then 'Order shipped'
        when 'READY_FOR_PICKUP' then 'Order ready for pickup'
        when 'DELIVERED' then 'Order delivered'
        when 'COMPLETED' then 'Order completed'
        when 'REFUNDED' then 'Order refunded'
        when 'CANCELLED' then 'Order cancelled'
        when 'DISPUTED' then 'New dispute opened'
        else 'Order updated'
      end;

    v_admin_message :=
      case new.status
        when 'PAID_ESCROW' then format('Order %s has been paid and is now held in escrow.', v_order_number)
        when 'SHIPPED' then format('Order %s has been marked as shipped.', v_order_number)
        when 'READY_FOR_PICKUP' then format('Order %s is ready for pickup.', v_order_number)
        when 'DELIVERED' then format('Order %s has been marked as delivered.', v_order_number)
        when 'COMPLETED' then format('Order %s has been completed.', v_order_number)
        when 'REFUNDED' then format('Order %s has been refunded.', v_order_number)
        when 'CANCELLED' then format('Order %s has been cancelled.', v_order_number)
        when 'DISPUTED' then format('Order %s has entered dispute review.', v_order_number)
        else format('Order %s has a new update.', v_order_number)
      end;

    perform public.insert_admin_notifications(
      'admin_alert',
      v_admin_title,
      v_admin_message,
      v_admin_link,
      v_metadata
    );
  end if;

  return new;
end;
$$;
