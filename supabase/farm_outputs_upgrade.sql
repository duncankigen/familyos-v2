create extension if not exists pgcrypto;

create table if not exists public.farm_outputs (
  id uuid primary key default gen_random_uuid(),
  project_id uuid not null references public.projects(id) on delete cascade,
  crop_id uuid references public.farm_crops(id) on delete set null,
  livestock_id uuid references public.livestock(id) on delete set null,
  output_category text not null default 'other',
  quantity numeric not null check (quantity > 0),
  unit text not null default 'units',
  output_date date not null default current_date,
  usage_type text not null default 'other',
  unit_price numeric check (unit_price is null or unit_price >= 0),
  total_value numeric check (total_value is null or total_value >= 0),
  destination text,
  notes text,
  recorded_by uuid references public.users(id) on delete set null,
  created_at timestamptz default now(),
  constraint farm_output_category_check check (output_category in ('harvest','milk','eggs','honey','meat','animal_sale','other')),
  constraint farm_output_usage_check check (usage_type in ('sold','stored','consumed','distributed','seed','other'))
);

create index if not exists farm_outputs_project_date_idx
on public.farm_outputs(project_id, output_date desc, created_at desc);

create index if not exists farm_outputs_crop_idx
on public.farm_outputs(crop_id);

create index if not exists farm_outputs_livestock_idx
on public.farm_outputs(livestock_id);

alter table public.farm_outputs enable row level security;

drop policy if exists "family reads farm outputs" on public.farm_outputs;
drop policy if exists "authorized manage farm outputs" on public.farm_outputs;

create policy "family reads farm outputs"
on public.farm_outputs for select
using (project_id in (select id from public.projects where family_id = public.get_my_family_id()));

create policy "authorized manage farm outputs"
on public.farm_outputs for all
using (
  project_id in (select id from public.projects where family_id = public.get_my_family_id())
  and public.get_my_role() in ('admin','project_manager')
)
with check (
  project_id in (select id from public.projects where family_id = public.get_my_family_id())
  and public.get_my_role() in ('admin','project_manager')
);

create or replace function public.log_farm_output_activity()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_family_id uuid;
begin
  select family_id into v_family_id
  from public.projects
  where id = new.project_id;

  insert into public.activity_logs (family_id, user_id, action, entity_type, entity_id)
  values (
    v_family_id,
    coalesce(auth.uid(), new.recorded_by),
    tg_op,
    tg_table_name,
    new.id
  );

  return new;
end;
$$;

drop trigger if exists log_farm_outputs on public.farm_outputs;
create trigger log_farm_outputs
  after insert on public.farm_outputs
  for each row execute procedure public.log_farm_output_activity();

notify pgrst, 'reload schema';
