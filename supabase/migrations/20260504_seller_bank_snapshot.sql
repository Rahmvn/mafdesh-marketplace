alter table if exists public.users
  add column if not exists bank_name text,
  add column if not exists account_number text,
  add column if not exists account_name text,
  add column if not exists bank_details_approved boolean not null default false,
  add column if not exists bank_details_pending jsonb default null;

alter table if exists public.orders
  add column if not exists payout_account_snapshot jsonb;

comment on column public.orders.payout_account_snapshot is
  'Approved seller bank details captured when an order first becomes COMPLETED.';

create or replace function public.capture_payout_snapshot()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_bank_name text := '';
  v_account_number text := '';
  v_account_name text := '';
begin
  if tg_op <> 'UPDATE' then
    return new;
  end if;

  if coalesce(old.status, '') = 'COMPLETED' or coalesce(new.status, '') <> 'COMPLETED' then
    return new;
  end if;

  select
    coalesce(bank_name, ''),
    coalesce(account_number, ''),
    coalesce(account_name, '')
  into
    v_bank_name,
    v_account_number,
    v_account_name
  from public.users
  where id = new.seller_id;

  new.payout_account_snapshot := jsonb_build_object(
    'bank_name', coalesce(v_bank_name, ''),
    'account_number', coalesce(v_account_number, ''),
    'account_name', coalesce(v_account_name, '')
  );

  return new;
end;
$$;

drop trigger if exists orders_capture_payout_snapshot on public.orders;
create trigger orders_capture_payout_snapshot
before update on public.orders
for each row
execute function public.capture_payout_snapshot();

create or replace function public.guard_user_client_mutation()
returns trigger
language plpgsql
as $$
declare
  request_role text := coalesce(
    nullif(auth.role(), ''),
    current_setting('request.jwt.claim.role', true)
  );
  bank_fields_changed boolean := (
    new.bank_name is distinct from old.bank_name
    or new.account_number is distinct from old.account_number
    or new.account_name is distinct from old.account_name
    or new.business_address is distinct from old.business_address
    or new.bvn is distinct from old.bvn
    or new.tax_id is distinct from old.tax_id
  );
  first_time_bank_setup boolean := (
    coalesce(old.bank_details_approved, false) = false
    and old.bank_details_pending is null
    and nullif(btrim(coalesce(old.bank_name, '')), '') is null
    and nullif(btrim(coalesce(old.account_number, '')), '') is null
    and nullif(btrim(coalesce(old.account_name, '')), '') is null
    and coalesce(new.bank_details_approved, false) = true
    and new.bank_details_pending is null
    and nullif(btrim(coalesce(new.bank_name, '')), '') is not null
    and nullif(btrim(coalesce(new.account_number, '')), '') is not null
    and nullif(btrim(coalesce(new.account_name, '')), '') is not null
  );
  pending_bank_request_submission boolean := (
    old.bank_details_pending is null
    and new.bank_details_pending is not null
    and coalesce(new.bank_details_approved, false) = coalesce(old.bank_details_approved, false)
    and bank_fields_changed = false
  );
begin
  if request_role = 'service_role' then
    if tg_op = 'DELETE' then
      return old;
    end if;

    return new;
  end if;

  if tg_op = 'DELETE' then
    raise exception 'Deleting user records from the client is not allowed.';
  end if;

  if auth.uid() is null then
    raise exception 'Authenticated session required.';
  end if;

  if old.id is distinct from auth.uid() then
    raise exception 'You can only update your own user record from the client.';
  end if;

  if new.id is distinct from old.id then
    raise exception 'Changing the user id is not allowed.';
  end if;

  if new.role is distinct from old.role then
    raise exception 'Changing account roles directly is not allowed.';
  end if;

  if new.status is distinct from old.status then
    raise exception 'Changing account status directly is not allowed.';
  end if;

  if new.account_status is distinct from old.account_status then
    raise exception 'Changing account status directly is not allowed.';
  end if;

  if first_time_bank_setup then
    return new;
  end if;

  if pending_bank_request_submission then
    return new;
  end if;

  if new.bank_details_approved is distinct from old.bank_details_approved then
    raise exception 'Bank approval status can only be changed through the first-time setup flow or the guarded admin flow.';
  end if;

  if bank_fields_changed then
    raise exception 'Active bank details can only be changed through the approved bank-change flow.';
  end if;

  if new.bank_details_pending is distinct from old.bank_details_pending then
    raise exception 'Bank detail change requests must be submitted through the pending approval flow.';
  end if;

  if new.is_trusted_seller is distinct from old.is_trusted_seller then
    raise exception 'Trusted seller status is managed automatically by the database.';
  end if;

  if new.completed_orders is distinct from old.completed_orders
    or new.average_rating is distinct from old.average_rating
    or new.dispute_rate is distinct from old.dispute_rate
    or new.no_fraud_flags is distinct from old.no_fraud_flags then
    raise exception 'Trusted seller metrics cannot be changed directly from the client.';
  end if;

  return new;
end;
$$;

create or replace function public.create_bank_review_notifications()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if coalesce(new.role, '') <> 'seller' then
    return new;
  end if;

  if coalesce(old.bank_details_approved, false) = false
     and coalesce(new.bank_details_approved, false) = true
     and old.bank_details_pending is null
     and new.bank_details_pending is null then
    perform public.create_notification(
      new.id,
      'bank_approved',
      'Bank details approved',
      'Your bank details are now active for payouts.',
      '/profile',
      jsonb_build_object('seller_id', new.id)
    );
  end if;

  return new;
end;
$$;

-- Sample payout query using the snapshot contract:
-- select
--   o.id,
--   o.order_number,
--   o.seller_id,
--   coalesce(o.payout_account_snapshot->>'bank_name', u.bank_name, '') as payout_bank_name,
--   coalesce(o.payout_account_snapshot->>'account_number', u.account_number, '') as payout_account_number,
--   coalesce(o.payout_account_snapshot->>'account_name', u.account_name, '') as payout_account_name
-- from public.orders o
-- join public.users u on u.id = o.seller_id
-- where o.status = 'COMPLETED';
