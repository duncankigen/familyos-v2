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

drop policy if exists "authorized manage payment accounts" on public.payment_accounts;
create policy "authorized manage payment accounts"
on public.payment_accounts for all
using (
  family_id = public.get_my_family_id()
  and public.get_my_role() in ('admin','treasurer')
)
with check (
  family_id = public.get_my_family_id()
  and public.get_my_role() in ('admin','treasurer')
);

drop policy if exists "authorized manage students" on public.students;
create policy "authorized manage students"
on public.students for all
using (
  family_id = public.get_my_family_id()
  and public.get_my_role() in ('admin','treasurer')
)
with check (
  family_id = public.get_my_family_id()
  and public.get_my_role() in ('admin','treasurer')
);

drop policy if exists "authorized manage emergency fund" on public.emergency_fund;
create policy "authorized manage emergency fund"
on public.emergency_fund for all
using (
  family_id = public.get_my_family_id()
  and public.get_my_role() in ('admin','treasurer')
)
with check (
  family_id = public.get_my_family_id()
  and public.get_my_role() in ('admin','treasurer')
);

drop policy if exists "authorized manage disbursements" on public.emergency_disbursements;
create policy "authorized manage disbursements"
on public.emergency_disbursements for all
using (
  family_id = public.get_my_family_id()
  and public.get_my_role() in ('admin','treasurer')
)
with check (
  family_id = public.get_my_family_id()
  and public.get_my_role() in ('admin','treasurer')
);

drop policy if exists "authorized update projects" on public.projects;
create policy "authorized update projects"
on public.projects for update
using (
  family_id = public.get_my_family_id()
  and public.get_my_role() in ('admin','project_manager')
)
with check (
  family_id = public.get_my_family_id()
  and public.get_my_role() in ('admin','project_manager')
);

drop policy if exists "authorized manage project members" on public.project_members;
create policy "authorized manage project members"
on public.project_members for all
using (
  project_id in (
    select id
    from public.projects
    where family_id = public.get_my_family_id()
  )
  and public.get_my_role() in ('admin','project_manager')
)
with check (
  project_id in (
    select id
    from public.projects
    where family_id = public.get_my_family_id()
  )
  and public.get_my_role() in ('admin','project_manager')
);

drop policy if exists "authorized manage crops" on public.farm_crops;
create policy "authorized manage crops"
on public.farm_crops for all
using (
  project_id in (
    select id
    from public.projects
    where family_id = public.get_my_family_id()
  )
  and public.get_my_role() in ('admin','project_manager')
)
with check (
  project_id in (
    select id
    from public.projects
    where family_id = public.get_my_family_id()
  )
  and public.get_my_role() in ('admin','project_manager')
);

drop policy if exists "authorized manage farm inputs" on public.farm_inputs;
create policy "authorized manage farm inputs"
on public.farm_inputs for all
using (
  project_id in (
    select id
    from public.projects
    where family_id = public.get_my_family_id()
  )
  and public.get_my_role() in ('admin','project_manager')
)
with check (
  project_id in (
    select id
    from public.projects
    where family_id = public.get_my_family_id()
  )
  and public.get_my_role() in ('admin','project_manager')
);

drop policy if exists "authorized manage livestock" on public.livestock;
create policy "authorized manage livestock"
on public.livestock for all
using (
  project_id in (
    select id
    from public.projects
    where family_id = public.get_my_family_id()
  )
  and public.get_my_role() in ('admin','project_manager')
)
with check (
  project_id in (
    select id
    from public.projects
    where family_id = public.get_my_family_id()
  )
  and public.get_my_role() in ('admin','project_manager')
);

drop policy if exists "authorized manage livestock events" on public.livestock_events;
create policy "authorized manage livestock events"
on public.livestock_events for all
using (
  livestock_id in (
    select lv.id
    from public.livestock lv
    join public.projects p on lv.project_id = p.id
    where p.family_id = public.get_my_family_id()
  )
  and public.get_my_role() in ('admin','project_manager')
)
with check (
  livestock_id in (
    select lv.id
    from public.livestock lv
    join public.projects p on lv.project_id = p.id
    where p.family_id = public.get_my_family_id()
  )
  and public.get_my_role() in ('admin','project_manager')
);

drop policy if exists "authorized manage vendors" on public.vendors;
create policy "authorized manage vendors"
on public.vendors for all
using (
  family_id = public.get_my_family_id()
  and public.get_my_role() in ('admin','project_manager')
)
with check (
  family_id = public.get_my_family_id()
  and public.get_my_role() in ('admin','project_manager')
);

drop policy if exists "authorized manage assets" on public.assets;
create policy "authorized manage assets"
on public.assets for all
using (
  family_id = public.get_my_family_id()
  and public.get_my_role() in ('admin','treasurer')
)
with check (
  family_id = public.get_my_family_id()
  and public.get_my_role() in ('admin','treasurer')
);

drop policy if exists "authorized manage goals" on public.family_goals;
create policy "authorized manage goals"
on public.family_goals for all
using (
  family_id = public.get_my_family_id()
  and public.get_my_role() in ('admin','treasurer')
)
with check (
  family_id = public.get_my_family_id()
  and public.get_my_role() in ('admin','treasurer')
);

drop policy if exists "users update own notifications" on public.notifications;
create policy "users update own notifications"
on public.notifications for update
using (user_id = auth.uid())
with check (user_id = auth.uid());

drop policy if exists "system manages ai insights" on public.ai_insights;
create policy "system manages ai insights"
on public.ai_insights for all
using (
  family_id = public.get_my_family_id()
  and public.get_my_role() in ('admin')
)
with check (
  family_id = public.get_my_family_id()
  and public.get_my_role() in ('admin')
);
