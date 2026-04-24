create or replace function public.validate_buyer_order_completion()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  request_role text := coalesce(
    nullif(auth.role(), ''),
    current_setting('request.jwt.claim.role', true)
  );
  actor_role text;
begin
  if tg_op <> 'UPDATE' or request_role = 'service_role' then
    return new;
  end if;

  if auth.uid() is null then
    return new;
  end if;

  select role
  into actor_role
  from public.users
  where id = auth.uid();

  if actor_role is distinct from 'buyer' then
    return new;
  end if;

  if new.status is distinct from old.status and new.status = 'COMPLETED' then
    if old.buyer_id is distinct from auth.uid() then
      raise exception 'You can only confirm your own orders.';
    end if;

    if old.status = 'DELIVERED' then
      if new.completed_at is null then
        raise exception 'completed_at is required when confirming delivery.';
      end if;

      return new;
    end if;

    if old.status = 'READY_FOR_PICKUP' then
      if new.picked_up_at is null then
        raise exception 'picked_up_at is required when confirming pickup.';
      end if;

      if new.completed_at is null then
        raise exception 'completed_at is required when confirming pickup.';
      end if;

      return new;
    end if;

    raise exception 'Buyers can only complete orders after the seller marks them delivered or ready for pickup.';
  end if;

  return new;
end;
$$;

drop trigger if exists orders_validate_buyer_order_completion on public.orders;
create trigger orders_validate_buyer_order_completion
before update of status, completed_at, picked_up_at on public.orders
for each row
execute function public.validate_buyer_order_completion();
