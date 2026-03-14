-- ============================================================
-- FAMILYOS — COMPLETE SUPABASE BACKEND SCHEMA
-- Version 1.0 | Generated for production use
-- 
-- HOW TO USE:
-- 1. Go to your Supabase project → SQL Editor
-- 2. For a clean rebuild, run supabase/schema_reset.sql first
-- 3. Paste this entire file and click "Run"
-- 4. All tables, policies, functions, and triggers will be created
-- 5. Then open your FamilyOS app and sign in
-- ============================================================

-- Enable UUID extension
create extension if not exists "uuid-ossp";
create extension if not exists pgcrypto;

-- ============================================================
-- STEP 1: CORE IDENTITY TABLES
-- ============================================================

-- Families table
create table if not exists families (
  id uuid primary key default uuid_generate_v4(),
  name text not null,
  description text,
  motto text,
  created_at timestamptz default now()
);

-- Users / Profiles (linked to Supabase Auth)
create table if not exists users (
  id uuid primary key references auth.users(id) on delete cascade,
  family_id uuid references families(id) on delete cascade,
  first_name text,
  last_name text,
  full_name text not null,
  phone text,
  role text not null default 'member',
  avatar_url text,
  is_active boolean default true,
  last_announcements_seen_at timestamptz default now(),
  created_at timestamptz default now(),
  constraint role_check check (role in ('admin','treasurer','project_manager','member','youth'))
);

-- Repair/migrate existing projects where public.users was created earlier
-- with missing columns. `create table if not exists` does not alter old tables.
alter table public.users add column if not exists family_id uuid references families(id) on delete cascade;
alter table public.users add column if not exists first_name text;
alter table public.users add column if not exists last_name text;
alter table public.users add column if not exists full_name text;
alter table public.users add column if not exists phone text;
alter table public.users add column if not exists role text default 'member';
alter table public.users add column if not exists avatar_url text;
alter table public.users add column if not exists is_active boolean default true;
alter table public.users add column if not exists last_announcements_seen_at timestamptz default now();
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
  last_announcements_seen_at = coalesce(u.last_announcements_seen_at, now()),
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
    or u.last_announcements_seen_at is null
    or u.created_at is null
  );

alter table public.users alter column full_name set not null;
alter table public.users alter column role set default 'member';
alter table public.users alter column role set not null;
alter table public.users alter column is_active set default true;
alter table public.users alter column last_announcements_seen_at set default now();
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

-- Skills master list
create table if not exists skills (
  id uuid primary key default uuid_generate_v4(),
  name text not null unique
);

-- User skills (many-to-many)
create table if not exists user_skills (
  id uuid primary key default uuid_generate_v4(),
  user_id uuid references users(id) on delete cascade,
  skill_id uuid references skills(id) on delete cascade,
  unique(user_id, skill_id)
);

create table if not exists family_invites (
  id uuid primary key default gen_random_uuid(),
  family_id uuid not null references families(id) on delete cascade,
  email text,
  role text not null default 'member',
  invite_code text not null unique,
  status text not null default 'pending',
  expires_at timestamptz,
  created_by uuid references users(id) on delete set null,
  accepted_by uuid references users(id) on delete set null,
  accepted_at timestamptz,
  created_at timestamptz default now(),
  constraint family_invites_role_check check (role in ('admin','treasurer','project_manager','member','youth')),
  constraint family_invites_status_check check (status in ('pending','accepted','revoked','expired'))
);

-- ============================================================
-- STEP 2: ANNOUNCEMENTS
-- ============================================================

create table if not exists announcements (
  id uuid primary key default uuid_generate_v4(),
  family_id uuid references families(id) on delete cascade,
  title text not null,
  message text not null,
  created_by uuid references users(id),
  created_at timestamptz default now(),
  updated_at timestamptz default now(),
  is_pinned boolean not null default false,
  is_archived boolean not null default false,
  archived_at timestamptz,
  archived_by uuid references users(id) on delete set null
);

create index if not exists announcements_family_feed_idx
on announcements(family_id, is_archived, is_pinned, created_at desc);

-- ============================================================
-- STEP 3: FINANCE TABLES
-- ============================================================

-- Contributions
create table if not exists contributions (
  id uuid primary key default uuid_generate_v4(),
  family_id uuid references families(id) on delete cascade,
  user_id uuid references users(id),
  recorded_by uuid references users(id) on delete set null,
  amount numeric not null check (amount > 0),
  contribution_type text not null default 'general',
  reference text,
  notes text,
  created_at timestamptz default now(),
  updated_at timestamptz default now(),
  constraint contrib_type_check check (contribution_type in ('project','fees','emergency','general'))
);

