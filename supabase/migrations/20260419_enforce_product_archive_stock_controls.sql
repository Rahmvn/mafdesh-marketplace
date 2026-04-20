alter table public.products
  add column if not exists archived_reason text,
  add column if not exists last_purchased_at timestamptz;

create index if not exists products_last_purchased_at_idx
  on public.products (last_purchased_at desc nulls last);

create or replace function public.product_has_active_orders(product_uuid uuid)
returns boolean
language sql
stable
as $$
  select exists (
    select 1
    from public.orders o
    where o.status not in ('CANCELLED', 'COMPLETED', 'REFUNDED')
      and (
        o.product_id = product_uuid
        or exists (
          select 1
          from public.order_items oi
          where oi.order_id = o.id
            and oi.product_id = product_uuid
        )
      )
  );
$$;

create or replace function public.touch_product_last_purchased_at(product_uuid uuid, purchased_at timestamptz)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  if product_uuid is null then
    return;
  end if;

  update public.products
  set last_purchased_at = greatest(
    coalesce(last_purchased_at, purchased_at),
    purchased_at
  )
  where id = product_uuid;
end;
$$;

create or replace function public.update_last_purchased_at()
returns trigger
language plpgsql
as $$
begin
  perform public.touch_product_last_purchased_at(new.product_id, coalesce(new.created_at, now()));
  return new;
end;
$$;

create or replace function public.update_last_purchased_at_from_order_item()
returns trigger
language plpgsql
as $$
declare
  order_created_at timestamptz;
begin
  select created_at
  into order_created_at
  from public.orders
  where id = new.order_id;

  perform public.touch_product_last_purchased_at(
    new.product_id,
    coalesce(order_created_at, now())
  );

  return new;
end;
$$;

update public.products p
set last_purchased_at = latest.latest_purchased_at
from (
  select purchased.product_id, max(purchased.created_at) as latest_purchased_at
  from (
    select o.product_id, o.created_at
    from public.orders o
    where o.product_id is not null

    union all

    select oi.product_id, o.created_at
    from public.order_items oi
    join public.orders o on o.id = oi.order_id
    where oi.product_id is not null
  ) purchased
  group by purchased.product_id
) latest
where p.id = latest.product_id
  and (
    p.last_purchased_at is null
    or p.last_purchased_at < latest.latest_purchased_at
  );

drop trigger if exists orders_update_last_purchased_at on public.orders;
create trigger orders_update_last_purchased_at
after insert on public.orders
for each row
execute function public.update_last_purchased_at();

drop trigger if exists order_items_update_last_purchased_at on public.order_items;
create trigger order_items_update_last_purchased_at
after insert on public.order_items
for each row
execute function public.update_last_purchased_at_from_order_item();

create or replace function public.prevent_hard_delete()
returns trigger
language plpgsql
as $$
declare
  request_role text := coalesce(
    nullif(auth.role(), ''),
    current_setting('request.jwt.claim.role', true)
  );
begin
  if request_role = 'service_role' then
    return old;
  end if;

  raise exception 'Products cannot be permanently deleted. Use soft delete instead.';
end;
$$;

drop trigger if exists products_prevent_active_flash_sale_delete on public.products;
drop trigger if exists products_prevent_hard_delete on public.products;
create trigger products_prevent_hard_delete
before delete on public.products
for each row
execute function public.prevent_hard_delete();

create or replace function public.validate_soft_delete()
returns trigger
language plpgsql
as $$
declare
  request_role text := coalesce(
    nullif(auth.role(), ''),
    current_setting('request.jwt.claim.role', true)
  );
  actor_role text;
