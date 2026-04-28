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

create or replace function public.get_public_seller_identities(p_seller_ids uuid[])
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
  where u.role = 'seller'
    and u.id = any(coalesce(p_seller_ids, '{}'::uuid[]));
$$;

revoke all on function public.get_public_seller_identity(uuid) from public;
grant execute on function public.get_public_seller_identity(uuid) to anon, authenticated;

revoke all on function public.get_public_seller_identities(uuid[]) from public;
grant execute on function public.get_public_seller_identities(uuid[]) to anon, authenticated;

do $$
begin
  if exists (
    select 1
    from pg_policies
    where schemaname = 'public'
      and tablename = 'users'
      and policyname = 'authenticated can read seller public info'
  ) then
    drop policy "authenticated can read seller public info" on public.users;
  end if;
end $$;
