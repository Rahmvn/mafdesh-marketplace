alter table public.products
  add column if not exists deleted_at timestamptz,
  add column if not exists deleted_by_admin_id uuid references public.users(id) on delete set null,
  add column if not exists deletion_reason text;

create index if not exists products_deleted_at_idx
  on public.products (deleted_at);

create or replace function public.prevent_hard_delete_products()
returns trigger
language plpgsql
as $$
begin
  raise exception 'Hard deleting products is disabled. Archive the product instead.';
end;
$$;

drop trigger if exists products_prevent_hard_delete on public.products;
create trigger products_prevent_hard_delete
before delete on public.products
for each row
execute function public.prevent_hard_delete_products();
