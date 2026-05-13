create or replace function public.set_product_flash_sale(
  p_product_id uuid,
  p_is_flash_sale boolean,
  p_sale_price numeric default null,
  p_sale_start timestamptz default null,
  p_sale_end timestamptz default null,
  p_sale_quantity_limit integer default null
)
returns public.products
language plpgsql
security definer
set search_path = public
as $$
declare
  actor_id uuid := auth.uid();
  actor_role text;
  updated_product public.products%rowtype;
begin
  if actor_id is null then
    raise exception 'Authenticated session required.';
  end if;

  select role
  into actor_role
  from public.users
  where id = actor_id;

  if actor_role is distinct from 'seller' then
    raise exception 'Only sellers can update flash sale settings.';
  end if;

  perform public.refresh_seller_trust_metrics(actor_id);
  perform set_config('app.product_control_action', 'flash_sale', true);

  update public.products
  set
    is_flash_sale = coalesce(p_is_flash_sale, false),
    sale_price = case when coalesce(p_is_flash_sale, false) then p_sale_price else null end,
    sale_start = case when coalesce(p_is_flash_sale, false) then p_sale_start else null end,
    sale_end = case when coalesce(p_is_flash_sale, false) then p_sale_end else null end,
    sale_quantity_limit = case when coalesce(p_is_flash_sale, false) then p_sale_quantity_limit else null end,
    updated_at = now()
  where id = p_product_id
    and seller_id = actor_id
  returning * into updated_product;

  if not found then
    raise exception 'You can only update flash sale settings for your own products.';
  end if;

  return updated_product;
end;
$$;

