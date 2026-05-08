create extension if not exists pgcrypto;

alter table if exists public.users
  add column if not exists university_name text,
  add column if not exists university_state text,
  add column if not exists university_zone text,
  add column if not exists university_role text,
  add column if not exists is_verified_seller boolean not null default false,
  add column if not exists verification_status text not null default 'not_submitted',
  add column if not exists verification_submitted_at timestamptz,
  add column if not exists verification_approved_at timestamptz;

alter table if exists public.users
  alter column is_verified_seller set default false,
  alter column verification_status set default 'not_submitted';

update public.users
set
  is_verified_seller = coalesce(is_verified_seller, false),
  verification_status = coalesce(nullif(btrim(verification_status), ''), 'not_submitted')
where
  is_verified_seller is null
  or verification_status is null
  or btrim(verification_status) = '';

do $$
begin
  if not exists (
    select 1
    from pg_constraint
    where conname = 'users_verification_status_check'
      and conrelid = 'public.users'::regclass
  ) then
    alter table public.users
      add constraint users_verification_status_check
      check (verification_status in ('not_submitted', 'pending', 'approved', 'rejected'));
  end if;

  if not exists (
    select 1
    from pg_constraint
    where conname = 'users_university_role_check'
      and conrelid = 'public.users'::regclass
  ) then
    alter table public.users
      add constraint users_university_role_check
      check (
        university_role is null
        or university_role in ('student', 'staff')
      );
  end if;
end $$;

