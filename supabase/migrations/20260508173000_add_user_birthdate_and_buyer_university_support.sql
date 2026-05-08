alter table public.users
  add column if not exists date_of_birth date;

update public.users u
set date_of_birth = (au.raw_user_meta_data ->> 'date_of_birth')::date
from auth.users au
where u.id = au.id
  and u.date_of_birth is null
  and coalesce(au.raw_user_meta_data ->> 'date_of_birth', '') ~ '^\d{4}-\d{2}-\d{2}$';

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
