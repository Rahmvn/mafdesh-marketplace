alter table public.orders
  add column if not exists delivery_deadline timestamptz;

create index if not exists orders_active_delivery_deadline_idx
  on public.orders (delivery_deadline)
  where status = 'SHIPPED'
    and delivery_type = 'delivery'
    and delivery_deadline is not null;

update public.orders
set delivery_deadline = case
  when shipped_at is not null then shipped_at + interval '7 days'
  else now()
end
where status = 'SHIPPED'
  and delivery_type = 'delivery'
  and delivery_deadline is null;

create or replace function public.prevent_seller_delivery_deadline_bypass()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_actor_id uuid := auth.uid();
  v_actor_role text;
  v_request_role text := coalesce(
    nullif(auth.role(), ''),
    current_setting('request.jwt.claim.role', true)
  );
  v_transition_actor text := current_setting('app.seller_order_transition', true);
begin
  if tg_op <> 'UPDATE' then
    return new;
  end if;

  if v_request_role = 'service_role' then
    return new;
  end if;

  if v_actor_id is null then
    return new;
  end if;

  select role
  into v_actor_role
  from public.users
  where id = v_actor_id;

  if v_actor_role = 'admin' then
    return new;
  end if;

  if old.delivery_deadline is distinct from new.delivery_deadline
     and coalesce(v_transition_actor, '') <> 'mark_shipped'
  then
    raise exception 'Delivery deadline can only be set by the seller shipping transition.';
  end if;

  if old.seller_id is distinct from v_actor_id then
    return new;
  end if;

  if old.delivery_type = 'delivery'
     and old.status = 'PAID_ESCROW'
     and new.status = 'SHIPPED'
     and coalesce(v_transition_actor, '') <> 'mark_shipped'
  then
    raise exception 'Use seller_mark_order_shipped to ship delivery orders.';
  end if;

  if old.delivery_type = 'delivery'
     and old.status = 'SHIPPED'
     and new.status = 'DELIVERED'
     and coalesce(v_transition_actor, '') <> 'mark_delivered'
  then
    raise exception 'Use seller_mark_order_delivered to mark delivery orders delivered.';
  end if;

  return new;
end;
$$;

drop trigger if exists orders_prevent_seller_delivery_deadline_bypass on public.orders;
create trigger orders_prevent_seller_delivery_deadline_bypass
before update of status, delivery_deadline on public.orders
for each row
execute function public.prevent_seller_delivery_deadline_bypass();

create or replace function public.seller_mark_order_shipped(
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

  if v_order.seller_id is distinct from v_actor_id then
    raise exception 'You can only ship your own orders.';
  end if;

  if v_order.delivery_type is distinct from 'delivery' then
    raise exception 'Only delivery orders can be marked as shipped.';
  end if;

  if v_order.status is distinct from 'PAID_ESCROW' then
    raise exception 'Only paid orders awaiting fulfillment can be marked as shipped.';
  end if;

  if v_order.ship_deadline is null then
    raise exception 'Shipping deadline is missing. Please contact support.';
  end if;

  if v_order.ship_deadline <= v_now then
    raise exception 'Shipping deadline has passed. This order will be refunded automatically.';
  end if;

  perform set_config('app.seller_order_transition', 'mark_shipped', true);

  update public.orders
  set status = 'SHIPPED',
      shipped_at = v_now,
      delivery_deadline = v_now + interval '7 days'
  where id = p_order_id
  returning *
  into v_order;

  perform set_config('app.seller_order_transition', '', true);

  return v_order;
exception
  when others then
    perform set_config('app.seller_order_transition', '', true);
    raise;
end;
$$;

create or replace function public.seller_mark_order_delivered(
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

  if v_order.seller_id is distinct from v_actor_id then
    raise exception 'You can only update your own orders.';
  end if;

  if v_order.delivery_type is distinct from 'delivery' then
    raise exception 'Only delivery orders can be marked as delivered.';
  end if;

  if v_order.status is distinct from 'SHIPPED' then
    raise exception 'Only shipped delivery orders can be marked as delivered.';
  end if;

  if v_order.delivery_deadline is null then
    raise exception 'Delivery deadline is missing. Please contact support.';
  end if;

  if v_order.delivery_deadline <= v_now then
    raise exception 'Delivery deadline has passed. This order will be refunded automatically.';
  end if;

  perform set_config('app.seller_order_transition', 'mark_delivered', true);

  update public.orders
  set status = 'DELIVERED',
      delivered_at = v_now,
      dispute_deadline = v_now + interval '72 hours'
  where id = p_order_id
  returning *
  into v_order;

  perform set_config('app.seller_order_transition', '', true);

  return v_order;
exception
  when others then
    perform set_config('app.seller_order_transition', '', true);
    raise;
end;
$$;

revoke all on function public.seller_mark_order_shipped(uuid) from public;
revoke all on function public.seller_mark_order_delivered(uuid) from public;
grant execute on function public.seller_mark_order_shipped(uuid) to authenticated;
grant execute on function public.seller_mark_order_delivered(uuid) to authenticated;
