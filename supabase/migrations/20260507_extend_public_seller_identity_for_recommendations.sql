drop function if exists public.get_public_seller_identity(uuid);
drop function if exists public.get_public_seller_identities(uuid[]);

create function public.get_public_seller_identity(p_seller_id uuid)
returns table (
  id uuid,
  business_name text,
  is_verified boolean,
  status text,
  account_status text,
  university_name text,
  university_state text,
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
    nullif(btrim(u.university_name), '') as university_name,
    nullif(btrim(u.university_state), '') as university_state,
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
  university_name text,
  university_state text,
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
    nullif(btrim(u.university_name), '') as university_name,
    nullif(btrim(u.university_state), '') as university_state,
    u.average_rating
  from public.users u
  where u.role = 'seller'
    and u.id = any(coalesce(p_seller_ids, '{}'::uuid[]));
$$;

revoke all on function public.get_public_seller_identity(uuid) from public;
grant execute on function public.get_public_seller_identity(uuid) to anon, authenticated;

revoke all on function public.get_public_seller_identities(uuid[]) from public;
grant execute on function public.get_public_seller_identities(uuid[]) to anon, authenticated;
