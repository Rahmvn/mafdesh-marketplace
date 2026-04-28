create or replace function public.create_single_checkout_order(
  p_product_id uuid,
  p_delivery_type text,
  p_delivery_fee numeric,
  p_delivery_state text default null,
  p_delivery_address text default null,
  p_selected_pickup_location text default null,
  p_delivery_zone_snapshot jsonb default null,
  p_pickup_location_snapshot jsonb default null
)
returns public.orders
language plpgsql
security definer
set search_path = public
as $$
declare
  v_actor_id uuid := auth.uid();
  v_actor_role text;
  v_delivery_type text := lower(coalesce(p_delivery_type, ''));
  v_delivery_fee numeric := coalesce(p_delivery_fee, 0);
  v_delivery_state text := nullif(btrim(coalesce(p_delivery_state, '')), '');
  v_delivery_address text := nullif(btrim(coalesce(p_delivery_address, '')), '');
  v_selected_pickup_location text := nullif(btrim(coalesce(p_selected_pickup_location, '')), '');
  v_product public.products%rowtype;
  v_order public.orders%rowtype;
  v_product_price numeric;
  v_platform_fee numeric;
  v_total_amount numeric;
  v_order_number text;
begin
  if v_actor_id is null then
    raise exception 'Authenticated session required.';
  end if;

  select role
  into v_actor_role
  from public.users
  where id = v_actor_id;

  if v_actor_role is distinct from 'buyer' then
    raise exception 'Only authenticated buyers can create orders from checkout.';
  end if;

  if p_product_id is null then
    raise exception 'A product is required to create an order.';
  end if;

  if v_delivery_type not in ('delivery', 'pickup') then
    raise exception 'Checkout orders must use delivery or pickup.';
  end if;

  if v_delivery_fee < 0 then
    raise exception 'Delivery fee must be a non-negative amount.';
  end if;

  if v_delivery_type = 'delivery' then
    if v_delivery_state is null then
      raise exception 'Delivery orders require a delivery state.';
    end if;

    if v_delivery_address is null then
      raise exception 'Delivery orders require a delivery address.';
    end if;
  end if;

  if v_delivery_type = 'pickup' and v_selected_pickup_location is null then
    raise exception 'Pickup orders require a selected pickup location.';
  end if;

  select *
  into v_product
  from public.products
  where id = p_product_id;

  if not found then
    raise exception 'Product not found for this order.';
  end if;

  if coalesce(v_product.is_approved, false) = false or v_product.deleted_at is not null then
    raise exception 'Only approved live products can be ordered.';
  end if;

  if coalesce(v_product.stock_quantity, 0) <= 0 then
    raise exception 'This product is out of stock.';
  end if;

  perform public.assert_seller_marketplace_active(v_product.seller_id);

  v_product_price := case
    when public.is_product_flash_sale_active(v_product) then v_product.sale_price
    else v_product.price
  end;
  v_platform_fee := round(coalesce(v_product_price, 0) * 0.05);
  v_total_amount := coalesce(v_product_price, 0) + v_delivery_fee;
  v_order_number :=
    upper(to_char(timezone('utc', now()), 'YYYYMMDDHH24MISS'))
    || '-'
    || upper(substr(replace(gen_random_uuid()::text, '-', ''), 1, 4));

  perform set_config('app.order_create_actor', 'secure_single_checkout', true);

  insert into public.orders (
    buyer_id,
    seller_id,
    product_id,
    product_snapshot,
    quantity,
    product_price,
    delivery_fee,
    platform_fee,
    total_amount,
    delivery_state,
    delivery_address,
    delivery_type,
    selected_pickup_location,
    delivery_zone_snapshot,
    pickup_location_snapshot,
    order_number,
    status
  )
  values (
    v_actor_id,
    v_product.seller_id,
    v_product.id,
    jsonb_build_object(
      'product_id', v_product.id,
      'name', v_product.name,
      'images', coalesce(to_jsonb(v_product.images), '[]'::jsonb),
      'category', v_product.category,
      'description', v_product.description,
      'seller_id', v_product.seller_id
    ),
    1,
    v_product_price,
    v_delivery_fee,
    v_platform_fee,
    v_total_amount,
    case when v_delivery_type = 'delivery' then v_delivery_state else null end,
    case when v_delivery_type = 'delivery' then v_delivery_address else null end,
    v_delivery_type,
    case when v_delivery_type = 'pickup' then v_selected_pickup_location else null end,
    case when v_delivery_type = 'delivery' then p_delivery_zone_snapshot else null end,
    case when v_delivery_type = 'pickup' then p_pickup_location_snapshot else null end,
    v_order_number,
    'PENDING'
  )
  returning *
  into v_order;

  perform set_config('app.order_create_actor', '', true);

  return v_order;
