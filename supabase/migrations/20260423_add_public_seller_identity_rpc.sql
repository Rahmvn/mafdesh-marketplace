create or replace function public.get_public_seller_identity(p_seller_id uuid)
returns table (
  id uuid,
  business_name text,
  is_verified boolean,
  status text,
  account_status text
)
language sql
security definer
set search_path = public
as $$
  select
    u.id,
    nullif(btrim(u.business_name), '') as business_name,
    coalesce(u.is_verified, false) as is_verified,
    u.status,
    u.account_status
  from public.users u
  where u.id = p_seller_id
    and u.role = 'seller';
$$;

revoke all on function public.get_public_seller_identity(uuid) from public;
grant execute on function public.get_public_seller_identity(uuid) to anon, authenticated;
