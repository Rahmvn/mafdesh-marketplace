alter table public.products
  drop constraint if exists products_name_length_check,
  drop constraint if exists products_category_length_check,
  drop constraint if exists products_description_length_check,
  drop constraint if exists products_images_count_check;

alter table public.products
  add constraint products_name_length_check
    check (char_length(btrim(coalesce(name, ''))) between 5 and 120) not valid,
  add constraint products_category_length_check
    check (char_length(btrim(coalesce(category, ''))) between 1 and 80) not valid,
  add constraint products_description_length_check
    check (char_length(btrim(coalesce(description, ''))) between 20 and 5000) not valid,
  add constraint products_images_count_check
    check (coalesce(array_length(images, 1), 0) between 1 and 5) not valid;

alter table public.support_tickets
  drop constraint if exists support_tickets_subject_length_check,
  drop constraint if exists support_tickets_message_length_check,
  drop constraint if exists support_tickets_attachment_count_check;

alter table public.support_tickets
  add constraint support_tickets_subject_length_check
    check (char_length(btrim(coalesce(subject, ''))) between 5 and 140) not valid,
  add constraint support_tickets_message_length_check
    check (char_length(btrim(coalesce(message, ''))) between 10 and 2000) not valid,
  add constraint support_tickets_attachment_count_check
    check (coalesce(array_length(attachment_urls, 1), 0) <= 5) not valid;

alter table public.dispute_messages
  drop constraint if exists dispute_messages_message_length_check,
  drop constraint if exists dispute_messages_image_count_check;

alter table public.dispute_messages
  add constraint dispute_messages_message_length_check
    check (
      message is null
      or char_length(btrim(message)) between 1 and 2000
    ) not valid,
  add constraint dispute_messages_image_count_check
    check (coalesce(array_length(images, 1), 0) <= 5) not valid;

alter table public.reviews
  drop constraint if exists reviews_comment_length_check;

alter table public.reviews
  add constraint reviews_comment_length_check
    check (
      comment is null
      or char_length(btrim(comment)) between 1 and 1000
    ) not valid;

alter table public.seller_verifications
  drop constraint if exists seller_verifications_proof_notes_length_check,
  drop constraint if exists seller_verifications_proof_url_length_check;

alter table public.seller_verifications
  add constraint seller_verifications_proof_notes_length_check
    check (
      proof_notes is null
      or char_length(btrim(proof_notes)) <= 2000
    ) not valid,
  add constraint seller_verifications_proof_url_length_check
    check (
      proof_url is null
      or char_length(btrim(proof_url)) <= 2048
    ) not valid;
