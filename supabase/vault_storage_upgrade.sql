-- ============================================================
-- FAMILYOS — VAULT STORAGE AND POLICY UPGRADE
-- Creates the documents bucket and aligns storage/document RLS
-- with the Vault page upload and save flow.
-- ============================================================

insert into storage.buckets (id, name, public)
values ('documents', 'documents', true)
on conflict (id) do update
set name = excluded.name,
    public = excluded.public;

drop policy if exists "family read documents bucket" on storage.objects;
create policy "family read documents bucket"
on storage.objects for select
using (bucket_id = 'documents');

drop policy if exists "family upload documents bucket" on storage.objects;
create policy "family upload documents bucket"
on storage.objects for insert
with check (
  bucket_id = 'documents'
  and auth.role() = 'authenticated'
  and (storage.foldername(name))[1] = public.get_my_family_id()::text
);

drop policy if exists "family update documents bucket" on storage.objects;
create policy "family update documents bucket"
on storage.objects for update
using (
  bucket_id = 'documents'
  and auth.role() = 'authenticated'
  and (storage.foldername(name))[1] = public.get_my_family_id()::text
)
with check (
  bucket_id = 'documents'
  and auth.role() = 'authenticated'
  and (storage.foldername(name))[1] = public.get_my_family_id()::text
);

drop policy if exists "family delete documents bucket" on storage.objects;
create policy "family delete documents bucket"
on storage.objects for delete
using (
  bucket_id = 'documents'
  and auth.role() = 'authenticated'
  and (storage.foldername(name))[1] = public.get_my_family_id()::text
);

drop policy if exists "authorized upload documents" on public.documents;
create policy "authorized upload documents"
on public.documents for insert
with check (
  family_id = public.get_my_family_id()
  and uploaded_by = auth.uid()
  and public.get_my_role() in ('admin','treasurer')
);

drop policy if exists "authorized manage documents" on public.documents;
create policy "authorized manage documents"
on public.documents for update
using (
  family_id = public.get_my_family_id()
  and (
    uploaded_by = auth.uid()
    or public.get_my_role() in ('admin','treasurer')
  )
)
with check (
  family_id = public.get_my_family_id()
  and (
    uploaded_by = auth.uid()
    or public.get_my_role() in ('admin','treasurer')
  )
);

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
