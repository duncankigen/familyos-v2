-- ============================================================
-- FAMILYOS — INACTIVE ACCOUNT LOCKDOWN UPGRADE
-- Makes deactivation a real access block without changing
-- the normal flow for active users.
-- ============================================================

create or replace function public.get_my_family_id()
returns uuid
language sql stable
security definer
as $$
  select family_id
  from public.users
  where id = auth.uid()
    and is_active = true
$$;

create or replace function public.get_my_role()
returns text
language sql stable
security definer
as $$
  select role
  from public.users
  where id = auth.uid()
    and is_active = true
$$;

create or replace function public.is_platform_admin()
returns boolean
language sql stable
security definer
set search_path = public
as $$
  select exists (
    select 1
    from public.platform_admins
    join public.users on public.users.id = public.platform_admins.user_id
    where public.platform_admins.user_id = auth.uid()
      and public.platform_admins.is_active = true
      and public.users.is_active = true
  )
$$;

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
    full_name = coalesce(nullif(excluded.full_name, ''), public.users.full_name);

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
  v_is_active boolean;
begin
  if auth.uid() is null then
    raise exception 'Not authenticated';
  end if;

  if coalesce(trim(p_name), '') = '' then
    raise exception 'Family name is required';
  end if;

  perform public.ensure_my_profile();

  select is_active
  into v_is_active
  from public.users
  where id = auth.uid();

  if v_is_active is distinct from true then
    raise exception 'Your account is inactive. Contact your family admin or platform support.';
  end if;

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
  v_role text;
  v_is_active boolean;
  v_invite_id uuid;
  v_code text;
  v_expires_at timestamptz;
begin
  if auth.uid() is null then
    raise exception 'Not authenticated';
  end if;

  select family_id, role, is_active
  into v_family_id, v_role, v_is_active
  from public.users
  where id = auth.uid();

  if v_is_active is distinct from true then
    raise exception 'Your account is inactive. Contact your family admin or platform support.';
  end if;

  if v_family_id is null then
    raise exception 'Create your family workspace first';
  end if;

  if v_role <> 'admin' then
    raise exception 'Only admins can invite members';
  end if;

  if p_role not in ('admin','treasurer','project_manager','member','youth') then
    raise exception 'Invalid role';
  end if;

  v_expires_at := now() + make_interval(days => greatest(coalesce(p_days_valid, 14), 1));

  loop
    v_code := upper(substr(replace(gen_random_uuid()::text, '-', ''), 1, 10));

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
  v_is_active boolean;
begin
  if auth.uid() is null then
    raise exception 'Not authenticated';
  end if;

  if coalesce(trim(p_invite_code), '') = '' then
    raise exception 'Invite code is required';
  end if;

  perform public.ensure_my_profile();

  select is_active
  into v_is_active
  from public.users
  where id = auth.uid();

  if v_is_active is distinct from true then
    raise exception 'Your account is inactive. Contact your family admin or platform support.';
  end if;

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

drop policy if exists "user updates own profile" on public.users;
create policy "user updates own profile"
on public.users for update
using (id = auth.uid() and is_active = true)
with check (
  id = auth.uid()
  and family_id is not distinct from (select family_id from public.users where id = auth.uid())
  and role is not distinct from (select role from public.users where id = auth.uid())
  and is_active is not distinct from (select is_active from public.users where id = auth.uid())
);
