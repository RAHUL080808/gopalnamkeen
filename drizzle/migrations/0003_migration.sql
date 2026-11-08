CREATE OR REPLACE FUNCTION public.validate_payment_allocation()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  p public.payments;
  b public.bills;
  allocated numeric;
  available numeric;
BEGIN
  IF auth.uid() IS NULL OR NOT public.has_role(auth.uid(), 'owner'::app_role) THEN
    RAISE EXCEPTION 'Only owner can adjust payments';
  END IF;
  IF new.amount IS NULL OR new.amount <= 0 THEN
    RAISE EXCEPTION 'Allocation amount must be greater than zero';
  END IF;

  SELECT * INTO p FROM public.payments WHERE id = new.payment_id FOR UPDATE;
  IF p.id IS NULL THEN RAISE EXCEPTION 'Payment not found'; END IF;
  IF p.is_void THEN RAISE EXCEPTION 'This payment is void and cannot be adjusted'; END IF;
  IF p.bill_id IS NOT NULL THEN RAISE EXCEPTION 'Only Without Bill payments can be adjusted'; END IF;

  SELECT * INTO b FROM public.bills WHERE id = new.bill_id FOR UPDATE;
  IF b.id IS NULL THEN RAISE EXCEPTION 'Bill not found'; END IF;
  IF b.shop_id <> p.shop_id THEN RAISE EXCEPTION 'Payment and bill must belong to the same shop'; END IF;

  SELECT COALESCE(SUM(amount), 0) INTO allocated
  FROM public.payment_allocations
  WHERE payment_id = new.payment_id AND id IS DISTINCT FROM new.id;
  IF allocated + new.amount > p.amount THEN
    RAISE EXCEPTION 'Allocation exceeds the unallocated payment amount (%)', p.amount - allocated;
  END IF;

  available := COALESCE(b.balance, 0);
  IF TG_OP = 'UPDATE' AND old.bill_id = new.bill_id THEN
    available := available + old.amount;
  END IF;
  IF new.amount > available THEN
    RAISE EXCEPTION 'Allocation exceeds bill outstanding balance (%)', available;
  END IF;

  new.allocated_by := auth.uid();
  IF TG_OP = 'INSERT' THEN new.created_at := now(); ELSE new.created_at := old.created_at; new.payment_id := old.payment_id; END IF;
  RETURN new;
END
$function$;