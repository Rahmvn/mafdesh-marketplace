-- Run this in Supabase SQL Editor if non-order admin actions fail with:
-- null value in column "order_id" of relation "admin_actions" violates not-null constraint

do $$
begin
  if exists (
    select 1
    from information_schema.columns
    where table_schema = 'public'
      and table_name = 'admin_actions'
      and column_name = 'order_id'
      and is_nullable = 'NO'
  ) then
    alter table public.admin_actions
      alter column order_id drop not null;
  end if;
end $$;

