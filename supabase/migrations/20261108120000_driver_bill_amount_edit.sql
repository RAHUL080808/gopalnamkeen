-- Driver-only bill amount correction with an owner-visible audit trail.
CREATE TABLE IF NOT EXISTS public.bill_amount_edit_history (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  bill_id uuid NOT NULL REFERENCES public.bills(id) ON DELETE RESTRICT,
  old_amount numeric NOT NULL,
  new_amount numeric NOT NULL,
  edited_by uuid NOT NULL REFERENCES auth.users(id),
  edited_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.bill_amount_edit_history ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS bill_amount_edit_history_owner_read ON public.bill_amount_edit_history;
CREATE POLICY bill_amount_edit_history_owner_read
ON public.bill_amount_edit_history
FOR SELECT TO authenticated
USING (public.has_role(auth.uid(), 'owner'::public.app_role));

CREATE OR REPLACE FUNCTION public.driver_update_bill_amount(
  _bill_id uuid,
  _new_amount numeric
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_bill public.bills%ROWTYPE;
BEGIN
  IF auth.uid() IS NULL OR NOT public.has_role(auth.uid(), 'driver'::public.app_role) THEN
    RAISE EXCEPTION 'Only drivers can use this action';
  END IF;

  IF _new_amount IS NULL OR _new_amount <= 0 THEN
    RAISE EXCEPTION 'Enter a valid bill amount';
  END IF;

  SELECT * INTO v_bill
  FROM public.bills
  WHERE id = _bill_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Bill not found';
  END IF;

  IF _new_amount < COALESCE(v_bill.paid_amount, 0) THEN
    RAISE EXCEPTION 'New amount cannot be less than the amount already received';
  END IF;

  IF _new_amount = v_bill.amount THEN
    RETURN;
  END IF;

  UPDATE public.bills
  SET amount = _new_amount,
      balance = _new_amount - COALESCE(v_bill.paid_amount, 0),
      status = CASE
        WHEN COALESCE(v_bill.paid_amount, 0) <= 0 THEN 'unpaid'
        WHEN COALESCE(v_bill.paid_amount, 0) >= _new_amount THEN 'paid'
        ELSE 'partial'
      END
  WHERE id = _bill_id;

  INSERT INTO public.bill_amount_edit_history
    (bill_id, old_amount, new_amount, edited_by)
  VALUES
    (_bill_id, v_bill.amount, _new_amount, auth.uid());
END;
$$;

REVOKE ALL ON FUNCTION public.driver_update_bill_amount(uuid, numeric) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.driver_update_bill_amount(uuid, numeric) TO authenticated;
GRANT SELECT ON public.bill_amount_edit_history TO authenticated;
