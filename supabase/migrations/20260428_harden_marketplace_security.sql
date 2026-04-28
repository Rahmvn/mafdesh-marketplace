create or replace function public.current_seller_agreement_version()
returns text
language sql
stable
as $$
  select '1.0-2026'::text;
$$;

create or replace function public.has_accepted_seller_agreement(
  p_user_id uuid default auth.uid()
)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1
    from public.users
    where id = p_user_id
      and role = 'seller'
      and coalesce(seller_agreement_accepted, false) = true
      and seller_agreement_accepted_at is not null
      and nullif(btrim(coalesce(seller_agreement_version, '')), '') is not null
  );
$$;

create or replace function public.order_actor_role(
  p_order_id uuid,
  p_user_id uuid default auth.uid()
)
returns text
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  v_order public.orders%rowtype;
begin
  if p_user_id is null then
    return null;
  end if;

  if public.is_admin_user(p_user_id) then
    return 'admin';
  end if;

  select *
  into v_order
  from public.orders
  where id = p_order_id;

  if not found then
    return null;
  end if;

  if v_order.buyer_id = p_user_id then
    return 'buyer';
  end if;

  if v_order.seller_id = p_user_id then
    return 'seller';
  end if;

  return null;
end;
$$;

create or replace function public.can_access_order(
  p_order_id uuid,
  p_user_id uuid default auth.uid()
)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select public.order_actor_role(p_order_id, p_user_id) is not null;
$$;

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

  if v_effective_role <> 'seller' then
    if new.seller_agreement_accepted is distinct from old.seller_agreement_accepted
      or new.seller_agreement_accepted_at is distinct from old.seller_agreement_accepted_at
      or new.seller_agreement_version is distinct from old.seller_agreement_version
    then
      raise exception 'Seller agreement fields are only valid for seller accounts.';
    end if;

    return new;
  end if;

  if old.seller_agreement_accepted = true
     and new.seller_agreement_accepted = false
  then
    raise exception 'Seller agreement acceptance cannot be revoked.';
  end if;

  if new.seller_agreement_accepted_at is distinct from old.seller_agreement_accepted_at
     and not (
       coalesce(old.seller_agreement_accepted, false) = false
       and new.seller_agreement_accepted = true
     )
  then
    raise exception 'seller_agreement_accepted_at is controlled by the database.';
  end if;

  if new.seller_agreement_version is distinct from old.seller_agreement_version
     and not (
       coalesce(old.seller_agreement_accepted, false) = false
       and new.seller_agreement_accepted = true
     )
  then
    raise exception 'seller_agreement_version is controlled by the database.';
  end if;

  if coalesce(old.seller_agreement_accepted, false) = false
     and new.seller_agreement_accepted = true
  then
    new.seller_agreement_accepted_at := now();
    new.seller_agreement_version := public.current_seller_agreement_version();
  elsif new.seller_agreement_accepted = true then
    new.seller_agreement_accepted_at := old.seller_agreement_accepted_at;
    new.seller_agreement_version := old.seller_agreement_version;
  else
    new.seller_agreement_accepted_at := null;
    new.seller_agreement_version := null;
  end if;

  return new;
end;
$$;

create or replace function public.enforce_seller_agreement_on_product_write()
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
  v_actor_id uuid := auth.uid();
  v_actor_role text;
begin
  if v_request_role = 'service_role' then
    if tg_op = 'DELETE' then
      return old;
    end if;

    return new;
  end if;

  if v_actor_id is null then
    if tg_op = 'DELETE' then
      return old;
    end if;

    return new;
  end if;

  select role
  into v_actor_role
  from public.users
  where id = v_actor_id;

  if v_actor_role is distinct from 'seller' then
    if tg_op = 'DELETE' then
      return old;
    end if;

    return new;
  end if;

  if not public.has_accepted_seller_agreement(v_actor_id) then
    raise exception 'Accept the seller agreement before creating or editing products.';
  end if;

  if tg_op = 'DELETE' then
    return old;
  end if;

  return new;
end;
$$;

drop trigger if exists products_require_seller_agreement on public.products;
create trigger products_require_seller_agreement
before insert or update or delete on public.products
for each row
execute function public.enforce_seller_agreement_on_product_write();

