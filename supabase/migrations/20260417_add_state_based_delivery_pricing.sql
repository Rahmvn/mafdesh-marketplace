create table if not exists public.seller_fulfillment_settings (
  seller_id uuid primary key references public.users(id) on delete cascade,
  delivery_enabled boolean not null default true,
  ship_from_address_text text,
  ship_from_state text,
  created_at timestamptz not null default timezone('utc', now()),
  updated_at timestamptz not null default timezone('utc', now())
);

alter table public.seller_fulfillment_settings
  add column if not exists ship_from_address_text text;

alter table public.seller_fulfillment_settings
  add column if not exists ship_from_state text;

insert into public.seller_fulfillment_settings (
  seller_id,
  delivery_enabled
)
select
  u.id,
  true
from public.users u
where u.role = 'seller'
on conflict (seller_id) do nothing;
