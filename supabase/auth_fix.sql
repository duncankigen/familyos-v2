-- ============================================================
-- FAMILYOS - AUTH / PROFILE / FAMILY BOOTSTRAP FIX
-- Safe to run on an existing project
-- ============================================================

create extension if not exists "uuid-ossp";

drop trigger if exists on_auth_user_created on auth.users;
drop function if exists public.handle_new_user() cascade;
drop function if exists public.accept_family_invite(text) cascade;
drop function if exists public.create_family_invite(text, text, int) cascade;
drop function if exists public.create_family_workspace(text, text) cascade;
drop function if exists public.ensure_my_profile() cascade;
drop function if exists public.get_my_profile() cascade;
drop function if exists public.get_my_role() cascade;
drop function if exists public.get_my_family_id() cascade;

alter table public.users add column if not exists family_id uuid references public.families(id) on delete cascade;
alter table public.users add column if not exists first_name text;
alter table public.users add column if not exists last_name text;
alter table public.users add column if not exists full_name text;
alter table public.users add column if not exists phone text;
alter table public.users add column if not exists role text default 'member';
alter table public.users add column if not exists avatar_url text;
alter table public.users add column if not exists is_active boolean default true;
alter table public.users add column if not exists created_at timestamptz default now();

update public.users u
set
  first_name = coalesce(
    nullif(trim(u.first_name), ''),
    nullif(trim(a.raw_user_meta_data->>'first_name'), ''),
    nullif(split_part(coalesce(nullif(trim(u.full_name), ''), nullif(trim(a.raw_user_meta_data->>'full_name'), ''), split_part(a.email, '@', 1)), ' ', 1), '')
  ),
  last_name = coalesce(
    nullif(trim(u.last_name), ''),
    nullif(trim(a.raw_user_meta_data->>'last_name'), ''),
    nullif(trim(regexp_replace(coalesce(nullif(trim(u.full_name), ''), nullif(trim(a.raw_user_meta_data->>'full_name'), '')), '^\S+\s*', '')), '')
  ),
  full_name = coalesce(
    nullif(trim(u.full_name), ''),
    nullif(trim(concat_ws(' ', u.first_name, u.last_name)), ''),
    nullif(trim(concat_ws(' ', a.raw_user_meta_data->>'first_name', a.raw_user_meta_data->>'last_name')), ''),
    nullif(trim(a.raw_user_meta_data->>'full_name'), ''),
    nullif(split_part(a.email, '@', 1), ''),
    'New Member'
  ),
  role = coalesce(nullif(trim(u.role), ''), 'member'),
  is_active = coalesce(u.is_active, true),
  created_at = coalesce(u.created_at, now())
from auth.users a
where a.id = u.id
  and (
    u.first_name is null or trim(u.first_name) = ''
    or u.last_name is null or trim(u.last_name) = ''
    or
    u.full_name is null or trim(u.full_name) = ''
    or u.role is null or trim(u.role) = ''
    or u.is_active is null
    or u.created_at is null
  );

alter table public.users alter column full_name set not null;
alter table public.users alter column role set default 'member';
alter table public.users alter column role set not null;
alter table public.users alter column is_active set default true;
alter table public.users alter column created_at set default now();

do $$
begin
  if not exists (
    select 1
    from pg_constraint
    where conname = 'role_check'
      and conrelid = 'public.users'::regclass
  ) then
    alter table public.users
      add constraint role_check
      check (role in ('admin','treasurer','project_manager','member','youth'));
  end if;
end $$;

create table if not exists public.family_invites (
  id uuid primary key default uuid_generate_v4(),
  family_id uuid not null references public.families(id) on delete cascade,
  email text,
  role text not null default 'member',
  invite_code text not null unique,
  status text not null default 'pending',
  expires_at timestamptz,
  created_by uuid references public.users(id) on delete set null,
  accepted_by uuid references public.users(id) on delete set null,
  accepted_at timestamptz,
  created_at timestamptz default now(),
  constraint family_invites_role_check check (role in ('admin','treasurer','project_manager','member','youth')),
  constraint family_invites_status_check check (status in ('pending','accepted','revoked','expired'))
);

alter table public.family_invites add column if not exists family_id uuid references public.families(id) on delete cascade;
alter table public.family_invites add column if not exists email text;
alter table public.family_invites add column if not exists role text default 'member';
alter table public.family_invites add column if not exists invite_code text;
alter table public.family_invites add column if not exists status text default 'pending';
alter table public.family_invites add column if not exists expires_at timestamptz;
alter table public.family_invites add column if not exists created_by uuid references public.users(id) on delete set null;
alter table public.family_invites add column if not exists accepted_by uuid references public.users(id) on delete set null;
alter table public.family_invites add column if not exists accepted_at timestamptz;
alter table public.family_invites add column if not exists created_at timestamptz default now();