-- Expenses
create table if not exists expenses (
  id uuid primary key default uuid_generate_v4(),
  family_id uuid references families(id) on delete cascade,
  project_id uuid,
  vendor_id uuid,
  amount numeric not null check (amount > 0),
  category text not null default 'other',
  description text not null,
  receipt_url text,
  reference text,
  notes text,
  attachment_name text,
  created_by uuid references users(id),
  created_at timestamptz default now(),
  updated_at timestamptz default now(),
  constraint expense_cat_check check (category in ('materials','labor','transport','equipment','services','other'))
);

-- Payment Accounts Registry
create table if not exists payment_accounts (
  id uuid primary key default uuid_generate_v4(),
  family_id uuid references families(id) on delete cascade,
  name text not null,
  account_type text not null,
  institution text,
  account_number text,
  reference_note text,
  linked_entity_type text,
  linked_entity_id uuid,
  created_at timestamptz default now(),
  constraint acct_type_check check (account_type in ('bank','mpesa_paybill','mpesa_till','mobile_money','other'))
);

-- ============================================================
-- STEP 4: SCHOOL FEES
-- ============================================================

create table if not exists students (
  id uuid primary key default uuid_generate_v4(),
  family_id uuid references families(id) on delete cascade,
  name text not null,
  school text not null,
  admission_number text,
  year_of_study text,
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);

create table if not exists school_fees (
  id uuid primary key default uuid_generate_v4(),
  student_id uuid references students(id) on delete cascade,
  family_id uuid references families(id) on delete cascade,
  term text not null,
  year int not null,
  total_fee numeric not null check (total_fee >= 0),
  paid_amount numeric not null default 0 check (paid_amount >= 0),
  due_date date,
  notes text,
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);

create table if not exists school_fee_payments (
  id uuid primary key default gen_random_uuid(),
  family_id uuid references families(id) on delete cascade,
  school_fee_id uuid not null references school_fees(id) on delete cascade,
  amount numeric not null check (amount > 0),
  payment_date date not null default current_date,
  reference text,
  notes text,
  attachment_url text,
  attachment_name text,
  payment_account_id uuid references payment_accounts(id) on delete set null,
  recorded_by uuid references users(id) on delete set null,
  created_at timestamptz default now()
);

create index if not exists school_fee_payments_family_date_idx
on school_fee_payments(family_id, payment_date desc, created_at desc);

create index if not exists school_fee_payments_fee_idx
on school_fee_payments(school_fee_id, payment_date desc, created_at desc);

-- ============================================================
-- STEP 5: EMERGENCY FUND
-- ============================================================

create table if not exists emergency_fund (
  id uuid primary key default uuid_generate_v4(),
  family_id uuid references families(id) on delete cascade,
  target_amount numeric not null default 300000,
  current_amount numeric not null default 0,
  updated_at timestamptz default now()
);

create unique index if not exists emergency_fund_family_id_idx
on emergency_fund(family_id);

create table if not exists emergency_disbursements (
  id uuid primary key default uuid_generate_v4(),
  family_id uuid references families(id) on delete cascade,
  event_description text not null,
  member_name text,
  amount numeric not null check (amount > 0),
  status text not null default 'pending',
  approved_by uuid references users(id),
  reference text,
  notes text,
  attachment_url text,
  attachment_name text,
  disbursed_at date,
  created_at timestamptz default now(),
  constraint disb_status_check check (status in ('pending','approved','rejected','disbursed'))
);

-- ============================================================
-- STEP 6: PROJECTS
-- ============================================================

create table if not exists projects (
  id uuid primary key default uuid_generate_v4(),
  family_id uuid references families(id) on delete cascade,
  name text not null,
  description text,
  project_type text not null default 'other',
  start_date date,
  end_date date,
  budget numeric default 0,
  status text not null default 'active',
  created_by uuid references users(id),
  created_at timestamptz default now(),
  constraint proj_type_check check (project_type in ('farming','construction','business','investment','other')),
  constraint proj_status_check check (status in ('planning','active','paused','completed','cancelled'))
);

create table if not exists project_members (
  id uuid primary key default uuid_generate_v4(),
  project_id uuid references projects(id) on delete cascade,
  user_id uuid references users(id) on delete cascade,
  role text not null default 'worker',
  unique(project_id, user_id),
  constraint pm_role_check check (role in ('leader','finance','worker','observer'))
);

-- ============================================================
-- STEP 7: FARMING MODULE
-- ============================================================

-- Farming sub-projects (crops)
create table if not exists farm_crops (
  id uuid primary key default uuid_generate_v4(),
  project_id uuid references projects(id) on delete cascade,
  crop_name text not null,
  acreage numeric,
  planting_date date,
  expected_harvest_date date,
  expected_yield text,
  actual_yield text,
  status text default 'growing',
  notes text,
  created_at timestamptz default now()
);

