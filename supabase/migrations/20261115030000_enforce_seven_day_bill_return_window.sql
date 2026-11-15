-- Enforce the 7-day return window at the database layer as well as in the UI.
-- A bill may be returned on its bill date or within the following 7 calendar days.
CREATE OR REPLACE FUNCTION public.guard_returned_bill()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public, pg_temp
AS $$
BEGIN
  IF NOT OLD.is_returned AND NEW.is_returned
     AND OLD.bill_date < (CURRENT_DATE - 7) THEN
    RAISE EXCEPTION 'Return window expired. A bill can only be returned within 7 days of its bill date.';
  END IF;

  IF (NEW.is_returned IS DISTINCT FROM OLD.is_returned
      OR NEW.return_reason IS DISTINCT FROM OLD.return_reason
      OR NEW.return_category IS DISTINCT FROM OLD.return_category
      OR NEW.returned_at IS DISTINCT FROM OLD.returned_at
      OR NEW.returned_by IS DISTINCT FROM OLD.returned_by)
     AND COALESCE(current_setting('app.bill_return', true), '') <> 'on' THEN
    RAISE EXCEPTION 'Only the owner return action can change return status';
  END IF;

  IF OLD.is_returned
     AND COALESCE(current_setting('app.bill_return', true), '') <> 'on'
     AND COALESCE(current_setting('app.recalc', true), '') <> 'on' THEN
    RAISE EXCEPTION 'Returned bills are locked and cannot be edited';
  END IF;
  RETURN NEW;
END;
$$;
