create table if not exists public.support_tickets (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.users(id) on delete cascade,
  user_role text not null,
  issue_type text not null,
  subject text not null,
  message text not null,
  attachment_urls text[] not null default '{}',
  status text not null default 'open' check (status in ('open', 'in_progress', 'resolved')),
  admin_notes text,
  resolved_at timestamptz,
  resolved_by uuid references public.users(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table public.support_tickets enable row level security;

create policy "users can insert own support tickets"
on public.support_tickets
for insert
to authenticated
with check (auth.uid() = user_id);

create policy "users can view own support tickets"
on public.support_tickets
for select
to authenticated
using (
  auth.uid() = user_id
  or exists (
    select 1
    from public.users
    where users.id = auth.uid() and users.role = 'admin'
  )
);

create policy "admins can update support tickets"
on public.support_tickets
for update
to authenticated
using (
  exists (
    select 1
    from public.users
    where users.id = auth.uid() and users.role = 'admin'
  )
)
with check (
  exists (
    select 1
    from public.users
    where users.id = auth.uid() and users.role = 'admin'
  )
);

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'support-attachments',
  'support-attachments',
  true,
  10485760,
  array['image/png', 'image/jpeg', 'image/webp', 'application/pdf']
)
on conflict (id) do nothing;

create policy "users can upload own support attachments"
on storage.objects
for insert
to authenticated
with check (
  bucket_id = 'support-attachments'
  and (storage.foldername(name))[1] = auth.uid()::text
);

create policy "users can view own support attachments"
on storage.objects
for select
to authenticated
using (
  bucket_id = 'support-attachments'
  and (
    (storage.foldername(name))[1] = auth.uid()::text
    or exists (
      select 1
      from public.users
      where users.id = auth.uid() and users.role = 'admin'
    )
  )
);

create policy "admins can update support attachments"
on storage.objects
for update
to authenticated
using (
  bucket_id = 'support-attachments'
  and exists (
    select 1
    from public.users
    where users.id = auth.uid() and users.role = 'admin'
  )
)
with check (
  bucket_id = 'support-attachments'
  and exists (
    select 1
    from public.users
    where users.id = auth.uid() and users.role = 'admin'
  )
);

create policy "owners or admins can delete support attachments"
on storage.objects
for delete
to authenticated
using (
  bucket_id = 'support-attachments'
  and (
    (storage.foldername(name))[1] = auth.uid()::text
    or exists (
      select 1
      from public.users
      where users.id = auth.uid() and users.role = 'admin'
    )
  )
);