-- Project activities (farm actions, construction steps, etc)
create table if not exists project_activities (
  id uuid primary key default uuid_generate_v4(),
  project_id uuid references projects(id) on delete cascade,
  activity_type text not null,
  description text not null,
  activity_date date not null default current_date,
  cost numeric default 0,
  vendor_id uuid,
  created_by uuid references users(id),
  created_at timestamptz default now()
);

-- Farm inputs inventory
create table if not exists farm_inputs (
  id uuid primary key default uuid_generate_v4(),
  project_id uuid references projects(id) on delete cascade,
  name text not null,
  quantity numeric not null default 0,
  unit text not null default 'units',
  cost_per_unit numeric default 0,
  notes text,
  updated_at timestamptz default now(),
  created_at timestamptz default now()
);

-- Livestock
create table if not exists livestock (
  id uuid primary key default uuid_generate_v4(),
  project_id uuid references projects(id) on delete cascade,
  animal_type text not null,
  count int not null default 0,
  breed text,
  milk_production_daily numeric,
  feed_cost_weekly numeric,
  notes text,
  created_at timestamptz default now()
);

create table if not exists livestock_events (
  id uuid primary key default uuid_generate_v4(),
  livestock_id uuid references livestock(id) on delete cascade,
  event_type text not null,
  description text not null,
  event_date date not null default current_date,
  cost numeric default 0,
  count_change int default 0,
  created_at timestamptz default now(),
  constraint lse_type_check check (event_type in ('birth','vaccination','sale','death','breeding','treatment','other'))
);

create table if not exists farm_outputs (
  id uuid primary key default gen_random_uuid(),
  project_id uuid not null references projects(id) on delete cascade,
  crop_id uuid references farm_crops(id) on delete set null,
  livestock_id uuid references livestock(id) on delete set null,
  output_category text not null default 'other',
  quantity numeric not null check (quantity > 0),
  unit text not null default 'units',
  output_date date not null default current_date,
  usage_type text not null default 'other',
  unit_price numeric check (unit_price is null or unit_price >= 0),
  total_value numeric check (total_value is null or total_value >= 0),
  destination text,
  notes text,
  recorded_by uuid references users(id) on delete set null,
  created_at timestamptz default now(),
  constraint farm_output_category_check check (output_category in ('harvest','milk','eggs','honey','meat','animal_sale','other')),
  constraint farm_output_usage_check check (usage_type in ('sold','stored','consumed','distributed','seed','other'))
);

create index if not exists farm_outputs_project_date_idx
on farm_outputs(project_id, output_date desc, created_at desc);

create index if not exists farm_outputs_crop_idx
on farm_outputs(crop_id);

create index if not exists farm_outputs_livestock_idx
on farm_outputs(livestock_id);

-- ============================================================
-- STEP 8: TASKS
-- ============================================================

create table if not exists tasks (
  id uuid primary key default uuid_generate_v4(),
  family_id uuid references families(id) on delete cascade,
  project_id uuid references projects(id) on delete set null,
  title text not null,
  description text,
  assigned_user uuid references users(id) on delete set null,
  assigned_vendor uuid,
  status text not null default 'pending',
  priority text not null default 'medium',
  deadline date,
  completed_at timestamptz,
  created_by uuid references users(id),
  created_at timestamptz default now(),
  constraint task_status_check check (status in ('pending','in_progress','completed','overdue','cancelled')),
  constraint task_priority_check check (priority in ('low','medium','high','urgent'))
);

-- ============================================================
-- STEP 9: VENDORS / SERVICE PROVIDERS
-- ============================================================

create table if not exists vendors (
  id uuid primary key default uuid_generate_v4(),
  family_id uuid references families(id) on delete cascade,
  name text not null,
  category text not null,
  phone text,
  email text,
  rate numeric,
  rate_unit text,
  notes text,
  rating int check (rating between 1 and 5),
  total_jobs int default 0,
  total_paid numeric default 0,
  created_at timestamptz default now()
);

do $$
begin
  if not exists (
    select 1
    from pg_constraint
    where conname = 'expenses_project_id_fkey'
      and conrelid = 'public.expenses'::regclass
  ) then
    alter table public.expenses
      add constraint expenses_project_id_fkey
      foreign key (project_id) references public.projects(id) on delete set null;
  end if;
end $$;

do $$
begin
  if not exists (
    select 1
    from pg_constraint
    where conname = 'expenses_vendor_id_fkey'
      and conrelid = 'public.expenses'::regclass
  ) then
    alter table public.expenses
      add constraint expenses_vendor_id_fkey
      foreign key (vendor_id) references public.vendors(id) on delete set null;
  end if;
end $$;

-- ============================================================
-- STEP 10: ASSETS REGISTRY
-- ============================================================

create table if not exists assets (
  id uuid primary key default uuid_generate_v4(),
  family_id uuid references families(id) on delete cascade,
  name text not null,
  asset_type text not null,
  location text,
  estimated_value numeric,
  purchase_date date,
  monthly_income numeric default 0,
  manager_id uuid references users(id) on delete set null,
  notes text,
  created_at timestamptz default now(),
  constraint asset_type_check check (asset_type in ('land','building','vehicle','tractor','livestock','equipment','investment','other'))
);

