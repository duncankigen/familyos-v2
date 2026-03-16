-- Remove automatic syncing of emergency disbursements into expenses.
-- Run this on the live Supabase database if emergency should stay
-- separate from the shared expense ledger.

drop trigger if exists sync_emergency_disbursement_expense_trigger
on public.emergency_disbursements;

drop function if exists public.sync_emergency_disbursement_expense();

do $$
begin
  if exists (
    select 1
    from information_schema.columns
    where table_schema = 'public'
      and table_name = 'expenses'
      and column_name = 'linked_source_type'
  ) then
    delete from public.expenses
    where linked_source_type = 'emergency_disbursement';
  end if;
end $$;

notify pgrst, 'reload schema';
