alter table public.refund_requests
  add column if not exists ship_deadline_remaining_seconds integer;

create or replace function public.prepare_refund_request_write()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_actor_id uuid := auth.uid();
  v_is_admin boolean := public.is_admin_user(v_actor_id);
  v_internal_actor text := current_setting('app.refund_system_actor', true);
  v_order public.orders%rowtype;
begin
  if tg_op = 'INSERT' then
    v_order := public.assert_refund_request_eligible(new.order_id, v_actor_id, new.reason);

    new.buyer_id := v_order.buyer_id;
    new.seller_id := v_order.seller_id;
    new.status := 'pending';
    new.reason := btrim(new.reason);
    new.admin_notes := null;
    new.reviewed_by := null;
    new.reviewed_at := null;
    new.created_at := coalesce(new.created_at, now());
    new.updated_at := now();
    new.ship_deadline_remaining_seconds := case
      when v_order.ship_deadline is null then null
      else greatest(0, floor(extract(epoch from (v_order.ship_deadline - now()))))::integer
    end;
    return new;
  end if;

  new.updated_at := now();

  if new.id is distinct from old.id
    or new.order_id is distinct from old.order_id
    or new.buyer_id is distinct from old.buyer_id
    or new.seller_id is distinct from old.seller_id
    or new.reason is distinct from old.reason
    or new.created_at is distinct from old.created_at
    or new.ship_deadline_remaining_seconds is distinct from old.ship_deadline_remaining_seconds
  then
    raise exception 'Refund request details cannot be changed after submission.';
  end if;

  if coalesce(v_internal_actor, '') = 'auto_cancel' then
    if old.status <> 'pending' or new.status <> 'cancelled' then
      raise exception 'Automatic refund cancellation is only allowed for pending requests.';
    end if;

    new.admin_notes := old.admin_notes;
    new.reviewed_by := old.reviewed_by;
    new.reviewed_at := old.reviewed_at;
    new.ship_deadline_remaining_seconds := old.ship_deadline_remaining_seconds;
    return new;
  end if;

  if coalesce(v_internal_actor, '') = 'auto_approve' then
    if old.status <> 'pending' or new.status <> 'approved' then
      raise exception 'Automatic refund approval is only allowed for pending requests.';
    end if;

    new.admin_notes := coalesce(
      nullif(btrim(coalesce(new.admin_notes, '')), ''),
      'Automatically approved after 10 days without admin review.'
    );
    new.reviewed_by := null;
    new.reviewed_at := coalesce(new.reviewed_at, now());
    new.ship_deadline_remaining_seconds := old.ship_deadline_remaining_seconds;
    return new;
  end if;

  if v_is_admin then
    if old.status <> 'pending' then
      raise exception 'Only pending refund requests can be reviewed.';
    end if;

    if new.status = 'approved' then
      new.admin_notes := nullif(btrim(coalesce(new.admin_notes, '')), '');
      new.reviewed_by := v_actor_id;
      new.reviewed_at := coalesce(new.reviewed_at, now());
      new.ship_deadline_remaining_seconds := old.ship_deadline_remaining_seconds;
      return new;
    end if;

    if new.status = 'rejected' then
      if char_length(btrim(coalesce(new.admin_notes, ''))) = 0 then
        raise exception 'A rejection reason is required.';
      end if;

      new.admin_notes := btrim(new.admin_notes);
      new.reviewed_by := v_actor_id;
      new.reviewed_at := coalesce(new.reviewed_at, now());
      new.ship_deadline_remaining_seconds := old.ship_deadline_remaining_seconds;
      return new;
    end if;

    raise exception 'Admins can only approve or reject pending refund requests.';
  end if;

  if v_actor_id is not null and v_actor_id = old.buyer_id then
    if old.status <> 'pending' or new.status <> 'cancelled' then
      raise exception 'You can only cancel a pending refund request.';
    end if;

    new.admin_notes := old.admin_notes;
    new.reviewed_by := old.reviewed_by;
    new.reviewed_at := old.reviewed_at;
    new.ship_deadline_remaining_seconds := old.ship_deadline_remaining_seconds;
    return new;
  end if;

  raise exception 'You are not allowed to modify this refund request.';
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

    update public.orders
    set status = 'REFUNDED',
        cancelled_at = coalesce(cancelled_at, now()),
        ship_deadline = null,
        delivery_deadline = null,
        auto_cancel_at = null,
        auto_complete_at = null,
        dispute_deadline = null
    where id = new.order_id;

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
end;
$$;

create or replace function public.sync_order_for_refund_request()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_order_number text;
  v_deadline timestamptz := new.created_at + interval '10 days';
  v_remaining_seconds integer;
  v_seller_link text := format('/seller/orders/%s', new.order_id);
  v_buyer_link text := format('/buyer/orders/%s', new.order_id);
  v_admin_link text := '/admin/refund-requests';
