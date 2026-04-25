-- Safely enable and complete RLS coverage for core marketplace tables.
-- Tables already handled in earlier migrations are intentionally skipped here:
-- notifications, admin_actions, support_tickets, product_edit_requests,
-- refund_requests, order_admin_holds.
--
-- For users/products, preserve the stricter existing write policies from prior
-- migrations and only add the missing read/admin coverage here.

alter table if exists public.products enable row level security;

do $$
begin
  if to_regclass('public.products') is not null then
    if not exists (
      select 1
      from pg_policies
      where schemaname = 'public'
        and tablename = 'products'
        and policyname = 'public can read approved products'
    ) then
      create policy "public can read approved products"
        on public.products
        for select
        using (
          is_approved = true
          and deleted_at is null
          and coalesce(stock_quantity, 0) > 0
        );
    end if;

    if not exists (
      select 1
      from pg_policies
      where schemaname = 'public'
        and tablename = 'products'
        and policyname = 'sellers can read own products'
    ) then
      create policy "sellers can read own products"
        on public.products
        for select
        to authenticated
        using (seller_id = auth.uid());
    end if;

    if not exists (
      select 1
      from pg_policies
      where schemaname = 'public'
        and tablename = 'products'
        and policyname = 'admins can read all products'
    ) then
      create policy "admins can read all products"
        on public.products
        for select
        to authenticated
        using (public.is_admin_user(auth.uid()));
    end if;

    if not exists (
      select 1
      from pg_policies
      where schemaname = 'public'
        and tablename = 'products'
        and policyname = 'admins can update any product'
    ) then
      create policy "admins can update any product"
        on public.products
        for update
        to authenticated
        using (public.is_admin_user(auth.uid()))
        with check (public.is_admin_user(auth.uid()));
    end if;
  end if;
end $$;

alter table if exists public.users enable row level security;

do $$
begin
  if to_regclass('public.users') is not null then
    if not exists (
      select 1
      from pg_policies
      where schemaname = 'public'
        and tablename = 'users'
        and policyname = 'users can read own record'
    ) then
      create policy "users can read own record"
        on public.users
        for select
        to authenticated
        using (id = auth.uid());
    end if;

    if not exists (
      select 1
      from pg_policies
      where schemaname = 'public'
        and tablename = 'users'
        and policyname = 'authenticated can read seller public info'
    ) then
      create policy "authenticated can read seller public info"
        on public.users
        for select
        to authenticated
        using (role = 'seller');
    end if;

    if not exists (
      select 1
      from pg_policies
      where schemaname = 'public'
        and tablename = 'users'
        and policyname = 'admins can read all users'
    ) then
      create policy "admins can read all users"
        on public.users
        for select
        to authenticated
        using (public.is_admin_user(auth.uid()));
    end if;

    if not exists (
      select 1
      from pg_policies
      where schemaname = 'public'
        and tablename = 'users'
        and policyname = 'admins can update any user'
    ) then
      create policy "admins can update any user"
        on public.users
        for update
        to authenticated
        using (public.is_admin_user(auth.uid()))
        with check (public.is_admin_user(auth.uid()));
    end if;
  end if;
end $$;

alter table if exists public.profiles enable row level security;

do $$
begin
  if to_regclass('public.profiles') is not null then
    if not exists (
      select 1
      from pg_policies
      where schemaname = 'public'
        and tablename = 'profiles'
        and policyname = 'anyone can read profiles'
    ) then
      create policy "anyone can read profiles"
        on public.profiles
        for select
        using (true);
    end if;

    if not exists (
      select 1
      from pg_policies
      where schemaname = 'public'
        and tablename = 'profiles'
        and policyname = 'users can update own profile'
    ) then
      create policy "users can update own profile"
        on public.profiles
        for update
        to authenticated
        using (id = auth.uid())
        with check (id = auth.uid());
    end if;

    if not exists (
      select 1
      from pg_policies
      where schemaname = 'public'
        and tablename = 'profiles'
        and policyname = 'users can insert own profile'
    ) then
      create policy "users can insert own profile"
        on public.profiles
        for insert
        to authenticated
        with check (id = auth.uid());
    end if;
  end if;
end $$;

alter table if exists public.orders enable row level security;

