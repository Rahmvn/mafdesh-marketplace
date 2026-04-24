alter table public.seller_pickup_locations
  add column if not exists lga_name text;