begin
  select coalesce(order_number, left(id::text, 8))
  into v_order_number
  from public.orders
  where id = new.order_id;

  if tg_op = 'INSERT' then
    if new.status = 'pending' then
      update public.orders
      set ship_deadline = null
      where id = new.order_id
        and status = 'PAID_ESCROW';

      perform public.create_notification(
        new.seller_id,
        'refund_requested',
        'Refund requested',
        format('The buyer requested a refund for order %s. Fulfillment is paused during admin review.', v_order_number),
        v_seller_link,
        jsonb_build_object(
          'refund_request_id', new.id,
          'order_id', new.order_id,
          'order_number', v_order_number
        )
      );

      perform public.create_admin_notifications(
        'refund_pending',
        'Refund request needs review',
        format(
          'Order %s has a pending refund request. Review should finish by %s.',
          v_order_number,
          to_char(v_deadline, 'FMMon DD, YYYY HH12:MI AM')
        ),
        v_admin_link,
        jsonb_build_object(
          'refund_request_id', new.id,
          'order_id', new.order_id,
          'order_number', v_order_number
        )
      );
    end if;

    return new;
  end if;

  if new.status = old.status then
    return new;
  end if;

  v_remaining_seconds := coalesce(new.ship_deadline_remaining_seconds, old.ship_deadline_remaining_seconds);

  if old.status = 'pending' and new.status in ('cancelled', 'rejected') then
    update public.orders
    set ship_deadline = case
      when v_remaining_seconds is null then ship_deadline
      when v_remaining_seconds <= 0 then now()
      else now() + make_interval(secs => v_remaining_seconds)
    end
    where id = new.order_id
      and status = 'PAID_ESCROW'
      and ship_deadline is null;
  end if;

  if old.status = 'pending' and new.status = 'approved' then
    perform public.create_notification(
      new.buyer_id,
      'refund_approved',
      'Refund approved',
      format('Your refund request for order %s was approved.', v_order_number),
      v_buyer_link,
      jsonb_build_object(
        'refund_request_id', new.id,
        'order_id', new.order_id,
        'order_number', v_order_number
      )
    );
  elsif old.status = 'pending' and new.status = 'rejected' then
    perform public.create_notification(
      new.buyer_id,
      'refund_rejected',
      'Refund rejected',
      case
        when coalesce(btrim(new.admin_notes), '') <> ''
          then format('Your refund request for order %s was rejected. Reason: %s', v_order_number, btrim(new.admin_notes))
        else format('Your refund request for order %s was rejected.', v_order_number)
      end,
      v_buyer_link,
      jsonb_build_object(
        'refund_request_id', new.id,
        'order_id', new.order_id,
        'order_number', v_order_number
      )
    );

    perform public.create_notification(
      new.seller_id,
      'refund_rejected',
      'Refund request rejected',
      format('Refund review for order %s is complete. Fulfillment can continue.', v_order_number),
      v_seller_link,
      jsonb_build_object(
        'refund_request_id', new.id,
        'order_id', new.order_id,
        'order_number', v_order_number
      )
    );
  elsif old.status = 'pending' and new.status = 'cancelled' then
    perform public.create_notification(
      new.buyer_id,
      'refund_cancelled',
      'Refund request cancelled',
      format('Your refund request for order %s has been cancelled.', v_order_number),
      v_buyer_link,
      jsonb_build_object(
        'refund_request_id', new.id,
        'order_id', new.order_id,
        'order_number', v_order_number
      )
    );

    perform public.create_notification(
      new.seller_id,
      'refund_cancelled',
      'Refund request cancelled',
      format('The buyer cancelled the refund request for order %s.', v_order_number),
      v_seller_link,
      jsonb_build_object(
        'refund_request_id', new.id,
        'order_id', new.order_id,
        'order_number', v_order_number
      )
    );
  end if;

  return new;
end;
$$;

create or replace function public.auto_approve_overdue_refund_requests()
returns table(request_id uuid, order_id uuid)
language plpgsql
security definer
set search_path = public
as $$
declare
  v_request record;
begin
  for v_request in
    select rr.id, rr.order_id
    from public.refund_requests rr
    join public.orders o on o.id = rr.order_id
    where rr.status = 'pending'
      and rr.created_at <= now() - interval '10 days'
      and o.status = 'PAID_ESCROW'
    order by rr.created_at asc, rr.id asc
  loop
    perform set_config('app.refund_system_actor', 'auto_approve', true);

    update public.refund_requests
    set status = 'approved',
        admin_notes = 'Automatically approved after 10 days without admin review.',
        reviewed_by = null,
        reviewed_at = now()
    where id = v_request.id
      and status = 'pending';

    perform set_config('app.refund_system_actor', '', true);

    if found then
      request_id := v_request.id;
      order_id := v_request.order_id;
      return next;
    end if;
  end loop;

  return;
exception
  when others then
    perform set_config('app.refund_system_actor', '', true);
    raise;
end;
$$;

revoke all on function public.auto_approve_overdue_refund_requests() from public;
revoke all on function public.auto_approve_overdue_refund_requests() from anon;
revoke all on function public.auto_approve_overdue_refund_requests() from authenticated;
grant execute on function public.auto_approve_overdue_refund_requests() to service_role;
