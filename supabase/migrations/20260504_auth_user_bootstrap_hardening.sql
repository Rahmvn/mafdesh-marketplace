create or replace function public.normalize_self_service_role(
  p_value text,
  p_fallback text default 'buyer'
)
returns text
language plpgsql
immutable
as $$
declare
  v_value text := lower(btrim(coalesce(p_value, '')));
  v_fallback text := lower(btrim(coalesce(p_fallback, 'buyer')));
begin
  if v_value in ('buyer', 'seller') then
    return v_value;
  end if;

  if v_fallback in ('buyer', 'seller') then
    return v_fallback;
  end if;

  return 'buyer';
end;
$$;

create or replace function public.sync_public_user_from_auth()
returns trigger
language plpgsql
security definer
set search_path = public, auth
as $$
declare
  v_metadata jsonb := coalesce(new.raw_user_meta_data, '{}'::jsonb);
  v_existing_user public.users%rowtype;
  v_next_role text;
  v_full_name text := nullif(btrim(coalesce(v_metadata ->> 'full_name', '')), '');
  v_username text := nullif(lower(btrim(coalesce(v_metadata ->> 'username', ''))), '');
  v_location text := nullif(btrim(coalesce(v_metadata ->> 'location', '')), '');
  v_phone_number text := nullif(btrim(coalesce(v_metadata ->> 'phone_number', '')), '');
  v_business_name text := nullif(btrim(coalesce(v_metadata ->> 'business_name', '')), '');
begin
  select *
  into v_existing_user
  from public.users
  where id = new.id;

  v_next_role := public.normalize_self_service_role(
    v_metadata ->> 'role',
    coalesce(v_existing_user.role, 'buyer')
  );

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
  business_name
)
select
  au.id,
  au.email,
  public.normalize_self_service_role(
    au.raw_user_meta_data ->> 'role',
    coalesce(u.role, 'buyer')
  ),
  nullif(btrim(coalesce(au.raw_user_meta_data ->> 'phone_number', '')), ''),
  case
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
