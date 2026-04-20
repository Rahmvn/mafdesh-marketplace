-- Manual rollout helper for the admin hardening work.
-- Run this whole file in the Supabase SQL Editor against your project.

-- =========================================================
-- 1. Admin audit log schema
-- =========================================================
create extension if not exists pgcrypto;

create table if not exists public.admin_actions (
  id uuid primary key default gen_random_uuid(),
  created_at timestamptz not null default now(),
  admin_id uuid references public.users(id) on delete set null,
  target_type text not null default 'system',
  target_id text,
  action_type text not null,
  reason text,
  metadata jsonb not null default '{}'::jsonb,
  previous_state jsonb,-- Manual rollout helper for the admin hardening work.
-- Run this whole file in the Supabase SQL Editor against your project.

-- =========================================================
-- 1. Admin audit log schema
-- =========================================================
create extension if not exists pgcrypto;

create table if not exists public.admin_actions (
  id uuid primary key default gen_random_uuid(),
  created_at timestamptz not null default now(),
  admin_id uuid references public.users(id) on delete set null,
  target_type text not null default 'system',
  target_id text,
  action_type text not null,
  reason text,
  metadata jsonb not null default '{}'::jsonb,
  previous_state jsonb,
  new_state jsonb,
  source text not null default 'admin_ui',
  requires_reason boolean not null default true,
  automated boolean not null default false
);

alter table public.admin_actions
  add column if not exists created_at timestamptz not null default now(),
  add column if not exists admin_id uuid references public.users(id) on delete set null,
  add column if not exists target_type text not null default 'system',
  add column if not exists target_id text,
  add column if not exists action_type text,
  add column if not exists reason text,
  add column if not exists metadata jsonb not null default '{}'::jsonb,
  add column if not exists previous_state jsonb,
  add column if not exists new_state jsonb,
  add column if not exists source text not null default 'admin_ui',
  add column if not exists requires_reason boolean not null default true,
  add column if not exists automated boolean not null default false;

update public.admin_actions
set metadata = '{}'::jsonb
where metadata is null;

update public.admin_actions
set source = 'admin_ui'
where source is null or btrim(source) = '';

update public.admin_actions
set requires_reason = true
where requires_reason is null;

update public.admin_actions
set automated = false
where automated is null;

do $$
begin
  if exists (
    select 1
    from information_schema.columns
    where table_schema = 'public'
      and table_name = 'admin_actions'
      and column_name = 'order_id'
  ) then
    execute $sql$
      update public.admin_actions
      set target_type = coalesce(nullif(target_type, ''), 'order'),
          target_id = coalesce(target_id, order_id::text)
      where order_id is not null
        and (
          target_id is null
          or target_type is null
          or target_type = 'system'
        )
    $sql$;
  end if;
end $$;

do $$
begin
  if exists (
    select 1
    from information_schema.columns
    where table_schema = 'public'
      and table_name = 'admin_actions'
      and column_name = 'amount'
  ) then
    execute $sql$
      update public.admin_actions
      set metadata = coalesce(metadata, '{}'::jsonb)
        || jsonb_build_object('amount', amount)
      where amount is not null
    $sql$;
  end if;
end $$;

do $$
begin
  if exists (
    select 1
    from information_schema.columns
    where table_schema = 'public'
      and table_name = 'admin_actions'
      and column_name = 'constitution_section'
  ) then
    execute $sql$
      update public.admin_actions
      set metadata = coalesce(metadata, '{}'::jsonb)
        || jsonb_build_object('constitution_section', constitution_section)
      where constitution_section is not null
    $sql$;
  end if;
end $$;

alter table public.admin_actions
  alter column action_type set not null,
  alter column target_type set not null,
  alter column metadata set default '{}'::jsonb,
  alter column metadata set not null,
  alter column source set default 'admin_ui',
  alter column source set not null,
  alter column requires_reason set default true,
  alter column requires_reason set not null,
  alter column automated set default false,
  alter column automated set not null;

do $$
begin
  if not exists (
    select 1
    from pg_constraint
    where conname = 'admin_actions_target_type_check'
  ) then
    alter table public.admin_actions
      add constraint admin_actions_target_type_check
      check (target_type in ('user', 'product', 'order', 'bank_request', 'system'));
  end if;

  if not exists (
    select 1
    from pg_constraint
    where conname = 'admin_actions_reason_required_check'
  ) then
    alter table public.admin_actions
      add constraint admin_actions_reason_required_check
      check (
        automated
        or requires_reason = false
        or char_length(btrim(coalesce(reason, ''))) > 0
      );
  end if;
end $$;

create index if not exists admin_actions_created_at_idx
  on public.admin_actions (created_at desc);

create index if not exists admin_actions_admin_id_idx
  on public.admin_actions (admin_id);

create index if not exists admin_actions_action_type_idx
  on public.admin_actions (action_type);

create index if not exists admin_actions_target_idx
  on public.admin_actions (target_type, target_id);

create or replace function public.prevent_admin_actions_mutation()
returns trigger
language plpgsql
as $$
begin
  raise exception 'admin_actions is immutable and cannot be modified after insert';
end;
$$;

drop trigger if exists admin_actions_prevent_update on public.admin_actions;
create trigger admin_actions_prevent_update
before update on public.admin_actions
for each row
execute function public.prevent_admin_actions_mutation();

drop trigger if exists admin_actions_prevent_delete on public.admin_actions;
create trigger admin_actions_prevent_delete
before delete on public.admin_actions
for each row
execute function public.prevent_admin_actions_mutation();

alter table public.admin_actions enable row level security;

do $$
begin
  if not exists (
    select 1
    from pg_policies
    where schemaname = 'public'
      and tablename = 'admin_actions'
      and policyname = 'admins can view admin actions'
  ) then
    create policy "admins can view admin actions"
    on public.admin_actions
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

  if not exists (
    select 1
    from pg_policies
    where schemaname = 'public'
      and tablename = 'admin_actions'
      and policyname = 'admins can insert admin actions'
  ) then
    create policy "admins can insert admin actions"
    on public.admin_actions
    for insert
    to authenticated
    with check (
      exists (
        select 1
        from public.users
        where users.id = auth.uid()
          and users.role = 'admin'
      )
      and (admin_id is null or admin_id = auth.uid())
    );
  end if;
end $$;

-- =========================================================
-- 2. Product soft-delete columns
-- =========================================================
alter table public.products
  add column if not exists deleted_at timestamptz,
  add column if not exists deleted_by_admin_id uuid references public.users(id) on delete set null,
  add column if not exists deletion_reason text;

create index if not exists products_deleted_at_idx
  on public.products (deleted_at);

create or replace function public.prevent_hard_delete_products()
returns trigger
language plpgsql
as $$
begin
  raise exception 'Hard deleting products is disabled. Archive the product instead.';
end;
$$;

drop trigger if exists products_prevent_hard_delete on public.products;
create trigger products_prevent_hard_delete
before delete on public.products
for each row
execute function public.prevent_hard_delete_products();

-- =========================================================
-- 3. Block direct client moderation writes
-- =========================================================
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

  if new.bank_details_approved is distinct from old.bank_details_approved then
    raise exception 'Bank approval status can only be changed through the guarded admin flow.';
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

-- =========================================================
-- 4. Optional verification checks
-- =========================================================
-- select column_name
-- from information_schema.columns
-- where table_schema = 'public'
--   and table_name = 'products'
--   and column_name in ('deleted_at', 'deleted_by_admin_id', 'deletion_reason');
--
-- select column_name
-- from information_schema.columns
-- where table_schema = 'public'
--   and table_name = 'admin_actions'
--   and column_name in (
--     'target_type',
--     'target_id',
--     'action_type',
--     'metadata',
--     'previous_state',
--     'new_state',
--     'source',
--     'requires_reason',
--     'automated'
--   );
-- Manual rollout helper for the admin hardening work.
-- Run this whole file in the Supabase SQL Editor against your project.

-- =========================================================
-- 1. Admin audit log schema
-- =========================================================
create extension if not exists pgcrypto;

create table if not exists public.admin_actions (
  id uuid primary key default gen_random_uuid(),
  created_at timestamptz not null default now(),
  admin_id uuid references public.users(id) on delete set null,
  target_type text not null default 'system',
  target_id text,
  action_type text not null,
  reason text,
  metadata jsonb not null default '{}'::jsonb,
  previous_state jsonb,
  new_state jsonb,
  source text not null default 'admin_ui',
  requires_reason boolean not null default true,
  automated boolean not null default false
);

alter table public.admin_actions
  add column if not exists created_at timestamptz not null default now(),
  add column if not exists admin_id uuid references public.users(id) on delete set null,
  add column if not exists target_type text not null default 'system',
  add column if not exists target_id text,
  add column if not exists action_type text,
  add column if not exists reason text,
  add column if not exists metadata jsonb not null default '{}'::jsonb,
  add column if not exists previous_state jsonb,
  add column if not exists new_state jsonb,
  add column if not exists source text not null default 'admin_ui',
  add column if not exists requires_reason boolean not null default true,
  add column if not exists automated boolean not null default false;

update public.admin_actions
set metadata = '{}'::jsonb
where metadata is null;

update public.admin_actions
set source = 'admin_ui'
where source is null or btrim(source) = '';

update public.admin_actions
set requires_reason = true
where requires_reason is null;

update public.admin_actions
set automated = false
where automated is null;

do $$
begin
  if exists (
    select 1
    from information_schema.columns
    where table_schema = 'public'
      and table_name = 'admin_actions'
      and column_name = 'order_id'
  ) then
    execute $sql$
      update public.admin_actions
      set target_type = coalesce(nullif(target_type, ''), 'order'),
          target_id = coalesce(target_id, order_id::text)
      where order_id is not null
        and (
          target_id is null
          or target_type is null
          or target_type = 'system'
        )
    $sql$;
  end if;
end $$;

do $$
begin
  if exists (
    select 1
    from information_schema.columns
    where table_schema = 'public'
      and table_name = 'admin_actions'
      and column_name = 'amount'
  ) then
    execute $sql$
      update public.admin_actions
      set metadata = coalesce(metadata, '{}'::jsonb)
        || jsonb_build_object('amount', amount)
      where amount is not null
    $sql$;
  end if;
end $$;

do $$
begin
  if exists (
    select 1
    from information_schema.columns
    where table_schema = 'public'
      and table_name = 'admin_actions'
      and column_name = 'constitution_section'
  ) then
    execute $sql$
      update public.admin_actions
      set metadata = coalesce(metadata, '{}'::jsonb)
        || jsonb_build_object('constitution_section', constitution_section)
      where constitution_section is not null
    $sql$;
  end if;
end $$;

alter table public.admin_actions
  alter column action_type set not null,
  alter column target_type set not null,
  alter column metadata set default '{}'::jsonb,
  alter column metadata set not null,
  alter column source set default 'admin_ui',
  alter column source set not null,
  alter column requires_reason set default true,
  alter column requires_reason set not null,
  alter column automated set default false,
  alter column automated set not null;

do $$
begin
  if not exists (
    select 1
    from pg_constraint
    where conname = 'admin_actions_target_type_check'
  ) then
    alter table public.admin_actions
      add constraint admin_actions_target_type_check
      check (target_type in ('user', 'product', 'order', 'bank_request', 'system'));
  end if;

  if not exists (
    select 1
    from pg_constraint
    where conname = 'admin_actions_reason_required_check'
  ) then
    alter table public.admin_actions
      add constraint admin_actions_reason_required_check
      check (
        automated
        or requires_reason = false
        or char_length(btrim(coalesce(reason, ''))) > 0
      );
  end if;
end $$;

create index if not exists admin_actions_created_at_idx
  on public.admin_actions (created_at desc);

create index if not exists admin_actions_admin_id_idx
  on public.admin_actions (admin_id);

create index if not exists admin_actions_action_type_idx
  on public.admin_actions (action_type);

create index if not exists admin_actions_target_idx
  on public.admin_actions (target_type, target_id);

create or replace function public.prevent_admin_actions_mutation()
returns trigger
language plpgsql
as $$
begin
  raise exception 'admin_actions is immutable and cannot be modified after insert';
end;
$$;

drop trigger if exists admin_actions_prevent_update on public.admin_actions;
create trigger admin_actions_prevent_update
before update on public.admin_actions
for each row
execute function public.prevent_admin_actions_mutation();

drop trigger if exists admin_actions_prevent_delete on public.admin_actions;
create trigger admin_actions_prevent_delete
before delete on public.admin_actions
for each row
execute function public.prevent_admin_actions_mutation();

alter table public.admin_actions enable row level security;

do $$
begin
  if not exists (
    select 1
    from pg_policies
    where schemaname = 'public'
      and tablename = 'admin_actions'
      and policyname = 'admins can view admin actions'
  ) then
    create policy "admins can view admin actions"
    on public.admin_actions
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

  if not exists (
    select 1
    from pg_policies
    where schemaname = 'public'
      and tablename = 'admin_actions'
      and policyname = 'admins can insert admin actions'
  ) then
    create policy "admins can insert admin actions"
    on public.admin_actions
    for insert
    to authenticated
    with check (
      exists (
        select 1
        from public.users
        where users.id = auth.uid()
          and users.role = 'admin'
      )
      and (admin_id is null or admin_id = auth.uid())
    );
  end if;
end $$;

-- =========================================================
-- 2. Product soft-delete columns
-- =========================================================
alter table public.products
  add column if not exists deleted_at timestamptz,
  add column if not exists deleted_by_admin_id uuid references public.users(id) on delete set null,
  add column if not exists deletion_reason text;

create index if not exists products_deleted_at_idx
  on public.products (deleted_at);

create or replace function public.prevent_hard_delete_products()
returns trigger
language plpgsql
as $$
begin
  raise exception 'Hard deleting products is disabled. Archive the product instead.';
end;
$$;

drop trigger if exists products_prevent_hard_delete on public.products;
create trigger products_prevent_hard_delete
before delete on public.products
for each row
execute function public.prevent_hard_delete_products();

-- =========================================================
-- 3. Block direct client moderation writes
-- =========================================================
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

  if new.bank_details_approved is distinct from old.bank_details_approved then
    raise exception 'Bank approval status can only be changed through the guarded admin flow.';
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

-- =========================================================
-- 4. Optional verification checks
-- =========================================================
-- select column_name
-- from information_schema.columns
-- where table_schema = 'public'
--   and table_name = 'products'
--   and column_name in ('deleted_at', 'deleted_by_admin_id', 'deletion_reason');
--
-- select column_name
-- from information_schema.columns
-- where table_schema = 'public'
--   and table_name = 'admin_actions'
--   and column_name in (
--     'target_type',
--     'target_id',
--     'action_type',
--     'metadata',
--     'previous_state',
--     'new_state',
--     'source',
--     'requires_reason',
--     'automated'
--   );

  new_state jsonb,
  source text not null default 'admin_ui',
  requires_reason boolean not null default true,
  automated boolean not null default false
);

