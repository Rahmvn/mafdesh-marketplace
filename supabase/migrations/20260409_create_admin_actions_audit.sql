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
      and column_name = 'order_id'
      and is_nullable = 'NO'
  ) then
    alter table public.admin_actions
      alter column order_id drop not null;
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