alter table public.family_invites alter column family_id set not null;
alter table public.family_invites alter column role set default 'member';
alter table public.family_invites alter column role set not null;
alter table public.family_invites alter column invite_code set not null;
alter table public.family_invites alter column status set default 'pending';
alter table public.family_invites alter column status set not null;

do $$
begin
  if not exists (
    select 1
    from pg_constraint
    where conname = 'family_invites_role_check'
      and conrelid = 'public.family_invites'::regclass
  ) then
    alter table public.family_invites
      add constraint family_invites_role_check
      check (role in ('admin','treasurer','project_manager','member','youth'));
  end if;

  if not exists (
    select 1
    from pg_constraint
    where conname = 'family_invites_status_check'
      and conrelid = 'public.family_invites'::regclass
  ) then
    alter table public.family_invites
      add constraint family_invites_status_check
      check (status in ('pending','accepted','revoked','expired'));
  end if;
end $$;

create unique index if not exists family_invites_invite_code_idx
on public.family_invites(invite_code);

create unique index if not exists emergency_fund_family_id_idx
on public.emergency_fund(family_id);

alter table public.users enable row level security;
alter table public.family_invites enable row level security;

create or replace function public.get_my_family_id()
returns uuid
language sql
stable
security definer
set search_path = public
as $$
  select family_id from public.users where id = auth.uid()
$$;

create or replace function public.get_my_role()
returns text
language sql
stable
security definer
set search_path = public
as $$
  select role from public.users where id = auth.uid()
$$;

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
    u.created_at
  from public.users u
  where u.id = auth.uid()
$$;

revoke all on function public.get_my_profile() from public;
grant execute on function public.get_my_profile() to authenticated;

create or replace function public.ensure_my_profile()
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_auth_user auth.users%rowtype;
begin
  if auth.uid() is null then
    raise exception 'Not authenticated';
  end if;

  select *
  into v_auth_user
  from auth.users
  where id = auth.uid();

  if v_auth_user.id is null then
    raise exception 'Authenticated user not found in auth.users';
  end if;

  insert into public.users (id, first_name, last_name, full_name, role, is_active)
  values (
    v_auth_user.id,
    nullif(trim(v_auth_user.raw_user_meta_data->>'first_name'), ''),
    nullif(trim(v_auth_user.raw_user_meta_data->>'last_name'), ''),
    coalesce(
      nullif(trim(concat_ws(' ', v_auth_user.raw_user_meta_data->>'first_name', v_auth_user.raw_user_meta_data->>'last_name')), ''),
      nullif(trim(v_auth_user.raw_user_meta_data->>'full_name'), ''),
      nullif(split_part(v_auth_user.email, '@', 1), ''),
      'New Member'
    ),
    'member',
    true
  )
  on conflict (id) do update
  set
    first_name = coalesce(nullif(excluded.first_name, ''), public.users.first_name),
    last_name = coalesce(nullif(excluded.last_name, ''), public.users.last_name),
    full_name = coalesce(nullif(excluded.full_name, ''), public.users.full_name),
    is_active = true;

  return v_auth_user.id;
end;
$$;

revoke all on function public.ensure_my_profile() from public;
grant execute on function public.ensure_my_profile() to authenticated;

create or replace function public.create_family_workspace(p_name text, p_description text default null)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_family_id uuid;
  v_existing_family_id uuid;
begin
  if auth.uid() is null then
    raise exception 'Not authenticated';
  end if;

  if coalesce(trim(p_name), '') = '' then
    raise exception 'Family name is required';
  end if;

  perform public.ensure_my_profile();

  select family_id
  into v_existing_family_id
  from public.users
  where id = auth.uid();

  if v_existing_family_id is not null then
    return v_existing_family_id;
  end if;

  insert into public.families (name, description)
  values (trim(p_name), nullif(trim(coalesce(p_description, '')), ''))
  returning id into v_family_id;

  update public.users
  set family_id = v_family_id,
      role = 'admin'
  where id = auth.uid();

  insert into public.emergency_fund (family_id, target_amount, current_amount)
  values (v_family_id, 300000, 0)
  on conflict (family_id) do nothing;

  return v_family_id;
end;
$$;

revoke all on function public.create_family_workspace(text, text) from public;
grant execute on function public.create_family_workspace(text, text) to authenticated;

create or replace function public.create_family_invite(
  p_email text default null,
  p_role text default 'member',
  p_days_valid int default 14
)
returns table (
  invite_id uuid,
  invite_code text,
  expires_at timestamptz
)
language plpgsql
security definer
set search_path = public
as $$
declare
  v_family_id uuid;
  v_user_role text;
  v_code text;
  v_expires_at timestamptz;
  v_invite_id uuid;
