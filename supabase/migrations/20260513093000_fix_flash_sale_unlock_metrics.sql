create or replace function public.compute_seller_trust_metrics(p_seller_id uuid)
returns table (
  completed_orders integer,
  average_rating numeric,
  dispute_rate numeric,
  no_fraud_flags boolean,
  is_trusted_seller boolean
)
language sql
security definer
set search_path = public
as $$
  with seller_record as (
    select
      u.id,
      coalesce(u.no_fraud_flags, true) as no_fraud_flags,
      coalesce(nullif(btrim(u.account_status), ''), 'active') as account_status
    from public.users u
    where u.id = p_seller_id
      and u.role = 'seller'
  ),
  order_metrics as (
    select
      count(*) filter (where o.status = 'COMPLETED')::integer as completed_orders,
      count(*) filter (
        where o.status in ('COMPLETED', 'REFUNDED', 'DISPUTED')
      )::integer as resolved_orders,
      count(*) filter (
        where o.status = 'DISPUTED'
          or coalesce(o.dispute_status, 'none') <> 'none'
          or o.disputed_at is not null
          or o.resolution_type is not null
      )::integer as disputed_orders
    from public.orders o
    where o.seller_id = p_seller_id
  ),
  review_metrics as (
    select
      coalesce(avg(r.rating), 0)::numeric as average_rating
    from public.reviews r
    inner join public.products p
      on p.id = r.product_id
    where p.seller_id = p_seller_id
  )
  select
    coalesce(order_metrics.completed_orders, 0) as completed_orders,
    coalesce(review_metrics.average_rating, 0) as average_rating,
    case
      when coalesce(order_metrics.resolved_orders, 0) <= 0 then 0
      else coalesce(order_metrics.disputed_orders, 0)::numeric
        / order_metrics.resolved_orders::numeric
    end as dispute_rate,
    seller_record.no_fraud_flags,
    (
      coalesce(order_metrics.completed_orders, 0) >= 5
      and coalesce(review_metrics.average_rating, 0) >= 4.0
      and (
        case
          when coalesce(order_metrics.resolved_orders, 0) <= 0 then 0
          else coalesce(order_metrics.disputed_orders, 0)::numeric
            / order_metrics.resolved_orders::numeric
        end
      ) <= 0.10
      and seller_record.no_fraud_flags = true
      and seller_record.account_status = 'active'
    ) as is_trusted_seller
  from seller_record
  cross join order_metrics
  cross join review_metrics;
$$;

revoke all on function public.compute_seller_trust_metrics(uuid) from public;
revoke all on function public.compute_seller_trust_metrics(uuid) from anon;
revoke all on function public.compute_seller_trust_metrics(uuid) from authenticated;
grant execute on function public.compute_seller_trust_metrics(uuid) to service_role;

create or replace function public.refresh_seller_trust_metrics(p_seller_id uuid)
returns public.users
language plpgsql
security definer
set search_path = public
as $$
declare
  metric_row record;
  refreshed_user public.users%rowtype;
begin
  if p_seller_id is null then
    return null;
  end if;

  select *
  into metric_row
  from public.compute_seller_trust_metrics(p_seller_id);

  if not found then
    return null;
  end if;

  update public.users u
  set
    completed_orders = metric_row.completed_orders,
    average_rating = metric_row.average_rating,
    dispute_rate = metric_row.dispute_rate,
    is_trusted_seller = metric_row.is_trusted_seller
  where u.id = p_seller_id
    and u.role = 'seller'
  returning u.* into refreshed_user;

  return refreshed_user;
end;
$$;

revoke all on function public.refresh_seller_trust_metrics(uuid) from public;
revoke all on function public.refresh_seller_trust_metrics(uuid) from anon;
revoke all on function public.refresh_seller_trust_metrics(uuid) from authenticated;
grant execute on function public.refresh_seller_trust_metrics(uuid) to service_role;

create or replace function public.refresh_all_seller_trust_metrics()
returns integer
language plpgsql
security definer
set search_path = public
as $$
declare
  seller_row record;
  refreshed_count integer := 0;
begin
  for seller_row in
    select u.id
    from public.users u
    where u.role = 'seller'
  loop
    perform public.refresh_seller_trust_metrics(seller_row.id);
    refreshed_count := refreshed_count + 1;
  end loop;

  return refreshed_count;
end;
$$;

revoke all on function public.refresh_all_seller_trust_metrics() from public;
revoke all on function public.refresh_all_seller_trust_metrics() from anon;
revoke all on function public.refresh_all_seller_trust_metrics() from authenticated;
grant execute on function public.refresh_all_seller_trust_metrics() to service_role;

create or replace function public.refresh_seller_trust_metrics_from_order()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  old_seller_id uuid := case when tg_op in ('UPDATE', 'DELETE') then old.seller_id else null end;
  new_seller_id uuid := case when tg_op in ('INSERT', 'UPDATE') then new.seller_id else null end;
begin
  if old_seller_id is not null then
    perform public.refresh_seller_trust_metrics(old_seller_id);
  end if;

  if new_seller_id is not null and new_seller_id is distinct from old_seller_id then
    perform public.refresh_seller_trust_metrics(new_seller_id);
  end if;

  if tg_op = 'DELETE' then
    return old;
  end if;

  return new;
end;
$$;

