-- Allow drivers to create delivery bills for an existing shop.
-- Bill number remains database-generated and created_by is set from auth.uid().
CREATE OR REPLACE FUNCTION public.driver_create_bill(
  _shop_id uuid,
  _bill_date date,
  _amount numeric,
  _notes text DEFAULT NULL
)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  _bill_id uuid;
BEGIN
  IF auth.uid() IS NULL OR NOT public.has_role(auth.uid(), 'driver'::public.app_role) THEN
    RAISE EXCEPTION 'Only drivers can create delivery bills';
  END IF;

  IF _shop_id IS NULL OR NOT EXISTS (SELECT 1 FROM public.shops WHERE id = _shop_id) THEN
    RAISE EXCEPTION 'Select a valid shop';
  END IF;

  IF _bill_date IS NULL THEN
    RAISE EXCEPTION 'Bill date is required';
  END IF;

  IF _amount IS NULL OR _amount <= 0 THEN
    RAISE EXCEPTION 'Enter a valid bill amount';
  END IF;

  INSERT INTO public.bills (shop_id, bill_date, amount, notes, created_by)
  VALUES (_shop_id, _bill_date, _amount, NULLIF(BTRIM(_notes), ''), auth.uid())
  RETURNING id INTO _bill_id;

  RETURN _bill_id;
END;
$$;

REVOKE ALL ON FUNCTION public.driver_create_bill(uuid, date, numeric, text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.driver_create_bill(uuid, date, numeric, text) TO authenticated;
