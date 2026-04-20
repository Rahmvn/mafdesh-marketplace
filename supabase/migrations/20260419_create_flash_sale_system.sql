create extension if not exists pgcrypto;

alter table public.products
  add column if not exists sale_price numeric,
  add column if not exists sale_start timestamptz,
  add column if not exists sale_end timestamptz,
  add column if not exists sale_quantity_limit integer,
  add column if not exists sale_quantity_sold integer not null default 0,
  add column if not exists is_flash_sale boolean not null default false,
  add column if not exists original_price_locked boolean not null default false,
  add column if not exists admin_approved_discount boolean not null default false;

alter table public.users
  add column if not exists is_trusted_seller boolean not null default false,
  add column if not exists completed_orders integer not null default 0,
  add column if not exists average_rating numeric not null default 0,
  add column if not exists dispute_rate numeric not null default 0,
  add column if not exists no_fraud_flags boolean not null default true,
  add column if not exists account_status text not null default 'active';

update public.products
set
  sale_quantity_sold = coalesce(sale_quantity_sold, 0),
  is_flash_sale = coalesce(is_flash_sale, false),
  original_price_locked = coalesce(original_price_locked, false),
  admin_approved_discount = coalesce(admin_approved_discount, false);

update public.users
set
  completed_orders = coalesce(completed_orders, 0),
  average_rating = coalesce(average_rating, 0),
  dispute_rate = coalesce(dispute_rate, 0),
  no_fraud_flags = coalesce(no_fraud_flags, true),
  account_status = coalesce(nullif(account_status, ''), status, 'active');

create index if not exists products_flash_sale_lookup_idx
  on public.products (is_flash_sale, sale_end, sale_start);

create or replace function public.sync_user_account_status()
returns trigger
language plpgsql
as $$
begin
  if tg_op = 'INSERT' then
    if new.account_status is null or btrim(new.account_status) = '' then
      new.account_status := coalesce(nullif(new.status, ''), 'active');
    elsif new.status is null or btrim(new.status) = '' then
      new.status := new.account_status;
    end if;

    return new;
  end if;

  if new.account_status is distinct from old.account_status then
    new.status := new.account_status;
  elsif new.status is distinct from old.status then
    new.account_status := new.status;
  elsif new.account_status is null or btrim(new.account_status) = '' then
    new.account_status := coalesce(nullif(new.status, ''), 'active');
  end if;

  return new;
end;
$$;

drop trigger if exists users_sync_account_status on public.users;
create trigger users_sync_account_status
before insert or update of status, account_status on public.users
for each row
execute function public.sync_user_account_status();

create or replace function public.recalculate_trusted_seller()
returns trigger
language plpgsql
as $$
declare
  next_value boolean;
begin
  next_value :=
    coalesce(new.completed_orders, 0) >= 5
    and coalesce(new.average_rating, 0) >= 4.0
    and coalesce(new.dispute_rate, 0) <= 0.10
    and coalesce(new.no_fraud_flags, false) = true
    and coalesce(nullif(new.account_status, ''), 'active') = 'active';

  update public.users
  set is_trusted_seller = next_value
  where id = new.id
    and is_trusted_seller is distinct from next_value;

  return null;
end;
$$;

update public.users
set is_trusted_seller =
  completed_orders >= 5
  and average_rating >= 4.0
  and dispute_rate <= 0.10
  and no_fraud_flags = true
  and coalesce(nullif(account_status, ''), 'active') = 'active';

drop trigger if exists users_recalculate_trusted_seller on public.users;
create trigger users_recalculate_trusted_seller
after update of completed_orders, average_rating, dispute_rate, no_fraud_flags, account_status, status
on public.users
for each row
execute function public.recalculate_trusted_seller();

create or replace function public.is_product_flash_sale_active(product_row public.products)
returns boolean
language sql
stable
as $$
  select
    coalesce(product_row.is_flash_sale, false)
    and product_row.sale_price is not null
    and product_row.sale_start is not null
    and product_row.sale_end is not null
    and now() >= product_row.sale_start
    and now() < product_row.sale_end
    and product_row.deleted_at is null
    and coalesce(product_row.stock_quantity, 0) > 0
    and (
      product_row.sale_quantity_limit is null
      or coalesce(product_row.sale_quantity_sold, 0) < product_row.sale_quantity_limit
    );
$$;

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
begin
  if tg_op = 'UPDATE' and public.is_product_flash_sale_active(old) and new.price is distinct from old.price then
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

drop trigger if exists products_validate_flash_sale on public.products;
create trigger products_validate_flash_sale
before insert or update on public.products
for each row
execute function public.validate_flash_sale();

create or replace function public.prevent_flash_sale_deletion()
returns trigger
language plpgsql
as $$
begin
  if public.is_product_flash_sale_active(old) then
    raise exception 'Products with an active flash sale cannot be deleted.';
  end if;

  return old;
end;
$$;

drop trigger if exists products_prevent_active_flash_sale_delete on public.products;
create trigger products_prevent_active_flash_sale_delete
before delete on public.products
for each row
execute function public.prevent_flash_sale_deletion();

create or replace function public.increment_sale_quantity(product_id uuid)
returns integer
language plpgsql
security definer
set search_path = public
as $$
declare
  product_row public.products%rowtype;
  next_quantity integer;
