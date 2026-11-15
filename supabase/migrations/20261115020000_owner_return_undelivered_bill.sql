-- Owner-only return of undelivered bills. Keep the bill as an auditable proof record,
-- but exclude it from active sales and outstanding calculations in the application.
ALTER TABLE public.bills
  ADD COLUMN IF NOT EXISTS is_returned boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS return_reason text,
  ADD COLUMN IF NOT EXISTS return_category text,
  ADD COLUMN IF NOT EXISTS returned_at timestamptz,
  ADD COLUMN IF NOT EXISTS returned_by uuid REFERENCES auth.users(id);

CREATE INDEX IF NOT EXISTS bills_active_shop_idx
  ON public.bills (shop_id) WHERE is_returned = false;

CREATE OR REPLACE FUNCTION public.guard_returned_bill()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public, pg_temp
AS $$
BEGIN
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

DROP TRIGGER IF EXISTS bills_guard_returned ON public.bills;
CREATE TRIGGER bills_guard_returned
  BEFORE UPDATE ON public.bills
  FOR EACH ROW EXECUTE FUNCTION public.guard_returned_bill();

CREATE OR REPLACE FUNCTION public.owner_return_bill(
  _bill_id uuid,
  _category text,
  _reason text
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_bill public.bills%ROWTYPE;
BEGIN
  IF auth.uid() IS NULL OR NOT public.has_role(auth.uid(), 'owner'::public.app_role) THEN
    RAISE EXCEPTION 'Only the owner can return a bill';
  END IF;
  IF _bill_id IS NULL THEN RAISE EXCEPTION 'Bill is required'; END IF;
  IF _category NOT IN ('shop_closed', 'not_delivered', 'shop_refused', 'other') THEN
    RAISE EXCEPTION 'Select a valid return reason';
  END IF;
  IF _reason IS NULL OR length(btrim(_reason)) < 5 OR length(btrim(_reason)) > 500 THEN
    RAISE EXCEPTION 'Enter a reason between 5 and 500 characters';
  END IF;

  SELECT * INTO v_bill FROM public.bills WHERE id = _bill_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Bill not found'; END IF;
  IF v_bill.is_returned THEN RAISE EXCEPTION 'This bill is already returned'; END IF;
  IF COALESCE(v_bill.paid_amount, 0) > 0 THEN
    RAISE EXCEPTION 'A bill with received payment cannot be returned. Resolve its payment first.';
  END IF;
  IF EXISTS (SELECT 1 FROM public.payments p WHERE p.bill_id = _bill_id AND NOT p.is_void) THEN
    RAISE EXCEPTION 'This bill has payment records and cannot be returned';
  END IF;
  IF to_regclass('public.payment_allocations') IS NOT NULL AND EXISTS (
    SELECT 1
    FROM public.payment_allocations pa
    JOIN public.payments p ON p.id = pa.payment_id
    WHERE pa.bill_id = _bill_id AND NOT p.is_void
  ) THEN
    RAISE EXCEPTION 'This bill has allocated payments and cannot be returned';
  END IF;

  PERFORM set_config('app.bill_return', 'on', true);
  UPDATE public.bills
  SET is_returned = true,
      return_category = _category,
      return_reason = btrim(_reason),
      returned_at = now(),
      returned_by = auth.uid()
  WHERE id = _bill_id;
  PERFORM set_config('app.bill_return', 'off', true);

  DELETE FROM public.daily_order_bills WHERE bill_id = _bill_id;
END;
$$;

REVOKE ALL ON FUNCTION public.owner_return_bill(uuid, text, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.owner_return_bill(uuid, text, text) TO authenticated;
REVOKE ALL ON FUNCTION public.guard_returned_bill() FROM PUBLIC, anon, authenticated;


-- Do not allow a returned bill to receive a new direct payment.
CREATE OR REPLACE FUNCTION public.reject_payment_for_returned_bill()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
BEGIN
  IF NEW.bill_id IS NOT NULL AND EXISTS (
    SELECT 1 FROM public.bills WHERE id = NEW.bill_id AND is_returned
  ) THEN
    RAISE EXCEPTION 'This bill was returned and cannot receive payments';
  END IF;
  RETURN NEW;
END;
$$;
DROP TRIGGER IF EXISTS payments_reject_returned_bill ON public.payments;
CREATE TRIGGER payments_reject_returned_bill
  BEFORE INSERT OR UPDATE OF bill_id ON public.payments
  FOR EACH ROW EXECUTE FUNCTION public.reject_payment_for_returned_bill();

-- Also protect the owner-only advance allocation path.
CREATE OR REPLACE FUNCTION public.reject_allocation_for_returned_bill()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM public.bills WHERE id = NEW.bill_id AND is_returned
  ) THEN
    RAISE EXCEPTION 'This bill was returned and cannot receive payment allocations';
  END IF;
  RETURN NEW;
END;
$$;
DROP TRIGGER IF EXISTS payment_allocations_reject_returned_bill ON public.payment_allocations;
CREATE TRIGGER payment_allocations_reject_returned_bill
  BEFORE INSERT OR UPDATE OF bill_id ON public.payment_allocations
  FOR EACH ROW EXECUTE FUNCTION public.reject_allocation_for_returned_bill();

REVOKE ALL ON FUNCTION public.reject_payment_for_returned_bill() FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.reject_allocation_for_returned_bill() FROM PUBLIC, anon, authenticated;