alter table public.admin_actions
  add column if not exists created_at timestamptz not null default now(),
  add column if not exists admin_id uuid references public.users(id) on delete set null,
  add column if not exists target_type text not null default 'system',
  add column if not exists target_id text,
  add column if not exists action_type text,
  add column if not exists reason text,
  add column if not exists metadata jsonb not null default '{}'::jsonb,
  add column if not exists previous_state jsonb,
  add column if not exists new_state jsonb,
  add column if not exists source text not null default 'admin_ui',
  add column if not exists requires_reason boolean not null default true,
  add column if not exists automated boolean not null default false;

update public.admin_actions
set metadata = '{}'::jsonb
where metadata is null;

update public.admin_actions
set source = 'admin_ui'
where source is null or btrim(source) = '';

update public.admin_actions
set requires_reason = true
where requires_reason is null;

update public.admin_actions
set automated = false
where automated is null;

do $$
begin
  if exists (
    select 1
    from information_schema.columns
    where table_schema = 'public'
      and table_name = 'admin_actions'
      and column_name = 'order_id'
  ) then
    execute $sql$
      update public.admin_actions
      set target_type = coalesce(nullif(target_type, ''), 'order'),
          target_id = coalesce(target_id, order_id::text)
      where order_id is not null
        and (
          target_id is null
          or target_type is null
          or target_type = 'system'
        )
    $sql$;
  end if;