drop trigger if exists orders_refresh_seller_trust_metrics on public.orders;
create trigger orders_refresh_seller_trust_metrics
after insert or delete or update of status, dispute_status, disputed_at, resolved_at, resolution_type, seller_id
on public.orders
for each row
execute function public.refresh_seller_trust_metrics_from_order();

create or replace function public.refresh_seller_trust_metrics_from_review()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  old_seller_id uuid;
  new_seller_id uuid;
begin
  if tg_op in ('UPDATE', 'DELETE') and old.product_id is not null then
    select p.seller_id
    into old_seller_id
    from public.products p
    where p.id = old.product_id;
  end if;

  if tg_op in ('INSERT', 'UPDATE') and new.product_id is not null then
    select p.seller_id
    into new_seller_id
    from public.products p
    where p.id = new.product_id;
  end if;

  if old_seller_id is not null then
    perform public.refresh_seller_trust_metrics(old_seller_id);
  end if;

  if new_seller_id is not null and new_seller_id is distinct from old_seller_id then
    perform public.refresh_seller_trust_metrics(new_seller_id);
  end if;

  if tg_op = 'DELETE' then
    return old;
  end if;

  return new;
end;
$$;

drop trigger if exists reviews_refresh_seller_trust_metrics on public.reviews;
create trigger reviews_refresh_seller_trust_metrics
after insert or update or delete
on public.reviews
for each row
execute function public.refresh_seller_trust_metrics_from_review();

create or replace function public.get_flash_sale_eligibility(p_product_id uuid)
returns table (
  eligible boolean,
  seller_eligible boolean,
  product_eligible boolean,
  blocking_reasons text[],
  trust_reasons text[],
  completed_orders integer,
  average_rating numeric,
  dispute_rate numeric,
  no_fraud_flags boolean,
  is_trusted_seller boolean,
  account_status text,
  is_approved boolean,
  stock_quantity integer,
  is_archived boolean
)
language plpgsql
security definer
set search_path = public
as $$
declare
  actor_id uuid := auth.uid();
  product_row public.products%rowtype;
  seller_row public.users%rowtype;
  trust_reason_codes text[] := array[]::text[];
  product_reason_codes text[] := array[]::text[];
begin
  if actor_id is null then
    raise exception 'Authenticated session required.';
  end if;

  perform public.refresh_seller_trust_metrics(actor_id);

  select *
  into product_row
  from public.products p
  where p.id = p_product_id
    and p.seller_id = actor_id;

  if not found then
    raise exception 'You can only check flash sale eligibility for your own product.';
  end if;

  select *
  into seller_row
  from public.users u
  where u.id = actor_id
    and u.role = 'seller';

  if not found then
    raise exception 'Seller account not found.';
  end if;

  if coalesce(seller_row.completed_orders, 0) < 5 then
    trust_reason_codes := array_append(trust_reason_codes, 'complete_more_orders');
  end if;

  if coalesce(seller_row.average_rating, 0) < 4.0 then
    trust_reason_codes := array_append(trust_reason_codes, 'improve_seller_rating');
  end if;

  if coalesce(seller_row.dispute_rate, 0) > 0.10 then
    trust_reason_codes := array_append(trust_reason_codes, 'reduce_dispute_rate');
  end if;

  if coalesce(nullif(btrim(seller_row.account_status), ''), 'active') <> 'active' then
    trust_reason_codes := array_append(trust_reason_codes, 'account_inactive');
  end if;

  if coalesce(seller_row.no_fraud_flags, true) = false then
    trust_reason_codes := array_append(trust_reason_codes, 'seller_flagged_for_review');
  end if;

  if coalesce(product_row.is_approved, false) = false then
    product_reason_codes := array_append(product_reason_codes, 'product_not_approved');
  end if;

  if coalesce(product_row.stock_quantity, 0) <= 0 then
    product_reason_codes := array_append(product_reason_codes, 'product_out_of_stock');
  end if;

  if product_row.deleted_at is not null then
    product_reason_codes := array_append(product_reason_codes, 'product_archived');
  end if;

  return query
  select
    cardinality(trust_reason_codes) = 0 and cardinality(product_reason_codes) = 0 as eligible,
    cardinality(trust_reason_codes) = 0 as seller_eligible,
    cardinality(product_reason_codes) = 0 as product_eligible,
    trust_reason_codes || product_reason_codes as blocking_reasons,
    trust_reason_codes as trust_reasons,
    coalesce(seller_row.completed_orders, 0) as completed_orders,
    coalesce(seller_row.average_rating, 0) as average_rating,
    coalesce(seller_row.dispute_rate, 0) as dispute_rate,
    coalesce(seller_row.no_fraud_flags, true) as no_fraud_flags,
    coalesce(seller_row.is_trusted_seller, false) as is_trusted_seller,
    coalesce(nullif(btrim(seller_row.account_status), ''), 'active') as account_status,
    coalesce(product_row.is_approved, false) as is_approved,
    coalesce(product_row.stock_quantity, 0) as stock_quantity,
    product_row.deleted_at is not null as is_archived;
end;
$$;

revoke all on function public.get_flash_sale_eligibility(uuid) from public;
revoke all on function public.get_flash_sale_eligibility(uuid) from anon;
grant execute on function public.get_flash_sale_eligibility(uuid) to authenticated;

select public.refresh_all_seller_trust_metrics();
