-- Paystack subscription fields for family workspaces.
-- Run after family_billing_trial_upgrade.sql.

alter table public.families
  add column if not exists billing_provider text not null default 'paystack',
  add column if not exists paystack_customer_code text,
  add column if not exists paystack_subscription_code text,
  add column if not exists paystack_subscription_email_token text,
  add column if not exists paystack_plan_code text,
  add column if not exists paystack_last_reference text;

update public.families
set billing_provider = coalesce(nullif(billing_provider, ''), 'paystack')
where billing_provider is null
   or billing_provider = '';

notify pgrst, 'reload schema';