begin
  select *
  into product_row
  from public.products
  where id = product_id
  for update;

  if not found then
    raise exception 'Product not found.';
  end if;

  if not public.is_product_flash_sale_active(product_row) then
    raise exception 'This product does not have an active flash sale.';
  end if;

  if product_row.sale_quantity_limit is not null
    and coalesce(product_row.sale_quantity_sold, 0) >= product_row.sale_quantity_limit then
    raise exception 'This flash sale is sold out.';
  end if;

  update public.products
  set
    sale_quantity_sold = coalesce(sale_quantity_sold, 0) + 1,
    original_price_locked = true
  where id = product_id
  returning sale_quantity_sold into next_quantity;

  return next_quantity;
end;
$$;

revoke all on function public.increment_sale_quantity(uuid) from public;

create or replace function public.guard_user_client_mutation()
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
    if tg_op = 'DELETE' then
      return old;
    end if;

    return new;
  end if;

  if tg_op = 'DELETE' then
    raise exception 'Deleting user records from the client is not allowed.';
  end if;

  if auth.uid() is null then
    raise exception 'Authenticated session required.';
  end if;

  if old.id is distinct from auth.uid() then
    raise exception 'You can only update your own user record from the client.';
  end if;

  if new.id is distinct from old.id then
    raise exception 'Changing the user id is not allowed.';
  end if;

  if new.role is distinct from old.role then
    raise exception 'Changing account roles directly is not allowed.';
  end if;

  if new.status is distinct from old.status then
    raise exception 'Changing account status directly is not allowed.';
  end if;

  if new.account_status is distinct from old.account_status then
    raise exception 'Changing account status directly is not allowed.';
  end if;

  if new.bank_details_approved is distinct from old.bank_details_approved then
    raise exception 'Bank approval status can only be changed through the guarded admin flow.';
  end if;

  if new.is_trusted_seller is distinct from old.is_trusted_seller then
    raise exception 'Trusted seller status is managed automatically by the database.';
  end if;

  if new.completed_orders is distinct from old.completed_orders
    or new.average_rating is distinct from old.average_rating
    or new.dispute_rate is distinct from old.dispute_rate
    or new.no_fraud_flags is distinct from old.no_fraud_flags then
    raise exception 'Trusted seller metrics cannot be changed directly from the client.';
  end if;

  return new;
end;
$$;

drop trigger if exists users_guard_client_update on public.users;
create trigger users_guard_client_update
before update on public.users
for each row
execute function public.guard_user_client_mutation();

drop trigger if exists users_guard_client_delete on public.users;
create trigger users_guard_client_delete
before delete on public.users
for each row
execute function public.guard_user_client_mutation();

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

drop trigger if exists products_guard_client_insert on public.products;
create trigger products_guard_client_insert
before insert on public.products
for each row
execute function public.guard_product_client_mutation();

drop trigger if exists products_guard_client_update on public.products;
create trigger products_guard_client_update
before update on public.products
for each row
execute function public.guard_product_client_mutation();

alter table public.users enable row level security;
alter table public.products enable row level security;

do $$
begin
  if not exists (
    select 1
    from pg_policies
    where schemaname = 'public'
      and tablename = 'users'
      and policyname = 'users can insert own profile safely'
  ) then
    create policy "users can insert own profile safely"
    on public.users
    for insert
    to authenticated
    with check (
      id = auth.uid()
      and coalesce(is_trusted_seller, false) = false
      and coalesce(completed_orders, 0) = 0
      and coalesce(average_rating, 0) = 0
      and coalesce(dispute_rate, 0) = 0
      and coalesce(no_fraud_flags, true) = true
      and coalesce(nullif(account_status, ''), 'active') = 'active'
    );
  end if;

  if not exists (
    select 1
    from pg_policies
    where schemaname = 'public'
      and tablename = 'users'
      and policyname = 'users can update own profile without trusted seller writes'
  ) then
    create policy "users can update own profile without trusted seller writes"
    on public.users
    for update
    to authenticated
    using (id = auth.uid())
    with check (
      id = auth.uid()
      and is_trusted_seller = (
        select u.is_trusted_seller
        from public.users u
        where u.id = auth.uid()
      )
      and completed_orders = (
        select u.completed_orders
        from public.users u
        where u.id = auth.uid()
      )
      and average_rating = (
        select u.average_rating
        from public.users u
        where u.id = auth.uid()
      )
      and dispute_rate = (
        select u.dispute_rate
        from public.users u
        where u.id = auth.uid()
      )
      and no_fraud_flags = (
        select u.no_fraud_flags
        from public.users u
        where u.id = auth.uid()
      )
      and account_status = (
        select u.account_status
        from public.users u
        where u.id = auth.uid()
      )
    );
  end if;

  if not exists (
    select 1
    from pg_policies
    where schemaname = 'public'
      and tablename = 'products'
      and policyname = 'sellers can insert own products with safe flash defaults'
  ) then
    create policy "sellers can insert own products with safe flash defaults"
    on public.products
    for insert
    to authenticated
    with check (
      seller_id = auth.uid()
      and coalesce(admin_approved_discount, false) = false
      and coalesce(sale_quantity_sold, 0) = 0
    );
  end if;

  if not exists (
    select 1
    from pg_policies
    where schemaname = 'public'
      and tablename = 'products'
      and policyname = 'sellers can update own products without protected flash writes'
  ) then
    create policy "sellers can update own products without protected flash writes"
    on public.products
    for update
    to authenticated
    using (seller_id = auth.uid())
    with check (
      seller_id = auth.uid()
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
  end if;
end $$;
