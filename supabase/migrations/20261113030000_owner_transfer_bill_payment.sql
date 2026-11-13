-- Owner-only transfer of an existing payment from one bill to another bill
-- for the same shop. The payment record and amount remain unchanged.
CREATE TABLE IF NOT EXISTS public.payment_allocation_transfer_history (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  payment_id uuid NOT NULL REFERENCES public.payments(id) ON DELETE RESTRICT,
  source_bill_id uuid NOT NULL REFERENCES public.bills(id) ON DELETE RESTRICT,
  target_bill_id uuid NOT NULL REFERENCES public.bills(id) ON DELETE RESTRICT,
  amount numeric(12,2) NOT NULL CHECK (amount > 0),
  reason text,
  transferred_by uuid NOT NULL REFERENCES auth.users(id),
  transferred_at timestamptz NOT NULL DEFAULT now(),
  CHECK (source_bill_id <> target_bill_id)
);

ALTER TABLE public.payment_allocation_transfer_history ENABLE ROW LEVEL SECURITY;
GRANT SELECT ON public.payment_allocation_transfer_history TO authenticated;
DROP POLICY IF EXISTS "owner reads payment allocation transfer history" ON public.payment_allocation_transfer_history;
CREATE POLICY "owner reads payment allocation transfer history"
  ON public.payment_allocation_transfer_history
  FOR SELECT TO authenticated
  USING (public.has_role(auth.uid(), 'owner'));

CREATE OR REPLACE FUNCTION public.owner_transfer_bill_payment(
  _payment_id uuid,
  _source_bill_id uuid,
  _target_bill_id uuid,
  _amount numeric,
  _reason text DEFAULT NULL
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_payment public.payments%ROWTYPE;
  v_source_shop uuid;
  v_target_shop uuid;
  v_target_balance numeric;
  v_source_allocation public.payment_allocations%ROWTYPE;
  v_remaining numeric;
BEGIN
  IF auth.uid() IS NULL OR NOT public.has_role(auth.uid(), 'owner') THEN
    RAISE EXCEPTION 'Only the owner can transfer a payment between bills';
  END IF;

  IF _payment_id IS NULL OR _source_bill_id IS NULL OR _target_bill_id IS NULL
     OR _amount IS NULL OR _amount <= 0 THEN
    RAISE EXCEPTION 'Payment, source bill, target bill and a positive amount are required';
  END IF;
  IF _source_bill_id = _target_bill_id THEN
    RAISE EXCEPTION 'Choose a different target bill';
  END IF;

  SELECT * INTO v_payment
  FROM public.payments
  WHERE id = _payment_id
  FOR UPDATE;

  IF NOT FOUND OR v_payment.is_void THEN
    RAISE EXCEPTION 'Payment not found or is void';
  END IF;

  SELECT shop_id INTO v_source_shop FROM public.bills WHERE id = _source_bill_id FOR UPDATE;
  SELECT shop_id, balance INTO v_target_shop, v_target_balance FROM public.bills WHERE id = _target_bill_id FOR UPDATE;

  IF v_source_shop IS NULL OR v_target_shop IS NULL THEN
    RAISE EXCEPTION 'Source or target bill not found';
  END IF;
  IF v_payment.shop_id <> v_source_shop OR v_payment.shop_id <> v_target_shop THEN
    RAISE EXCEPTION 'Payment can only be transferred between bills of the same shop';
  END IF;
  IF COALESCE(v_target_balance, 0) < _amount THEN
    RAISE EXCEPTION 'Transfer amount exceeds the target bill balance';
  END IF;

  IF v_payment.bill_id = _source_bill_id THEN
    IF EXISTS (SELECT 1 FROM public.payment_allocations WHERE payment_id = _payment_id) THEN
      RAISE EXCEPTION 'This payment already has bill allocations; select the allocated source instead';
    END IF;
    IF _amount > v_payment.amount THEN
      RAISE EXCEPTION 'Transfer amount exceeds the payment amount';
    END IF;

    -- Convert the direct bill payment into allocations so its original payment
    -- record, date, mode, collector and reference are preserved.
    UPDATE public.payments SET bill_id = NULL WHERE id = _payment_id;
    v_remaining := v_payment.amount - _amount;

    IF v_remaining > 0 THEN
      INSERT INTO public.payment_allocations(payment_id, bill_id, amount)
      VALUES (_payment_id, _source_bill_id, v_remaining);
    END IF;
    INSERT INTO public.payment_allocations(payment_id, bill_id, amount)
    VALUES (_payment_id, _target_bill_id, _amount);

  ELSIF v_payment.bill_id IS NULL THEN
    SELECT * INTO v_source_allocation
    FROM public.payment_allocations
    WHERE payment_id = _payment_id AND bill_id = _source_bill_id
    FOR UPDATE;

    IF NOT FOUND THEN
      RAISE EXCEPTION 'The selected payment is not allocated to the source bill';
    END IF;
    IF _amount > v_source_allocation.amount THEN
      RAISE EXCEPTION 'Transfer amount exceeds the amount allocated to the source bill';
    END IF;

    v_remaining := v_source_allocation.amount - _amount;
    IF v_remaining = 0 THEN
      DELETE FROM public.payment_allocations WHERE id = v_source_allocation.id;
    ELSE
      UPDATE public.payment_allocations
      SET amount = v_remaining
      WHERE id = v_source_allocation.id;
    END IF;

    INSERT INTO public.payment_allocations(payment_id, bill_id, amount)
    VALUES (_payment_id, _target_bill_id, _amount);
  ELSE
    RAISE EXCEPTION 'The selected payment is not linked to the chosen source bill';
  END IF;

  INSERT INTO public.payment_allocation_transfer_history
    (payment_id, source_bill_id, target_bill_id, amount, reason, transferred_by)
  VALUES
    (_payment_id, _source_bill_id, _target_bill_id, _amount, NULLIF(trim(_reason), ''), auth.uid());

  PERFORM public.recalc_bill(_source_bill_id);
  PERFORM public.recalc_bill(_target_bill_id);
END;
$$;

REVOKE ALL ON FUNCTION public.owner_transfer_bill_payment(uuid, uuid, uuid, numeric, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.owner_transfer_bill_payment(uuid, uuid, uuid, numeric, text) TO authenticated;