do $$
begin
  if to_regclass('public.orders') is not null then
    if not exists (
      select 1
      from pg_policies
      where schemaname = 'public'
        and tablename = 'orders'
        and policyname = 'buyers can read own orders'
    ) then
      create policy "buyers can read own orders"
        on public.orders
        for select
        to authenticated
        using (buyer_id = auth.uid());
    end if;

    if not exists (
      select 1
      from pg_policies
      where schemaname = 'public'
        and tablename = 'orders'
        and policyname = 'sellers can read own orders'
    ) then
      create policy "sellers can read own orders"
        on public.orders
        for select
        to authenticated
        using (seller_id = auth.uid());
    end if;

    if not exists (
      select 1
      from pg_policies
      where schemaname = 'public'
        and tablename = 'orders'
        and policyname = 'admins can read all orders'
    ) then
      create policy "admins can read all orders"
        on public.orders
        for select
        to authenticated
        using (public.is_admin_user(auth.uid()));
    end if;

    if not exists (
      select 1
      from pg_policies
      where schemaname = 'public'
        and tablename = 'orders'
        and policyname = 'buyers can insert orders'
    ) then
      create policy "buyers can insert orders"
        on public.orders
        for insert
        to authenticated
        with check (buyer_id = auth.uid());
    end if;

    if not exists (
      select 1
      from pg_policies
      where schemaname = 'public'
        and tablename = 'orders'
        and policyname = 'sellers can update own orders'
    ) then
      create policy "sellers can update own orders"
        on public.orders
        for update
        to authenticated
        using (seller_id = auth.uid())
        with check (seller_id = auth.uid());
    end if;

    if not exists (
      select 1
      from pg_policies
      where schemaname = 'public'
        and tablename = 'orders'
        and policyname = 'buyers can update own orders'
    ) then
      create policy "buyers can update own orders"
        on public.orders
        for update
        to authenticated
        using (buyer_id = auth.uid())
        with check (buyer_id = auth.uid());
    end if;

    if not exists (
      select 1
      from pg_policies
      where schemaname = 'public'
        and tablename = 'orders'
        and policyname = 'admins can update any order'
    ) then
      create policy "admins can update any order"
        on public.orders
        for update
        to authenticated
        using (public.is_admin_user(auth.uid()))
        with check (public.is_admin_user(auth.uid()));
    end if;

    if not exists (
      select 1
      from pg_policies
      where schemaname = 'public'
        and tablename = 'orders'
        and policyname = 'buyers can delete own pending orders'
    ) then
      create policy "buyers can delete own pending orders"
        on public.orders
        for delete
        to authenticated
        using (
          buyer_id = auth.uid()
          and status = 'PENDING'
        );
    end if;
  end if;
end $$;

alter table if exists public.order_items enable row level security;

do $$
begin
  if to_regclass('public.order_items') is not null then
    if not exists (
      select 1
      from pg_policies
      where schemaname = 'public'
        and tablename = 'order_items'
        and policyname = 'buyers can read own order items'
    ) then
      create policy "buyers can read own order items"
        on public.order_items
        for select
        to authenticated
        using (
          exists (
            select 1
            from public.orders
            where orders.id = order_items.order_id
              and orders.buyer_id = auth.uid()
          )
        );
    end if;

    if not exists (
      select 1
      from pg_policies
      where schemaname = 'public'
        and tablename = 'order_items'
        and policyname = 'sellers can read own order items'
    ) then
      create policy "sellers can read own order items"
        on public.order_items
        for select
        to authenticated
        using (
          exists (
            select 1
            from public.orders
            where orders.id = order_items.order_id
              and orders.seller_id = auth.uid()
          )
        );
    end if;

    if not exists (
      select 1
      from pg_policies
      where schemaname = 'public'
        and tablename = 'order_items'
        and policyname = 'admins can read all order items'
    ) then
      create policy "admins can read all order items"
        on public.order_items
        for select
        to authenticated
        using (public.is_admin_user(auth.uid()));
    end if;

    if not exists (
      select 1
      from pg_policies
      where schemaname = 'public'
        and tablename = 'order_items'
        and policyname = 'buyers can insert order items'
    ) then
      create policy "buyers can insert order items"
        on public.order_items
        for insert
        to authenticated
        with check (
          exists (
            select 1
            from public.orders
            where orders.id = order_items.order_id
              and orders.buyer_id = auth.uid()
          )
        );
    end if;
  end if;
end $$;

alter table if exists public.carts enable row level security;

do $$
begin
  if to_regclass('public.carts') is not null then
    if not exists (
      select 1
      from pg_policies
      where schemaname = 'public'
        and tablename = 'carts'
        and policyname = 'users can manage own cart'
    ) then
      create policy "users can manage own cart"
        on public.carts
        for all
        to authenticated
        using (user_id = auth.uid())
        with check (user_id = auth.uid());
    end if;
  end if;
end $$;

alter table if exists public.cart_items enable row level security;

