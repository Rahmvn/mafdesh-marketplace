alter table public.orders
  add column if not exists review_required boolean not null default false,
  add column if not exists review_deadline_at timestamptz;
