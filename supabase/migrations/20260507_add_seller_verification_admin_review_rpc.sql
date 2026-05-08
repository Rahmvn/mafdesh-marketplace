create or replace function public.review_seller_verification(
  p_verification_id uuid,
  p_decision text,
  p_admin_notes text default null
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_actor_id uuid := auth.uid();
  v_now timestamptz := now();
  v_decision text := lower(btrim(coalesce(p_decision, '')));
  v_admin_notes text := nullif(btrim(coalesce(p_admin_notes, '')), '');
  v_verification public.seller_verifications%rowtype;
  v_seller public.users%rowtype;
begin
  if not public.is_admin_user(v_actor_id) then
    raise exception 'Only admins can review seller verification requests.';
  end if;

  if p_verification_id is null then
    raise exception 'A verification request id is required.';
  end if;

  if v_decision not in ('approve', 'reject') then
    raise exception 'Decision must be approve or reject.';
  end if;

  select *
  into v_verification
  from public.seller_verifications
  where id = p_verification_id
  for update;

  if not found then
    raise exception 'Verification request not found.';
  end if;

  if coalesce(v_verification.verification_status, 'pending') <> 'pending' then
    raise exception 'Only pending verification requests can be reviewed.';
  end if;

  select *
  into v_seller
  from public.users
  where id = v_verification.seller_id
  for update;

  if not found then
    raise exception 'Seller account not found for this verification request.';
  end if;

  if v_seller.role is distinct from 'seller' then
    raise exception 'Only seller accounts can be reviewed through this flow.';
  end if;

  if v_decision = 'reject' and v_admin_notes is null then
    raise exception 'Admin notes are required when rejecting a verification request.';
  end if;

  if v_decision = 'approve' then
    update public.seller_verifications
    set
      verification_status = 'approved',
      admin_notes = v_admin_notes,
      reviewed_by = v_actor_id,
      reviewed_at = v_now
    where id = v_verification.id;

    update public.users
    set
      is_verified_seller = true,
      verification_status = 'approved',
      verification_approved_at = v_now
    where id = v_seller.id;
  else
    update public.seller_verifications
    set
      verification_status = 'rejected',
      admin_notes = v_admin_notes,
      reviewed_by = v_actor_id,
      reviewed_at = v_now
    where id = v_verification.id;

    update public.users
    set
      is_verified_seller = false,
      verification_status = 'rejected',
      verification_approved_at = null
    where id = v_seller.id;
  end if;

  return jsonb_build_object(
    'verification_id', v_verification.id,
    'seller_id', v_seller.id,
    'decision', v_decision,
    'reviewed_by', v_actor_id,
    'reviewed_at', v_now,
    'admin_notes', v_admin_notes,
    'user_verification_status', case
      when v_decision = 'approve' then 'approved'
      else 'rejected'
    end
  );
end;
$$;

revoke all on function public.review_seller_verification(uuid, text, text) from public;
grant execute on function public.review_seller_verification(uuid, text, text) to authenticated;
