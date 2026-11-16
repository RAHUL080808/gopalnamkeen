-- Enforce a two-day bill-date window for driver amount edits (India business date).
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
  v_today date := (now() AT TIME ZONE 'Asia/Kolkata')::date;
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

  IF v_bill.bill_date < v_today - 2 OR v_bill.bill_date > v_today THEN
    RAISE EXCEPTION 'Driver can edit bill amount only within 2 days from the bill date';
  END IF;

  IF _new_amount < COALESCE(v_bill.paid_amount, 0) THEN
    RAISE EXCEPTION 'New amount cannot be less than the amount already received';
  END IF;

  IF _new_amount = v_bill.amount THEN
    RETURN;
  END IF;

  UPDATE public.bills
  SET amount = _new_amount
  WHERE id = _bill_id;

  INSERT INTO public.bill_amount_edit_history
    (bill_id, old_amount, new_amount, edited_by)
  VALUES
    (_bill_id, v_bill.amount, _new_amount, auth.uid());
END;
$$;

REVOKE ALL ON FUNCTION public.driver_update_bill_amount(uuid, numeric) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.driver_update_bill_amount(uuid, numeric) TO authenticated;
