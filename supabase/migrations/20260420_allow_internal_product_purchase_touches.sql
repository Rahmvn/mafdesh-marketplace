create or replace function public.touch_product_last_purchased_at(product_uuid uuid, purchased_at timestamptz)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  if product_uuid is null then
    return;
  end if;

  perform set_config('app.product_control_action', 'touch_last_purchased_at', true);

  update public.products
  set last_purchased_at = greatest(
    coalesce(last_purchased_at, purchased_at),
    purchased_at
  )
  where id = product_uuid;
end;
$$;

create or replace function public.guard_product_client_mutation()
returns trigger
language plpgsql
as $$
declare
  request_role text := coalesce(
    nullif(auth.role(), ''),
    current_setting('request.jwt.claim.role', true)
  );
  actor_role text;
  control_action text := coalesce(current_setting('app.product_control_action', true), '');
begin
  if request_role = 'service_role' then
    if tg_op = 'DELETE' then
      return old;
    end if;

    return new;
  end if;

  if control_action = 'touch_last_purchased_at' then
    if tg_op = 'UPDATE'
      and (to_jsonb(new) - 'last_purchased_at') is not distinct from (to_jsonb(old) - 'last_purchased_at')
      and new.last_purchased_at is distinct from old.last_purchased_at then
      return new;
    end if;

    raise exception 'touch_last_purchased_at can only update last_purchased_at.';
  end if;

  if tg_op = 'DELETE' then
    raise exception 'Hard deleting products from the client is not allowed.';
  end if;

  if auth.uid() is null then
    raise exception 'Authenticated session required.';
  end if;

  select u.role
  into actor_role
  from public.users u
  where u.id = auth.uid();

  if actor_role = 'admin' then
    raise exception 'Admin client writes are disabled. Use the guarded admin moderation flow.';
  end if;

  if actor_role is distinct from 'seller' then
    raise exception 'Only sellers can change products directly.';
  end if;

  if tg_op = 'INSERT' then
    if new.seller_id is distinct from auth.uid() then
      raise exception 'You can only create products for your own seller account.';
    end if;

    if coalesce(new.is_approved, false) then
      raise exception 'New products cannot be self-approved.';
    end if;

    if coalesce(btrim(new.reapproval_reason), '') <> '' then
      raise exception 'reapproval_reason can only be changed by the database.';
    end if;

    if new.deleted_by_admin_id is not null then
      raise exception 'Only the guarded admin flow can set deletion ownership.';
    end if;

    if coalesce(btrim(new.deletion_reason), '') <> '' then
      raise exception 'Only the guarded admin flow can set deletion reasons.';
    end if;

    if coalesce(new.admin_approved_discount, false) then
      raise exception 'admin_approved_discount can only be changed through admin moderation.';
    end if;

    if coalesce(new.sale_quantity_sold, 0) <> 0 then
      raise exception 'sale_quantity_sold can only be changed by the database.';
    end if;

    return new;
  end if;

  if old.seller_id is distinct from auth.uid() then
    raise exception 'You can only update your own products.';
  end if;

  if new.seller_id is distinct from old.seller_id then
    raise exception 'Changing product ownership is not allowed.';
  end if;

  if coalesce(new.is_approved, false) and not coalesce(old.is_approved, false) then
    raise exception 'Sellers cannot self-approve products.';
  end if;

  if new.reapproval_reason is distinct from old.reapproval_reason then
    raise exception 'reapproval_reason can only be changed by the database.';
  end if;

  if new.deleted_by_admin_id is not null then
    raise exception 'Only the guarded admin flow can set deletion ownership.';
  end if;

  if coalesce(btrim(new.deletion_reason), '') <> '' then
    raise exception 'Only the guarded admin flow can set deletion reasons.';
  end if;

  if new.admin_approved_discount is distinct from old.admin_approved_discount then
    raise exception 'admin_approved_discount can only be changed through admin moderation.';
  end if;

  if new.sale_quantity_sold is distinct from old.sale_quantity_sold then
    raise exception 'sale_quantity_sold can only be changed by the database.';
  end if;

  return new;
end;
$$;
