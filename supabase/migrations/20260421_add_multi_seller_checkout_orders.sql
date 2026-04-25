create extension if not exists pgcrypto;

alter table public.orders
  add column if not exists checkout_session_id uuid,
  add column if not exists subtotal numeric not null default 0,
  add column if not exists payment_reference text;

create index if not exists orders_checkout_session_id_idx
  on public.orders (checkout_session_id);

create index if not exists orders_payment_reference_idx
  on public.orders (payment_reference);

create or replace function public.create_multi_seller_orders(
  p_checkout_session_id uuid,
  p_buyer_id uuid,
  p_payment_reference text,
  p_orders jsonb
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_order_entry jsonb;
  v_item_entry jsonb;
  v_created_order_ids jsonb := '[]'::jsonb;
  v_existing_order_ids jsonb;
  v_order_id uuid;
  v_order_number text;
  v_seller_id uuid;
  v_delivery_method text;
  v_delivery_fee numeric;
  v_platform_fee numeric;
  v_subtotal numeric;
  v_total numeric;
  v_discount_amount numeric;
  v_delivery_state text;
  v_delivery_address text;
  v_selected_pickup_location text;
  v_delivery_zone_snapshot jsonb;
  v_pickup_location_snapshot jsonb;
  v_items jsonb;
  v_item_count integer;
  v_product_id uuid;
  v_quantity integer;
  v_price_at_time numeric;
  v_product_snapshot jsonb;
  v_product public.products%rowtype;
  v_now timestamptz := timezone('utc', now());
  v_order_total_check numeric;
  v_ship_deadline timestamptz;
  v_added_business_days integer;
begin
  if p_checkout_session_id is null then
    raise exception 'checkout_session_id is required.';
  end if;

  if p_buyer_id is null then
    raise exception 'buyer_id is required.';
  end if;

  if coalesce(btrim(p_payment_reference), '') = '' then
    raise exception 'payment_reference is required.';
  end if;

  if jsonb_typeof(p_orders) is distinct from 'array' then
    raise exception 'p_orders must be a JSON array.';
  end if;

  if jsonb_array_length(p_orders) = 0 then
    raise exception 'p_orders cannot be empty.';
  end if;

  select jsonb_agg(existing_orders.id order by existing_orders.created_at, existing_orders.id)
  into v_existing_order_ids
  from public.orders as existing_orders
  where existing_orders.payment_reference = p_payment_reference
    and existing_orders.buyer_id = p_buyer_id;

  if v_existing_order_ids is not null then
    return v_existing_order_ids;
  end if;

  for v_order_entry in
    select value
    from jsonb_array_elements(p_orders)
  loop
    v_seller_id := nullif(v_order_entry->>'seller_id', '')::uuid;
    v_delivery_method := lower(coalesce(v_order_entry->>'delivery_method', ''));
    v_delivery_fee := coalesce((v_order_entry->>'delivery_fee')::numeric, 0);
    v_platform_fee := coalesce((v_order_entry->>'platform_fee')::numeric, 0);
    v_subtotal := coalesce((v_order_entry->>'subtotal')::numeric, 0);
    v_total := coalesce((v_order_entry->>'total')::numeric, 0);
    v_discount_amount := coalesce((v_order_entry->>'discount_amount')::numeric, 0);
    v_delivery_state := nullif(btrim(coalesce(v_order_entry->>'delivery_state', '')), '');
    v_delivery_address := nullif(btrim(coalesce(v_order_entry->>'delivery_address', '')), '');
    v_selected_pickup_location :=
      nullif(btrim(coalesce(v_order_entry->>'selected_pickup_location', '')), '');
    v_delivery_zone_snapshot := coalesce(v_order_entry->'delivery_zone_snapshot', null);
    v_pickup_location_snapshot := coalesce(v_order_entry->'pickup_location_snapshot', null);
    v_items := v_order_entry->'items';
    v_item_count := coalesce(jsonb_array_length(v_items), 0);
    v_order_total_check := (v_subtotal + v_delivery_fee) - v_discount_amount;

    if v_seller_id is null then
      raise exception 'Each order group must include seller_id.';
    end if;

    perform public.assert_seller_marketplace_active(v_seller_id);

    if v_delivery_method not in ('delivery', 'pickup') then
      raise exception 'Each order group must use delivery or pickup.';
    end if;

    if v_item_count = 0 then
      raise exception 'Each order group must include at least one item.';
    end if;

    if v_subtotal < 0 or v_delivery_fee < 0 or v_platform_fee < 0 or v_discount_amount < 0 then
      raise exception 'Order amounts cannot be negative.';
    end if;

    if abs(v_total - v_order_total_check) > 0.01 then
      raise exception 'Order total mismatch for seller group %.', v_seller_id;
    end if;

    if v_delivery_method = 'delivery' then
      if v_delivery_state is null or v_delivery_address is null then
        raise exception 'Delivery orders require both delivery_state and delivery_address.';
      end if;
    end if;

    if v_delivery_method = 'pickup' and v_selected_pickup_location is null then
      raise exception 'Pickup orders require a selected pickup location.';
    end if;

    v_order_number :=
      upper(to_char(v_now, 'YYYYMMDDHH24MISS'))
      || '-'
      || upper(substr(replace(gen_random_uuid()::text, '-', ''), 1, 4));

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
      status,
      checkout_session_id,
      subtotal,
      payment_reference
    )
    values (
      p_buyer_id,
      v_seller_id,
      null,
      null,
      null,
      null,
      v_delivery_fee,
      v_platform_fee,
      v_total,
      case when v_delivery_method = 'delivery' then v_delivery_state else null end,
      case when v_delivery_method = 'delivery' then v_delivery_address else null end,
      v_delivery_method,
      case when v_delivery_method = 'pickup' then v_selected_pickup_location else null end,
      case when v_delivery_method = 'delivery' then v_delivery_zone_snapshot else null end,
      case when v_delivery_method = 'pickup' then v_pickup_location_snapshot else null end,
      v_order_number,
      'PENDING',
      p_checkout_session_id,
      v_subtotal,
      p_payment_reference
    )
    returning id into v_order_id;

    for v_item_entry in
      select value
      from jsonb_array_elements(v_items)
    loop
      v_product_id := nullif(v_item_entry->>'product_id', '')::uuid;
      v_quantity := coalesce((v_item_entry->>'quantity')::integer, 0);
      v_price_at_time := coalesce((v_item_entry->>'price_at_time')::numeric, 0);
      v_product_snapshot := coalesce(v_item_entry->'product_snapshot', null);

      if v_product_id is null then
        raise exception 'Each order item must include product_id.';
      end if;

      if v_quantity < 1 then
        raise exception 'Each order item must have a quantity of at least 1.';
      end if;

      if v_price_at_time < 0 then
        raise exception 'Order item price_at_time cannot be negative.';
      end if;

      select *
      into v_product
      from public.products
      where id = v_product_id
      for update;

      if not found then
        raise exception 'Product % was not found.', v_product_id;
      end if;

      if v_product.seller_id is distinct from v_seller_id then
        raise exception 'Product % does not belong to seller %.', v_product_id, v_seller_id;
      end if;

      if coalesce(v_product.stock_quantity, 0) < v_quantity then
        raise exception 'OUT_OF_STOCK: % only has % left.',
          coalesce(nullif(v_product.name, ''), v_product_id::text),
          coalesce(v_product.stock_quantity, 0);
      end if;

      update public.products
      set stock_quantity = stock_quantity - v_quantity
      where id = v_product_id
        and stock_quantity >= v_quantity;

      if not found then
        raise exception 'OUT_OF_STOCK: % is no longer available in the requested quantity.',
          coalesce(nullif(v_product.name, ''), v_product_id::text);
      end if;

      insert into public.order_items (
        order_id,
        product_id,
        quantity,
        price_at_time,
        product_snapshot
      )
      values (
        v_order_id,
        v_product_id,
        v_quantity,
        v_price_at_time,
        coalesce(
          v_product_snapshot,
          jsonb_build_object(
            'product_id', v_product.id,
            'name', v_product.name,
            'images', coalesce(to_jsonb(v_product.images), '[]'::jsonb),
            'category', v_product.category,
            'description', v_product.description,
            'seller_id', v_product.seller_id
          )
        )
      );

      if v_product.id is not null
         and v_price_at_time > 0
         and v_price_at_time < coalesce(v_product.price, 0)
      then
        for v_item_count in 1..v_quantity loop
          perform public.increment_sale_quantity(v_product.id);
        end loop;
      end if;
    end loop;

    v_ship_deadline := v_now;
    v_added_business_days := 0;

    while v_added_business_days < 2 loop
      v_ship_deadline := v_ship_deadline + interval '1 day';

      if extract(isodow from v_ship_deadline) < 6 then
        v_added_business_days := v_added_business_days + 1;
      end if;
    end loop;

    update public.orders
    set
      status = 'PAID_ESCROW',
      ship_deadline = v_ship_deadline
    where id = v_order_id;

    v_created_order_ids := v_created_order_ids || to_jsonb(v_order_id);
  end loop;

  return v_created_order_ids;
end;
$$;

revoke all on function public.create_multi_seller_orders(uuid, uuid, text, jsonb) from public;
revoke all on function public.create_multi_seller_orders(uuid, uuid, text, jsonb) from anon;
revoke all on function public.create_multi_seller_orders(uuid, uuid, text, jsonb) from authenticated;
grant execute on function public.create_multi_seller_orders(uuid, uuid, text, jsonb) to service_role;
