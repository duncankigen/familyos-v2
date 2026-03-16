alter table public.contributions
  add column if not exists project_id uuid;

update public.contributions c
set project_id = null
where project_id is not null
  and not exists (
    select 1
    from public.projects p
    where p.id = c.project_id
  );

do $$
begin
  if not exists (
    select 1
    from pg_constraint
    where conname = 'contributions_project_id_fkey'
      and conrelid = 'public.contributions'::regclass
  ) then
    alter table public.contributions
      add constraint contributions_project_id_fkey
      foreign key (project_id) references public.projects(id) on delete set null;
  end if;
end $$;

create index if not exists contributions_family_project_idx
on public.contributions(family_id, project_id, created_at desc);

drop policy if exists "members record own contributions" on public.contributions;
drop policy if exists "finance team records contributions" on public.contributions;
drop policy if exists "treasurer manages contributions" on public.contributions;

create policy "members record own contributions"
on public.contributions for insert
with check (
  family_id = public.get_my_family_id()
  and user_id = auth.uid()
  and (
    project_id is null
    or project_id in (
      select id from public.projects where family_id = public.get_my_family_id()
    )
  )
);

create policy "finance team records contributions"
on public.contributions for insert
with check (
  family_id = public.get_my_family_id()
  and public.get_my_role() in ('admin','treasurer')
  and (
    project_id is null
    or project_id in (
      select id from public.projects where family_id = public.get_my_family_id()
    )
  )
);

create policy "treasurer manages contributions"
on public.contributions for update
using (
  family_id = public.get_my_family_id()
  and public.get_my_role() in ('admin','treasurer')
)
with check (
  family_id = public.get_my_family_id()
  and public.get_my_role() in ('admin','treasurer')
  and (
    project_id is null
    or project_id in (
      select id from public.projects where family_id = public.get_my_family_id()
    )
  )
);

notify pgrst, 'reload schema';
