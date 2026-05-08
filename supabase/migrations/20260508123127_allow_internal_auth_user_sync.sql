create or replace function public.guard_user_client_mutation()
returns trigger
language plpgsql
as $$
declare
  request_role text := coalesce(
    nullif(auth.role(), ''),
    current_setting('request.jwt.claim.role', true)
  );
  current_db_role text := current_user;
  old_verification_status text := coalesce(nullif(btrim(old.verification_status), ''), 'not_submitted');
  new_verification_status text := coalesce(nullif(btrim(new.verification_status), ''), 'not_submitted');
begin
  if request_role = 'service_role' or current_db_role in ('postgres', 'supabase_auth_admin', 'supabase_admin') then
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

  if new.bank_details_approved is distinct from old.bank_details_approved then
    raise exception 'Bank approval status can only be changed through the guarded admin flow.';
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

  if new.is_verified_seller is distinct from old.is_verified_seller then
    raise exception 'Verified seller approval can only be changed through the verification review flow.';
  end if;

  if new.verification_approved_at is distinct from old.verification_approved_at then
    raise exception 'verification_approved_at is controlled by the verification review flow.';
  end if;

  if new_verification_status is distinct from old_verification_status then
    if not (
      new_verification_status = 'pending'
      and old_verification_status in ('not_submitted', 'rejected')
    ) then
      raise exception 'verification_status can only move to pending from the client.';
    end if;
  end if;

  if new.verification_submitted_at is distinct from old.verification_submitted_at then
    if not (
      new_verification_status = 'pending'
      and old_verification_status in ('not_submitted', 'rejected')
      and new.verification_submitted_at is not null
    ) then
      raise exception 'verification_submitted_at is controlled by the verification submission flow.';
    end if;
  end if;

  return new;
end;
$$;
