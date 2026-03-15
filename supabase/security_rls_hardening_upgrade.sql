-- ============================================================
-- FAMILYOS - SECURITY RLS HARDENING
-- Tightens weak update policies to prevent cross-family writes
-- when callers know row IDs outside their own workspace.
-- ============================================================

drop policy if exists "authorized manage activities" on public.project_activities;
create policy "authorized manage activities"
on public.project_activities for update
using (
  project_id in (
    select id
    from public.projects
    where family_id = public.get_my_family_id()
  )
  and (created_by = auth.uid() or public.get_my_role() in ('admin','project_manager'))
)
with check (
  project_id in (
    select id
    from public.projects
    where family_id = public.get_my_family_id()
  )
  and (created_by = auth.uid() or public.get_my_role() in ('admin','project_manager'))
);

drop policy if exists "assigned user updates task status" on public.tasks;
create policy "assigned user updates task status"
on public.tasks for update
using (
  family_id = public.get_my_family_id()
  and (assigned_user = auth.uid() or public.get_my_role() in ('admin','project_manager'))
)
with check (
  family_id = public.get_my_family_id()
  and (assigned_user = auth.uid() or public.get_my_role() in ('admin','project_manager'))
);

drop policy if exists "authorized manage documents" on public.documents;
create policy "authorized manage documents"
on public.documents for update
using (
  family_id = public.get_my_family_id()
  and (uploaded_by = auth.uid() or public.get_my_role() in ('admin','treasurer'))
)
with check (
  family_id = public.get_my_family_id()
  and (uploaded_by = auth.uid() or public.get_my_role() in ('admin','treasurer'))
);