do $$
begin
  if to_regclass('public.cart_items') is not null then
    if not exists (
      select 1
      from pg_policies
      where schemaname = 'public'
        and tablename = 'cart_items'
        and policyname = 'users can manage own cart items'
    ) then
      create policy "users can manage own cart items"
        on public.cart_items
        for all
        to authenticated
        using (
          exists (
            select 1
            from public.carts
            where carts.id = cart_items.cart_id
              and carts.user_id = auth.uid()
          )
        )
        with check (
          exists (
            select 1
            from public.carts
            where carts.id = cart_items.cart_id
              and carts.user_id = auth.uid()
          )
        );
    end if;
  end if;
end $$;

alter table if exists public.seller_fulfillment_settings enable row level security;

do $$
begin
  if to_regclass('public.seller_fulfillment_settings') is not null then
    if not exists (
      select 1
      from pg_policies
      where schemaname = 'public'
        and tablename = 'seller_fulfillment_settings'
        and policyname = 'authenticated can read seller fulfillment settings'
    ) then
      create policy "authenticated can read seller fulfillment settings"
        on public.seller_fulfillment_settings
        for select
        to authenticated
        using (true);
    end if;

    if not exists (
      select 1
      from pg_policies
      where schemaname = 'public'
        and tablename = 'seller_fulfillment_settings'
        and policyname = 'sellers can manage own fulfillment settings'
    ) then
      create policy "sellers can manage own fulfillment settings"
        on public.seller_fulfillment_settings
        for all
        to authenticated
        using (seller_id = auth.uid())
        with check (
          seller_id = auth.uid()
          and exists (
            select 1
            from public.users
            where users.id = auth.uid()
              and users.role = 'seller'
          )
        );
    end if;

    if not exists (
      select 1
      from pg_policies
      where schemaname = 'public'
        and tablename = 'seller_fulfillment_settings'
        and policyname = 'admins can manage all fulfillment settings'
    ) then
      create policy "admins can manage all fulfillment settings"
        on public.seller_fulfillment_settings
        for all
        to authenticated
        using (public.is_admin_user(auth.uid()))
        with check (public.is_admin_user(auth.uid()));
    end if;
  end if;
end $$;

alter table if exists public.seller_pickup_locations enable row level security;

do $$
begin
  if to_regclass('public.seller_pickup_locations') is not null then
    if not exists (
      select 1
      from pg_policies
      where schemaname = 'public'
        and tablename = 'seller_pickup_locations'
        and policyname = 'public can read active seller pickup locations'
    ) then
      create policy "public can read active seller pickup locations"
        on public.seller_pickup_locations
        for select
        using (is_active = true);
    end if;

    if not exists (
      select 1
      from pg_policies
      where schemaname = 'public'
        and tablename = 'seller_pickup_locations'
        and policyname = 'sellers can manage own pickup locations'
    ) then
      create policy "sellers can manage own pickup locations"
        on public.seller_pickup_locations
        for all
        to authenticated
        using (seller_id = auth.uid())
        with check (
          seller_id = auth.uid()
          and exists (
            select 1
            from public.users
            where users.id = auth.uid()
              and users.role = 'seller'
          )
        );
    end if;

    if not exists (
      select 1
      from pg_policies
      where schemaname = 'public'
        and tablename = 'seller_pickup_locations'
        and policyname = 'admins can manage all pickup locations'
    ) then
      create policy "admins can manage all pickup locations"
        on public.seller_pickup_locations
        for all
        to authenticated
        using (public.is_admin_user(auth.uid()))
        with check (public.is_admin_user(auth.uid()));
    end if;
  end if;
end $$;

alter table if exists public.product_pickup_location_links enable row level security;

do $$
begin
  if to_regclass('public.product_pickup_location_links') is not null then
    if not exists (
      select 1
      from pg_policies
      where schemaname = 'public'
        and tablename = 'product_pickup_location_links'
        and policyname = 'public can read approved product pickup links'
    ) then
      create policy "public can read approved product pickup links"
        on public.product_pickup_location_links
        for select
        using (
          exists (
            select 1
            from public.products
            where products.id = product_pickup_location_links.product_id
              and products.is_approved = true
              and products.deleted_at is null
              and coalesce(products.stock_quantity, 0) > 0
          )
        );
    end if;

    if not exists (
      select 1
      from pg_policies
      where schemaname = 'public'
        and tablename = 'product_pickup_location_links'
        and policyname = 'sellers can manage own product pickup links'
    ) then
      create policy "sellers can manage own product pickup links"
        on public.product_pickup_location_links
        for all
        to authenticated
        using (
          exists (
            select 1
            from public.products
            where products.id = product_pickup_location_links.product_id
              and products.seller_id = auth.uid()
          )
        )
        with check (
          exists (
            select 1
            from public.products
            where products.id = product_pickup_location_links.product_id
              and products.seller_id = auth.uid()
          )
          and exists (
            select 1
            from public.users
            where users.id = auth.uid()
              and users.role = 'seller'
          )
        );
    end if;

    if not exists (
      select 1
      from pg_policies
      where schemaname = 'public'
        and tablename = 'product_pickup_location_links'
        and policyname = 'admins can manage all product pickup links'
    ) then
      create policy "admins can manage all product pickup links"
        on public.product_pickup_location_links
        for all
        to authenticated
        using (public.is_admin_user(auth.uid()))
        with check (public.is_admin_user(auth.uid()));
    end if;
  end if;
