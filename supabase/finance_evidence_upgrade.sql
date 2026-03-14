alter table public.expenses
  add column if not exists reference text,
  add column if not exists notes text,
  add column if not exists attachment_name text;

alter table public.emergency_disbursements
  add column if not exists reference text,
  add column if not exists notes text,
  add column if not exists attachment_url text,
  add column if not exists attachment_name text;

alter table public.school_fee_payments
  add column if not exists attachment_url text,
  add column if not exists attachment_name text;

notify pgrst, 'reload schema';