create or replace function public.guard_order_client_write()
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
  v_actor_id uuid := auth.uid();
  v_actor_role text;
  v_transition_actor text := coalesce(current_setting('app.order_transition_actor', true), '');
  v_seller_transition_actor text := coalesce(current_setting('app.seller_order_transition', true), '');
  v_refund_actor text := coalesce(current_setting('app.refund_system_actor', true), '');
  v_hold_resolution_actor text := coalesce(current_setting('app.order_admin_hold_resolution', true), '');
  v_dispute_resolution_actor text := coalesce(current_setting('app.order_dispute_resolution', true), '');
  v_product public.products%rowtype;
  v_expected_product_price numeric;
  v_new_order jsonb;
begin
  if v_request_role = 'service_role' then
    if tg_op = 'DELETE' then
      return old;
    end if;

    return new;
  end if;

  if v_actor_id is not null then
    select role
    into v_actor_role
    from public.users
    where id = v_actor_id;
  end if;

  if tg_op = 'DELETE' then
    if v_actor_id is null
       or v_actor_role is distinct from 'buyer'
       or old.buyer_id is distinct from v_actor_id
       or old.status is distinct from 'PENDING'
    then
      raise exception 'Only the buyer can delete their own pending orders.';
    end if;

    return old;
  end if;

  v_new_order := to_jsonb(new);

  if tg_op = 'INSERT' then
    if v_actor_id is null or v_actor_role is distinct from 'buyer' then
      raise exception 'Only authenticated buyers can create orders from the client.';
    end if;

    if new.buyer_id is distinct from v_actor_id then
      raise exception 'You can only create orders for your own buyer account.';
    end if;

    if new.status is distinct from 'PENDING' then
      raise exception 'New client-created orders must start in PENDING status.';
    end if;

    if new.product_id is null then
      raise exception 'Client-created orders must reference a product.';
    end if;

    select *
    into v_product
    from public.products
    where id = new.product_id;

    if not found then
      raise exception 'Product not found for this order.';
    end if;

    if v_product.seller_id is distinct from new.seller_id then
      raise exception 'seller_id must match the product seller.';
    end if;

    if coalesce(v_product.is_approved, false) = false or v_product.deleted_at is not null then
      raise exception 'Only approved live products can be ordered.';
    end if;

    if coalesce(v_product.stock_quantity, 0) <= 0 then
      raise exception 'This product is out of stock.';
    end if;

    perform public.assert_seller_marketplace_active(v_product.seller_id);

    v_expected_product_price := case
      when public.is_product_flash_sale_active(v_product) then v_product.sale_price
      else v_product.price
    end;

    if coalesce(new.product_price, 0) <> coalesce(v_expected_product_price, 0) then
      raise exception 'product_price does not match the current product price.';
    end if;

    if coalesce(new.quantity, 0) < 1 then
      raise exception 'Order quantity must be at least 1.';
    end if;

    if coalesce(new.delivery_fee, 0) < 0
       or coalesce(new.platform_fee, 0) < 0
       or coalesce(new.total_amount, 0) <= 0
    then
      raise exception 'Order monetary fields must be valid non-negative amounts.';
    end if;

    if coalesce(new.total_amount, 0)
       <> (coalesce(new.product_price, 0) * coalesce(new.quantity, 0)) + coalesce(new.delivery_fee, 0)
    then
      raise exception 'total_amount must equal product total plus delivery fee.';
    end if;

    if coalesce(new.platform_fee, 0)
       <> round((coalesce(new.product_price, 0) * coalesce(new.quantity, 0)) * 0.05)
    then
      raise exception 'platform_fee does not match the current marketplace fee.';
    end if;

    if coalesce(v_new_order->>'payment_reference', '') <> ''
       or coalesce(v_new_order->>'paid_at', '') <> ''
       or coalesce(v_new_order->>'shipped_at', '') <> ''
       or coalesce(v_new_order->>'delivered_at', '') <> ''
       or coalesce(v_new_order->>'ready_for_pickup_at', '') <> ''
       or coalesce(v_new_order->>'picked_up_at', '') <> ''
       or coalesce(v_new_order->>'completed_at', '') <> ''
       or coalesce(v_new_order->>'cancelled_at', '') <> ''
       or coalesce(v_new_order->>'disputed_at', '') <> ''
       or coalesce(v_new_order->>'resolved_at', '') <> ''
       or coalesce(v_new_order->>'resolution_type', '') <> ''
       or coalesce(v_new_order->>'resolution_amount', '') <> ''
       or coalesce(v_new_order->>'resolution_notes', '') <> ''
       or coalesce(v_new_order->>'constitution_section', '') <> ''
       or coalesce(v_new_order->>'dispute_reason', '') <> ''
       or coalesce(v_new_order->>'dispute_status', '') <> ''
       or coalesce(v_new_order->>'resolved_by', '') <> ''
       or coalesce(v_new_order->>'ship_deadline', '') <> ''
       or coalesce(v_new_order->>'delivery_deadline', '') <> ''
       or coalesce(v_new_order->>'auto_cancel_at', '') <> ''
       or coalesce(v_new_order->>'auto_complete_at', '') <> ''
       or coalesce(v_new_order->>'dispute_deadline', '') <> ''
    then
      raise exception 'Protected order lifecycle fields can only be set by backend logic.';
    end if;

    return new;
  end if;

  if v_transition_actor <> ''
     or v_seller_transition_actor <> ''
     or v_refund_actor <> ''
     or v_hold_resolution_actor = 'enabled'
     or v_dispute_resolution_actor = 'enabled'
  then
    return new;
  end if;

  if v_actor_role = 'admin' then
    raise exception 'Admin direct order updates are disabled. Use the protected admin workflow.';
  end if;

  if v_actor_role = 'seller' then
    raise exception 'Use the protected seller order RPCs to update fulfillment.';
  end if;

  if v_actor_role = 'buyer' then
    raise exception 'Use the protected buyer order RPCs to confirm delivery, confirm pickup, or open disputes.';
  end if;

  raise exception 'You are not allowed to update orders.';