end $$;

do $$
begin
  if exists (
    select 1
    from information_schema.columns
    where table_schema = 'public'
      and table_name = 'admin_actions'
      and column_name = 'amount'
  ) then
    execute $sql$
      update public.admin_actions
      set metadata = coalesce(metadata, '{}'::jsonb)
        || jsonb_build_object('amount', amount)
      where amount is not null
    $sql$;
  end if;
end $$;

do $$
begin
  if exists (
    select 1
    from information_schema.columns
    where table_schema = 'public'
      and table_name = 'admin_actions'
      and column_name = 'constitution_section'
  ) then
    execute $sql$
      update public.admin_actions
      set metadata = coalesce(metadata, '{}'::jsonb)
        || jsonb_build_object('constitution_section', constitution_section)
      where constitution_section is not null
    $sql$;
  end if;
end $$;

alter table public.admin_actions
  alter column action_type set not null,
  alter column target_type set not null,
  alter column metadata set default '{}'::jsonb,
  alter column metadata set not null,
  alter column source set default 'admin_ui',
  alter column source set not null,
  alter column requires_reason set default true,
  alter column requires_reason set not null,
  alter column automated set default false,
  alter column automated set not null;

do $$
begin
  if not exists (
    select 1
    from pg_constraint
    where conname = 'admin_actions_target_type_check'
  ) then
    alter table public.admin_actions
      add constraint admin_actions_target_type_check
      check (target_type in ('user', 'product', 'order', 'bank_request', 'system'));
  end if;

  if not exists (
    select 1
    from pg_constraint
    where conname = 'admin_actions_reason_required_check'
  ) then
    alter table public.admin_actions
      add constraint admin_actions_reason_required_check
      check (
        automated
        or requires_reason = false
        or char_length(btrim(coalesce(reason, ''))) > 0
      );
  end if;
