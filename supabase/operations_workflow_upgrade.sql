create extension if not exists pgcrypto;

alter table public.assets
  add column if not exists attachment_url text,
  add column if not exists attachment_name text;

create table if not exists public.task_comments (
  id uuid primary key default gen_random_uuid(),
  task_id uuid not null references public.tasks(id) on delete cascade,
  family_id uuid not null references public.families(id) on delete cascade,
  user_id uuid not null references public.users(id) on delete cascade,
  comment text not null,
  created_at timestamptz default now()
);

create index if not exists task_comments_task_created_idx
on public.task_comments(task_id, created_at desc);

alter table public.task_comments enable row level security;

drop policy if exists "family reads task comments" on public.task_comments;
drop policy if exists "family members add task comments" on public.task_comments;

create policy "family reads task comments"
on public.task_comments for select
using (family_id = public.get_my_family_id());

create policy "family members add task comments"
on public.task_comments for insert
with check (
  family_id = public.get_my_family_id()
  and user_id = auth.uid()
  and task_id in (
    select id from public.tasks where family_id = public.get_my_family_id()
  )
);

create or replace function public.sync_livestock_count_from_events()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if tg_op = 'INSERT' then
    update public.livestock
    set count = greatest(0, coalesce(count, 0) + coalesce(new.count_change, 0))
    where id = new.livestock_id;
    return new;
  end if;

  if tg_op = 'UPDATE' then
    if old.livestock_id = new.livestock_id then
      update public.livestock
      set count = greatest(0, coalesce(count, 0) - coalesce(old.count_change, 0) + coalesce(new.count_change, 0))
      where id = new.livestock_id;
    else
      update public.livestock
      set count = greatest(0, coalesce(count, 0) - coalesce(old.count_change, 0))
      where id = old.livestock_id;

      update public.livestock
      set count = greatest(0, coalesce(count, 0) + coalesce(new.count_change, 0))
      where id = new.livestock_id;
    end if;
    return new;
  end if;

  update public.livestock
  set count = greatest(0, coalesce(count, 0) - coalesce(old.count_change, 0))
  where id = old.livestock_id;
  return old;
end;
$$;

drop trigger if exists sync_livestock_count on public.livestock_events;
create trigger sync_livestock_count
  after insert or update or delete on public.livestock_events
  for each row execute procedure public.sync_livestock_count_from_events();

drop policy if exists "Authenticated users upload finance attachments" on storage.objects;
drop policy if exists "Authenticated users update finance attachments" on storage.objects;
drop policy if exists "Authenticated users delete finance attachments" on storage.objects;

create policy "Authenticated users upload finance attachments"
on storage.objects
for insert
to authenticated
with check (
  bucket_id = 'receipts'
  and (storage.foldername(name))[1] in ('expenses', 'emergency', 'school-fees', 'assets')
  and (storage.foldername(name))[2] = public.get_my_family_id()::text
);

create policy "Authenticated users update finance attachments"
on storage.objects
for update
to authenticated
using (
  bucket_id = 'receipts'
  and (storage.foldername(name))[1] in ('expenses', 'emergency', 'school-fees', 'assets')
  and (storage.foldername(name))[2] = public.get_my_family_id()::text
)
with check (
  bucket_id = 'receipts'
  and (storage.foldername(name))[1] in ('expenses', 'emergency', 'school-fees', 'assets')
  and (storage.foldername(name))[2] = public.get_my_family_id()::text
);

create policy "Authenticated users delete finance attachments"
on storage.objects
for delete
to authenticated
using (
  bucket_id = 'receipts'
  and (storage.foldername(name))[1] in ('expenses', 'emergency', 'school-fees', 'assets')
  and (storage.foldername(name))[2] = public.get_my_family_id()::text
);

notify pgrst, 'reload schema';
