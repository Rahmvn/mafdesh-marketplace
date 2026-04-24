create or replace function public.validate_product_edit()
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
  has_active_orders boolean;
  original_price_changed boolean := false;
  flash_sale_changed boolean := false;
  reapproval_field text;
  expected_reapproval_reason text;
  allowed_reapproval_transition boolean := false;
  discount_percent numeric;
begin
  if tg_op <> 'UPDATE' or request_role = 'service_role' then
    return new;
  end if;

  if auth.uid() is not null then
    select role
    into actor_role
    from public.users
    where id = auth.uid();
  end if;

  if actor_role is distinct from 'seller' then
    return new;
  end if;

  if (to_jsonb(new) ? 'original_price') and coalesce(new.original_price, 0) = 0 then
    new.original_price := null;
  end if;

  if new.original_price is not null then
    if new.original_price <= new.price then
      raise exception 'original_price must be greater than price.';
    end if;

    discount_percent := (1 - (new.price / nullif(new.original_price, 0))) * 100;
    if discount_percent > 70 then
      raise exception 'Maximum discount is 70%.';
    end if;
  end if;

  reapproval_field := public.get_product_reapproval_field(old, new);
  expected_reapproval_reason :=
    case
      when reapproval_field is not null then format('Field changed: %s', reapproval_field)
      else null
    end;
  allowed_reapproval_transition :=
    expected_reapproval_reason is not null
    and coalesce(old.is_approved, false) = true
    and coalesce(new.is_approved, false) = false
    and coalesce(new.reapproval_reason, '') = expected_reapproval_reason;

  if new.seller_id is distinct from old.seller_id then
    raise exception 'seller_id cannot be changed.';
  end if;

  if new.reapproval_reason is distinct from old.reapproval_reason and not allowed_reapproval_transition then
    raise exception 'reapproval_reason is controlled by the system.';
  end if;

  if new.is_approved is distinct from old.is_approved then
    if coalesce(new.is_approved, false) then
      raise exception 'is_approved can only be changed by an admin.';
    end if;

    if not allowed_reapproval_transition then
      raise exception 'is_approved can only be changed by an admin.';
    end if;
  end if;

  if new.deleted_at is distinct from old.deleted_at and control_action not in ('archive', 'unarchive') then
    raise exception 'Product archiving must go through the archive action.';
  end if;

  if new.archived_reason is distinct from old.archived_reason and control_action <> 'archive' then
    raise exception 'Archived reason can only be changed through the archive action.';
  end if;

  flash_sale_changed :=
    new.is_flash_sale is distinct from old.is_flash_sale
    or new.sale_price is distinct from old.sale_price
    or new.sale_start is distinct from old.sale_start
    or new.sale_end is distinct from old.sale_end
    or new.sale_quantity_limit is distinct from old.sale_quantity_limit;

  if flash_sale_changed and control_action <> 'flash_sale' and not allowed_reapproval_transition then
    raise exception 'Flash sale settings must be changed through the flash sale system.';
  end if;

  original_price_changed :=
    (to_jsonb(new) -> 'original_price') is distinct from (to_jsonb(old) -> 'original_price');

  if new.category is distinct from old.category
    or new.price is distinct from old.price
    or original_price_changed then
    has_active_orders := public.product_has_active_orders(new.id);

    if has_active_orders then
      if new.category is distinct from old.category then
        raise exception 'Category cannot be changed while this product has active orders.';
      end if;

      if new.price is distinct from old.price or original_price_changed then
        raise exception 'Price cannot be changed while this product has active or pending orders.';
      end if;
    end if;
  end if;

  return new;
end;
$$;
