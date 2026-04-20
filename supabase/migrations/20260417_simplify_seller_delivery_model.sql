create table if not exists public.seller_fulfillment_settings (
  seller_id uuid primary key references public.users(id) on delete cascade,
  delivery_enabled boolean not null default true,
  flat_delivery_fee numeric(12,2) not null default 0,
  created_at timestamptz not null default timezone('utc', now()),
  updated_at timestamptz not null default timezone('utc', now())
);

insert into public.seller_fulfillment_settings (
  seller_id,
  delivery_enabled,
  flat_delivery_fee
)
select
  u.id,
  true,
  coalesce(zone.flat_fee, 0)
from public.users u
left join lateral (
  select z.flat_fee
  from public.seller_delivery_zones z
  where z.seller_id = u.id
    and z.is_active = true
  order by z.updated_at desc nulls last, z.created_at desc nulls last, z.id desc
  limit 1
) zone on true
where u.role = 'seller'
on conflict (seller_id) do nothing;

update public.products
set delivery_enabled = true
where delivery_enabled is distinct from true;