end;
$$;

drop trigger if exists orders_guard_client_write on public.orders;
create trigger orders_guard_client_write
before insert or update or delete on public.orders
for each row
execute function public.guard_order_client_write();

create or replace function public.buyer_confirm_order_delivery(
  p_order_id uuid
)
returns public.orders
language plpgsql
security definer
set search_path = public
as $$
declare
  v_actor_id uuid := auth.uid();
  v_order public.orders%rowtype;
begin
  if v_actor_id is null then
    raise exception 'Authenticated session required.';
  end if;

  select *
  into v_order
  from public.orders
  where id = p_order_id
  for update;

  if not found then
    raise exception 'Order not found.';
  end if;

  if v_order.buyer_id is distinct from v_actor_id then
    raise exception 'You can only confirm your own orders.';
  end if;

  if v_order.status is distinct from 'DELIVERED' then
    raise exception 'You can only confirm delivery after the order is DELIVERED.';
  end if;

  perform set_config('app.order_transition_actor', 'buyer_confirm_delivery', true);

  update public.orders
  set
    status = 'COMPLETED',
    completed_at = now()
  where id = p_order_id
  returning * into v_order;

  perform set_config('app.order_transition_actor', '', true);
  return v_order;
exception
  when others then
    perform set_config('app.order_transition_actor', '', true);
    raise;
end;
$$;

create or replace function public.buyer_confirm_order_pickup(
  p_order_id uuid
)
returns public.orders
language plpgsql
security definer
set search_path = public
as $$
declare
  v_actor_id uuid := auth.uid();
  v_now timestamptz := now();
  v_order public.orders%rowtype;
begin
  if v_actor_id is null then
    raise exception 'Authenticated session required.';
  end if;

  select *
  into v_order
  from public.orders
  where id = p_order_id
  for update;

  if not found then
    raise exception 'Order not found.';
  end if;

  if v_order.buyer_id is distinct from v_actor_id then
    raise exception 'You can only confirm your own orders.';
  end if;

  if v_order.status is distinct from 'READY_FOR_PICKUP' then
    raise exception 'You can only confirm pickup after the order is READY_FOR_PICKUP.';
  end if;

  if v_order.auto_cancel_at is not null and v_order.auto_cancel_at <= v_now then
    raise exception 'Pickup deadline has already passed.';
  end if;

  perform set_config('app.order_transition_actor', 'buyer_confirm_pickup', true);

  update public.orders
  set
    status = 'COMPLETED',
    picked_up_at = v_now,
    completed_at = v_now
  where id = p_order_id
  returning * into v_order;

  perform set_config('app.order_transition_actor', '', true);
  return v_order;