begin
  if request_role = 'service_role' then
    return new;
  end if;

  if auth.uid() is not null then
    select role
    into actor_role
    from public.users
    where id = auth.uid();
  end if;

  if old.deleted_at is null and new.deleted_at is not null then
    if actor_role = 'seller' then
      if public.product_has_active_orders(new.id) then
        raise exception 'This product cannot be archived while it has active orders.';
      end if;

      if coalesce(new.is_flash_sale, false)
        and new.sale_end is not null
        and new.sale_end >= now() then
        raise exception 'This product cannot be archived while it has an active flash sale.';
      end if;

      if coalesce(new.last_purchased_at, '-infinity'::timestamptz) >= now() - interval '7 days' then
        raise exception 'This product cannot be archived within 7 days of a recent purchase.';
      end if;
    end if;

    new.archived_reason := nullif(btrim(coalesce(new.archived_reason, '')), '');
    return new;
  end if;

  if old.deleted_at is not null and new.deleted_at is null and actor_role = 'seller' then
    if coalesce(new.is_approved, false) = false then
      raise exception 'Only approved products can be unarchived.';
    end if;

    new.archived_reason := null;
  end if;

  return new;
end;
$$;

drop trigger if exists products_validate_soft_delete on public.products;
create trigger products_validate_soft_delete
before update on public.products
for each row
execute function public.validate_soft_delete();

create or replace function public.prevent_stock_reduction()
returns trigger
language plpgsql
as $$
declare
  request_role text := coalesce(
    nullif(auth.role(), ''),
    current_setting('request.jwt.claim.role', true)
  );
  actor_role text;
begin
  if tg_op <> 'UPDATE' or new.stock_quantity >= old.stock_quantity then
    return new;
  end if;

  if request_role = 'service_role' then
    return new;
  end if;

  if auth.uid() is not null then
    select role
    into actor_role
    from public.users
    where id = auth.uid();
  end if;

  if actor_role = 'admin' then
    return new;
  end if;

  if new.stock_quantity = 0 and not public.product_has_active_orders(new.id) then
    return new;
  end if;

  if new.stock_quantity = 0 then
    raise exception 'Stock cannot be set to 0 while the product has active orders.';
  end if;

  raise exception 'Stock can only be reduced through order processing, not manual edits.';
end;
$$;

drop trigger if exists products_prevent_stock_reduction on public.products;
create trigger products_prevent_stock_reduction
before update on public.products
for each row
execute function public.prevent_stock_reduction();

create or replace function public.validate_product_edit()
returns trigger
language plpgsql
as $$
declare
  request_role text := coalesce(
    nullif(auth.role(), ''),
    current_setting('request.jwt.claim.role', true)
  );
  actor_role text;
  control_action text := coalesce(current_setting('app.product_control_action', true), '');
  has_active_orders boolean;
  original_price_changed boolean := false;
  flash_sale_changed boolean := false;
begin
  if tg_op <> 'UPDATE' or request_role = 'service_role' then
    return new;
  end if;

  if auth.uid() is not null then
    select role
    into actor_role
    from public.users
    where id = auth.uid();
  end if;

  if actor_role is distinct from 'seller' then
    return new;
  end if;

  if new.seller_id is distinct from old.seller_id then
    raise exception 'seller_id cannot be changed.';
  end if;

  if new.is_approved is distinct from old.is_approved then
    raise exception 'is_approved can only be changed by an admin.';
  end if;

  if new.deleted_at is distinct from old.deleted_at and control_action not in ('archive', 'unarchive') then
    raise exception 'Product archiving must go through the archive action.';
  end if;

  if new.archived_reason is distinct from old.archived_reason and control_action <> 'archive' then
    raise exception 'Archived reason can only be changed through the archive action.';
  end if;

  flash_sale_changed :=
    new.is_flash_sale is distinct from old.is_flash_sale
    or new.sale_price is distinct from old.sale_price
    or new.sale_start is distinct from old.sale_start
    or new.sale_end is distinct from old.sale_end;

  if flash_sale_changed and control_action <> 'flash_sale' then
    raise exception 'Flash sale settings must be changed through the flash sale system.';
  end if;

  original_price_changed :=
    (to_jsonb(new) -> 'original_price') is distinct from (to_jsonb(old) -> 'original_price');

  if new.category is distinct from old.category
    or new.price is distinct from old.price
    or original_price_changed then
    has_active_orders := public.product_has_active_orders(new.id);

    if has_active_orders then
      if new.category is distinct from old.category then
        raise exception 'Category cannot be changed while this product has active orders.';
      end if;

      if new.price is distinct from old.price or original_price_changed then
        raise exception 'Price cannot be changed while this product has active or pending orders.';
      end if;
    end if;
  end if;

  return new;
