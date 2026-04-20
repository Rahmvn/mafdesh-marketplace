create extension if not exists pgcrypto;

alter table public.orders
  add column if not exists product_snapshot jsonb;

alter table public.order_items
  add column if not exists product_snapshot jsonb;

create table if not exists public.product_edit_requests (
  id uuid primary key default gen_random_uuid(),
  product_id uuid not null references public.products(id) on delete cascade,
  seller_id uuid not null references public.users(id) on delete cascade,
  status text not null default 'pending',
  current_snapshot jsonb not null default '{}'::jsonb,
  proposed_snapshot jsonb not null default '{}'::jsonb,
  admin_reason text,
  submitted_at timestamptz not null default now(),
  reviewed_at timestamptz,
  reviewed_by uuid references public.users(id) on delete set null
);

do $$
begin
  if not exists (
    select 1
    from pg_constraint
    where conname = 'product_edit_requests_status_check'
  ) then
    alter table public.product_edit_requests
      add constraint product_edit_requests_status_check
      check (status in ('pending', 'approved', 'rejected', 'cancelled'));
  end if;
end $$;

create index if not exists product_edit_requests_product_id_idx
  on public.product_edit_requests (product_id);

create index if not exists product_edit_requests_seller_id_idx
  on public.product_edit_requests (seller_id);

create index if not exists product_edit_requests_status_idx
  on public.product_edit_requests (status, submitted_at desc);

create unique index if not exists product_edit_requests_one_pending_per_product_idx
  on public.product_edit_requests (product_id)
  where status = 'pending';

create or replace function public.product_has_trust_history(product_uuid uuid)
returns boolean
language sql
stable
as $$
  select
    exists (
      select 1
      from public.orders o
      left join public.order_items oi
        on oi.order_id = o.id
      where o.status in (
        'PAID_ESCROW',
        'SHIPPED',
        'READY_FOR_PICKUP',
        'DELIVERED',
        'COMPLETED',
        'DISPUTED',
        'REFUNDED'
      )
        and (
          o.product_id = product_uuid
          or oi.product_id = product_uuid
        )
    )
    or exists (
      select 1
      from public.reviews r
      where r.product_id = product_uuid
    );
$$;

create or replace function public.products_core_fields_changed(
  old_product public.products,
  new_product public.products
)
returns boolean
language sql
stable
as $$
  select
    old_product.name is distinct from new_product.name
    or old_product.price is distinct from new_product.price
    or old_product.category is distinct from new_product.category
    or old_product.description is distinct from new_product.description
    or old_product.images is distinct from new_product.images;
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

    if new.deleted_by_admin_id is not null then
      raise exception 'Only the guarded admin flow can set deletion ownership.';
    end if;

    if coalesce(btrim(new.deletion_reason), '') <> '' then
      raise exception 'Only the guarded admin flow can set deletion reasons.';
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

  if coalesce(old.is_approved, false)
     and public.products_core_fields_changed(old, new) then
    if public.product_has_trust_history(old.id) then
      raise exception 'Core listing fields are locked after this product has orders or reviews.';
    end if;

    raise exception 'Core listing fields on approved products must go through the product edit review flow.';
  end if;

  return new;
end;
$$;

alter table public.product_edit_requests enable row level security;

do $$
begin
  if not exists (
    select 1
    from pg_policies
    where schemaname = 'public'
      and tablename = 'product_edit_requests'
      and policyname = 'sellers can view own product edit requests'
  ) then
    create policy "sellers can view own product edit requests"
    on public.product_edit_requests
    for select
    to authenticated
    using (seller_id = auth.uid());
  end if;

  if not exists (
    select 1
    from pg_policies
    where schemaname = 'public'
      and tablename = 'product_edit_requests'
      and policyname = 'admins can view product edit requests'
  ) then
    create policy "admins can view product edit requests"
    on public.product_edit_requests
    for select
    to authenticated
    using (
      exists (
        select 1
        from public.users
        where users.id = auth.uid()
          and users.role = 'admin'
      )
    );
  end if;
end $$;

update public.orders o
set product_snapshot = jsonb_build_object(
  'product_id', p.id,
  'name', p.name,
  'images', coalesce(to_jsonb(p.images), '[]'::jsonb),
  'category', p.category,
  'description', p.description,
  'seller_id', p.seller_id
)
from public.products p
where o.product_id = p.id
  and o.product_snapshot is null;

update public.order_items oi
set product_snapshot = jsonb_build_object(
  'product_id', p.id,
  'name', p.name,
  'images', coalesce(to_jsonb(p.images), '[]'::jsonb),
  'category', p.category,
  'description', p.description,
  'seller_id', p.seller_id
)
from public.products p
where oi.product_id = p.id
  and oi.product_snapshot is null;
