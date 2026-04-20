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

create or replace function public.validate_flash_sale()
returns trigger
language plpgsql
as $$
declare
  request_role text := coalesce(
    nullif(auth.role(), ''),
    current_setting('request.jwt.claim.role', true)
  );
  seller_record public.users%rowtype;
  has_flash_sale_configuration boolean;
  discount_percent numeric;
  sale_duration interval;
  flash_sale_definition_changed boolean;
  reapproval_field text;
  expected_reapproval_reason text;
  allowed_reapproval_transition boolean := false;
begin
  if tg_op = 'UPDATE' then
    reapproval_field := public.get_product_reapproval_field(old, new);
    expected_reapproval_reason :=
      case
        when reapproval_field is not null then format('Field changed: %s', reapproval_field)
        else null
      end;
    allowed_reapproval_transition :=
      expected_reapproval_reason is not null
      and coalesce(old.is_approved, false) = true
      and coalesce(new.is_approved, false) = false
      and coalesce(new.reapproval_reason, '') = expected_reapproval_reason;
  end if;

  if tg_op = 'UPDATE'
    and public.is_product_flash_sale_active(old)
    and new.price is distinct from old.price
    and not allowed_reapproval_transition then
    raise exception 'Original price cannot be changed while a flash sale is active.';
  end if;

  if tg_op = 'UPDATE'
    and old.deleted_at is null
    and new.deleted_at is not null
    and public.is_product_flash_sale_active(old) then
    raise exception 'Products with an active flash sale cannot be deleted.';
  end if;

  if request_role <> 'service_role' then
    if tg_op = 'INSERT' and coalesce(new.sale_quantity_sold, 0) <> 0 then
      raise exception 'sale_quantity_sold can only be changed by the database.';
    end if;

    if tg_op = 'UPDATE' and new.sale_quantity_sold is distinct from old.sale_quantity_sold then
      raise exception 'sale_quantity_sold can only be changed by the database.';
    end if;

    if tg_op = 'INSERT' and coalesce(new.admin_approved_discount, false) then
      raise exception 'admin_approved_discount can only be changed through admin moderation.';
    end if;

    if tg_op = 'UPDATE' and new.admin_approved_discount is distinct from old.admin_approved_discount then
      raise exception 'admin_approved_discount can only be changed through admin moderation.';
    end if;
  end if;

  new.sale_quantity_sold := coalesce(new.sale_quantity_sold, 0);
  new.admin_approved_discount := coalesce(new.admin_approved_discount, false);

  has_flash_sale_configuration :=
    coalesce(new.is_flash_sale, false)
    or new.sale_price is not null
    or new.sale_start is not null
    or new.sale_end is not null
    or new.sale_quantity_limit is not null;

  if not has_flash_sale_configuration then
    new.is_flash_sale := false;
    new.sale_price := null;
    new.sale_start := null;
    new.sale_end := null;
    new.sale_quantity_limit := null;
    new.sale_quantity_sold := 0;
    new.original_price_locked := false;
    return new;
  end if;

  if not coalesce(new.is_flash_sale, false) then
    raise exception 'Set is_flash_sale to true or clear all flash sale fields.';
  end if;

  select *
  into seller_record
  from public.users
  where id = new.seller_id;

  if not found then
    raise exception 'Seller account not found for this product.';
  end if;

  if coalesce(seller_record.is_trusted_seller, false) = false then
    raise exception 'Only trusted sellers can create flash sales.';
  end if;

  if coalesce(nullif(seller_record.account_status, ''), 'active') <> 'active' then
    raise exception 'Only active seller accounts can create flash sales.';
  end if;

  if coalesce(new.is_approved, false) = false then
    raise exception 'Only approved products can be placed in a flash sale.';
  end if;

  if coalesce(new.stock_quantity, 0) <= 0 then
    raise exception 'Only in-stock products can be placed in a flash sale.';
  end if;

  if new.deleted_at is not null then
    raise exception 'Deleted products cannot be placed in a flash sale.';
  end if;

  if new.sale_price is null then
    raise exception 'sale_price must be set for a flash sale.';
  end if;

  if new.sale_price >= new.price then
    raise exception 'sale_price must be lower than price.';
  end if;

  discount_percent := ((new.price - new.sale_price) / nullif(new.price, 0)) * 100;
  if not coalesce(new.admin_approved_discount, false) and discount_percent > 50 then
    raise exception 'Discounts above 50% require admin approval.';
  end if;

  if new.sale_start is null or new.sale_end is null then
    raise exception 'sale_start and sale_end must both be set.';
  end if;

  if new.sale_end <= new.sale_start then
    raise exception 'sale_end must be after sale_start.';
  end if;

  sale_duration := new.sale_end - new.sale_start;
  if sale_duration > interval '48 hours' then
    raise exception 'Flash sale duration cannot exceed 48 hours.';
  end if;

  if new.sale_quantity_limit is not null and new.sale_quantity_limit <= 0 then
    raise exception 'sale_quantity_limit must be greater than 0 when provided.';
  end if;

  if new.sale_quantity_limit is not null and new.sale_quantity_sold > new.sale_quantity_limit then
    raise exception 'sale_quantity_sold cannot exceed sale_quantity_limit.';
  end if;

  flash_sale_definition_changed :=
    tg_op = 'INSERT'
    or new.is_flash_sale is distinct from old.is_flash_sale
    or new.sale_price is distinct from old.sale_price
    or new.sale_start is distinct from old.sale_start
    or new.sale_end is distinct from old.sale_end
    or new.sale_quantity_limit is distinct from old.sale_quantity_limit;

  if request_role <> 'service_role' and flash_sale_definition_changed then
    new.sale_quantity_sold := 0;
  end if;

  new.original_price_locked := public.is_product_flash_sale_active(new);

  return new;