exception
  when others then
    perform set_config('app.order_create_actor', '', true);
    raise;
end;
$$;

create or replace function public.guard_order_client_write()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_request_role text := coalesce(
    nullif(auth.role(), ''),
    current_setting('request.jwt.claim.role', true)
  );
  v_actor_id uuid := auth.uid();
  v_actor_role text;
  v_transition_actor text := coalesce(current_setting('app.order_transition_actor', true), '');
  v_seller_transition_actor text := coalesce(current_setting('app.seller_order_transition', true), '');
  v_refund_actor text := coalesce(current_setting('app.refund_system_actor', true), '');
  v_hold_resolution_actor text := coalesce(current_setting('app.order_admin_hold_resolution', true), '');
  v_dispute_resolution_actor text := coalesce(current_setting('app.order_dispute_resolution', true), '');
  v_order_create_actor text := coalesce(current_setting('app.order_create_actor', true), '');
  v_product public.products%rowtype;
  v_expected_product_price numeric;
  v_new_order jsonb;
begin
  if v_request_role = 'service_role' then
    if tg_op = 'DELETE' then
      return old;
    end if;

    return new;
  end if;

  if tg_op = 'INSERT' and v_order_create_actor = 'secure_single_checkout' then
    return new;
  end if;

  if v_actor_id is not null then
    select role
    into v_actor_role
    from public.users
    where id = v_actor_id;
  end if;

  if tg_op = 'DELETE' then
    if v_actor_id is null
       or v_actor_role is distinct from 'buyer'
       or old.buyer_id is distinct from v_actor_id
       or old.status is distinct from 'PENDING'
    then
      raise exception 'Only the buyer can delete their own pending orders.';
    end if;

    return old;
  end if;

  v_new_order := to_jsonb(new);

  if tg_op = 'INSERT' then
    if v_actor_id is null or v_actor_role is distinct from 'buyer' then
      raise exception 'Only authenticated buyers can create orders from the client.';
    end if;

    if new.buyer_id is distinct from v_actor_id then
      raise exception 'You can only create orders for your own buyer account.';
    end if;

    if new.status is distinct from 'PENDING' then
      raise exception 'New client-created orders must start in PENDING status.';
    end if;

    if new.product_id is null then
      raise exception 'Client-created orders must reference a product.';
    end if;

    select *
    into v_product
    from public.products
    where id = new.product_id;

    if not found then
      raise exception 'Product not found for this order.';
    end if;

    if v_product.seller_id is distinct from new.seller_id then
      raise exception 'seller_id must match the product seller.';
    end if;

    if coalesce(v_product.is_approved, false) = false or v_product.deleted_at is not null then
      raise exception 'Only approved live products can be ordered.';
    end if;

    if coalesce(v_product.stock_quantity, 0) <= 0 then
      raise exception 'This product is out of stock.';
    end if;

    perform public.assert_seller_marketplace_active(v_product.seller_id);

    v_expected_product_price := case
      when public.is_product_flash_sale_active(v_product) then v_product.sale_price
      else v_product.price
    end;

    if coalesce(new.product_price, 0) <> coalesce(v_expected_product_price, 0) then
      raise exception 'product_price does not match the current product price.';
    end if;

    if coalesce(new.quantity, 0) < 1 then
      raise exception 'Order quantity must be at least 1.';
    end if;

    if coalesce(new.delivery_fee, 0) < 0
       or coalesce(new.platform_fee, 0) < 0
       or coalesce(new.total_amount, 0) <= 0
    then
      raise exception 'Order monetary fields must be valid non-negative amounts.';
    end if;

    if coalesce(new.total_amount, 0)
       <> (coalesce(new.product_price, 0) * coalesce(new.quantity, 0)) + coalesce(new.delivery_fee, 0)
    then
      raise exception 'total_amount must equal product total plus delivery fee.';
    end if;

    if coalesce(new.platform_fee, 0)
       <> round((coalesce(new.product_price, 0) * coalesce(new.quantity, 0)) * 0.05)
    then
      raise exception 'platform_fee does not match the current marketplace fee.';
    end if;

    if coalesce(v_new_order->>'payment_reference', '') <> ''
       or coalesce(v_new_order->>'paid_at', '') <> ''
       or coalesce(v_new_order->>'shipped_at', '') <> ''
       or coalesce(v_new_order->>'delivered_at', '') <> ''
       or coalesce(v_new_order->>'ready_for_pickup_at', '') <> ''
       or coalesce(v_new_order->>'picked_up_at', '') <> ''
       or coalesce(v_new_order->>'completed_at', '') <> ''
       or coalesce(v_new_order->>'cancelled_at', '') <> ''
       or coalesce(v_new_order->>'disputed_at', '') <> ''
       or coalesce(v_new_order->>'resolved_at', '') <> ''
       or coalesce(v_new_order->>'resolution_type', '') <> ''
       or coalesce(v_new_order->>'resolution_amount', '') <> ''
       or coalesce(v_new_order->>'resolution_notes', '') <> ''
       or coalesce(v_new_order->>'constitution_section', '') <> ''
       or coalesce(v_new_order->>'dispute_reason', '') <> ''
       or coalesce(v_new_order->>'dispute_status', '') <> ''
       or coalesce(v_new_order->>'resolved_by', '') <> ''
       or coalesce(v_new_order->>'ship_deadline', '') <> ''
       or coalesce(v_new_order->>'delivery_deadline', '') <> ''
       or coalesce(v_new_order->>'auto_cancel_at', '') <> ''
       or coalesce(v_new_order->>'auto_complete_at', '') <> ''
       or coalesce(v_new_order->>'dispute_deadline', '') <> ''
    then
      raise exception 'Protected order lifecycle fields can only be set by backend logic.';
    end if;

    return new;
  end if;

  if v_transition_actor <> ''
     or v_seller_transition_actor <> ''
     or v_refund_actor <> ''
     or v_hold_resolution_actor = 'enabled'
     or v_dispute_resolution_actor = 'enabled'
  then
    return new;
  end if;

  if v_actor_role = 'admin' then
    raise exception 'Admin direct order updates are disabled. Use the protected admin workflow.';
  end if;

  if v_actor_role = 'seller' then
    raise exception 'Use the protected seller order RPCs to update fulfillment.';
  end if;

  if v_actor_role = 'buyer' then
    raise exception 'Use the protected buyer order RPCs to confirm delivery, confirm pickup, or open disputes.';
  end if;

  raise exception 'You are not allowed to update orders.';
end;
$$;

revoke all on function public.create_single_checkout_order(uuid, text, numeric, text, text, text, jsonb, jsonb) from public;
revoke all on function public.create_single_checkout_order(uuid, text, numeric, text, text, text, jsonb, jsonb) from anon;
grant execute on function public.create_single_checkout_order(uuid, text, numeric, text, text, text, jsonb, jsonb) to authenticated;