end $$;

create index if not exists admin_actions_created_at_idx
  on public.admin_actions (created_at desc);

create index if not exists admin_actions_admin_id_idx
  on public.admin_actions (admin_id);

create index if not exists admin_actions_action_type_idx
  on public.admin_actions (action_type);

create index if not exists admin_actions_target_idx
  on public.admin_actions (target_type, target_id);

create or replace function public.prevent_admin_actions_mutation()
returns trigger
language plpgsql
as $$
begin
  raise exception 'admin_actions is immutable and cannot be modified after insert';
end;
$$;

drop trigger if exists admin_actions_prevent_update on public.admin_actions;
create trigger admin_actions_prevent_update
before update on public.admin_actions
for each row
execute function public.prevent_admin_actions_mutation();

drop trigger if exists admin_actions_prevent_delete on public.admin_actions;
create trigger admin_actions_prevent_delete
before delete on public.admin_actions
for each row
execute function public.prevent_admin_actions_mutation();

alter table public.admin_actions enable row level security;

do $$
begin
  if not exists (
    select 1
    from pg_policies
    where schemaname = 'public'
      and tablename = 'admin_actions'
      and policyname = 'admins can view admin actions'
  ) then
    create policy "admins can view admin actions"
    on public.admin_actions
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

  if not exists (
    select 1
    from pg_policies
    where schemaname = 'public'
      and tablename = 'admin_actions'
      and policyname = 'admins can insert admin actions'
  ) then
    create policy "admins can insert admin actions"
    on public.admin_actions
    for insert
    to authenticated
    with check (
      exists (
        select 1
        from public.users
        where users.id = auth.uid()
          and users.role = 'admin'
      )
      and (admin_id is null or admin_id = auth.uid())
    );
  end if;
