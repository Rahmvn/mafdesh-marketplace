CREATE TABLE IF NOT EXISTS public.saved_addresses (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  buyer_id uuid NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
  label text NOT NULL DEFAULT 'Home'
    CHECK (label IN ('Home', 'Office', 'Other')),
  full_name text NOT NULL,
  phone_number text NOT NULL,
  state text NOT NULL,
  lga text NOT NULL,
  city text NOT NULL,
  street_address text NOT NULL,
  landmark text,
  is_default boolean NOT NULL DEFAULT false,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS saved_addresses_buyer_id_idx
  ON public.saved_addresses (buyer_id);

CREATE UNIQUE INDEX IF NOT EXISTS saved_addresses_one_default_per_buyer_idx
  ON public.saved_addresses (buyer_id)
  WHERE is_default = true;

ALTER TABLE public.saved_addresses ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "buyers can manage own addresses" ON public.saved_addresses;

CREATE POLICY "buyers can manage own addresses"
  ON public.saved_addresses FOR ALL
  TO authenticated
  USING (buyer_id = auth.uid())
  WITH CHECK (buyer_id = auth.uid());

CREATE OR REPLACE FUNCTION public.enforce_max_saved_addresses()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
BEGIN
  IF (
    SELECT COUNT(*) FROM public.saved_addresses
    WHERE buyer_id = NEW.buyer_id
  ) >= 5 THEN
    RAISE EXCEPTION 'You can save a maximum of 5 addresses. Please delete one before adding a new one.';
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS saved_addresses_max_five ON public.saved_addresses;

CREATE TRIGGER saved_addresses_max_five
  BEFORE INSERT ON public.saved_addresses
  FOR EACH ROW
  EXECUTE FUNCTION public.enforce_max_saved_addresses();

CREATE OR REPLACE FUNCTION public.handle_default_address()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
BEGIN
  IF NEW.is_default = true THEN
    UPDATE public.saved_addresses
    SET is_default = false
    WHERE buyer_id = NEW.buyer_id
      AND id <> NEW.id;
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS saved_addresses_handle_default ON public.saved_addresses;

CREATE TRIGGER saved_addresses_handle_default
  AFTER INSERT OR UPDATE ON public.saved_addresses
  FOR EACH ROW
  EXECUTE FUNCTION public.handle_default_address();

CREATE OR REPLACE FUNCTION public.saved_addresses_set_updated_at()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS saved_addresses_set_updated_at ON public.saved_addresses;

CREATE TRIGGER saved_addresses_set_updated_at
  BEFORE UPDATE ON public.saved_addresses
  FOR EACH ROW
  EXECUTE FUNCTION public.saved_addresses_set_updated_at();
