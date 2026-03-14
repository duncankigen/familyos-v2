alter table public.users add column if not exists last_announcements_seen_at timestamptz default now();
alter table public.users add column if not exists last_tasks_seen_at timestamptz default now();
alter table public.users add column if not exists last_meetings_seen_at timestamptz default now();
alter table public.users add column if not exists last_goals_seen_at timestamptz default now();
alter table public.users add column if not exists last_ai_seen_at timestamptz default now();

update public.users
set
  last_announcements_seen_at = coalesce(last_announcements_seen_at, now()),
  last_tasks_seen_at = coalesce(last_tasks_seen_at, now()),
  last_meetings_seen_at = coalesce(last_meetings_seen_at, now()),
  last_goals_seen_at = coalesce(last_goals_seen_at, now()),
  last_ai_seen_at = coalesce(last_ai_seen_at, now())
where
  last_announcements_seen_at is null
  or last_tasks_seen_at is null
  or last_meetings_seen_at is null
  or last_goals_seen_at is null
  or last_ai_seen_at is null;

alter table public.users alter column last_announcements_seen_at set default now();
alter table public.users alter column last_tasks_seen_at set default now();
alter table public.users alter column last_meetings_seen_at set default now();
alter table public.users alter column last_goals_seen_at set default now();
alter table public.users alter column last_ai_seen_at set default now();

create or replace function public.get_my_profile()
returns table (
  id uuid,
  family_id uuid,
  first_name text,
  last_name text,
  full_name text,
  phone text,
  role text,
  avatar_url text,
  is_active boolean,
  last_announcements_seen_at timestamptz,
  last_tasks_seen_at timestamptz,
  last_meetings_seen_at timestamptz,
  last_goals_seen_at timestamptz,
  last_ai_seen_at timestamptz,
  created_at timestamptz
)
language sql
stable
security definer
set search_path = public
as $$
  select
    u.id,
    u.family_id,
    u.first_name,
    u.last_name,
    u.full_name,
    u.phone,
    u.role,
    u.avatar_url,
    u.is_active,
    u.last_announcements_seen_at,
    u.last_tasks_seen_at,
    u.last_meetings_seen_at,
    u.last_goals_seen_at,
    u.last_ai_seen_at,
    u.created_at
  from public.users u
  where u.id = auth.uid()
$$;

revoke all on function public.get_my_profile() from public;
grant execute on function public.get_my_profile() to authenticated;

notify pgrst, 'reload schema';