end;
$$;

drop trigger if exists products_validate_product_edit on public.products;
create trigger products_validate_product_edit
before update on public.products
for each row
execute function public.validate_product_edit();

create or replace function public.archive_product(p_product_id uuid, p_archived_reason text default null)
returns public.products
language plpgsql
security definer
set search_path = public
as $$
declare
  actor_id uuid := auth.uid();
  actor_role text;
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

  perform set_config('app.product_control_action', 'archive', true);

  update public.products
  set
    deleted_at = now(),
    archived_reason = nullif(btrim(coalesce(p_archived_reason, '')), ''),
    updated_at = now()
  where id = p_product_id
    and seller_id = actor_id
  returning * into archived_product;

  if not found then
    raise exception 'You can only archive your own products.';
  end if;

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

  perform set_config('app.product_control_action', 'unarchive', true);

  update public.products
  set
    deleted_at = null,
    archived_reason = null,
    updated_at = now()
  where id = p_product_id
    and seller_id = actor_id
  returning * into restored_product;

  if not found then
    raise exception 'You can only unarchive your own products.';
  end if;

  return restored_product;
end;
$$;

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

revoke all on function public.archive_product(uuid, text) from public;
revoke all on function public.unarchive_product(uuid) from public;
revoke all on function public.set_product_flash_sale(uuid, boolean, numeric, timestamptz, timestamptz, integer) from public;

grant execute on function public.archive_product(uuid, text) to authenticated;
grant execute on function public.unarchive_product(uuid) to authenticated;
grant execute on function public.set_product_flash_sale(uuid, boolean, numeric, timestamptz, timestamptz, integer) to authenticated;

drop policy if exists "sellers can insert own products with safe flash defaults" on public.products;
create policy "sellers can insert own products with safe flash defaults"
on public.products
for insert
to authenticated
with check (
  seller_id = auth.uid()
  and deleted_at is null
  and archived_reason is null
  and coalesce(admin_approved_discount, false) = false
  and coalesce(sale_quantity_sold, 0) = 0
);

drop policy if exists "sellers can update own products without protected flash writes" on public.products;
create policy "sellers can update own products with controlled protected fields"
on public.products
for update
to authenticated
using (seller_id = auth.uid())
with check (
  seller_id = auth.uid()
  and is_approved = (
    select p.is_approved
    from public.products p
    where p.id = products.id
  )
  and seller_id = (
    select p.seller_id
    from public.products p
    where p.id = products.id
  )
  and deleted_at is not distinct from (
    select p.deleted_at
    from public.products p
    where p.id = products.id
  )
  and archived_reason is not distinct from (
    select p.archived_reason
    from public.products p
    where p.id = products.id
  )
  and is_flash_sale = (
    select p.is_flash_sale
    from public.products p
    where p.id = products.id
  )
  and sale_price is not distinct from (
    select p.sale_price
    from public.products p
    where p.id = products.id
  )
  and sale_start is not distinct from (
    select p.sale_start
    from public.products p
    where p.id = products.id
  )
  and sale_end is not distinct from (
    select p.sale_end
    from public.products p
    where p.id = products.id
  )
  and admin_approved_discount = (
    select p.admin_approved_discount
    from public.products p
    where p.id = products.id
  )
  and sale_quantity_sold = (
    select p.sale_quantity_sold
    from public.products p
    where p.id = products.id
  )
);
