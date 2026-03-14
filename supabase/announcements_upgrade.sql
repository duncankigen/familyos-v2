alter table users add column if not exists last_announcements_seen_at timestamptz default now();

alter table announcements add column if not exists updated_at timestamptz default now();
alter table announcements add column if not exists is_pinned boolean not null default false;
alter table announcements add column if not exists is_archived boolean not null default false;
alter table announcements add column if not exists archived_at timestamptz;
alter table announcements add column if not exists archived_by uuid;

do $$
begin
  if not exists (
    select 1
    from pg_constraint
    where conname = 'announcements_archived_by_fkey'
      and conrelid = 'public.announcements'::regclass
  ) then
    alter table announcements
      add constraint announcements_archived_by_fkey
      foreign key (archived_by) references users(id) on delete set null;
  end if;
end $$;

update users
set last_announcements_seen_at = coalesce(last_announcements_seen_at, now())
where last_announcements_seen_at is null;

update announcements
set
  updated_at = coalesce(updated_at, created_at, now()),
  is_pinned = coalesce(is_pinned, false),
  is_archived = coalesce(is_archived, false)
where
  updated_at is null
  or is_pinned is null
  or is_archived is null;

create index if not exists announcements_family_feed_idx
on announcements(family_id, is_archived, is_pinned, created_at desc);

drop policy if exists "family reads announcements" on announcements;
drop policy if exists "admins write announcements" on announcements;
drop policy if exists "creator updates announcement" on announcements;
drop policy if exists "creator deletes announcement" on announcements;
drop policy if exists "team creates announcements" on announcements;
drop policy if exists "creators and admins update announcements" on announcements;
drop policy if exists "admins delete announcements" on announcements;

create policy "family reads announcements"
on announcements for select
using (family_id = get_my_family_id());

create policy "team creates announcements"
on announcements for insert
with check (family_id = get_my_family_id() and get_my_role() in ('admin','treasurer','project_manager'));

create policy "creators and admins update announcements"
on announcements for update
using (
  family_id = get_my_family_id()
  and (created_by = auth.uid() or get_my_role() = 'admin')
)
with check (
  family_id = get_my_family_id()
  and (created_by = auth.uid() or get_my_role() = 'admin')
);

create policy "admins delete announcements"
on announcements for delete
using (family_id = get_my_family_id() and get_my_role() = 'admin');