create table if not exists public.seller_verifications (
  id uuid primary key default gen_random_uuid(),
  seller_id uuid not null references public.users(id) on delete cascade,
  university_name text not null,
  university_state text,
  university_zone text,
  university_role text,
  matric_or_staff_id text,
  proof_url text,
  payment_amount integer not null default 1500,
  payment_status text not null default 'pending',
  verification_status text not null default 'pending',
  admin_notes text,
  reviewed_by uuid references public.users(id) on delete set null,
  reviewed_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table if exists public.seller_verifications
  add column if not exists seller_id uuid references public.users(id) on delete cascade,
  add column if not exists university_name text,
  add column if not exists university_state text,
  add column if not exists university_zone text,
  add column if not exists university_role text,
  add column if not exists matric_or_staff_id text,
  add column if not exists proof_url text,
  add column if not exists payment_amount integer not null default 1500,
  add column if not exists payment_status text not null default 'pending',
  add column if not exists verification_status text not null default 'pending',
  add column if not exists admin_notes text,
  add column if not exists reviewed_by uuid references public.users(id) on delete set null,
  add column if not exists reviewed_at timestamptz,
  add column if not exists created_at timestamptz not null default now(),
  add column if not exists updated_at timestamptz not null default now();

alter table if exists public.seller_verifications
  alter column payment_amount set default 1500,
  alter column payment_status set default 'pending',
  alter column verification_status set default 'pending',
  alter column created_at set default now(),
  alter column updated_at set default now();

update public.seller_verifications
set
  payment_amount = coalesce(payment_amount, 1500),
  payment_status = coalesce(nullif(btrim(payment_status), ''), 'pending'),
  verification_status = coalesce(nullif(btrim(verification_status), ''), 'pending'),
  created_at = coalesce(created_at, now()),
  updated_at = coalesce(updated_at, created_at, now())
where
  payment_amount is null
  or payment_status is null
  or btrim(payment_status) = ''
  or verification_status is null
  or btrim(verification_status) = ''
  or created_at is null
  or updated_at is null;

do $$
begin
  if not exists (
    select 1
    from pg_constraint
    where conname = 'seller_verifications_university_role_check'
      and conrelid = 'public.seller_verifications'::regclass
  ) then
    alter table public.seller_verifications
      add constraint seller_verifications_university_role_check
      check (
        university_role is null
        or university_role in ('student', 'staff')
      );
  end if;

  if not exists (
    select 1
    from pg_constraint
    where conname = 'seller_verifications_payment_status_check'
      and conrelid = 'public.seller_verifications'::regclass
  ) then
    alter table public.seller_verifications
      add constraint seller_verifications_payment_status_check
      check (payment_status in ('pending', 'manual_pending', 'paid', 'failed'));
  end if;

  if not exists (
    select 1
    from pg_constraint
    where conname = 'seller_verifications_verification_status_check'
      and conrelid = 'public.seller_verifications'::regclass
  ) then
    alter table public.seller_verifications
      add constraint seller_verifications_verification_status_check
      check (verification_status in ('pending', 'approved', 'rejected'));
  end if;
end $$;

create index if not exists seller_verifications_seller_id_idx
  on public.seller_verifications (seller_id, created_at desc);

create index if not exists seller_verifications_status_idx
  on public.seller_verifications (verification_status, payment_status);

create or replace function public.seller_verifications_set_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at := now();
  return new;
end;
$$;

drop trigger if exists seller_verifications_set_updated_at on public.seller_verifications;
create trigger seller_verifications_set_updated_at
before update on public.seller_verifications
for each row
execute function public.seller_verifications_set_updated_at();

create or replace function public.guard_seller_verification_write()
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

  if auth.uid() is null then
    raise exception 'Authenticated session required.';
  end if;

  select role
  into actor_role
  from public.users
  where id = auth.uid();

  if tg_op = 'INSERT' then
    if actor_role is distinct from 'seller' then
      raise exception 'Only sellers can create verification submissions.';
    end if;

    if new.seller_id is distinct from auth.uid() then
      raise exception 'You can only submit verification for your own seller account.';
    end if;

    if nullif(btrim(coalesce(new.university_name, '')), '') is null then
      raise exception 'university_name is required.';
    end if;

    new.payment_amount := 1500;
    new.payment_status := case
      when coalesce(new.payment_status, 'pending') = 'manual_pending' then 'manual_pending'
      else 'pending'
    end;
    new.verification_status := 'pending';
    new.admin_notes := null;
    new.reviewed_by := null;
    new.reviewed_at := null;
    new.created_at := coalesce(new.created_at, now());
    new.updated_at := coalesce(new.updated_at, new.created_at, now());
    return new;
  end if;

  if tg_op = 'UPDATE' then
    if actor_role = 'admin' then
      return new;
    end if;

    raise exception 'Verification submissions can only be reviewed by admins.';
  end if;

  if actor_role = 'admin' then
    return old;
  end if;

  raise exception 'Verification submissions cannot be deleted from the client.';
end;
$$;

drop trigger if exists seller_verifications_guard_write on public.seller_verifications;
create trigger seller_verifications_guard_write
before insert or update or delete on public.seller_verifications
for each row
execute function public.guard_seller_verification_write();

create or replace function public.guard_user_client_mutation()
returns trigger
language plpgsql
as $$
declare
  request_role text := coalesce(
    nullif(auth.role(), ''),
    current_setting('request.jwt.claim.role', true)
  );
  old_verification_status text := coalesce(nullif(btrim(old.verification_status), ''), 'not_submitted');
  new_verification_status text := coalesce(nullif(btrim(new.verification_status), ''), 'not_submitted');
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

  if new.account_status is distinct from old.account_status then
    raise exception 'Changing account status directly is not allowed.';
  end if;

  if new.bank_details_approved is distinct from old.bank_details_approved then
    raise exception 'Bank approval status can only be changed through the guarded admin flow.';
  end if;

  if new.is_trusted_seller is distinct from old.is_trusted_seller then
    raise exception 'Trusted seller status is managed automatically by the database.';
  end if;

  if new.completed_orders is distinct from old.completed_orders
    or new.average_rating is distinct from old.average_rating
    or new.dispute_rate is distinct from old.dispute_rate
    or new.no_fraud_flags is distinct from old.no_fraud_flags then
    raise exception 'Trusted seller metrics cannot be changed directly from the client.';
  end if;

  if new.is_verified_seller is distinct from old.is_verified_seller then
    raise exception 'Verified seller approval can only be changed through the verification review flow.';
  end if;

  if new.verification_approved_at is distinct from old.verification_approved_at then
    raise exception 'verification_approved_at is controlled by the verification review flow.';
  end if;

  if new_verification_status is distinct from old_verification_status then
    if not (
      new_verification_status = 'pending'
      and old_verification_status in ('not_submitted', 'rejected')
    ) then
      raise exception 'verification_status can only move to pending from the client.';
    end if;
  end if;

  if new.verification_submitted_at is distinct from old.verification_submitted_at then
    if not (
      new_verification_status = 'pending'
      and old_verification_status in ('not_submitted', 'rejected')
      and new.verification_submitted_at is not null
    ) then
      raise exception 'verification_submitted_at is controlled by the verification submission flow.';
    end if;
  end if;

  return new;
end;
$$;

drop trigger if exists users_guard_client_update on public.users;
create trigger users_guard_client_update
before update on public.users
for each row
execute function public.guard_user_client_mutation();

alter table if exists public.seller_verifications enable row level security;

drop policy if exists "sellers can insert own verification submissions" on public.seller_verifications;
create policy "sellers can insert own verification submissions"
on public.seller_verifications
for insert
to authenticated
with check (
  seller_id = auth.uid()
  and exists (
    select 1
    from public.users
    where users.id = auth.uid()
      and users.role = 'seller'
  )
);

drop policy if exists "sellers can read own verification submissions" on public.seller_verifications;
create policy "sellers can read own verification submissions"
on public.seller_verifications
for select
to authenticated
using (
  seller_id = auth.uid()
  or public.is_admin_user(auth.uid())
);

drop policy if exists "admins can update verification submissions" on public.seller_verifications;
create policy "admins can update verification submissions"
on public.seller_verifications
for update
to authenticated
using (public.is_admin_user(auth.uid()))
with check (public.is_admin_user(auth.uid()));

drop policy if exists "admins can delete verification submissions" on public.seller_verifications;
create policy "admins can delete verification submissions"
on public.seller_verifications
for delete
to authenticated
using (public.is_admin_user(auth.uid()));

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'seller-verification-proofs',
  'seller-verification-proofs',
  false,
  10485760,
  array['image/png', 'image/jpeg', 'image/webp', 'application/pdf']
)
on conflict (id) do update
set
  public = excluded.public,
  file_size_limit = excluded.file_size_limit,
  allowed_mime_types = excluded.allowed_mime_types;