exception
  when others then
    perform set_config('app.order_transition_actor', '', true);
    raise;
end;
$$;

create or replace function public.prepare_dispute_message_write()
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
  v_actor_id uuid := auth.uid();
  v_actor_role text;
  v_order_status text;
  v_message_text text := nullif(btrim(coalesce(new.message, '')), '');
  v_image_count integer;
begin
  if tg_op = 'DELETE' then
    raise exception 'Dispute messages cannot be deleted.';
  end if;

  if tg_op = 'UPDATE' then
    raise exception 'Dispute messages are immutable once created.';
  end if;

  if v_request_role = 'service_role' then
    return new;
  end if;

  if v_actor_id is null then
    raise exception 'Authenticated session required.';
  end if;

  v_actor_role := public.order_actor_role(new.order_id, v_actor_id);
  if v_actor_role is null then
    raise exception 'You are not allowed to post in this dispute.';
  end if;

  select status
  into v_order_status
  from public.orders
  where id = new.order_id;

  if v_order_status is distinct from 'DISPUTED' then
    raise exception 'Dispute messages are only available after the order is disputed.';
  end if;

  v_image_count := coalesce(
    jsonb_array_length(
      case
        when jsonb_typeof(to_jsonb(new)->'images') = 'array' then to_jsonb(new)->'images'
        else '[]'::jsonb
      end
    ),
    0
  );

  if v_message_text is null and v_image_count = 0 then
    raise exception 'A dispute message requires text or at least one image.';
  end if;

  new.sender_id := v_actor_id;
  new.sender_role := v_actor_role;
  new.message := v_message_text;
  return new;
end;
$$;

create or replace function public.open_order_dispute(
  p_order_id uuid,
  p_message text,
  p_images text[] default '{}'
)
returns public.orders
language plpgsql
security definer
set search_path = public
as $$
declare
  v_actor_id uuid := auth.uid();
  v_order public.orders%rowtype;
  v_message text := nullif(btrim(coalesce(p_message, '')), '');
  v_images text[] := coalesce(p_images, '{}');
begin
  if v_actor_id is null then
    raise exception 'Authenticated session required.';
  end if;

  if v_message is null then
    raise exception 'Please describe the dispute.';
  end if;

  select *
  into v_order
  from public.orders
  where id = p_order_id
  for update;

  if not found then
    raise exception 'Order not found.';
  end if;

  if v_order.buyer_id is distinct from v_actor_id then
    raise exception 'Only the buyer can open a dispute for this order.';
  end if;

  if v_order.delivery_type = 'delivery' and v_order.status is distinct from 'DELIVERED' then
    raise exception 'Delivery disputes can only be opened after the order is DELIVERED.';
  end if;

  if v_order.delivery_type = 'pickup' and v_order.status is distinct from 'READY_FOR_PICKUP' then
    raise exception 'Pickup disputes can only be opened while the order is READY_FOR_PICKUP.';
  end if;

  perform set_config('app.order_transition_actor', 'buyer_open_dispute', true);

  update public.orders
  set
    status = 'DISPUTED',
    dispute_reason = v_message,
    dispute_images = v_images,
    disputed_at = now(),
    dispute_status = 'open'
  where id = p_order_id
  returning * into v_order;

  insert into public.dispute_messages (
    order_id,
    sender_id,
    sender_role,
    message,
    images
  )
  values (
    p_order_id,
    v_actor_id,
    'buyer',
    v_message,
    v_images
  );

  perform set_config('app.order_transition_actor', '', true);
  return v_order;
exception
  when others then
    perform set_config('app.order_transition_actor', '', true);
    raise;
end;
$$;

create or replace function public.add_dispute_message(
  p_order_id uuid,
  p_message text default null,
  p_images text[] default '{}'
)
returns public.dispute_messages
language plpgsql
security definer
set search_path = public
as $$
declare
  v_message public.dispute_messages%rowtype;
begin
  insert into public.dispute_messages (
    order_id,
    message,
    images
  )
  values (
    p_order_id,
    nullif(btrim(coalesce(p_message, '')), ''),
    coalesce(p_images, '{}')
  )
  returning *
  into v_message;

  return v_message;
end;
$$;

