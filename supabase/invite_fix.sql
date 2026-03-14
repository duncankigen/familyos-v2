create extension if not exists pgcrypto;

alter table public.family_invites
alter column id set default gen_random_uuid();

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

notify pgrst, 'reload schema';
