alter table public.contributions
  add column if not exists recorded_by uuid,
  add column if not exists updated_at timestamptz default now();

do $$
begin
  if not exists (
    select 1
    from pg_constraint
    where conname = 'contributions_recorded_by_fkey'
      and conrelid = 'public.contributions'::regclass
  ) then
    alter table public.contributions
      add constraint contributions_recorded_by_fkey
      foreign key (recorded_by) references public.users(id) on delete set null;
  end if;
end $$;

update public.contributions
set
  recorded_by = coalesce(recorded_by, user_id),
  updated_at = coalesce(updated_at, created_at, now())
where recorded_by is null
   or updated_at is null;

alter table public.contributions alter column updated_at set default now();

alter table public.expenses
  add column if not exists updated_at timestamptz default now();

update public.expenses e
set project_id = null
where project_id is not null
  and not exists (
    select 1
    from public.projects p
    where p.id = e.project_id
  );

update public.expenses e
set vendor_id = null
where vendor_id is not null
  and not exists (
    select 1
    from public.vendors v
    where v.id = e.vendor_id
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

update public.expenses
set updated_at = coalesce(updated_at, created_at, now())
where updated_at is null;

alter table public.expenses alter column updated_at set default now();

create index if not exists contributions_family_created_idx
on public.contributions(family_id, created_at desc);

create index if not exists expenses_family_created_idx
on public.expenses(family_id, created_at desc);

drop policy if exists "family reads contributions" on public.contributions;
drop policy if exists "members record own contributions" on public.contributions;
drop policy if exists "finance team records contributions" on public.contributions;
drop policy if exists "treasurer manages contributions" on public.contributions;

create policy "family reads contributions"
on public.contributions for select
using (family_id = public.get_my_family_id());

create policy "members record own contributions"
on public.contributions for insert
with check (
  family_id = public.get_my_family_id()
  and user_id = auth.uid()
);

create policy "finance team records contributions"
on public.contributions for insert
with check (
  family_id = public.get_my_family_id()
  and public.get_my_role() in ('admin','treasurer')
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
);

drop policy if exists "family reads expenses" on public.expenses;
drop policy if exists "authorized members add expenses" on public.expenses;
drop policy if exists "authorized members update expenses" on public.expenses;

create policy "family reads expenses"
on public.expenses for select
using (family_id = public.get_my_family_id());

create policy "authorized members add expenses"
on public.expenses for insert
with check (
  family_id = public.get_my_family_id()
  and public.get_my_role() in ('admin','treasurer','project_manager')
);

create policy "authorized members update expenses"
on public.expenses for update
using (
  family_id = public.get_my_family_id()
  and public.get_my_role() in ('admin','treasurer')
)
with check (
  family_id = public.get_my_family_id()
  and public.get_my_role() in ('admin','treasurer')
);

notify pgrst, 'reload schema';
