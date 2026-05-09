alter table if exists public.seller_verifications
  add column if not exists proof_notes text;
