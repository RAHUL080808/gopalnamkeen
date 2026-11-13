-- Allow owners to safely void an accidentally recorded payment.
-- Keep the original payment row for audit history; active bill totals exclude voided payments.
ALTER TABLE public.payments
  ADD COLUMN IF NOT EXISTS voided_at timestamptz,
  ADD COLUMN IF NOT EXISTS voided_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS void_reason text;

CREATE OR REPLACE FUNCTION public.owner_void_payment(_payment_id uuid, _reason text)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  p public.payments;
BEGIN
  IF auth.uid() IS NULL OR NOT public.has_role(auth.uid(), 'owner'::public.app_role) THEN
    RAISE EXCEPTION 'Only the owner can cancel a payment';
  END IF;

  IF length(btrim(COALESCE(_reason, ''))) < 3 THEN
    RAISE EXCEPTION 'Please enter a reason (at least 3 characters)';
  END IF;

  SELECT * INTO p
  FROM public.payments
  WHERE id = _payment_id
  FOR UPDATE;

  IF p.id IS NULL THEN
    RAISE EXCEPTION 'Payment not found';
  END IF;

  IF p.is_void THEN
    RAISE EXCEPTION 'This payment is already cancelled';
  END IF;

  UPDATE public.payments
  SET is_void = true,
      voided_at = now(),
      voided_by = auth.uid(),
      void_reason = left(btrim(_reason), 500)
  WHERE id = _payment_id;
END;
$$;

REVOKE ALL ON FUNCTION public.owner_void_payment(uuid, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.owner_void_payment(uuid, text) TO authenticated;