create or replace function public.admin_resolve_order_dispute(
  p_order_id uuid,
  p_resolution_type text,
  p_constitution_section text,
  p_reason text,
  p_resolution_notes text default null,
  p_resolution_amount numeric default null
)
returns public.orders
language plpgsql
security definer
set search_path = public
as $$
declare
  v_actor_id uuid := auth.uid();
  v_now timestamptz := now();
  v_reason text := nullif(btrim(coalesce(p_reason, '')), '');
  v_notes text := nullif(btrim(coalesce(p_resolution_notes, '')), '');
  v_order public.orders%rowtype;
  v_previous_status text;
  v_previous_dispute_status text;
begin
  if not public.is_admin_user(v_actor_id) then
    raise exception 'Only admins can resolve disputes.';
  end if;

  if p_resolution_type not in ('full_refund', 'partial_refund', 'release', 'cancelled') then
    raise exception 'Unsupported dispute resolution type.';
  end if;

  if nullif(btrim(coalesce(p_constitution_section, '')), '') is null then
    raise exception 'A constitution section is required.';
  end if;

  if v_reason is null then
    raise exception 'A dispute resolution reason is required.';
  end if;

  select *
  into v_order
  from public.orders
  where id = p_order_id
  for update;

  if not found then
    raise exception 'Order not found.';
  end if;

  if v_order.status is distinct from 'DISPUTED' then
    raise exception 'Only disputed orders can be resolved.';
  end if;

  v_previous_status := v_order.status;
  v_previous_dispute_status := coalesce(v_order.dispute_status, 'open');

  if p_resolution_type = 'partial_refund' then
    if p_resolution_amount is null or p_resolution_amount <= 0 then
      raise exception 'A valid partial refund amount is required.';
    end if;

    if p_resolution_amount > coalesce(v_order.total_amount, 0) then
      raise exception 'Partial refund amount cannot exceed the order total.';
    end if;
  else
    p_resolution_amount := null;
  end if;

  perform set_config('app.order_dispute_resolution', 'enabled', true);

  update public.orders
  set
    status = case
      when p_resolution_type in ('full_refund', 'partial_refund') then 'REFUNDED'
      when p_resolution_type = 'release' then 'COMPLETED'
      else 'CANCELLED'
    end,
    dispute_status = 'resolved',
    resolved_by = v_actor_id,
    resolution_type = p_resolution_type,
    resolution_amount = p_resolution_amount,
    constitution_section = p_constitution_section,
    resolution_notes = v_notes,
    resolved_at = v_now,
    completed_at = case when p_resolution_type = 'release' then v_now else completed_at end,
    cancelled_at = case when p_resolution_type in ('full_refund', 'partial_refund', 'cancelled') then v_now else cancelled_at end,
    ship_deadline = null,
    delivery_deadline = null,
    auto_cancel_at = null,
    auto_complete_at = null,
    dispute_deadline = null
  where id = p_order_id
  returning * into v_order;

  insert into public.admin_actions (
    admin_id,
    target_type,
    target_id,
    action_type,
    reason,
    metadata,
    previous_state,
    new_state,
    source,
    automated,
    requires_reason
  )
  values (
    v_actor_id,
    'order',
    p_order_id::text,
    'RESOLVE_DISPUTE',
    v_reason,
    jsonb_build_object(
      'resolution_type', p_resolution_type,
      'constitution_section', p_constitution_section,
      'resolution_amount', p_resolution_amount,
      'resolution_notes', v_notes
    ),
    jsonb_build_object(
      'order_status', v_previous_status,
      'dispute_status', v_previous_dispute_status
    ),
    jsonb_build_object(
      'order_status', v_order.status,
      'dispute_status', v_order.dispute_status
    ),
    'rpc:admin_resolve_order_dispute',
    false,
    true
  );

  perform set_config('app.order_dispute_resolution', '', true);
  return v_order;
exception
  when others then
    perform set_config('app.order_dispute_resolution', '', true);
    raise;
end;
$$;

create or replace function public.handle_refund_request_status_change()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_order public.orders%rowtype;
  v_reason text;
  v_internal_actor text := current_setting('app.refund_system_actor', true);
  v_is_automated boolean := coalesce(v_internal_actor, '') = 'auto_approve';
