-- Security hardening only: no table data, financial rows, or business rules are changed.
-- Keep trusted schemas ahead of temporary schemas for SECURITY DEFINER functions.
DO $$
DECLARE
  fn text;
  signatures text[] := ARRAY[
    'public.has_role(uuid, public.app_role)',
    'public.is_staff(uuid)',
    'public.owner_exists()',
    'public.handle_new_user()',
    'public.prepare_payment()',
    'public.recalc_bill(uuid)',
    'public.after_payment()',
    'public.prepare_correction()',
    'public.apply_correction()',
    'public.validate_payment_allocation()',
    'public.driver_update_bill_amount(uuid, numeric)',
    'public.driver_update_shop_contact(uuid, text, text, text, text)',
    'public.owner_delete_bill_with_payments(uuid)',
    'public.driver_create_shop(text, text, text, text)',
    'public.driver_create_bill(uuid, date, numeric, text)',
    'public.import_shops(jsonb)'
  ];
BEGIN
  FOREACH fn IN ARRAY signatures LOOP
    IF to_regprocedure(fn) IS NOT NULL THEN
      EXECUTE format('ALTER FUNCTION %s SET search_path = public, pg_temp', fn);
    END IF;
  END LOOP;
END
$$;

-- Role-check helpers are needed by authenticated policies and server actions,
-- but do not need to be callable by anonymous visitors.
REVOKE ALL ON FUNCTION public.has_role(uuid, public.app_role) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.has_role(uuid, public.app_role) TO authenticated;

REVOKE ALL ON FUNCTION public.is_staff(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.is_staff(uuid) TO authenticated;

-- Trigger-only functions should not be directly callable through the API.
REVOKE ALL ON FUNCTION public.handle_new_user() FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.prepare_payment() FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.after_payment() FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.prepare_correction() FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.apply_correction() FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.validate_payment_allocation() FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.protect_bill_paid() FROM PUBLIC, anon, authenticated;

-- Internal recalculation must only be reached by trusted trigger/function code.
REVOKE ALL ON FUNCTION public.recalc_bill(uuid) FROM PUBLIC, anon, authenticated;