end $$;

alter table if exists public.seller_delivery_zones enable row level security;

do $$
begin
  if to_regclass('public.seller_delivery_zones') is not null then
    if not exists (
      select 1
      from pg_policies
      where schemaname = 'public'
        and tablename = 'seller_delivery_zones'
        and policyname = 'sellers can manage own delivery zones'
    ) then
      create policy "sellers can manage own delivery zones"
        on public.seller_delivery_zones
        for all
        to authenticated
        using (seller_id = auth.uid())
        with check (
          seller_id = auth.uid()
          and exists (
            select 1
            from public.users
            where users.id = auth.uid()
              and users.role = 'seller'
          )
        );
    end if;

    if not exists (
      select 1
      from pg_policies
      where schemaname = 'public'
        and tablename = 'seller_delivery_zones'
        and policyname = 'admins can manage all delivery zones'
    ) then
      create policy "admins can manage all delivery zones"
        on public.seller_delivery_zones
        for all
        to authenticated
        using (public.is_admin_user(auth.uid()))
        with check (public.is_admin_user(auth.uid()));
    end if;
  end if;
end $$;

do $$
begin
  if to_regclass('public.saved_addresses') is not null then
    execute 'alter table public.saved_addresses enable row level security';

    if not exists (
      select 1
      from pg_policies
      where schemaname = 'public'
        and tablename = 'saved_addresses'
        and policyname = 'users can manage own addresses'
    ) then
      execute $policy$
        create policy "users can manage own addresses"
          on public.saved_addresses
          for all
          to authenticated
          using (buyer_id = auth.uid())
          with check (buyer_id = auth.uid())
      $policy$;
    end if;
  end if;
end $$;

do $$
begin
  if to_regclass('public.discount_codes') is not null then
    execute 'alter table public.discount_codes enable row level security';

    if not exists (
      select 1
      from pg_policies
      where schemaname = 'public'
        and tablename = 'discount_codes'
        and policyname = 'authenticated can read active discount codes'
    ) then
      execute $policy$
        create policy "authenticated can read active discount codes"
          on public.discount_codes
          for select
          to authenticated
          using (is_active = true)
      $policy$;
    end if;

    if not exists (
      select 1
      from pg_policies
      where schemaname = 'public'
        and tablename = 'discount_codes'
        and policyname = 'sellers can manage own discount codes'
    ) then
      execute $policy$
        create policy "sellers can manage own discount codes"
          on public.discount_codes
          for all
          to authenticated
          using (created_by = auth.uid())
          with check (
            created_by = auth.uid()
            and scope = 'seller'
          )
      $policy$;
    end if;

    if not exists (
      select 1
      from pg_policies
      where schemaname = 'public'
        and tablename = 'discount_codes'
        and policyname = 'admins can manage all codes'
    ) then
      execute $policy$
        create policy "admins can manage all codes"
          on public.discount_codes
          for all
          to authenticated
          using (public.is_admin_user(auth.uid()))
          with check (public.is_admin_user(auth.uid()))
      $policy$;
    end if;
  end if;
end $$;

do $$
begin
  if to_regclass('public.platform_settings') is not null then
    execute 'alter table public.platform_settings enable row level security';

    if not exists (
      select 1
      from pg_policies
      where schemaname = 'public'
        and tablename = 'platform_settings'
        and policyname = 'anyone can read platform settings'
    ) then
      execute $policy$
        create policy "anyone can read platform settings"
          on public.platform_settings
          for select
          using (true)
      $policy$;
    end if;

    if not exists (
      select 1
      from pg_policies
      where schemaname = 'public'
        and tablename = 'platform_settings'
        and policyname = 'admins can update platform settings'
    ) then
      execute $policy$
        create policy "admins can update platform settings"
          on public.platform_settings
          for update
          to authenticated
          using (public.is_admin_user(auth.uid()))
          with check (public.is_admin_user(auth.uid()))
      $policy$;
    end if;
  end if;
end $$;