begin
  if new.status = old.status then
    return new;
  end if;

  if new.status = 'approved' and old.status = 'pending' then
    select *
    into v_order
    from public.orders
    where id = new.order_id
    for update;

    if not found then
      raise exception 'Order not found for this refund request.';
    end if;

    if v_order.status <> 'PAID_ESCROW' then
      raise exception 'Refund request can no longer be approved because the order status is %.', v_order.status;
    end if;

    perform set_config(
      'app.refund_system_actor',
      coalesce(nullif(v_internal_actor, ''), 'admin_review'),
      true
    );

    update public.orders
    set status = 'REFUNDED',
        cancelled_at = coalesce(cancelled_at, now()),
        ship_deadline = null,
        delivery_deadline = null,
        auto_cancel_at = null,
        auto_complete_at = null,
        dispute_deadline = null
    where id = new.order_id;

    perform set_config('app.refund_system_actor', '', true);

    v_reason := case
      when v_is_automated then
        coalesce(new.admin_notes, 'Automatically approved after 10 days without admin review.')
      else
        coalesce(new.admin_notes, 'Approved refund request after seller inactivity.')
    end;

    insert into public.admin_actions (
      admin_id,
      target_type,
      target_id,
      action_type,
      reason,
      metadata,
      previous_state,
      new_state,
      source,
      requires_reason,
      automated
    )
    values (
      new.reviewed_by,
      'order',
      new.order_id::text,
      'APPROVE_REFUND_REQUEST',
      v_reason,
      jsonb_build_object(
        'refund_request_id', new.id,
        'order_id', new.order_id,
        'buyer_id', new.buyer_id,
        'seller_id', new.seller_id,
        'refund_reason', new.reason
      ),
      jsonb_build_object(
        'order_status', v_order.status,
        'refund_request_status', old.status
      ),
      jsonb_build_object(
        'order_status', 'REFUNDED',
        'refund_request_status', new.status
      ),
      case when v_is_automated then 'refund_request_deadline' else 'refund_request' end,
      false,
      v_is_automated
    );
  elsif new.status = 'rejected' and old.status = 'pending' then
    insert into public.admin_actions (
      admin_id,
      target_type,
      target_id,
      action_type,
      reason,
      metadata,
      previous_state,
      new_state,
      source,
      requires_reason,
      automated
    )
    values (
      new.reviewed_by,
      'order',
      new.order_id::text,
      'REJECT_REFUND_REQUEST',
      new.admin_notes,
      jsonb_build_object(
        'refund_request_id', new.id,
        'order_id', new.order_id,
        'buyer_id', new.buyer_id,
        'seller_id', new.seller_id,
        'refund_reason', new.reason
      ),
      jsonb_build_object(
        'refund_request_status', old.status
      ),
      jsonb_build_object(
        'refund_request_status', new.status
      ),
      'refund_request',
      true,
      false
    );
  end if;

  return new;
exception
  when others then
    perform set_config('app.refund_system_actor', '', true);
    raise;
end;
$$;

create or replace function public.prepare_review_write()
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
  v_actor_id uuid := auth.uid();
  v_order public.orders%rowtype;
begin
  if tg_op = 'DELETE' then
    raise exception 'Reviews cannot be deleted from the client.';
  end if;

  if tg_op = 'UPDATE' then
    raise exception 'Reviews are immutable once submitted.';
  end if;

  if v_request_role = 'service_role' then
    return new;
  end if;

  if v_actor_id is null then
    raise exception 'Authenticated session required.';
  end if;

  select *
  into v_order
  from public.orders
  where id = new.order_id;

  if not found then
    raise exception 'Order not found for this review.';
  end if;

  if v_order.buyer_id is distinct from v_actor_id then
    raise exception 'You can only review products from your own orders.';
  end if;

  if v_order.status is distinct from 'COMPLETED' then
    raise exception 'Reviews are only allowed after the order is completed.';
  end if;

  if v_order.seller_id = v_actor_id then
    raise exception 'Sellers cannot review their own products.';
  end if;

  if not (
    v_order.product_id = new.product_id
    or exists (
      select 1
      from public.order_items oi
      where oi.order_id = new.order_id
        and oi.product_id = new.product_id
    )
  ) then
    raise exception 'You can only review products that were included in this order.';
  end if;

  if coalesce(new.rating, 0) < 1 or coalesce(new.rating, 0) > 5 then
    raise exception 'rating must be between 1 and 5.';
  end if;

  new.buyer_id := v_actor_id;
  new.comment := nullif(btrim(coalesce(new.comment, '')), '');
  return new;
end;
$$;