end;
$$;

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
  reapproval_field text;
  expected_reapproval_reason text;
  allowed_reapproval_transition boolean := false;
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

  reapproval_field := public.get_product_reapproval_field(old, new);
  expected_reapproval_reason :=
    case
      when reapproval_field is not null then format('Field changed: %s', reapproval_field)
      else null
    end;
  allowed_reapproval_transition :=
    expected_reapproval_reason is not null
    and coalesce(old.is_approved, false) = true
    and coalesce(new.is_approved, false) = false
    and coalesce(new.reapproval_reason, '') = expected_reapproval_reason;

  if new.seller_id is distinct from old.seller_id then
    raise exception 'seller_id cannot be changed.';
  end if;

  if new.reapproval_reason is distinct from old.reapproval_reason and not allowed_reapproval_transition then
    raise exception 'reapproval_reason is controlled by the system.';
  end if;

  if new.is_approved is distinct from old.is_approved then
    if coalesce(new.is_approved, false) then
      raise exception 'is_approved can only be changed by an admin.';
    end if;

    if not allowed_reapproval_transition then
      raise exception 'is_approved can only be changed by an admin.';
    end if;
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
    or new.sale_end is distinct from old.sale_end
    or new.sale_quantity_limit is distinct from old.sale_quantity_limit;

  if flash_sale_changed and control_action <> 'flash_sale' and not allowed_reapproval_transition then
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

create or replace function public.guard_product_client_mutation()
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
    if tg_op = 'DELETE' then
      return old;
    end if;

    return new;
  end if;

  if tg_op = 'DELETE' then
    raise exception 'Hard deleting products from the client is not allowed.';
  end if;

  if auth.uid() is null then
    raise exception 'Authenticated session required.';
  end if;

  select u.role
  into actor_role
  from public.users u
  where u.id = auth.uid();

  if actor_role = 'admin' then
    raise exception 'Admin client writes are disabled. Use the guarded admin moderation flow.';
  end if;

  if actor_role is distinct from 'seller' then
    raise exception 'Only sellers can change products directly.';
  end if;

  if tg_op = 'INSERT' then
    if new.seller_id is distinct from auth.uid() then
      raise exception 'You can only create products for your own seller account.';
    end if;

    if coalesce(new.is_approved, false) then
      raise exception 'New products cannot be self-approved.';
    end if;

    if coalesce(btrim(new.reapproval_reason), '') <> '' then
      raise exception 'reapproval_reason can only be changed by the database.';
    end if;

    if new.deleted_by_admin_id is not null then
      raise exception 'Only the guarded admin flow can set deletion ownership.';
    end if;

    if coalesce(btrim(new.deletion_reason), '') <> '' then
      raise exception 'Only the guarded admin flow can set deletion reasons.';
    end if;

    if coalesce(new.admin_approved_discount, false) then
      raise exception 'admin_approved_discount can only be changed through admin moderation.';
    end if;

    if coalesce(new.sale_quantity_sold, 0) <> 0 then
      raise exception 'sale_quantity_sold can only be changed by the database.';
    end if;

    return new;
  end if;

  if old.seller_id is distinct from auth.uid() then
    raise exception 'You can only update your own products.';
  end if;

  if new.seller_id is distinct from old.seller_id then
    raise exception 'Changing product ownership is not allowed.';
  end if;

  if coalesce(new.is_approved, false) and not coalesce(old.is_approved, false) then
    raise exception 'Sellers cannot self-approve products.';
  end if;

  if new.reapproval_reason is distinct from old.reapproval_reason then
    raise exception 'reapproval_reason can only be changed by the database.';
  end if;

  if new.deleted_by_admin_id is not null then
    raise exception 'Only the guarded admin flow can set deletion ownership.';
  end if;

  if coalesce(btrim(new.deletion_reason), '') <> '' then
    raise exception 'Only the guarded admin flow can set deletion reasons.';
  end if;

  if new.admin_approved_discount is distinct from old.admin_approved_discount then
    raise exception 'admin_approved_discount can only be changed through admin moderation.';
  end if;

  if new.sale_quantity_sold is distinct from old.sale_quantity_sold then
    raise exception 'sale_quantity_sold can only be changed by the database.';
  end if;

  return new;
end;
$$;

drop policy if exists "sellers can insert own products with safe flash defaults" on public.products;
create policy "sellers can insert own products with safe flash defaults"
on public.products
for insert
to authenticated
with check (
  seller_id = auth.uid()
  and deleted_at is null
  and archived_reason is null
  and coalesce(btrim(reapproval_reason), '') = ''
  and coalesce(admin_approved_discount, false) = false
  and coalesce(sale_quantity_sold, 0) = 0
);

drop policy if exists "sellers can update own products with controlled protected fields" on public.products;
drop policy if exists "sellers can update own products without protected flash writes" on public.products;
create policy "sellers can update own products with controlled protected fields"
on public.products
for update
to authenticated
using (seller_id = auth.uid())
with check (
  seller_id = auth.uid()
  and seller_id = (
    select p.seller_id
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