-- ============================================================
-- STEP 11: MEETINGS & VOTING
-- ============================================================

create table if not exists meetings (
  id uuid primary key default uuid_generate_v4(),
  family_id uuid references families(id) on delete cascade,
  title text not null,
  agenda text,
  venue text,
  meeting_date timestamptz not null,
  minutes text,
  status text default 'scheduled',
  created_by uuid references users(id),
  created_at timestamptz default now(),
  constraint meeting_status_check check (status in ('scheduled','completed','cancelled'))
);

create table if not exists votes (
  id uuid primary key default uuid_generate_v4(),
  meeting_id uuid references meetings(id) on delete cascade,
  family_id uuid references families(id) on delete cascade,
  proposal text not null,
  description text,
  status text default 'open',
  deadline timestamptz,
  created_at timestamptz default now(),
  constraint vote_status_check check (status in ('open','closed','cancelled'))
);

create table if not exists vote_responses (
  id uuid primary key default uuid_generate_v4(),
  vote_id uuid references votes(id) on delete cascade,
  user_id uuid references users(id) on delete cascade,
  response text not null,
  created_at timestamptz default now(),
  unique(vote_id, user_id),
  constraint vr_response_check check (response in ('yes','no','abstain'))
);

-- ============================================================
-- STEP 12: GOALS
-- ============================================================

create table if not exists family_goals (
  id uuid primary key default uuid_generate_v4(),
  family_id uuid references families(id) on delete cascade,
  title text not null,
  description text,
  target_amount numeric not null check (target_amount > 0),
  current_amount numeric not null default 0 check (current_amount >= 0),
  deadline date,
  status text default 'active',
  created_at timestamptz default now(),
  constraint goal_status_check check (status in ('active','achieved','paused','cancelled'))
);

-- ============================================================
-- STEP 13: DOCUMENT VAULT
-- ============================================================

create table if not exists documents (
  id uuid primary key default uuid_generate_v4(),
  family_id uuid references families(id) on delete cascade,
  title text not null,
  file_url text,
  file_name text,
  file_size_kb int,
  category text not null default 'other',
  access_level text not null default 'members',
  uploaded_by uuid references users(id),
  created_at timestamptz default now(),
  constraint doc_cat_check check (category in ('land_title','certificate','contract','medical','financial','other')),
  constraint doc_access_check check (access_level in ('admins','members','all'))
);

-- ============================================================
-- STEP 14: NOTIFICATIONS
-- ============================================================

create table if not exists notifications (
  id uuid primary key default uuid_generate_v4(),
  user_id uuid references users(id) on delete cascade,
  family_id uuid references families(id) on delete cascade,
  title text not null,
  message text not null,
  type text default 'info',
  entity_type text,
  entity_id uuid,
  read boolean not null default false,
  created_at timestamptz default now(),
  constraint notif_type_check check (type in ('info','warning','alert','success'))
);

-- ============================================================
-- STEP 15: AI INSIGHTS
-- ============================================================

create table if not exists ai_insights (
  id uuid primary key default uuid_generate_v4(),
  family_id uuid references families(id) on delete cascade,
  insight_type text not null,
  title text not null,
  message text not null,
  severity text not null default 'info',
  is_read boolean default false,
  expires_at timestamptz,
  created_at timestamptz default now(),
  constraint ai_severity_check check (severity in ('info','warning','alert','success')),
  constraint ai_type_check check (insight_type in ('finance_alert','task_warning','farming_advice','planning_tip','goal_update','school_fees'))
);

-- ============================================================
-- STEP 16: ACTIVITY LOG (Audit Trail)
-- ============================================================

create table if not exists activity_logs (
  id uuid primary key default uuid_generate_v4(),
  family_id uuid references families(id) on delete cascade,
  user_id uuid references users(id) on delete set null,
  action text not null,
  entity_type text,
  entity_id uuid,
  details jsonb,
  created_at timestamptz default now()
);

-- ============================================================
-- STEP 17: ENABLE ROW LEVEL SECURITY ON ALL TABLES
-- ============================================================

