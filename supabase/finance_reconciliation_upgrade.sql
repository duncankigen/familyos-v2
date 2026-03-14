-- ============================================================
-- FAMILYOS — FINANCE RECONCILIATION UPGRADE
-- Mirrors school fee payments and disbursed emergency payouts
-- into the core expenses ledger so cash totals stay consistent.
-- ============================================================

alter table public.expenses
  add column if not exists linked_source_type text,
  add column if not exists linked_source_id uuid;

create unique index if not exists expenses_linked_source_uidx
on public.expenses(linked_source_type, linked_source_id);

create or replace function public.sync_school_fee_payment_expense()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_student_name text;
  v_term text;
  v_year int;
  v_created_at timestamptz;
begin
  if tg_op = 'DELETE' then
    delete from public.expenses
    where linked_source_type = 'school_fee_payment'
      and linked_source_id = old.id;
    return old;
  end if;

  select s.name, sf.term, sf.year
  into v_student_name, v_term, v_year
  from public.school_fees sf
  left join public.students s on s.id = sf.student_id
  where sf.id = new.school_fee_id;

  v_created_at := coalesce(new.payment_date::timestamptz, new.created_at, now());

  insert into public.expenses (
    family_id,
    amount,
    category,
    description,
    receipt_url,
    reference,
    notes,
    attachment_name,
    created_by,
    created_at,
    updated_at,
    linked_source_type,
    linked_source_id
  )
  values (
    new.family_id,
    new.amount,
    'services',
    concat(
      'School fee payment',
      case when coalesce(v_student_name, '') <> '' then ' - ' || v_student_name else '' end,
      case when coalesce(v_term, '') <> '' then ' (' || v_term || ' ' || coalesce(v_year::text, '') || ')' else '' end
    ),
    new.attachment_url,
    new.reference,
    coalesce(new.notes, 'Auto-synced from school fee payment'),
    new.attachment_name,
    new.recorded_by,
    v_created_at,
    now(),
    'school_fee_payment',
    new.id
  )
  on conflict (linked_source_type, linked_source_id)
  do update set
    family_id = excluded.family_id,
    amount = excluded.amount,
    category = excluded.category,
    description = excluded.description,
    receipt_url = excluded.receipt_url,
    reference = excluded.reference,
    notes = excluded.notes,
    attachment_name = excluded.attachment_name,
    created_by = excluded.created_by,
    created_at = excluded.created_at,
    updated_at = now();

  return new;
end;
$$;

create or replace function public.sync_emergency_disbursement_expense()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_created_at timestamptz;
begin
  if tg_op = 'DELETE' then
    delete from public.expenses
    where linked_source_type = 'emergency_disbursement'
      and linked_source_id = old.id;
    return old;
  end if;

  if coalesce(new.status, 'pending') <> 'disbursed' then
    delete from public.expenses
    where linked_source_type = 'emergency_disbursement'
      and linked_source_id = new.id;
    return new;
  end if;

  v_created_at := coalesce(new.disbursed_at::timestamptz, new.created_at, now());

  insert into public.expenses (
    family_id,
    amount,
    category,
    description,
    receipt_url,
    reference,
    notes,
    attachment_name,
    created_by,
    created_at,
    updated_at,
    linked_source_type,
    linked_source_id
  )
  values (
    new.family_id,
    new.amount,
    'other',
    concat(
      'Emergency disbursement',
      case
        when coalesce(new.member_name, '') <> '' then ' - ' || new.member_name
        when coalesce(new.event_description, '') <> '' then ' - ' || new.event_description
        else ''
      end
    ),
    new.attachment_url,
    new.reference,
    coalesce(new.notes, new.event_description, 'Auto-synced from emergency disbursement'),
    new.attachment_name,
    new.approved_by,
    v_created_at,
    now(),
    'emergency_disbursement',
    new.id
  )
  on conflict (linked_source_type, linked_source_id)
  do update set
    family_id = excluded.family_id,
    amount = excluded.amount,
    category = excluded.category,
    description = excluded.description,
    receipt_url = excluded.receipt_url,
    reference = excluded.reference,
    notes = excluded.notes,
    attachment_name = excluded.attachment_name,
    created_by = excluded.created_by,
    created_at = excluded.created_at,
    updated_at = now();

  return new;
end;
$$;

drop trigger if exists sync_school_fee_payment_expense_trigger on public.school_fee_payments;
create trigger sync_school_fee_payment_expense_trigger
  after insert or update or delete on public.school_fee_payments
  for each row execute procedure public.sync_school_fee_payment_expense();

drop trigger if exists sync_emergency_disbursement_expense_trigger on public.emergency_disbursements;
create trigger sync_emergency_disbursement_expense_trigger
  after insert or update or delete on public.emergency_disbursements
  for each row execute procedure public.sync_emergency_disbursement_expense();

insert into public.expenses (
  family_id,
  amount,
  category,
  description,
  receipt_url,
  reference,
  notes,
  attachment_name,
  created_by,
  created_at,
  updated_at,
  linked_source_type,
  linked_source_id
)
select
  p.family_id,
  p.amount,
  'services',
  concat(
    'School fee payment',
    case when coalesce(s.name, '') <> '' then ' - ' || s.name else '' end,
    case when coalesce(sf.term, '') <> '' then ' (' || sf.term || ' ' || coalesce(sf.year::text, '') || ')' else '' end
  ),
  p.attachment_url,
  p.reference,
  coalesce(p.notes, 'Auto-synced from school fee payment'),
  p.attachment_name,
  p.recorded_by,
  coalesce(p.payment_date::timestamptz, p.created_at, now()),
  now(),
  'school_fee_payment',
  p.id
from public.school_fee_payments p
join public.school_fees sf on sf.id = p.school_fee_id
left join public.students s on s.id = sf.student_id
on conflict (linked_source_type, linked_source_id)
do update set
  family_id = excluded.family_id,
  amount = excluded.amount,
  category = excluded.category,
  description = excluded.description,
  receipt_url = excluded.receipt_url,
  reference = excluded.reference,
  notes = excluded.notes,
  attachment_name = excluded.attachment_name,
  created_by = excluded.created_by,
  created_at = excluded.created_at,
  updated_at = now();

insert into public.expenses (
  family_id,
  amount,
  category,
  description,
  receipt_url,
  reference,
  notes,
  attachment_name,
  created_by,
  created_at,
  updated_at,
  linked_source_type,
  linked_source_id
)
select
  d.family_id,
  d.amount,
  'other',
  concat(
    'Emergency disbursement',
    case
      when coalesce(d.member_name, '') <> '' then ' - ' || d.member_name
      when coalesce(d.event_description, '') <> '' then ' - ' || d.event_description
      else ''
    end
  ),
  d.attachment_url,
  d.reference,
  coalesce(d.notes, d.event_description, 'Auto-synced from emergency disbursement'),
  d.attachment_name,
  d.approved_by,
  coalesce(d.disbursed_at::timestamptz, d.created_at, now()),
  now(),
  'emergency_disbursement',
  d.id
from public.emergency_disbursements d
where coalesce(d.status, 'pending') = 'disbursed'
on conflict (linked_source_type, linked_source_id)
do update set
  family_id = excluded.family_id,
  amount = excluded.amount,
  category = excluded.category,
  description = excluded.description,
  receipt_url = excluded.receipt_url,
  reference = excluded.reference,
  notes = excluded.notes,
  attachment_name = excluded.attachment_name,
  created_by = excluded.created_by,
  created_at = excluded.created_at,
  updated_at = now();
