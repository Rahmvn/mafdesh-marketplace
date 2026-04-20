create table if not exists public.seller_delivery_zones (
  id uuid primary key default gen_random_uuid(),
  seller_id uuid not null references public.users(id) on delete cascade,
  state_name text not null,
  flat_fee numeric(12,2) not null default 0,
  is_active boolean not null default true,
  estimated_days_min integer,
  estimated_days_max integer,
  created_at timestamptz not null default timezone('utc', now()),
  updated_at timestamptz not null default timezone('utc', now()),
  unique (seller_id, state_name)
);

create table if not exists public.seller_pickup_locations (
  id uuid primary key default gen_random_uuid(),
  seller_id uuid not null references public.users(id) on delete cascade,
  label text not null,
  address_text text not null,
  state_name text,
  is_active boolean not null default true,
  sort_order integer not null default 0,
  created_at timestamptz not null default timezone('utc', now()),
  updated_at timestamptz not null default timezone('utc', now()),
  unique (seller_id, label, address_text)
);

create table if not exists public.product_pickup_location_links (
  product_id uuid not null references public.products(id) on delete cascade,
  pickup_location_id uuid not null references public.seller_pickup_locations(id) on delete cascade,
  created_at timestamptz not null default timezone('utc', now()),
  primary key (product_id, pickup_location_id)
);

alter table public.products
  add column if not exists delivery_enabled boolean not null default true;

alter table public.products
  add column if not exists pickup_mode text not null default 'disabled';

alter table public.orders
  add column if not exists delivery_zone_snapshot jsonb;

alter table public.orders
  add column if not exists pickup_location_snapshot jsonb;

do $$
begin
  if not exists (
    select 1
    from pg_constraint
    where conname = 'products_pickup_mode_check'
  ) then
    alter table public.products
      add constraint products_pickup_mode_check
      check (pickup_mode in ('disabled', 'seller_default', 'custom'));
  end if;
end $$;

create index if not exists seller_delivery_zones_seller_id_idx
  on public.seller_delivery_zones (seller_id);

create index if not exists seller_pickup_locations_seller_id_idx
  on public.seller_pickup_locations (seller_id);

create index if not exists product_pickup_location_links_pickup_location_id_idx
  on public.product_pickup_location_links (pickup_location_id);

update public.products
set delivery_enabled = true
where delivery_enabled is null;

update public.products
set pickup_mode = case
  when coalesce(array_length(pickup_locations, 1), 0) > 0 then 'custom'
  else 'disabled'
end
where pickup_mode is null
   or pickup_mode not in ('disabled', 'seller_default', 'custom');

insert into public.seller_pickup_locations (
  seller_id,
  label,
  address_text,
  state_name,
  is_active,
  sort_order
)
select
  legacy.seller_id,
  legacy.location,
  legacy.location,
  null,
  true,
  row_number() over (partition by legacy.seller_id order by legacy.location)
from (
  select distinct
    p.seller_id,
    trim(location_text) as location
  from public.products p
  cross join lateral unnest(coalesce(p.pickup_locations, array[]::text[])) as location_text
  where trim(location_text) <> ''
) as legacy
on conflict (seller_id, label, address_text) do nothing;

insert into public.product_pickup_location_links (product_id, pickup_location_id)
select
  p.id,
  spl.id
from public.products p
cross join lateral unnest(coalesce(p.pickup_locations, array[]::text[])) as location_text
join public.seller_pickup_locations spl
  on spl.seller_id = p.seller_id
 and spl.label = trim(location_text)
 and spl.address_text = trim(location_text)
where trim(location_text) <> ''
on conflict do nothing;
