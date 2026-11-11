-- Security hardening only: no table data, financial rows, or business rules are changed.
-- Every operation is guarded so this remains safe if an optional migration is not present.
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
    'public.import_shops(jsonb)',
    'public.protect_bill_paid()'
  ];
  trigger_only text[] := ARRAY[
    'public.handle_new_user()',
    'public.prepare_payment()',
    'public.after_payment()',
    'public.prepare_correction()',
    'public.apply_correction()',
    'public.validate_payment_allocation()',
    'public.protect_bill_paid()'
  ];
BEGIN
  FOREACH fn IN ARRAY signatures LOOP
    IF to_regprocedure(fn) IS NOT NULL THEN
      EXECUTE format('ALTER FUNCTION %s SET search_path = public, pg_temp', fn);
    END IF;
  END LOOP;

  IF to_regprocedure('public.has_role(uuid, public.app_role)') IS NOT NULL THEN
    REVOKE ALL ON FUNCTION public.has_role(uuid, public.app_role) FROM PUBLIC, anon;
    GRANT EXECUTE ON FUNCTION public.has_role(uuid, public.app_role) TO authenticated;
  END IF;

  IF to_regprocedure('public.is_staff(uuid)') IS NOT NULL THEN
    REVOKE ALL ON FUNCTION public.is_staff(uuid) FROM PUBLIC, anon;
    GRANT EXECUTE ON FUNCTION public.is_staff(uuid) TO authenticated;
  END IF;

  FOREACH fn IN ARRAY trigger_only LOOP
    IF to_regprocedure(fn) IS NOT NULL THEN
      EXECUTE format('REVOKE ALL ON FUNCTION %s FROM PUBLIC, anon, authenticated', fn);
    END IF;
  END LOOP;

  IF to_regprocedure('public.recalc_bill(uuid)') IS NOT NULL THEN
    REVOKE ALL ON FUNCTION public.recalc_bill(uuid) FROM PUBLIC, anon, authenticated;
  END IF;
END
$$;
