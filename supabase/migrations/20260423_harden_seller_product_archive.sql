create or replace function public.archive_product(p_product_id uuid, p_archived_reason text default null)
returns public.products
language plpgsql
security definer
set search_path = public
as $$
declare
  actor_id uuid := auth.uid();
  actor_role text;
  product_row public.products%rowtype;
  archived_product public.products%rowtype;
begin
  if actor_id is null then
    raise exception 'Authenticated session required.';
  end if;

  select role
  into actor_role
  from public.users
  where id = actor_id;

  if actor_role is distinct from 'seller' then
    raise exception 'Only sellers can archive products.';
  end if;

  select *
  into product_row
  from public.products
  where id = p_product_id
    and seller_id = actor_id
  for update;

  if not found then
    raise exception 'You can only archive your own products.';
  end if;

  if product_row.deleted_by_admin_id is not null
    or nullif(btrim(coalesce(product_row.deletion_reason, '')), '') is not null then
    raise exception 'This product was archived by admin and cannot be changed by the seller.';
  end if;

  if product_row.deleted_at is not null then
    return product_row;
  end if;

  if exists (
    select 1
    from public.product_edit_requests per
    where per.product_id = product_row.id
      and per.status = 'pending'
  ) then
    raise exception 'Resolve the pending product edit review before archiving this product.';
  end if;

  perform set_config('app.product_control_action', 'archive', true);

  update public.products
  set
    deleted_at = now(),
    archived_reason = nullif(btrim(coalesce(p_archived_reason, '')), ''),
    updated_at = now()
  where id = product_row.id
  returning * into archived_product;

  return archived_product;
end;
$$;

create or replace function public.unarchive_product(p_product_id uuid)
returns public.products
language plpgsql
security definer
set search_path = public
as $$
declare
  actor_id uuid := auth.uid();
  actor_role text;
  product_row public.products%rowtype;
  restored_product public.products%rowtype;
begin
  if actor_id is null then
    raise exception 'Authenticated session required.';
  end if;

  select role
  into actor_role
  from public.users
  where id = actor_id;

  if actor_role is distinct from 'seller' then
    raise exception 'Only sellers can unarchive products.';
  end if;

  select *
  into product_row
  from public.products
  where id = p_product_id
    and seller_id = actor_id
  for update;

  if not found then
    raise exception 'You can only unarchive your own products.';
  end if;

  if product_row.deleted_by_admin_id is not null
    or nullif(btrim(coalesce(product_row.deletion_reason, '')), '') is not null then
    raise exception 'This product was archived by admin and can only be restored by admin.';
  end if;

  if product_row.deleted_at is null then
    return product_row;
  end if;

  if coalesce(product_row.is_approved, false) = false then
    raise exception 'Only approved products can be unarchived.';
  end if;

  if coalesce(product_row.stock_quantity, 0) <= 0 then
    raise exception 'Restock this product before unarchiving it.';
  end if;

  if exists (
    select 1
    from public.product_edit_requests per
    where per.product_id = product_row.id
      and per.status = 'pending'
  ) then
    raise exception 'Resolve the pending product edit review before unarchiving this product.';
  end if;

  perform set_config('app.product_control_action', 'unarchive', true);

  update public.products
  set
    deleted_at = null,
    archived_reason = null,
    updated_at = now()
  where id = product_row.id
  returning * into restored_product;

  return restored_product;
end;
$$;

revoke all on function public.archive_product(uuid, text) from public;
revoke all on function public.unarchive_product(uuid) from public;

grant execute on function public.archive_product(uuid, text) to authenticated;
grant execute on function public.unarchive_product(uuid) to authenticated;