begin
  if auth.uid() is null then
    raise exception 'Not authenticated';
  end if;

  select family_id, role
  into v_family_id, v_user_role
  from public.users
  where id = auth.uid();

  if v_family_id is null then
    raise exception 'Create or join a family before inviting members';
  end if;

  if v_user_role <> 'admin' then
    raise exception 'Only admins can invite members';
  end if;

  if p_role not in ('admin','treasurer','project_manager','member','youth') then
    raise exception 'Invalid role';
  end if;

  v_expires_at := now() + make_interval(days => greatest(coalesce(p_days_valid, 14), 1));

  loop
    v_code := upper(substr(replace(uuid_generate_v4()::text, '-', ''), 1, 10));

    begin
      insert into public.family_invites (
        family_id, email, role, invite_code, status, expires_at, created_by
      )
      values (
        v_family_id,
        nullif(lower(trim(coalesce(p_email, ''))), ''),
        p_role,
        v_code,
        'pending',
        v_expires_at,
        auth.uid()
      )
      returning id into v_invite_id;

      exit;
    exception
      when unique_violation then
        null;
    end;
  end loop;

  return query
  select v_invite_id, v_code, v_expires_at;
end;
$$;

revoke all on function public.create_family_invite(text, text, int) from public;
grant execute on function public.create_family_invite(text, text, int) to authenticated;

create or replace function public.accept_family_invite(p_invite_code text)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_invite public.family_invites%rowtype;
  v_user auth.users%rowtype;
  v_existing_family_id uuid;
begin
  if auth.uid() is null then
    raise exception 'Not authenticated';
  end if;

  if coalesce(trim(p_invite_code), '') = '' then
    raise exception 'Invite code is required';
  end if;

  perform public.ensure_my_profile();

  select *
  into v_user
  from auth.users
  where id = auth.uid();

  select *
  into v_invite
  from public.family_invites
  where invite_code = upper(trim(p_invite_code))
    and status = 'pending'
  limit 1;

  if v_invite.id is null then
    raise exception 'Invite code not found';
  end if;

  if v_invite.expires_at is not null and v_invite.expires_at < now() then
    update public.family_invites
    set status = 'expired'
    where id = v_invite.id;
    raise exception 'Invite code has expired';
  end if;

  if v_invite.email is not null and lower(v_invite.email) <> lower(v_user.email) then
    raise exception 'This invite is for a different email address';
  end if;

  select family_id
  into v_existing_family_id
  from public.users
  where id = auth.uid();

  if v_existing_family_id is not null then
    return v_existing_family_id;
  end if;

  update public.users
  set family_id = v_invite.family_id,
      role = v_invite.role
  where id = auth.uid();

  update public.family_invites
  set status = 'accepted',
      accepted_by = auth.uid(),
      accepted_at = now()
  where id = v_invite.id;

  return v_invite.family_id;
end;
$$;

revoke all on function public.accept_family_invite(text) from public;
grant execute on function public.accept_family_invite(text) to authenticated;

create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into public.users (id, first_name, last_name, full_name, role)
  values (
    new.id,
    nullif(trim(new.raw_user_meta_data->>'first_name'), ''),
    nullif(trim(new.raw_user_meta_data->>'last_name'), ''),
    coalesce(
      nullif(trim(concat_ws(' ', new.raw_user_meta_data->>'first_name', new.raw_user_meta_data->>'last_name')), ''),
      nullif(trim(new.raw_user_meta_data->>'full_name'), ''),
      nullif(split_part(new.email, '@', 1), ''),
      'New Member'
    ),
    'member'
  )
  on conflict (id) do update
  set
    first_name = coalesce(nullif(excluded.first_name, ''), public.users.first_name),
    last_name = coalesce(nullif(excluded.last_name, ''), public.users.last_name),
    full_name = coalesce(nullif(excluded.full_name, ''), public.users.full_name);

  return new;
end;
$$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
  after insert on auth.users
  for each row execute procedure public.handle_new_user();

drop policy if exists "users read own profile" on public.users;
create policy "users read own profile"
on public.users for select
using (id = auth.uid());

drop policy if exists "admins read family invites" on public.family_invites;
create policy "admins read family invites"
on public.family_invites for select
using (
  family_id = public.get_my_family_id()
  and public.get_my_role() = 'admin'
);

drop policy if exists "admins create family invites" on public.family_invites;
create policy "admins create family invites"
on public.family_invites for insert
with check (
  family_id = public.get_my_family_id()
  and created_by = auth.uid()
  and public.get_my_role() = 'admin'
);

drop policy if exists "admins update family invites" on public.family_invites;
create policy "admins update family invites"
on public.family_invites for update
using (
  family_id = public.get_my_family_id()
  and public.get_my_role() = 'admin'
);
