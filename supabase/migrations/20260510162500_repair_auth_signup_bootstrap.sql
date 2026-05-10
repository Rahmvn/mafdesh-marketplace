create extension if not exists pgcrypto;

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

alter table if exists public.universities enable row level security;

drop policy if exists "universities are readable by everyone" on public.universities;
create policy "universities are readable by everyone"
on public.universities
for select
to anon, authenticated
using (is_active = true);

alter table public.users
  add column if not exists date_of_birth date;

alter table public.users
  add column if not exists university_id uuid references public.universities(id) on delete set null;

alter table public.users
  add column if not exists university_name text;

alter table public.users
  add column if not exists university_state text;

alter table public.users
  add column if not exists university_zone text;

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
  v_date_of_birth date := case
    when coalesce(v_metadata ->> 'date_of_birth', '') ~ '^\d{4}-\d{2}-\d{2}$'
      then (v_metadata ->> 'date_of_birth')::date
    else null
  end;
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
    date_of_birth,
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
    v_date_of_birth,
    case when v_next_role = 'seller' then v_business_name else null end,
    case when v_next_role in ('buyer', 'seller') then v_university_id else null end,
    case when v_next_role in ('buyer', 'seller') then v_university_name else null end,
    case when v_next_role in ('buyer', 'seller') then v_university_state else null end,
    case when v_next_role in ('buyer', 'seller') then v_university_zone else null end
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
    date_of_birth = coalesce(excluded.date_of_birth, public.users.date_of_birth),
    business_name = case
      when coalesce(public.users.role, excluded.role) = 'seller'
        then coalesce(excluded.business_name, public.users.business_name)
      else null
    end,
    university_id = case
      when coalesce(public.users.role, excluded.role) in ('buyer', 'seller')
        then coalesce(excluded.university_id, public.users.university_id)
      else null
    end,
    university_name = case
      when coalesce(public.users.role, excluded.role) in ('buyer', 'seller')
        then coalesce(excluded.university_name, public.users.university_name)
      else null
    end,
    university_state = case
      when coalesce(public.users.role, excluded.role) in ('buyer', 'seller')
        then coalesce(excluded.university_state, public.users.university_state)
      else null
    end,
    university_zone = case
      when coalesce(public.users.role, excluded.role) in ('buyer', 'seller')
        then coalesce(excluded.university_zone, public.users.university_zone)
      else null
    end;

  return new;
end;
$$;

drop trigger if exists auth_users_sync_public_user on auth.users;
create trigger auth_users_sync_public_user
after insert or update of email, raw_user_meta_data on auth.users
for each row
execute function public.sync_public_user_from_auth();

insert into public.profiles (
  id,
  full_name,
  username,
  location
)
select
  au.id,
  nullif(btrim(coalesce(au.raw_user_meta_data ->> 'full_name', '')), ''),
  nullif(lower(btrim(coalesce(au.raw_user_meta_data ->> 'username', ''))), ''),
  nullif(btrim(coalesce(au.raw_user_meta_data ->> 'location', '')), '')
from auth.users au
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
  date_of_birth,
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
    when coalesce(au.raw_user_meta_data ->> 'date_of_birth', '') ~ '^\d{4}-\d{2}-\d{2}$'
      then (au.raw_user_meta_data ->> 'date_of_birth')::date
    else null
  end,
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
    ) in ('buyer', 'seller')
      and coalesce(au.raw_user_meta_data ->> 'university_id', '') ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$'
      then (au.raw_user_meta_data ->> 'university_id')::uuid
    else null
  end,
  case
    when public.normalize_self_service_role(
      au.raw_user_meta_data ->> 'role',
      coalesce(u.role, 'buyer')
    ) in ('buyer', 'seller')
      then nullif(btrim(coalesce(au.raw_user_meta_data ->> 'university_name', '')), '')
    else null
  end,
  case
    when public.normalize_self_service_role(
      au.raw_user_meta_data ->> 'role',
      coalesce(u.role, 'buyer')
    ) in ('buyer', 'seller')
      then nullif(btrim(coalesce(au.raw_user_meta_data ->> 'university_state', '')), '')
    else null
  end,
  case
    when public.normalize_self_service_role(
      au.raw_user_meta_data ->> 'role',
      coalesce(u.role, 'buyer')
    ) in ('buyer', 'seller')
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
  date_of_birth = coalesce(excluded.date_of_birth, public.users.date_of_birth),
  business_name = case
    when excluded.role = 'seller'
      then coalesce(excluded.business_name, public.users.business_name)
    else null
  end,
  university_id = case
    when excluded.role in ('buyer', 'seller')
      then coalesce(excluded.university_id, public.users.university_id)
    else null
  end,
  university_name = case
    when excluded.role in ('buyer', 'seller')
      then coalesce(excluded.university_name, public.users.university_name)
    else null
  end,
  university_state = case
    when excluded.role in ('buyer', 'seller')
      then coalesce(excluded.university_state, public.users.university_state)
    else null
  end,
  university_zone = case
    when excluded.role in ('buyer', 'seller')
      then coalesce(excluded.university_zone, public.users.university_zone)
    else null
  end;
