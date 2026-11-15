-- Restrict scheduled daily-order bill visibility to users assigned an app role.
-- Previously, USING (true) allowed every authenticated signup to read all rows.
DROP POLICY IF EXISTS "authenticated staff view scheduled bills"
  ON public.daily_order_bills;

CREATE POLICY "assigned staff view scheduled bills"
  ON public.daily_order_bills
  FOR SELECT
  TO authenticated
  USING (
    public.has_role(auth.uid(), 'owner'::public.app_role)
    OR public.has_role(auth.uid(), 'driver'::public.app_role)
    OR public.has_role(auth.uid(), 'salesman'::public.app_role)
  );
