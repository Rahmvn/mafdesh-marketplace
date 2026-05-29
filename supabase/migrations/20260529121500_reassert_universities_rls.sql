alter table if exists public.universities enable row level security;

drop policy if exists "universities are readable by everyone" on public.universities;
create policy "universities are readable by everyone"
on public.universities
for select
to anon, authenticated
using (is_active = true);
