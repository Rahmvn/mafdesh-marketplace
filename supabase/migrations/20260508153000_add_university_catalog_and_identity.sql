create table if not exists public.universities (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  state text not null,
  zone text not null,
  slug text not null unique,
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create unique index if not exists universities_name_state_unique_idx
  on public.universities (lower(btrim(name)), lower(btrim(state)));

create index if not exists universities_state_idx
  on public.universities (state, is_active, name);

create or replace function public.universities_set_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at := now();
  return new;
end;
$$;

drop trigger if exists universities_set_updated_at on public.universities;
create trigger universities_set_updated_at
before update on public.universities
for each row
execute function public.universities_set_updated_at();

insert into public.universities (name, state, zone, slug)
values
  ('Mafdesh University', 'Kaduna', 'North West', 'mafdesh-university-kaduna'),
  ('Ahmadu Bello University', 'Kaduna', 'North West', 'ahmadu-bello-university-kaduna'),
  ('University of Lagos', 'Lagos', 'South West', 'university-of-lagos-lagos'),
  ('Lagos State University', 'Lagos', 'South West', 'lagos-state-university-lagos'),
  ('University of Ibadan', 'Oyo', 'South West', 'university-of-ibadan-oyo'),
  ('Obafemi Awolowo University', 'Osun', 'South West', 'obafemi-awolowo-university-osun'),
  ('Covenant University', 'Ogun', 'South West', 'covenant-university-ogun'),
  ('Federal University of Agriculture Abeokuta', 'Ogun', 'South West', 'federal-university-of-agriculture-abeokuta-ogun'),
  ('University of Nigeria, Nsukka', 'Enugu', 'South East', 'university-of-nigeria-nsukka-enugu'),
  ('Nnamdi Azikiwe University', 'Anambra', 'South East', 'nnamdi-azikiwe-university-anambra'),
  ('Ebonyi State University', 'Ebonyi', 'South East', 'ebonyi-state-university-ebonyi'),
  ('Michael Okpara University of Agriculture Umudike', 'Abia', 'South East', 'michael-okpara-university-of-agriculture-umudike-abia'),
  ('Abia State University', 'Abia', 'South East', 'abia-state-university-abia'),
  ('University of Benin', 'Edo', 'South South', 'university-of-benin-edo'),
  ('University of Port Harcourt', 'Rivers', 'South South', 'university-of-port-harcourt-rivers'),
  ('Rivers State University', 'Rivers', 'South South', 'rivers-state-university-rivers'),
  ('University of Calabar', 'Cross River', 'South South', 'university-of-calabar-cross-river'),
  ('Delta State University', 'Delta', 'South South', 'delta-state-university-delta'),
  ('Federal University Otuoke', 'Bayelsa', 'South South', 'federal-university-otuoke-bayelsa'),
  ('University of Ilorin', 'Kwara', 'North Central', 'university-of-ilorin-kwara'),
  ('University of Abuja', 'FCT', 'North Central', 'university-of-abuja-fct'),
  ('University of Jos', 'Plateau', 'North Central', 'university-of-jos-plateau'),
  ('Benue State University', 'Benue', 'North Central', 'benue-state-university-benue'),
  ('Federal University Lafia', 'Nasarawa', 'North Central', 'federal-university-lafia-nasarawa'),
  ('Prince Abubakar Audu University', 'Kogi', 'North Central', 'prince-abubakar-audu-university-kogi'),
  ('Ibrahim Badamasi Babangida University', 'Niger', 'North Central', 'ibrahim-badamasi-babangida-university-niger'),
  ('Bayero University Kano', 'Kano', 'North West', 'bayero-university-kano'),
  ('Umaru Musa Yar''adua University', 'Katsina', 'North West', 'umaru-musa-yaradua-university-katsina'),
  ('Kebbi State University of Science and Technology', 'Kebbi', 'North West', 'kebbi-state-university-of-science-and-technology-kebbi'),
  ('Usmanu Danfodiyo University', 'Sokoto', 'North West', 'usmanu-danfodiyo-university-sokoto'),
  ('Federal University Dutse', 'Jigawa', 'North West', 'federal-university-dutse-jigawa'),
  ('Modibbo Adama University', 'Adamawa', 'North East', 'modibbo-adama-university-adamawa'),
  ('University of Maiduguri', 'Borno', 'North East', 'university-of-maiduguri-borno'),
  ('Gombe State University', 'Gombe', 'North East', 'gombe-state-university-gombe'),
  ('Taraba State University', 'Taraba', 'North East', 'taraba-state-university-taraba')
on conflict (slug) do update
set
  name = excluded.name,
  state = excluded.state,
  zone = excluded.zone,
  is_active = true;

alter table if exists public.users
  add column if not exists university_id uuid references public.universities(id) on delete set null;

alter table if exists public.seller_verifications
  add column if not exists university_id uuid references public.universities(id) on delete set null;

create index if not exists users_university_id_idx
  on public.users (university_id);

create index if not exists seller_verifications_university_id_idx
  on public.seller_verifications (university_id);

update public.users u
set
  university_id = uni.id,
  university_state = coalesce(nullif(btrim(u.university_state), ''), uni.state),
  university_zone = coalesce(nullif(btrim(u.university_zone), ''), uni.zone)
from public.universities uni
where u.university_id is null
  and nullif(btrim(coalesce(u.university_name, '')), '') is not null
  and lower(btrim(u.university_name)) = lower(btrim(uni.name))
  and lower(btrim(coalesce(u.university_state, uni.state))) = lower(btrim(uni.state));

update public.seller_verifications sv
set
  university_id = uni.id,
  university_state = coalesce(nullif(btrim(sv.university_state), ''), uni.state),
  university_zone = coalesce(nullif(btrim(sv.university_zone), ''), uni.zone)
from public.universities uni
where sv.university_id is null
  and nullif(btrim(coalesce(sv.university_name, '')), '') is not null
  and lower(btrim(sv.university_name)) = lower(btrim(uni.name))
  and lower(btrim(coalesce(sv.university_state, uni.state))) = lower(btrim(uni.state));

do $$
begin
  if exists (
    select 1
    from pg_constraint
    where conname = 'users_university_role_check'
      and conrelid = 'public.users'::regclass
  ) then
    alter table public.users
      drop constraint users_university_role_check;
  end if;

  alter table public.users
    add constraint users_university_role_check
    check (
      university_role is null
      or university_role in ('student', 'staff', 'other')
    );

  if exists (
    select 1
    from pg_constraint
    where conname = 'seller_verifications_university_role_check'
      and conrelid = 'public.seller_verifications'::regclass
  ) then
    alter table public.seller_verifications
      drop constraint seller_verifications_university_role_check;
  end if;

  alter table public.seller_verifications
    add constraint seller_verifications_university_role_check
    check (
      university_role is null
      or university_role in ('student', 'staff', 'other')
    );
end $$;

alter table if exists public.universities enable row level security;

drop policy if exists "universities are readable by everyone" on public.universities;
create policy "universities are readable by everyone"
on public.universities
for select
to anon, authenticated
using (is_active = true);

create or replace function public.sync_public_user_from_auth()
returns trigger
language plpgsql
security definer
set search_path = public, auth
as $$
declare
  v_metadata jsonb := coalesce(new.raw_user_meta_data, '{}'::jsonb);
  v_app_metadata jsonb := coalesce(new.raw_app_meta_data, '{}'::jsonb);
  v_existing_user public.users%rowtype;
  v_next_role text;
  v_full_name text := nullif(btrim(coalesce(v_metadata ->> 'full_name', '')), '');
  v_username text := nullif(lower(btrim(coalesce(v_metadata ->> 'username', ''))), '');
  v_location text := nullif(btrim(coalesce(v_metadata ->> 'location', '')), '');
  v_phone_number text := nullif(btrim(coalesce(v_metadata ->> 'phone_number', '')), '');
  v_business_name text := nullif(btrim(coalesce(v_metadata ->> 'business_name', '')), '');
  v_university_id uuid := case
    when coalesce(v_metadata ->> 'university_id', '') ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$'
      then (v_metadata ->> 'university_id')::uuid
    else null
  end;
  v_university_name text := nullif(btrim(coalesce(v_metadata ->> 'university_name', '')), '');
  v_university_state text := nullif(btrim(coalesce(v_metadata ->> 'university_state', '')), '');
  v_university_zone text := nullif(btrim(coalesce(v_metadata ->> 'university_zone', '')), '');
  v_trusted_role text := lower(btrim(coalesce(v_app_metadata ->> 'role', '')));
begin
  select *
  into v_existing_user
  from public.users
  where id = new.id;

  v_next_role := case
    when coalesce(v_existing_user.role, '') = 'admin' then 'admin'
    when v_trusted_role = 'admin' then 'admin'
    else public.normalize_self_service_role(
      v_metadata ->> 'role',
      coalesce(v_existing_user.role, 'buyer')
    )
  end;

  insert into public.profiles (
    id,
    full_name,
    username,
    location
  )
  values (
    new.id,
    v_full_name,
    v_username,
    v_location
  )
  on conflict (id) do update
  set
    full_name = coalesce(excluded.full_name, public.profiles.full_name),
    username = coalesce(excluded.username, public.profiles.username),
    location = coalesce(excluded.location, public.profiles.location);

  insert into public.users (
    id,
    email,
    role,
    phone_number,
    business_name,
    university_id,
    university_name,
    university_state,
    university_zone
  )
  values (
    new.id,
    new.email,
    v_next_role,
    v_phone_number,
    case when v_next_role = 'seller' then v_business_name else null end,
    case when v_next_role = 'seller' then v_university_id else null end,
    case when v_next_role = 'seller' then v_university_name else null end,
    case when v_next_role = 'seller' then v_university_state else null end,
    case when v_next_role = 'seller' then v_university_zone else null end
  )
  on conflict (id) do update
  set
    email = coalesce(excluded.email, public.users.email),
    role = case
      when lower(btrim(coalesce(v_app_metadata ->> 'role', ''))) = 'admin' then 'admin'
      when public.users.role = 'admin' then public.users.role
      when nullif(btrim(coalesce(public.users.role, '')), '') is null then excluded.role
      else public.users.role
    end,
    phone_number = coalesce(excluded.phone_number, public.users.phone_number),
    business_name = case
      when coalesce(public.users.role, excluded.role) = 'seller'
        then coalesce(excluded.business_name, public.users.business_name)
      else null
    end,
    university_id = case
      when coalesce(public.users.role, excluded.role) = 'seller'
        then coalesce(excluded.university_id, public.users.university_id)
      else null
    end,
    university_name = case
      when coalesce(public.users.role, excluded.role) = 'seller'
        then coalesce(excluded.university_name, public.users.university_name)
      else null
    end,
    university_state = case
      when coalesce(public.users.role, excluded.role) = 'seller'
        then coalesce(excluded.university_state, public.users.university_state)
      else null
    end,
    university_zone = case
      when coalesce(public.users.role, excluded.role) = 'seller'
        then coalesce(excluded.university_zone, public.users.university_zone)
      else null
    end;

  return new;
end;
$$;

insert into public.users (
  id,
  email,
  role,
  phone_number,
  business_name,
  university_id,
  university_name,
  university_state,
  university_zone
)
select
  au.id,
  au.email,
  case
    when lower(btrim(coalesce(au.raw_app_meta_data ->> 'role', ''))) = 'admin' then 'admin'
    else public.normalize_self_service_role(
      au.raw_user_meta_data ->> 'role',
      coalesce(u.role, 'buyer')
    )
  end,
  nullif(btrim(coalesce(au.raw_user_meta_data ->> 'phone_number', '')), ''),
  case
    when lower(btrim(coalesce(au.raw_app_meta_data ->> 'role', ''))) = 'admin' then null
    when public.normalize_self_service_role(
      au.raw_user_meta_data ->> 'role',
      coalesce(u.role, 'buyer')
    ) = 'seller'
      then nullif(btrim(coalesce(au.raw_user_meta_data ->> 'business_name', '')), '')
    else null
  end,
  case
    when public.normalize_self_service_role(
      au.raw_user_meta_data ->> 'role',
      coalesce(u.role, 'buyer')
    ) = 'seller'
      and coalesce(au.raw_user_meta_data ->> 'university_id', '') ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$'
      then (au.raw_user_meta_data ->> 'university_id')::uuid
    else null
  end,
  case
    when public.normalize_self_service_role(
      au.raw_user_meta_data ->> 'role',
      coalesce(u.role, 'buyer')
    ) = 'seller'
      then nullif(btrim(coalesce(au.raw_user_meta_data ->> 'university_name', '')), '')
    else null
  end,
  case
    when public.normalize_self_service_role(
      au.raw_user_meta_data ->> 'role',
      coalesce(u.role, 'buyer')
    ) = 'seller'
      then nullif(btrim(coalesce(au.raw_user_meta_data ->> 'university_state', '')), '')
    else null
  end,
  case
    when public.normalize_self_service_role(
      au.raw_user_meta_data ->> 'role',
      coalesce(u.role, 'buyer')
    ) = 'seller'
      then nullif(btrim(coalesce(au.raw_user_meta_data ->> 'university_zone', '')), '')
    else null
  end
from auth.users au
left join public.users u
  on u.id = au.id
on conflict (id) do update
set
  email = coalesce(excluded.email, public.users.email),
  role = case
    when excluded.role = 'admin' then 'admin'
    when public.users.role = 'admin' then public.users.role
    when nullif(btrim(coalesce(public.users.role, '')), '') is null then excluded.role
    else public.users.role
  end,
  phone_number = coalesce(excluded.phone_number, public.users.phone_number),
  business_name = case
    when excluded.role = 'seller'
      then coalesce(excluded.business_name, public.users.business_name)
    else null
  end,
  university_id = case
    when excluded.role = 'seller'
      then coalesce(excluded.university_id, public.users.university_id)
    else null
  end,
  university_name = case
    when excluded.role = 'seller'
      then coalesce(excluded.university_name, public.users.university_name)
    else null
  end,
  university_state = case
    when excluded.role = 'seller'
      then coalesce(excluded.university_state, public.users.university_state)
    else null
  end,
  university_zone = case
    when excluded.role = 'seller'
      then coalesce(excluded.university_zone, public.users.university_zone)
    else null
  end;

create or replace function public.guard_user_client_mutation()
returns trigger
language plpgsql
as $$
declare
  request_role text := coalesce(
    nullif(auth.role(), ''),
    current_setting('request.jwt.claim.role', true)
  );
  current_db_role text := current_user;
  old_verification_status text := coalesce(nullif(btrim(old.verification_status), ''), 'not_submitted');
  new_verification_status text := coalesce(nullif(btrim(new.verification_status), ''), 'not_submitted');
  university_identity_changed boolean := (
    new.university_id is distinct from old.university_id
    or nullif(btrim(coalesce(new.university_name, '')), '') is distinct from nullif(btrim(coalesce(old.university_name, '')), '')
    or nullif(btrim(coalesce(new.university_state, '')), '') is distinct from nullif(btrim(coalesce(old.university_state, '')), '')
    or nullif(btrim(coalesce(new.university_zone, '')), '') is distinct from nullif(btrim(coalesce(old.university_zone, '')), '')
    or nullif(btrim(coalesce(new.university_role, '')), '') is distinct from nullif(btrim(coalesce(old.university_role, '')), '')
  );
  verification_reset_applied boolean := false;
begin
  if request_role = 'service_role' or current_db_role in ('postgres', 'supabase_auth_admin', 'supabase_admin') then
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

  if university_identity_changed and (
    old.is_verified_seller
    or old_verification_status <> 'not_submitted'
    or old.verification_submitted_at is not null
    or old.verification_approved_at is not null
  ) then
    new.is_verified_seller := false;
    new.verification_status := 'not_submitted';
    new.verification_submitted_at := null;
    new.verification_approved_at := null;
    verification_reset_applied := true;
  end if;

  if new.is_verified_seller is distinct from old.is_verified_seller then
    if not (verification_reset_applied and new.is_verified_seller = false) then
      raise exception 'Verified seller approval can only be changed through the verification review flow.';
    end if;
  end if;

  if new.verification_approved_at is distinct from old.verification_approved_at then
    if not (verification_reset_applied and new.verification_approved_at is null) then
      raise exception 'verification_approved_at is controlled by the verification review flow.';
    end if;
  end if;

  if new_verification_status is distinct from old_verification_status then
    if not (
      verification_reset_applied
      or (
        new_verification_status = 'pending'
        and old_verification_status in ('not_submitted', 'rejected')
      )
    ) then
      raise exception 'verification_status can only move to pending from the client.';
    end if;
  end if;

  if new.verification_submitted_at is distinct from old.verification_submitted_at then
    if not (
      verification_reset_applied
      or (
        new_verification_status = 'pending'
        and old_verification_status in ('not_submitted', 'rejected')
        and new.verification_submitted_at is not null
      )
    ) then
      raise exception 'verification_submitted_at is controlled by the verification submission flow.';
    end if;
  end if;

  return new;
end;
$$;

drop function if exists public.get_public_seller_identity(uuid);
drop function if exists public.get_public_seller_identities(uuid[]);

create function public.get_public_seller_identity(p_seller_id uuid)
returns table (
  id uuid,
  business_name text,
  is_verified boolean,
  status text,
  account_status text,
  university_id uuid,
  university_name text,
  university_state text,
  university_zone text,
  average_rating numeric
)
language sql
security definer
set search_path = public
as $$
  select
    u.id,
    nullif(btrim(u.business_name), '') as business_name,
    coalesce(u.is_verified_seller, false) or coalesce(u.is_verified, false) as is_verified,
    u.status,
    u.account_status,
    u.university_id,
    nullif(btrim(u.university_name), '') as university_name,
    nullif(btrim(u.university_state), '') as university_state,
    nullif(btrim(u.university_zone), '') as university_zone,
    u.average_rating
  from public.users u
  where u.id = p_seller_id
    and u.role = 'seller';
$$;

create function public.get_public_seller_identities(p_seller_ids uuid[])
returns table (
  id uuid,
  business_name text,
  is_verified boolean,
  status text,
  account_status text,
  university_id uuid,
  university_name text,
  university_state text,
  university_zone text,
  average_rating numeric
)
language sql
security definer
set search_path = public
as $$
  select
    u.id,
    nullif(btrim(u.business_name), '') as business_name,
    coalesce(u.is_verified_seller, false) or coalesce(u.is_verified, false) as is_verified,
    u.status,
    u.account_status,
    u.university_id,
    nullif(btrim(u.university_name), '') as university_name,
    nullif(btrim(u.university_state), '') as university_state,
    nullif(btrim(u.university_zone), '') as university_zone,
    u.average_rating
  from public.users u
  where u.role = 'seller'
    and u.id = any(coalesce(p_seller_ids, '{}'::uuid[]));
$$;

revoke all on function public.get_public_seller_identity(uuid) from public;
grant execute on function public.get_public_seller_identity(uuid) to anon, authenticated;

revoke all on function public.get_public_seller_identities(uuid[]) from public;
grant execute on function public.get_public_seller_identities(uuid[]) to anon, authenticated;
