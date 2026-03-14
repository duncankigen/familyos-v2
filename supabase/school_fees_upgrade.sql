create extension if not exists pgcrypto;

alter table public.students
  add column if not exists updated_at timestamptz default now();

alter table public.school_fees
  add column if not exists updated_at timestamptz default now();

update public.students
set updated_at = coalesce(updated_at, created_at, now())
where updated_at is null;

update public.school_fees
set updated_at = coalesce(updated_at, created_at, now())
where updated_at is null;

alter table public.students alter column updated_at set default now();
alter table public.school_fees alter column updated_at set default now();

create table if not exists public.school_fee_payments (
  id uuid primary key default gen_random_uuid(),
  family_id uuid references public.families(id) on delete cascade,
  school_fee_id uuid not null references public.school_fees(id) on delete cascade,
  amount numeric not null check (amount > 0),
  payment_date date not null default current_date,
  reference text,
  notes text,
  payment_account_id uuid references public.payment_accounts(id) on delete set null,
  recorded_by uuid references public.users(id) on delete set null,
  created_at timestamptz default now()
);

create index if not exists school_fee_payments_family_date_idx
on public.school_fee_payments(family_id, payment_date desc, created_at desc);

create index if not exists school_fee_payments_fee_idx
on public.school_fee_payments(school_fee_id, payment_date desc, created_at desc);

alter table public.school_fee_payments enable row level security;

drop policy if exists "authorized manage school fees" on public.school_fees;
create policy "authorized manage school fees"
on public.school_fees for all
using (family_id = public.get_my_family_id() and public.get_my_role() in ('admin','treasurer'))
with check (
  family_id = public.get_my_family_id()
  and public.get_my_role() in ('admin','treasurer')
  and student_id in (
    select id from public.students where family_id = public.get_my_family_id()
  )
);

drop policy if exists "family reads school fee payments" on public.school_fee_payments;
drop policy if exists "authorized manage school fee payments" on public.school_fee_payments;

create policy "family reads school fee payments"
on public.school_fee_payments for select
using (family_id = public.get_my_family_id());

create policy "authorized manage school fee payments"
on public.school_fee_payments for all
using (family_id = public.get_my_family_id() and public.get_my_role() in ('admin','treasurer'))
with check (
  family_id = public.get_my_family_id()
  and public.get_my_role() in ('admin','treasurer')
  and school_fee_id in (
    select id from public.school_fees where family_id = public.get_my_family_id()
  )
  and (
    payment_account_id is null
    or payment_account_id in (
      select id from public.payment_accounts where family_id = public.get_my_family_id()
    )
  )
);

create or replace function public.sync_school_fee_paid_amount()
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

drop trigger if exists school_fee_payment_totals on public.school_fee_payments;
create trigger school_fee_payment_totals
  after insert or update or delete on public.school_fee_payments
  for each row execute procedure public.sync_school_fee_paid_amount();

notify pgrst, 'reload schema';