do $$
declare
  policy_record record;
begin
  if to_regclass('public.dispute_messages') is not null then
    execute 'alter table public.dispute_messages enable row level security';

    if to_regprocedure('public.prepare_dispute_message_write()') is not null then
      execute 'drop trigger if exists dispute_messages_prepare_write on public.dispute_messages';
      execute 'create trigger dispute_messages_prepare_write before insert or update or delete on public.dispute_messages for each row execute function public.prepare_dispute_message_write()';
    end if;

    for policy_record in
      select policyname
      from pg_policies
      where schemaname = 'public'
        and tablename = 'dispute_messages'
    loop
      execute format('drop policy if exists %I on public.dispute_messages', policy_record.policyname);
    end loop;

    execute $policy$
      create policy "participants and admins can read dispute messages"
      on public.dispute_messages
      for select
      to authenticated
      using (public.can_access_order(order_id, auth.uid()))
    $policy$;

    execute $policy$
      create policy "participants and admins can insert dispute messages"
      on public.dispute_messages
      for insert
      to authenticated
      with check (public.can_access_order(order_id, auth.uid()))
    $policy$;
  end if;
end $$;

do $$
declare
  policy_record record;
begin
  if to_regclass('public.reviews') is not null then
    execute 'alter table public.reviews enable row level security';
    execute 'create unique index if not exists reviews_unique_buyer_order_product_idx on public.reviews (order_id, product_id, buyer_id)';

    if to_regprocedure('public.prepare_review_write()') is not null then
      execute 'drop trigger if exists reviews_prepare_write on public.reviews';
      execute 'create trigger reviews_prepare_write before insert or update or delete on public.reviews for each row execute function public.prepare_review_write()';
    end if;

    for policy_record in
      select policyname
      from pg_policies
      where schemaname = 'public'
        and tablename = 'reviews'
    loop
      execute format('drop policy if exists %I on public.reviews', policy_record.policyname);
    end loop;

    execute $policy$
      create policy "public can read reviews for approved products"
      on public.reviews
      for select
      using (
        exists (
          select 1
          from public.products
          where products.id = reviews.product_id
            and products.is_approved = true
            and products.deleted_at is null
        )
      )
    $policy$;

    execute $policy$
      create policy "sellers can read reviews for own products"
      on public.reviews
      for select
      to authenticated
      using (
        exists (
          select 1
          from public.products
          where products.id = reviews.product_id
            and products.seller_id = auth.uid()
        )
      )
    $policy$;

    execute $policy$
      create policy "admins can read all reviews"
      on public.reviews
      for select
      to authenticated
      using (public.is_admin_user(auth.uid()))
    $policy$;

    execute $policy$
      create policy "buyers can insert completed-order reviews"
      on public.reviews
      for insert
      to authenticated
      with check (buyer_id = auth.uid())
    $policy$;
  end if;
end $$;

drop policy if exists "buyers can update own orders" on public.orders;
drop policy if exists "sellers can update own orders" on public.orders;
drop policy if exists "admins can update any order" on public.orders;

drop policy if exists "buyers can insert own refund requests" on public.refund_requests;
drop policy if exists "buyers can update own refund requests" on public.refund_requests;
drop policy if exists "admins can review refund requests" on public.refund_requests;

drop policy if exists "admins can insert admin actions" on public.admin_actions;
drop policy if exists "admins can update any user" on public.users;
drop policy if exists "admins can update any product" on public.products;

do $$
declare
  bucket_policy record;
begin
  insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
  values (
    'product-images',
    'product-images',
    true,
    10485760,
    array['image/png', 'image/jpeg', 'image/webp']
  )
  on conflict (id) do update
  set
    public = excluded.public,
    file_size_limit = excluded.file_size_limit,
    allowed_mime_types = excluded.allowed_mime_types;

  insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
  values (
    'dispute-evidence',
    'dispute-evidence',
    false,
    10485760,
    array['image/png', 'image/jpeg', 'image/webp']
  )
  on conflict (id) do update
  set
    public = excluded.public,
    file_size_limit = excluded.file_size_limit,
    allowed_mime_types = excluded.allowed_mime_types;

  for bucket_policy in
    select policyname
    from pg_policies
    where schemaname = 'storage'
      and tablename = 'objects'
      and policyname in (
        'sellers can upload own product images',
        'sellers can update own product images',
        'sellers can delete own product images',
        'participants can upload dispute evidence',
        'participants can view dispute evidence',
        'owners or admins can update dispute evidence',
        'owners or admins can delete dispute evidence'
      )
  loop
    execute format('drop policy if exists %I on storage.objects', bucket_policy.policyname);
  end loop;
