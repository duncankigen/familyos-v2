-- Scholarship override support for family workspaces.
-- Active scholarships behave like paid access until the scholarship end date.

alter table public.families
  add column if not exists scholarship_active boolean not null default false,
  add column if not exists scholarship_started_at timestamptz,
  add column if not exists scholarship_ends_at timestamptz,
  add column if not exists scholarship_note text,
  add column if not exists scholarship_granted_by uuid references public.users(id) on delete set null;

update public.families
set scholarship_active = coalesce(scholarship_active, false)
where scholarship_active is null;

notify pgrst, 'reload schema';
