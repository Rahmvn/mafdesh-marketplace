-- Safe admin bootstrap helper.
--
-- Why this exists:
-- - direct UPDATE statements against public.users.role are blocked by the
--   users_guard_client_update trigger for any non-service-role request
-- - client/API callers must never be able to self-promote to admin
-- - we still need a controlled path for trusted SQL Editor/bootstrap use
--
-- How to use after this migration:
--   select * from public.promote_user_to_admin('00000000-0000-0000-0000-000000000000');

create or replace function public.promote_user_to_admin(target_user_id uuid)
returns table (
  id uuid,
  email text,
  role text
)
language plpgsql
security definer
set search_path = public
as $$
declare
  v_request_role text := coalesce(
    nullif(auth.role(), ''),
    current_setting('request.jwt.claim.role', true)
  );
  v_has_updated_at boolean;
begin
  if target_user_id is null then
    raise exception 'target_user_id is required.';
  end if;

  if v_request_role in ('anon', 'authenticated') then
    raise exception 'promote_user_to_admin() is restricted to trusted database contexts.';
  end if;

  -- The public.users update guard explicitly allows service_role updates.
  -- SQL Editor sessions do not normally carry that JWT claim, so we set it
  -- locally inside this SECURITY DEFINER function before running the update.
  perform set_config('request.jwt.claim.role', 'service_role', true);

  select exists (
    select 1
    from pg_catalog.pg_attribute attribute
    join pg_catalog.pg_class class_relation
      on class_relation.oid = attribute.attrelid
    join pg_catalog.pg_namespace namespace_relation
      on namespace_relation.oid = class_relation.relnamespace
    where namespace_relation.nspname = 'public'
      and class_relation.relname = 'users'
      and attribute.attname = 'updated_at'
      and attribute.attnum > 0
      and not attribute.attisdropped
  )
  into v_has_updated_at;

  if v_has_updated_at then
    return query
    execute $sql$
      update public.users
      set
        role = 'admin',
        updated_at = now()
      where public.users.id = $1
      returning public.users.id, public.users.email, public.users.role
    $sql$
    using target_user_id;
  else
    return query
    update public.users
    set role = 'admin'
    where public.users.id = target_user_id
    returning public.users.id, public.users.email, public.users.role;
  end if;

  if not found then
    raise exception 'User % was not found in public.users.', target_user_id;
  end if;
end;
$$;

comment on function public.promote_user_to_admin(uuid) is
'Trusted SQL-only bootstrap helper for promoting a public.users record to admin without exposing role changes to normal client/API callers.';

revoke all on function public.promote_user_to_admin(uuid) from public;
revoke all on function public.promote_user_to_admin(uuid) from anon;
revoke all on function public.promote_user_to_admin(uuid) from authenticated;
revoke all on function public.promote_user_to_admin(uuid) from service_role;