alter table families enable row level security;
alter table users enable row level security;
alter table skills enable row level security;
alter table user_skills enable row level security;
alter table family_invites enable row level security;
alter table announcements enable row level security;
alter table contributions enable row level security;
alter table expenses enable row level security;
alter table payment_accounts enable row level security;
alter table students enable row level security;
alter table school_fees enable row level security;
alter table school_fee_payments enable row level security;
alter table emergency_fund enable row level security;
alter table emergency_disbursements enable row level security;
alter table projects enable row level security;
alter table project_members enable row level security;
alter table farm_crops enable row level security;
alter table project_activities enable row level security;
alter table farm_inputs enable row level security;
alter table livestock enable row level security;
alter table livestock_events enable row level security;
alter table farm_outputs enable row level security;
alter table tasks enable row level security;
alter table vendors enable row level security;
alter table assets enable row level security;
alter table meetings enable row level security;
alter table votes enable row level security;
alter table vote_responses enable row level security;
alter table family_goals enable row level security;
alter table documents enable row level security;
alter table notifications enable row level security;
alter table ai_insights enable row level security;
alter table activity_logs enable row level security;

-- ============================================================
-- STEP 18: HELPER FUNCTION — get current user's family_id
-- ============================================================

create or replace function get_my_family_id()
returns uuid
language sql stable
security definer
as $$
  select family_id from users where id = auth.uid()
$$;

create or replace function get_my_role()
returns text
language sql stable
security definer
as $$
  select role from users where id = auth.uid()
$$;

create or replace function get_my_profile()
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

revoke all on function get_my_profile() from public;
grant execute on function get_my_profile() to authenticated;

create or replace function ensure_my_profile()
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

revoke all on function ensure_my_profile() from public;
grant execute on function ensure_my_profile() to authenticated;

create or replace function create_family_workspace(p_name text, p_description text default null)
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

  perform ensure_my_profile();

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

revoke all on function create_family_workspace(text, text) from public;
grant execute on function create_family_workspace(text, text) to authenticated;