end $$;

create policy "sellers can upload own product images"
on storage.objects
for insert
to authenticated
with check (
  bucket_id = 'product-images'
  and (storage.foldername(name))[1] = auth.uid()::text
  and exists (
    select 1
    from public.users
    where users.id = auth.uid()
      and users.role = 'seller'
      and public.has_accepted_seller_agreement(users.id)
  )
);

create policy "sellers can update own product images"
on storage.objects
for update
to authenticated
using (
  bucket_id = 'product-images'
  and (storage.foldername(name))[1] = auth.uid()::text
)
with check (
  bucket_id = 'product-images'
  and (storage.foldername(name))[1] = auth.uid()::text
);

create policy "sellers can delete own product images"
on storage.objects
for delete
to authenticated
using (
  bucket_id = 'product-images'
  and (storage.foldername(name))[1] = auth.uid()::text
);

create policy "participants can upload dispute evidence"
on storage.objects
for insert
to authenticated
with check (
  bucket_id = 'dispute-evidence'
  and (storage.foldername(name))[1] = 'orders'
  and coalesce((storage.foldername(name))[2], '') ~* '^[0-9a-f-]{36}$'
  and (storage.foldername(name))[3] = auth.uid()::text
  and public.can_access_order(((storage.foldername(name))[2])::uuid, auth.uid())
);

create policy "participants can view dispute evidence"
on storage.objects
for select
to authenticated
using (
  bucket_id = 'dispute-evidence'
  and (storage.foldername(name))[1] = 'orders'
  and coalesce((storage.foldername(name))[2], '') ~* '^[0-9a-f-]{36}$'
  and public.can_access_order(((storage.foldername(name))[2])::uuid, auth.uid())
);

create policy "owners or admins can update dispute evidence"
on storage.objects
for update
to authenticated
using (
  bucket_id = 'dispute-evidence'
  and (storage.foldername(name))[1] = 'orders'
  and coalesce((storage.foldername(name))[2], '') ~* '^[0-9a-f-]{36}$'
  and (
    (storage.foldername(name))[3] = auth.uid()::text
    or public.is_admin_user(auth.uid())
  )
  and public.can_access_order(((storage.foldername(name))[2])::uuid, auth.uid())
)
with check (
  bucket_id = 'dispute-evidence'
  and (storage.foldername(name))[1] = 'orders'
  and coalesce((storage.foldername(name))[2], '') ~* '^[0-9a-f-]{36}$'
  and (
    (storage.foldername(name))[3] = auth.uid()::text
    or public.is_admin_user(auth.uid())
  )
  and public.can_access_order(((storage.foldername(name))[2])::uuid, auth.uid())
);

create policy "owners or admins can delete dispute evidence"
on storage.objects
for delete
to authenticated
using (
  bucket_id = 'dispute-evidence'
  and (storage.foldername(name))[1] = 'orders'
  and coalesce((storage.foldername(name))[2], '') ~* '^[0-9a-f-]{36}$'
  and (
    (storage.foldername(name))[3] = auth.uid()::text
    or public.is_admin_user(auth.uid())
  )
  and public.can_access_order(((storage.foldername(name))[2])::uuid, auth.uid())
);

revoke all on function public.buyer_confirm_order_delivery(uuid) from public;
revoke all on function public.buyer_confirm_order_pickup(uuid) from public;
revoke all on function public.open_order_dispute(uuid, text, text[]) from public;
revoke all on function public.add_dispute_message(uuid, text, text[]) from public;
revoke all on function public.admin_resolve_order_dispute(uuid, text, text, text, text, numeric) from public;

grant execute on function public.buyer_confirm_order_delivery(uuid) to authenticated;
grant execute on function public.buyer_confirm_order_pickup(uuid) to authenticated;
grant execute on function public.open_order_dispute(uuid, text, text[]) to authenticated;
grant execute on function public.add_dispute_message(uuid, text, text[]) to authenticated;
grant execute on function public.admin_resolve_order_dispute(uuid, text, text, text, text, numeric) to authenticated;
