-- Allow document uploaders, admins, and treasurers to delete vault records.
-- Run this on the live Supabase database before using the new Vault delete flow.

drop policy if exists "authorized delete documents" on public.documents;

create policy "authorized delete documents"
on public.documents for delete
using (
  family_id = public.get_my_family_id()
  and (
    uploaded_by = auth.uid()
    or public.get_my_role() in ('admin','treasurer')
  )
);

notify pgrst, 'reload schema';