end $$;

-- =========================================================
-- 2. Product soft-delete columns
-- =========================================================
alter table public.products
  add column if not exists deleted_at timestamptz,
  add column if not exists deleted_by_admin_id uuid references public.users(id) on delete set null,
  add column if not exists deletion_reason text;

create index if not exists products_deleted_at_idx
  on public.products (deleted_at);

create or replace function public.prevent_hard_delete_products()
returns trigger
language plpgsql
as $$
begin
  raise exception 'Hard deleting products is disabled. Archive the product instead.';
end;
$$;

drop trigger if exists products_prevent_hard_delete on public.products;
create trigger products_prevent_hard_delete
before delete on public.products
for each row
execute function public.prevent_hard_delete_products();

-- =========================================================
-- 3. Block direct client moderation writes
-- =========================================================
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

  if new.bank_details_approved is distinct from old.bank_details_approved then
    raise exception 'Bank approval status can only be changed through the guarded admin flow.';
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

-- =========================================================
-- 4. Optional verification checks
-- =========================================================
-- select column_name
-- from information_schema.columns
-- where table_schema = 'public'
--   and table_name = 'products'
--   and column_name in ('deleted_at', 'deleted_by_admin_id', 'deletion_reason');
--
-- select column_name
-- from information_schema.columns
-- where table_schema = 'public'
--   and table_name = 'admin_actions'
--   and column_name in (
--     'target_type',
--     'target_id',
--     'action_type',
--     'metadata',
--     'previous_state',
--     'new_state',
--     'source',
--     'requires_reason',
--     'automated'
--   );
