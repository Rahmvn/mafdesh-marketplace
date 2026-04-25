alter table public.users
  add column if not exists seller_agreement_accepted boolean not null default false,
  add column if not exists seller_agreement_accepted_at timestamptz,
  add column if not exists seller_agreement_version text;

create or replace function public.handle_seller_agreement_guard()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_request_role text := coalesce(
    nullif(auth.role(), ''),
    current_setting('request.jwt.claim.role', true)
  );
  v_effective_role text := coalesce(new.role, old.role);
begin
  if tg_op <> 'UPDATE' then
    return new;
  end if;

  if v_request_role = 'service_role' then
    return new;
  end if;

  if v_effective_role = 'seller'
     and old.seller_agreement_accepted = true
     and new.seller_agreement_accepted = false
  then
    raise exception 'Seller agreement acceptance cannot be revoked.';
  end if;

  if v_effective_role = 'seller'
     and coalesce(old.seller_agreement_accepted, false) = false
     and new.seller_agreement_accepted = true
  then
    new.seller_agreement_accepted_at := now();
    new.seller_agreement_version := '1.0-2026';
  end if;

  return new;
end;
$$;

drop trigger if exists guard_seller_agreement on public.users;

create trigger guard_seller_agreement
before update on public.users
for each row
execute function public.handle_seller_agreement_guard();
