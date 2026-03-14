alter table public.assets
  add column if not exists status text default 'active';

update public.assets
set status = coalesce(status, 'active')
where status is null;

alter table public.assets alter column status set default 'active';

do $$
begin
  if not exists (
    select 1
    from pg_constraint
    where conname = 'asset_status_check'
      and conrelid = 'public.assets'::regclass
  ) then
    alter table public.assets
      add constraint asset_status_check
      check (status in ('active','inactive','archived'));
  end if;
end $$;

notify pgrst, 'reload schema';
