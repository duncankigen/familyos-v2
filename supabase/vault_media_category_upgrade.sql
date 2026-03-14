-- ============================================================
-- FAMILYOS — VAULT MEDIA CATEGORY UPGRADE
-- Adds the family_media category for shared Drive/photo links.
-- ============================================================

alter table public.documents
  drop constraint if exists doc_cat_check;

alter table public.documents
  add constraint doc_cat_check
  check (category in ('land_title','certificate','contract','medical','financial','family_media','other'));
