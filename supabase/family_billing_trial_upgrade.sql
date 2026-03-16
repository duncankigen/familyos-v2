-- Workspace-level billing foundation for FamilyOS.
-- Existing families are marked active so current workspaces keep working.
-- New families created through create_family_workspace() start a 7-day trial.

alter table public.families
  add column if not exists billing_status text not null default 'active',
  add column if not exists billing_plan text not null default 'monthly',
  add column if not exists billing_currency text not null default 'KES',
  add column if not exists billing_country text not null default 'KE',
  add column if not exists trial_started_at timestamptz,
  add column if not exists trial_ends_at timestamptz,
  add column if not exists subscription_started_at timestamptz,
  add column if not exists subscription_ends_at timestamptz;

update public.families
set billing_status = coalesce(nullif(billing_status, ''), 'active'),
    billing_plan = coalesce(nullif(billing_plan, ''), 'monthly'),
    billing_currency = coalesce(nullif(billing_currency, ''), 'KES'),
    billing_country = coalesce(nullif(billing_country, ''), 'KE')
where billing_status is null
   or billing_status = ''
   or billing_plan is null
   or billing_plan = ''
   or billing_currency is null
   or billing_currency = ''
   or billing_country is null
   or billing_country = '';

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

  perform ensure_my_profile();

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

  insert into public.families (
    name,
    description,
    billing_status,
    billing_plan,
    billing_currency,
    billing_country,
    trial_started_at,
    trial_ends_at
  )
  values (
    trim(p_name),
    nullif(trim(coalesce(p_description, '')), ''),
    'trialing',
    'monthly',
    'KES',
    'KE',
    now(),
    now() + interval '7 days'
  )
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

notify pgrst, 'reload schema';
