alter table public.seller_pickup_locations
  add column if not exists city_name text,
  add column if not exists area_name text;

comment on column public.seller_pickup_locations.city_name is
  'City or town where the seller pickup point is located.';

comment on column public.seller_pickup_locations.area_name is
  'Particular area, estate, market, or neighbourhood for the seller pickup point.';

do $$
begin
  if not exists (
    select 1
    from pg_constraint
    where conname = 'seller_pickup_locations_required_location_parts'
      and conrelid = 'public.seller_pickup_locations'::regclass
  ) then
    alter table public.seller_pickup_locations
      add constraint seller_pickup_locations_required_location_parts
      check (
        nullif(btrim(label), '') is not null
        and nullif(btrim(address_text), '') is not null
        and nullif(btrim(state_name), '') is not null
        and nullif(btrim(lga_name), '') is not null
        and nullif(btrim(city_name), '') is not null
        and nullif(btrim(area_name), '') is not null
      ) not valid;
  end if;
end $$;
