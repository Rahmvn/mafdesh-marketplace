create or replace function public.deduct_stock_bulk(
  p_items jsonb
)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_item jsonb;
  v_product_id uuid;
  v_quantity integer;
  v_current_stock integer;
begin
  for v_item in select * from jsonb_array_elements(p_items)
  loop
    v_product_id := (v_item->>'product_id')::uuid;
    v_quantity := (v_item->>'quantity')::integer;

    select stock_quantity into v_current_stock
    from public.products
    where id = v_product_id
    for update;

    if not found then
      raise exception 'Product % not found', v_product_id;
    end if;

    if v_current_stock < v_quantity then
      raise exception 'Insufficient stock for product %. Available: %, Requested: %',
        v_product_id, v_current_stock, v_quantity;
    end if;

    update public.products
    set stock_quantity = stock_quantity - v_quantity
    where id = v_product_id;
  end loop;
end;
$$;

revoke all on function public.deduct_stock_bulk(jsonb) from public;
grant execute on function public.deduct_stock_bulk(jsonb) to service_role;

create or replace function public.build_product_snapshot(
  p_product_id uuid
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_product public.products%rowtype;
  v_seller public.users%rowtype;
begin
  select * into v_product
  from public.products
  where id = p_product_id;

  if not found then
    return '{}'::jsonb;
  end if;

  select * into v_seller
  from public.users
  where id = v_product.seller_id;

  return jsonb_build_object(
    'product_id', v_product.id,
    'name', v_product.name,
    'price', v_product.price,
    'original_price', v_product.original_price,
    'images', coalesce(to_jsonb(v_product.images), '[]'::jsonb),
    'category', v_product.category,
    'description', v_product.description,
    'seller_id', v_product.seller_id,
    'seller_business_name', v_seller.business_name,
    'seller_is_verified', v_seller.is_verified,
    'snapshot_at', now()
  );
end;
$$;

revoke all on function public.build_product_snapshot(uuid) from public;
grant execute on function public.build_product_snapshot(uuid) to service_role;

create or replace function public.reserve_stock_for_order(
  p_items jsonb
)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_item jsonb;
  v_product_id uuid;
  v_quantity integer;
  v_current_stock integer;
  v_product_name text;
begin
  for v_item in
    select value
    from jsonb_array_elements(p_items)
    order by value->>'product_id'
  loop
    v_product_id := (v_item->>'product_id')::uuid;
    v_quantity := (v_item->>'quantity')::integer;

    if v_quantity <= 0 then
      raise exception 'Invalid quantity for product %', v_product_id;
    end if;

    select stock_quantity, name
    into v_current_stock, v_product_name
    from public.products
    where id = v_product_id
      and is_approved = true
      and deleted_at is null
    for update;

    if not found then
      raise exception 'Product not found or no longer available.';
    end if;

    if v_current_stock < v_quantity then
      raise exception '"%" only has % unit(s) left in stock.',
        v_product_name, v_current_stock;
    end if;

    update public.products
    set stock_quantity = stock_quantity - v_quantity
    where id = v_product_id;
  end loop;
end;
$$;

revoke all on function public.reserve_stock_for_order(jsonb) from public;
grant execute on function public.reserve_stock_for_order(jsonb) to service_role;
