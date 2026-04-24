alter table public.seller_pickup_locations
  add column if not exists landmark_text text,
  add column if not exists pickup_instructions text;

comment on column public.seller_pickup_locations.landmark_text is
  'Optional nearby landmark to help buyers identify the pickup point.';

comment on column public.seller_pickup_locations.pickup_instructions is
  'Optional seller instructions for pickup timing, access, or contact flow.';
