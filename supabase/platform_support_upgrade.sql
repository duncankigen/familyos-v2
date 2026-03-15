-- ============================================================
-- FAMILYOS — PLATFORM ADMIN + SUPPORT UPGRADE
-- Adds:
--   - platform_admins
--   - support_tickets
--   - is_platform_admin()
--   - RLS policies for support and platform admin lookup
-- ============================================================

create table if not exists public.platform_admins (
  user_id uuid primary key references auth.users(id) on delete cascade,
  email text,
  display_name text,
  is_active boolean not null default true,
  created_by uuid references public.users(id) on delete set null,
  created_at timestamptz default now()
);

create table if not exists public.support_tickets (
  id uuid primary key default gen_random_uuid(),
  family_id uuid references public.families(id) on delete set null,
  submitted_by uuid not null references public.users(id) on delete cascade,
  category text not null,
  subject text not null,
  message text not null,
  status text not null default 'open',
  priority text not null default 'normal',
  page_context text,
  browser_context text,
  admin_notes text,
  resolved_at timestamptz,
  resolved_by uuid references public.users(id) on delete set null,
  created_at timestamptz default now(),
  updated_at timestamptz default now(),
  constraint support_ticket_category_check check (category in ('bug_report','account_issue','data_issue','feature_request','complaint','other')),
  constraint support_ticket_status_check check (status in ('open','in_progress','resolved','closed')),
  constraint support_ticket_priority_check check (priority in ('low','normal','high','urgent'))
);

create index if not exists support_tickets_submitted_by_idx
on public.support_tickets(submitted_by, created_at desc);

create index if not exists support_tickets_family_status_idx
on public.support_tickets(family_id, status, created_at desc);

create or replace function public.set_support_ticket_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

drop trigger if exists support_ticket_set_updated_at on public.support_tickets;
create trigger support_ticket_set_updated_at
before update on public.support_tickets
for each row execute procedure public.set_support_ticket_updated_at();

alter table public.platform_admins enable row level security;
alter table public.support_tickets enable row level security;

create or replace function public.is_platform_admin()
returns boolean
language sql stable
security definer
set search_path = public
as $$
  select exists (
    select 1
    from public.platform_admins
    where user_id = auth.uid()
      and is_active = true
  )
$$;

drop policy if exists "users read own platform admin row" on public.platform_admins;
create policy "users read own platform admin row"
on public.platform_admins for select
using (user_id = auth.uid());

drop policy if exists "platform admins read all platform admins" on public.platform_admins;
create policy "platform admins read all platform admins"
on public.platform_admins for select
using (public.is_platform_admin());

drop policy if exists "users read own support tickets" on public.support_tickets;
create policy "users read own support tickets"
on public.support_tickets for select
using (submitted_by = auth.uid());

drop policy if exists "users create own support tickets" on public.support_tickets;
create policy "users create own support tickets"
on public.support_tickets for insert
with check (
  submitted_by = auth.uid()
  and (family_id is null or family_id = public.get_my_family_id())
);

drop policy if exists "platform admins read all support tickets" on public.support_tickets;
create policy "platform admins read all support tickets"
on public.support_tickets for select
using (public.is_platform_admin());

drop policy if exists "platform admins update support tickets" on public.support_tickets;
create policy "platform admins update support tickets"
on public.support_tickets for update
using (public.is_platform_admin())
with check (public.is_platform_admin());

drop policy if exists "platform admins delete support tickets" on public.support_tickets;
create policy "platform admins delete support tickets"
on public.support_tickets for delete
using (public.is_platform_admin());

drop policy if exists "platform admins read families" on public.families;
create policy "platform admins read families"
on public.families for select
using (public.is_platform_admin());

drop policy if exists "platform admins update families" on public.families;
create policy "platform admins update families"
on public.families for update
using (public.is_platform_admin())
with check (public.is_platform_admin());

drop policy if exists "platform admins read users" on public.users;
create policy "platform admins read users"
on public.users for select
using (public.is_platform_admin());

drop policy if exists "platform admins update users" on public.users;
create policy "platform admins update users"
on public.users for update
using (public.is_platform_admin())
with check (public.is_platform_admin());

-- Seed your first superadmin manually after running this upgrade.
-- Example:
-- insert into public.platform_admins (user_id, email, display_name, is_active)
-- values ('YOUR-USER-ID-HERE', 'owner@example.com', 'System Owner', true)
-- on conflict (user_id) do update
-- set email = excluded.email,
--     display_name = excluded.display_name,
--     is_active = excluded.is_active;
