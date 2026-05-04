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
    business_name
  )
  values (
    new.id,
    new.email,
    v_next_role,
    v_phone_number,
    case when v_next_role = 'seller' then v_business_name else null end
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
    end;

  return new;
end;
$$;

update public.users u
set role = 'admin'
from auth.users au
where au.id = u.id
  and lower(btrim(coalesce(au.raw_app_meta_data ->> 'role', ''))) = 'admin'
  and u.role is distinct from 'admin';

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
left join public.profiles p
  on p.id = au.id
where lower(btrim(coalesce(au.raw_app_meta_data ->> 'role', ''))) = 'admin'
  and p.id is null
on conflict (id) do nothing;

insert into public.users (
  id,
  email,
  role,
  phone_number,
  business_name
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
  end;
