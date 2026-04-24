alter table public.products
  add column if not exists reapproval_reason text;

create or replace function public.get_product_reapproval_field(
  old_product public.products,
  new_product public.products
)
returns text
language sql
stable
as $$
  select case
    when coalesce(old_product.is_approved, false) = false then null
    when new_product.price is distinct from old_product.price then 'price'
    when (to_jsonb(new_product) -> 'original_price') is distinct from (to_jsonb(old_product) -> 'original_price') then 'original_price'
    when new_product.images is distinct from old_product.images then 'images'
    when new_product.category is distinct from old_product.category then 'category'
    when new_product.name is distinct from old_product.name then 'name'
    else null
  end;
$$;

create or replace function public.handle_product_reapproval()
returns trigger
language plpgsql
as $$
declare
  changed_field text;
begin
  if tg_op <> 'UPDATE' then
    return new;
  end if;

  if coalesce(new.is_approved, false) and coalesce(old.is_approved, false) = false then
    new.reapproval_reason := null;
    return new;
  end if;

  changed_field := public.get_product_reapproval_field(old, new);

  if changed_field is null then
    return new;
  end if;

  new.is_approved := false;
  new.reapproval_reason := format('Field changed: %s', changed_field);
  new.is_flash_sale := false;
  new.sale_price := null;
  new.sale_start := null;
  new.sale_end := null;
  new.sale_quantity_limit := null;

  return new;
end;
$$;

drop trigger if exists products_handle_product_reapproval on public.products;
create trigger products_handle_product_reapproval
before update on public.products
for each row
execute function public.handle_product_reapproval();
