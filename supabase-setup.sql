-- FUSE PREP v3 — paste the entire script in Supabase Dashboard > SQL Editor > New query > Run.
-- Do not expose your Supabase service_role/secret key in the app.

create table if not exists public.fuse_workspaces (
    user_id uuid primary key references auth.users(id) on delete cascade,
    content jsonb not null default '{}'::jsonb,
    updated_at timestamptz not null default now()
);

alter table public.fuse_workspaces enable row level security;
grant select, insert, update, delete on public.fuse_workspaces to authenticated;

drop policy if exists "fuse_owner_select" on public.fuse_workspaces;
drop policy if exists "fuse_owner_insert" on public.fuse_workspaces;
drop policy if exists "fuse_owner_update" on public.fuse_workspaces;
drop policy if exists "fuse_owner_delete" on public.fuse_workspaces;

create policy "fuse_owner_select" on public.fuse_workspaces
for select to authenticated using ((select auth.uid()) = user_id);
create policy "fuse_owner_insert" on public.fuse_workspaces
for insert to authenticated with check ((select auth.uid()) = user_id);
create policy "fuse_owner_update" on public.fuse_workspaces
for update to authenticated using ((select auth.uid()) = user_id)
with check ((select auth.uid()) = user_id);
create policy "fuse_owner_delete" on public.fuse_workspaces
for delete to authenticated using ((select auth.uid()) = user_id);

-- Public READ is necessary for image URLs in Whatnot CSV.
-- Only signed-in users can UPLOAD into their own account-ID folder.
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('fuse-images', 'fuse-images', true, 5242880, ARRAY['image/jpeg'])
on conflict (id) do update
set public = excluded.public,
    file_size_limit = excluded.file_size_limit,
    allowed_mime_types = excluded.allowed_mime_types;

drop policy if exists "fuse_photo_insert" on storage.objects;
create policy "fuse_photo_insert" on storage.objects
for insert to authenticated
with check (bucket_id = 'fuse-images'
 and (storage.foldername(name))[1] = (select auth.uid())::text);

-- Remote photos are intentionally not deleted automatically: deleting hosted
-- images would break Whatnot CSV links that have already been imported.
