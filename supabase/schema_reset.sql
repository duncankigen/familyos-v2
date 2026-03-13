-- ============================================================
-- FAMILYOS - DESTRUCTIVE RESET
-- WARNING: This removes FamilyOS tables, policies, functions,
-- and triggers so you can rebuild from supabase/schema.sql.
-- ============================================================

drop trigger if exists on_auth_user_created on auth.users;

drop function if exists public.log_activity() cascade;
drop function if exists public.handle_new_user() cascade;
drop function if exists public.update_overdue_tasks() cascade;
drop function if exists public.get_overdue_tasks(uuid) cascade;
drop function if exists public.get_family_finance_summary(uuid) cascade;
drop function if exists public.accept_family_invite(text) cascade;
drop function if exists public.create_family_invite(text, text, int) cascade;
drop function if exists public.create_family_workspace(text, text) cascade;
drop function if exists public.ensure_my_profile() cascade;
drop function if exists public.get_my_profile() cascade;
drop function if exists public.get_my_role() cascade;
drop function if exists public.get_my_family_id() cascade;

drop table if exists public.activity_logs cascade;
drop table if exists public.ai_insights cascade;
drop table if exists public.notifications cascade;
drop table if exists public.documents cascade;
drop table if exists public.family_goals cascade;
drop table if exists public.vote_responses cascade;
drop table if exists public.votes cascade;
drop table if exists public.meetings cascade;
drop table if exists public.assets cascade;
drop table if exists public.vendors cascade;
drop table if exists public.tasks cascade;
drop table if exists public.livestock_events cascade;
drop table if exists public.livestock cascade;
drop table if exists public.farm_inputs cascade;
drop table if exists public.project_activities cascade;
drop table if exists public.farm_crops cascade;
drop table if exists public.project_members cascade;
drop table if exists public.projects cascade;
drop table if exists public.emergency_disbursements cascade;
drop table if exists public.emergency_fund cascade;
drop table if exists public.school_fees cascade;
drop table if exists public.students cascade;
drop table if exists public.payment_accounts cascade;
drop table if exists public.expenses cascade;
drop table if exists public.contributions cascade;
drop table if exists public.announcements cascade;
drop table if exists public.family_invites cascade;
drop table if exists public.user_skills cascade;
drop table if exists public.skills cascade;
drop table if exists public.users cascade;
drop table if exists public.families cascade;
