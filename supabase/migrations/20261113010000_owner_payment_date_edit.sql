-- Allow only owners to correct a payment's recorded date/time.
-- Keep an immutable audit trail for every change.
CREATE TABLE IF NOT EXISTS public.payment_date_edit_history (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  payment_id uuid REFERENCES public.payments(id) ON DELETE SET NULL,
  old_paid_at timestamptz NOT NULL,
  new_paid_at timestamptz NOT NULL,
  edited_by uuid NOT NULL REFERENCES auth.users(id),
  edited_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.payment_date_edit_history ENABLE ROW LEVEL SECURITY;
GRANT SELECT ON public.payment_date_edit_history TO authenticated;
CREATE POLICY "owner reads payment date edit history"
  ON public.payment_date_edit_history
  FOR SELECT TO authenticated
  USING (public.has_role(auth.uid(), 'owner'));

CREATE OR REPLACE FUNCTION public.owner_update_payment_date(
  _payment_id uuid,
  _paid_at timestamptz
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_old_paid_at timestamptz;
BEGIN
  IF auth.uid() IS NULL OR NOT public.has_role(auth.uid(), 'owner') THEN
    RAISE EXCEPTION 'Only the owner can update a payment date';
  END IF;

  IF _payment_id IS NULL OR _paid_at IS NULL THEN
    RAISE EXCEPTION 'Payment and date/time are required';
  END IF;

  SELECT paid_at INTO v_old_paid_at
  FROM public.payments
  WHERE id = _payment_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Payment not found';
  END IF;

  IF v_old_paid_at = _paid_at THEN
    RETURN;
  END IF;

  INSERT INTO public.payment_date_edit_history
    (payment_id, old_paid_at, new_paid_at, edited_by)
  VALUES
    (_payment_id, v_old_paid_at, _paid_at, auth.uid());

  UPDATE public.payments
  SET paid_at = _paid_at
  WHERE id = _payment_id;
END;
$$;

REVOKE ALL ON FUNCTION public.owner_update_payment_date(uuid, timestamptz) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.owner_update_payment_date(uuid, timestamptz) TO authenticated;
