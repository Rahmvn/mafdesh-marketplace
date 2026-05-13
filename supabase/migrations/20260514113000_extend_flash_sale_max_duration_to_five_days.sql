create or replace function public.validate_flash_sale()
returns trigger
language plpgsql
as $$
declare
  request_role text := coalesce(
    nullif(auth.role(), ''),
    current_setting('request.jwt.claim.role', true)
  );
  seller_record public.users%rowtype;
  has_flash_sale_configuration boolean;
  discount_percent numeric;
  sale_duration interval;
  flash_sale_definition_changed boolean;
  reapproval_field text;
  expected_reapproval_reason text;
  allowed_reapproval_transition boolean := false;
begin
  if tg_op = 'UPDATE' then
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
  end if;

  if tg_op = 'UPDATE'
    and public.is_product_flash_sale_active(old)
    and new.price is distinct from old.price
    and not allowed_reapproval_transition then
    raise exception 'Original price cannot be changed while a flash sale is active.';
  end if;

  if tg_op = 'UPDATE'
    and old.deleted_at is null
    and new.deleted_at is not null
    and public.is_product_flash_sale_active(old) then
    raise exception 'Products with an active flash sale cannot be deleted.';
  end if;

  if request_role <> 'service_role' then
    if tg_op = 'INSERT' and coalesce(new.sale_quantity_sold, 0) <> 0 then
      raise exception 'sale_quantity_sold can only be changed by the database.';
    end if;

    if tg_op = 'UPDATE' and new.sale_quantity_sold is distinct from old.sale_quantity_sold then
      raise exception 'sale_quantity_sold can only be changed by the database.';
    end if;

    if tg_op = 'INSERT' and coalesce(new.admin_approved_discount, false) then
      raise exception 'admin_approved_discount can only be changed through admin moderation.';
    end if;

    if tg_op = 'UPDATE' and new.admin_approved_discount is distinct from old.admin_approved_discount then
      raise exception 'admin_approved_discount can only be changed through admin moderation.';
    end if;
  end if;

  new.sale_quantity_sold := coalesce(new.sale_quantity_sold, 0);
  new.admin_approved_discount := coalesce(new.admin_approved_discount, false);

  has_flash_sale_configuration :=
    coalesce(new.is_flash_sale, false)
    or new.sale_price is not null
    or new.sale_start is not null
    or new.sale_end is not null
    or new.sale_quantity_limit is not null;

  if not has_flash_sale_configuration then
    new.is_flash_sale := false;
    new.sale_price := null;
    new.sale_start := null;
    new.sale_end := null;
    new.sale_quantity_limit := null;
    new.sale_quantity_sold := 0;
    new.original_price_locked := false;
    return new;
  end if;

  if not coalesce(new.is_flash_sale, false) then
    raise exception 'Set is_flash_sale to true or clear all flash sale fields.';
  end if;

  select *
  into seller_record
  from public.users
  where id = new.seller_id;

  if not found then
    raise exception 'Seller account not found for this product.';
  end if;

  if coalesce(seller_record.is_trusted_seller, false) = false then
    raise exception 'Only trusted sellers can create flash sales.';
  end if;

  if coalesce(nullif(seller_record.account_status, ''), 'active') <> 'active' then
    raise exception 'Only active seller accounts can create flash sales.';
  end if;

  if coalesce(new.is_approved, false) = false then
    raise exception 'Only approved products can be placed in a flash sale.';
  end if;

  if coalesce(new.stock_quantity, 0) <= 0 then
    raise exception 'Only in-stock products can be placed in a flash sale.';
  end if;

  if new.deleted_at is not null then
    raise exception 'Deleted products cannot be placed in a flash sale.';
  end if;

  if new.sale_price is null then
    raise exception 'sale_price must be set for a flash sale.';
  end if;

  if new.sale_price >= new.price then
    raise exception 'sale_price must be lower than price.';
  end if;

  discount_percent := ((new.price - new.sale_price) / nullif(new.price, 0)) * 100;
  if not coalesce(new.admin_approved_discount, false) and discount_percent > 50 then
    raise exception 'Discounts above 50%% require admin approval.';
  end if;

  if new.sale_start is null or new.sale_end is null then
    raise exception 'sale_start and sale_end must both be set.';
  end if;

  if new.sale_end <= new.sale_start then
    raise exception 'sale_end must be after sale_start.';
  end if;

  sale_duration := new.sale_end - new.sale_start;
  if sale_duration > interval '5 days' then
    raise exception 'Flash sale duration cannot exceed 5 days.';
  end if;

  if new.sale_quantity_limit is not null and new.sale_quantity_limit <= 0 then
    raise exception 'sale_quantity_limit must be greater than 0 when provided.';
  end if;

  if new.sale_quantity_limit is not null and new.sale_quantity_sold > new.sale_quantity_limit then
    raise exception 'sale_quantity_sold cannot exceed sale_quantity_limit.';
  end if;

  flash_sale_definition_changed :=
    tg_op = 'INSERT'
    or new.is_flash_sale is distinct from old.is_flash_sale
    or new.sale_price is distinct from old.sale_price
    or new.sale_start is distinct from old.sale_start
    or new.sale_end is distinct from old.sale_end
    or new.sale_quantity_limit is distinct from old.sale_quantity_limit;

  if request_role <> 'service_role' and flash_sale_definition_changed then
    new.sale_quantity_sold := 0;
  end if;

  new.original_price_locked := public.is_product_flash_sale_active(new);

  return new;
end;
$$;
