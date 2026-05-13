create or replace function public.normalize_marketplace_text(value text)
returns text
language sql
immutable
as $$
  select nullif(
    btrim(
      regexp_replace(
        replace(replace(replace(replace(coalesce(value, ''), chr(8203), ''), chr(8204), ''), chr(8205), ''), chr(65279), ''),
        '\s+',
        ' ',
        'g'
      )
    ),
    ''
  );
$$;

create or replace function public.validate_self_service_signup_inputs(
  p_role text,
  p_full_name text,
  p_phone_number text,
  p_date_of_birth date,
  p_business_name text,
  p_location text,
  p_university_name text,
  p_university_state text,
  p_university_zone text
)
returns void
language plpgsql
as $$
declare
  v_role text := lower(btrim(coalesce(p_role, '')));
  v_full_name text := public.normalize_marketplace_text(p_full_name);
  v_phone_number text := public.normalize_marketplace_text(p_phone_number);
  v_business_name text := public.normalize_marketplace_text(p_business_name);
  v_location text := public.normalize_marketplace_text(p_location);
  v_university_name text := public.normalize_marketplace_text(p_university_name);
  v_university_state text := public.normalize_marketplace_text(p_university_state);
  v_university_zone text := public.normalize_marketplace_text(p_university_zone);
begin
  if v_role not in ('buyer', 'seller') then
    return;
  end if;

  if v_full_name is null then
    raise exception 'A valid full name is required for signup.';
  end if;

  if length(v_full_name) < 2 or length(v_full_name) > 100 then
    raise exception 'Full name must be between 2 and 100 characters.';
  end if;

  if v_full_name like '%<%' or v_full_name like '%>%'
    or v_full_name !~ '^[A-Za-z0-9 .,''-]+$' then
    raise exception 'Full name contains invalid characters.';
  end if;

  if v_phone_number is null or v_phone_number !~ '^0[0-9]{10}$' then
    raise exception 'Phone number must be a valid 11-digit Nigerian number starting with 0.';
  end if;

  if p_date_of_birth is null then
    raise exception 'Date of birth is required for signup.';
  end if;

  if p_date_of_birth > current_date - interval '16 years' then
    raise exception 'You must be at least 16 years old to create an account.';
  end if;

  if p_date_of_birth < current_date - interval '120 years' then
    raise exception 'Date of birth must be realistic.';
  end if;

  if v_location is null or length(v_location) > 80 or v_location like '%<%' or v_location like '%>%' then
    raise exception 'A valid location is required for signup.';
  end if;

  if v_university_name is null or length(v_university_name) < 2 or length(v_university_name) > 120
    or v_university_name like '%<%' or v_university_name like '%>%' then
    raise exception 'A valid university name is required for signup.';
  end if;

  if v_role = 'seller' then
    if v_business_name is null then
      raise exception 'A valid business name is required for seller signup.';
    end if;

    if length(v_business_name) < 2 or length(v_business_name) > 120 then
      raise exception 'Business name must be between 2 and 120 characters.';
    end if;

    if v_business_name like '%<%' or v_business_name like '%>%'
      or v_business_name !~ '^[A-Za-z0-9 .,''&()/ -]+$' then
      raise exception 'Business name contains invalid characters.';
    end if;

    if v_university_state is null or length(v_university_state) > 80 then
      raise exception 'University state is required for seller signup.';
    end if;

    if v_university_zone is null or length(v_university_zone) > 80 then
      raise exception 'University zone is required for seller signup.';
    end if;
  end if;
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
  v_app_metadata jsonb := coalesce(new.raw_app_meta_data, '{}'::jsonb);
  v_existing_user public.users%rowtype;
  v_next_role text;
  v_full_name text := public.normalize_marketplace_text(v_metadata ->> 'full_name');
  v_username text := nullif(lower(btrim(coalesce(v_metadata ->> 'username', ''))), '');
  v_location text := public.normalize_marketplace_text(v_metadata ->> 'location');
  v_phone_number text := public.normalize_marketplace_text(v_metadata ->> 'phone_number');
  v_business_name text := public.normalize_marketplace_text(v_metadata ->> 'business_name');
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
  v_university_name text := public.normalize_marketplace_text(v_metadata ->> 'university_name');
  v_university_state text := public.normalize_marketplace_text(v_metadata ->> 'university_state');
  v_university_zone text := public.normalize_marketplace_text(v_metadata ->> 'university_zone');
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

  perform public.validate_self_service_signup_inputs(
    v_next_role,
    v_full_name,
    v_phone_number,
    v_date_of_birth,
    v_business_name,
    v_location,
    v_university_name,
    v_university_state,
    v_university_zone
  );

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

  return new;
end;
$$;
