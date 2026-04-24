create or replace function public.assert_refund_request_eligible(
  p_order_id uuid,
  p_buyer_id uuid,
  p_reason text default null
)
returns public.orders
language plpgsql
security definer
set search_path = public
as $$
declare
  v_order public.orders%rowtype;
  v_reason text := btrim(coalesce(p_reason, ''));
begin
  if p_buyer_id is null then
    raise exception 'Authenticated session required to request a refund.';
  end if;

  if char_length(v_reason) < 20 then
    raise exception 'Refund reason must be at least 20 characters.';
  end if;

  select *
  into v_order
  from public.orders
  where id = p_order_id;

  if not found then
    raise exception 'Order not found.';
  end if;

  if v_order.buyer_id is distinct from p_buyer_id then
    raise exception 'You can only request a refund for your own orders.';
  end if;

  if v_order.status in ('CANCELLED', 'REFUNDED', 'COMPLETED', 'DISPUTED') then
    raise exception 'This order is no longer eligible for a refund request.';
  end if;

  if v_order.status in ('SHIPPED', 'READY_FOR_PICKUP', 'DELIVERED') then
    raise exception 'The seller has already acted on this order, so a refund request is not available.';
  end if;

  if v_order.status <> 'PAID_ESCROW' then
    raise exception 'Refund requests are only available for paid orders awaiting seller fulfillment.';
  end if;

  if exists (
    select 1
    from public.refund_requests
    where order_id = p_order_id
      and status = 'pending'
  ) then
    raise exception 'A refund request is already pending for this order.';
  end if;

  return v_order;
end;
$$;