drop policy if exists "sellers can upload own verification proofs" on storage.objects;
create policy "sellers can upload own verification proofs"
on storage.objects
for insert
to authenticated
with check (
  bucket_id = 'seller-verification-proofs'
  and (storage.foldername(name))[1] = auth.uid()::text
  and exists (
    select 1
    from public.users
    where users.id = auth.uid()
      and users.role = 'seller'
  )
);

drop policy if exists "owners or admins can view verification proofs" on storage.objects;
create policy "owners or admins can view verification proofs"
on storage.objects
for select
to authenticated
using (
  bucket_id = 'seller-verification-proofs'
  and (
    (storage.foldername(name))[1] = auth.uid()::text
    or public.is_admin_user(auth.uid())
  )
);

drop policy if exists "owners or admins can update verification proofs" on storage.objects;
create policy "owners or admins can update verification proofs"
on storage.objects
for update
to authenticated
using (
  bucket_id = 'seller-verification-proofs'
  and (
    (storage.foldername(name))[1] = auth.uid()::text
    or public.is_admin_user(auth.uid())
  )
)
with check (
  bucket_id = 'seller-verification-proofs'
  and (
    (storage.foldername(name))[1] = auth.uid()::text
    or public.is_admin_user(auth.uid())
  )
);

drop policy if exists "owners or admins can delete verification proofs" on storage.objects;
create policy "owners or admins can delete verification proofs"
on storage.objects
for delete
to authenticated
using (
  bucket_id = 'seller-verification-proofs'
  and (
    (storage.foldername(name))[1] = auth.uid()::text
    or public.is_admin_user(auth.uid())
  )
);