create or replace function create_family_invite(
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
  v_invite_id uuid;
  v_code text;
  v_expires_at timestamptz;
begin
  if auth.uid() is null then
    raise exception 'Not authenticated';
  end if;

  select family_id, role
  into v_family_id, v_role
  from public.users
  where id = auth.uid();

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

revoke all on function create_family_invite(text, text, int) from public;
grant execute on function create_family_invite(text, text, int) to authenticated;

create or replace function accept_family_invite(p_invite_code text)
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

  perform ensure_my_profile();

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

revoke all on function accept_family_invite(text) from public;
grant execute on function accept_family_invite(text) to authenticated;

-- ============================================================
-- STEP 19: RLS POLICIES
-- ============================================================

-- FAMILIES: members can read their own family
create policy "members read own family"
on families for select
using (id = get_my_family_id());

create policy "admins update family"
on families for update
using (id = get_my_family_id() and get_my_role() in ('admin'));

-- USERS: family members can see each other
create policy "users read own profile"
on users for select
using (id = auth.uid());

create policy "family members see each other"
on users for select
using (family_id = get_my_family_id());

create policy "user updates own profile"
on users for update
using (id = auth.uid());

create policy "admins manage members"
on users for all
using (family_id = get_my_family_id() and get_my_role() = 'admin');

-- SKILLS: readable by all authenticated users
create policy "skills readable by all"
on skills for select
using (auth.uid() is not null);

-- USER_SKILLS: family members can see each other's skills
create policy "family sees skills"
on user_skills for select
using (user_id in (select id from users where family_id = get_my_family_id()));

create policy "user manages own skills"
on user_skills for all
using (user_id = auth.uid());

create policy "admins manage family member skills"
on user_skills for all
using (
  user_id in (select id from users where family_id = get_my_family_id())
  and get_my_role() = 'admin'
)
with check (
  user_id in (select id from users where family_id = get_my_family_id())
  and get_my_role() = 'admin'
);

create policy "admins read family invites"
on family_invites for select
using (
  family_id = get_my_family_id()
  and get_my_role() = 'admin'
);

create policy "admins create family invites"
on family_invites for insert
with check (
  family_id = get_my_family_id()
  and created_by = auth.uid()
  and get_my_role() = 'admin'
);

create policy "admins update family invites"
on family_invites for update
using (
  family_id = get_my_family_id()
  and get_my_role() = 'admin'
);

-- ANNOUNCEMENTS: family members read; admins/managers write
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

-- CONTRIBUTIONS: all family members can read; treasurer/admin can write
create policy "family reads contributions"
on contributions for select
using (family_id = get_my_family_id());

create policy "members record own contributions"
on contributions for insert
with check (family_id = get_my_family_id() and user_id = auth.uid());

create policy "finance team records contributions"
on contributions for insert
with check (family_id = get_my_family_id() and get_my_role() in ('admin','treasurer'));

create policy "treasurer manages contributions"
on contributions for update
using (family_id = get_my_family_id() and get_my_role() in ('admin','treasurer'))
with check (family_id = get_my_family_id() and get_my_role() in ('admin','treasurer'));

-- EXPENSES: all family members can read; treasurer/project_manager can write
create policy "family reads expenses"
on expenses for select
using (family_id = get_my_family_id());

create policy "authorized members add expenses"
on expenses for insert
with check (family_id = get_my_family_id() and get_my_role() in ('admin','treasurer','project_manager'));

create policy "authorized members update expenses"
on expenses for update
using (family_id = get_my_family_id() and get_my_role() in ('admin','treasurer'))
with check (family_id = get_my_family_id() and get_my_role() in ('admin','treasurer'));

-- PAYMENT ACCOUNTS: read all family; admin/treasurer manage
create policy "family reads payment accounts"
on payment_accounts for select
using (family_id = get_my_family_id());

create policy "authorized manage payment accounts"
on payment_accounts for all
using (family_id = get_my_family_id() and get_my_role() in ('admin','treasurer'));

-- STUDENTS: all family members can read
create policy "family reads students"
on students for select
using (family_id = get_my_family_id());

create policy "authorized manage students"
on students for all
using (family_id = get_my_family_id() and get_my_role() in ('admin','treasurer'));

-- SCHOOL FEES: all family members can read
create policy "family reads school fees"
on school_fees for select
using (family_id = get_my_family_id());

create policy "authorized manage school fees"
on school_fees for all
using (family_id = get_my_family_id() and get_my_role() in ('admin','treasurer'))
with check (
  family_id = get_my_family_id()
  and get_my_role() in ('admin','treasurer')
  and student_id in (
    select id from students where family_id = get_my_family_id()
  )
);

create policy "family reads school fee payments"
on school_fee_payments for select
using (family_id = get_my_family_id());

create policy "authorized manage school fee payments"
on school_fee_payments for all
using (family_id = get_my_family_id() and get_my_role() in ('admin','treasurer'))
with check (
  family_id = get_my_family_id()
  and get_my_role() in ('admin','treasurer')
  and school_fee_id in (
    select id from school_fees where family_id = get_my_family_id()
  )
  and (
    payment_account_id is null
    or payment_account_id in (
      select id from payment_accounts where family_id = get_my_family_id()
    )
  )
);

-- EMERGENCY FUND
create policy "family reads emergency fund"
on emergency_fund for select
using (family_id = get_my_family_id());

create policy "authorized manage emergency fund"
on emergency_fund for all
using (family_id = get_my_family_id() and get_my_role() in ('admin','treasurer'));

create policy "family reads disbursements"
on emergency_disbursements for select
using (family_id = get_my_family_id());

create policy "authorized manage disbursements"
on emergency_disbursements for all
using (family_id = get_my_family_id() and get_my_role() in ('admin','treasurer'));

-- PROJECTS: all family members can read; pm/admin can write
create policy "family reads projects"
on projects for select
using (family_id = get_my_family_id());

create policy "authorized create projects"
on projects for insert
with check (family_id = get_my_family_id() and get_my_role() in ('admin','project_manager'));

create policy "authorized update projects"
on projects for update
using (family_id = get_my_family_id() and get_my_role() in ('admin','project_manager'));

-- PROJECT MEMBERS
create policy "family reads project members"
on project_members for select
using (project_id in (select id from projects where family_id = get_my_family_id()));

create policy "authorized manage project members"
on project_members for all
using (project_id in (select id from projects where family_id = get_my_family_id())
  and get_my_role() in ('admin','project_manager'));

-- FARM CROPS
create policy "family reads crops"
on farm_crops for select
using (project_id in (select id from projects where family_id = get_my_family_id()));

create policy "authorized manage crops"
on farm_crops for all
using (project_id in (select id from projects where family_id = get_my_family_id())
  and get_my_role() in ('admin','project_manager'));

-- PROJECT ACTIVITIES
create policy "family reads activities"
on project_activities for select
using (project_id in (select id from projects where family_id = get_my_family_id()));

create policy "authorized add activities"
on project_activities for insert
with check (project_id in (select id from projects where family_id = get_my_family_id()));

create policy "authorized manage activities"
on project_activities for update
using (created_by = auth.uid() or get_my_role() in ('admin','project_manager'));

-- FARM INPUTS
create policy "family reads farm inputs"
on farm_inputs for select
using (project_id in (select id from projects where family_id = get_my_family_id()));

create policy "authorized manage farm inputs"
on farm_inputs for all
using (project_id in (select id from projects where family_id = get_my_family_id())
  and get_my_role() in ('admin','project_manager'));

-- LIVESTOCK
create policy "family reads livestock"
on livestock for select
using (project_id in (select id from projects where family_id = get_my_family_id()));

create policy "authorized manage livestock"
on livestock for all
using (project_id in (select id from projects where family_id = get_my_family_id())
  and get_my_role() in ('admin','project_manager'));

create policy "family reads livestock events"
on livestock_events for select
using (livestock_id in (
  select lv.id from livestock lv
  join projects p on lv.project_id = p.id
  where p.family_id = get_my_family_id()
));

create policy "authorized manage livestock events"
on livestock_events for all
using (livestock_id in (
  select lv.id from livestock lv
  join projects p on lv.project_id = p.id
  where p.family_id = get_my_family_id()
) and get_my_role() in ('admin','project_manager'));

create policy "family reads farm outputs"
on farm_outputs for select
using (project_id in (select id from projects where family_id = get_my_family_id()));

create policy "authorized manage farm outputs"
on farm_outputs for all
using (
  project_id in (select id from projects where family_id = get_my_family_id())
  and get_my_role() in ('admin','project_manager')
)
with check (
  project_id in (select id from projects where family_id = get_my_family_id())
  and get_my_role() in ('admin','project_manager')
);

-- TASKS: all family members can read; assigned user can update own tasks
create policy "family reads tasks"
on tasks for select
using (family_id = get_my_family_id());

create policy "authorized create tasks"
on tasks for insert
with check (family_id = get_my_family_id() and get_my_role() in ('admin','project_manager','treasurer'));

create policy "assigned user updates task status"
on tasks for update
using (assigned_user = auth.uid() or get_my_role() in ('admin','project_manager'));

-- VENDORS
create policy "family reads vendors"
on vendors for select
using (family_id = get_my_family_id());

create policy "authorized manage vendors"
on vendors for all
using (family_id = get_my_family_id() and get_my_role() in ('admin','project_manager'));

-- ASSETS
create policy "family reads assets"
on assets for select
using (family_id = get_my_family_id());

create policy "authorized manage assets"
on assets for all
using (family_id = get_my_family_id() and get_my_role() in ('admin','treasurer'));

-- MEETINGS: all family can read; admin can manage
create policy "family reads meetings"
on meetings for select
using (family_id = get_my_family_id());

create policy "admins manage meetings"
on meetings for all
using (family_id = get_my_family_id() and get_my_role() in ('admin'));

-- VOTES: all family can read/respond
create policy "family reads votes"
on votes for select
using (family_id = get_my_family_id());

create policy "admins manage votes"
on votes for all
using (family_id = get_my_family_id() and get_my_role() in ('admin'));

create policy "family reads vote responses"
on vote_responses for select
using (vote_id in (select id from votes where family_id = get_my_family_id()));

create policy "members vote"
on vote_responses for insert
with check (
  vote_id in (select id from votes where family_id = get_my_family_id() and status = 'open')
  and user_id = auth.uid()
);

-- FAMILY GOALS: all can read; admin manages
create policy "family reads goals"
on family_goals for select
using (family_id = get_my_family_id());

create policy "authorized manage goals"
on family_goals for all
using (family_id = get_my_family_id() and get_my_role() in ('admin','treasurer'));

-- DOCUMENTS: access_level enforcement
create policy "members read member-level docs"
on documents for select
using (
  family_id = get_my_family_id()
  and (
    access_level = 'members'
    or access_level = 'all'
    or (access_level = 'admins' and get_my_role() = 'admin')
  )
);

create policy "authorized upload documents"
on documents for insert
with check (family_id = get_my_family_id() and get_my_role() in ('admin','treasurer'));

create policy "authorized manage documents"
on documents for update
using (uploaded_by = auth.uid() or get_my_role() = 'admin');

-- NOTIFICATIONS: users read own notifications
create policy "users read own notifications"
on notifications for select
using (user_id = auth.uid());

create policy "system creates notifications"
on notifications for insert
with check (family_id = get_my_family_id());

create policy "users update own notifications"
on notifications for update
using (user_id = auth.uid());

-- AI INSIGHTS: all family members can read
create policy "family reads ai insights"
on ai_insights for select
using (family_id = get_my_family_id());

create policy "system manages ai insights"
on ai_insights for all
using (family_id = get_my_family_id() and get_my_role() in ('admin'));

-- ACTIVITY LOGS: all family members can read
create policy "family reads activity logs"
on activity_logs for select
using (family_id = get_my_family_id());

create policy "system writes activity logs"
on activity_logs for insert
with check (family_id = get_my_family_id());

-- ============================================================
-- STEP 20: USEFUL DATABASE FUNCTIONS
-- ============================================================

-- Get family finance summary
create or replace function get_family_finance_summary(p_family_id uuid)
returns table (
  total_contributions numeric,
  total_expenses numeric,
  balance numeric,
  this_month_contributions numeric,
  this_month_expenses numeric,
  emergency_fund_balance numeric
)
language sql stable security definer
as $$
  select
    coalesce((select sum(amount) from contributions where family_id = p_family_id), 0) as total_contributions,
    coalesce((select sum(amount) from expenses where family_id = p_family_id), 0) as total_expenses,
    coalesce((select sum(amount) from contributions where family_id = p_family_id), 0) -
    coalesce((select sum(amount) from expenses where family_id = p_family_id), 0) as balance,
    coalesce((select sum(amount) from contributions
      where family_id = p_family_id
      and date_trunc('month', created_at) = date_trunc('month', now())), 0) as this_month_contributions,
    coalesce((select sum(amount) from expenses
      where family_id = p_family_id
      and date_trunc('month', created_at) = date_trunc('month', now())), 0) as this_month_expenses,
    coalesce((select current_amount from emergency_fund where family_id = p_family_id limit 1), 0) as emergency_fund_balance
$$;

-- Get overdue tasks count
create or replace function get_overdue_tasks(p_family_id uuid)
returns bigint
language sql stable security definer
as $$
  select count(*) from tasks
  where family_id = p_family_id
  and status not in ('completed','cancelled')
  and deadline < current_date
$$;

-- Auto-update task status to overdue
create or replace function update_overdue_tasks()
returns void
language sql security definer
as $$
  update tasks
  set status = 'overdue'
  where status in ('pending','in_progress')
  and deadline < current_date;
$$;

create or replace function sync_school_fee_paid_amount()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if tg_op = 'INSERT' then
    update public.school_fees
    set paid_amount = coalesce(paid_amount, 0) + coalesce(new.amount, 0),
        updated_at = now()
    where id = new.school_fee_id;
    return new;
  end if;

  if tg_op = 'UPDATE' then
    if old.school_fee_id = new.school_fee_id then
      update public.school_fees
      set paid_amount = greatest(0, coalesce(paid_amount, 0) - coalesce(old.amount, 0) + coalesce(new.amount, 0)),
          updated_at = now()
      where id = new.school_fee_id;
    else
      update public.school_fees
      set paid_amount = greatest(0, coalesce(paid_amount, 0) - coalesce(old.amount, 0)),
          updated_at = now()
      where id = old.school_fee_id;

      update public.school_fees
      set paid_amount = coalesce(paid_amount, 0) + coalesce(new.amount, 0),
          updated_at = now()
      where id = new.school_fee_id;
    end if;
    return new;
  end if;

  update public.school_fees
  set paid_amount = greatest(0, coalesce(paid_amount, 0) - coalesce(old.amount, 0)),
      updated_at = now()
  where id = old.school_fee_id;
  return old;
end;
$$;

-- ============================================================
-- STEP 21: TRIGGERS
-- ============================================================

-- Auto-create user profile on signup
create or replace function handle_new_user()
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
  for each row execute procedure handle_new_user();

-- Log activity on key events
create or replace function log_activity()
returns trigger language plpgsql security definer
as $$
begin
  insert into activity_logs (family_id, user_id, action, entity_type, entity_id)
  values (
    coalesce(new.family_id, (select family_id from users where id = auth.uid())),
    auth.uid(),
    tg_op,
    tg_table_name,
    new.id
  );
  return new;
end;
$$;

-- Apply activity logging trigger
create trigger log_contributions after insert on contributions
  for each row execute procedure log_activity();

create trigger log_expenses after insert on expenses
  for each row execute procedure log_activity();

create trigger log_school_fee_payments after insert on school_fee_payments
  for each row execute procedure log_activity();

create trigger log_tasks after insert on tasks
  for each row execute procedure log_activity();

create trigger log_projects after insert on projects
  for each row execute procedure log_activity();

create trigger log_farm_outputs after insert on farm_outputs
  for each row execute procedure log_activity();

drop trigger if exists school_fee_payment_totals on school_fee_payments;
create trigger school_fee_payment_totals
  after insert or update or delete on school_fee_payments
  for each row execute procedure sync_school_fee_paid_amount();

-- ============================================================
-- STEP 22: SEED DEFAULT SKILLS DATA
-- ============================================================

insert into skills (name) values
  ('Farming'),
  ('Accounting'),
  ('Construction'),
  ('Mechanic'),
  ('Driver'),
  ('Carpentry'),
  ('Plumbing'),
  ('Electrical'),
  ('IT/Technology'),
  ('Teaching'),
  ('Medical/Health'),
  ('Business Management'),
  ('Legal'),
  ('Marketing'),
  ('Photography')
on conflict (name) do nothing;

-- ============================================================
-- SETUP COMPLETE
-- 
-- NEXT STEPS:
-- 1. In Supabase Dashboard → Authentication → Settings:
--    - Enable email/password sign ups
--    - Optionally enable phone OTP for mobile users
-- 
-- 2. In Supabase Storage → Create buckets:
--    - "documents" (for vault files) — set RLS: authenticated users
--    - "receipts" (for expense receipts)
--    - "avatars" (for user profile photos)
-- 
-- 3. After first user signs up:
--    - Sign in through the app
--    - Choose "Create Family" during onboarding
--    - Additional members can join with invite codes created from Members -> Invite Member
-- 
-- 4. For AI Advisor:
--    - Deploy Supabase Edge Function "ai-advisor"
--    - Set ANTHROPIC_API_KEY in Supabase secrets
--    - See AI setup instructions in the app
-- ============================================================
