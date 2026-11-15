-- Complete, append-only audit trail for business records.
CREATE TABLE IF NOT EXISTS public.audit_logs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  event_at timestamptz NOT NULL DEFAULT now(),
  actor_id uuid,
  actor_name text,
  actor_email text,
  action text NOT NULL CHECK (action IN ('INSERT', 'UPDATE', 'DELETE')),
  entity_type text NOT NULL,
  entity_id uuid,
  entity_label text,
  old_data jsonb,
  new_data jsonb,
  changed_fields jsonb NOT NULL DEFAULT '{}'::jsonb
);

CREATE INDEX IF NOT EXISTS audit_logs_event_at_idx ON public.audit_logs (event_at DESC);
CREATE INDEX IF NOT EXISTS audit_logs_entity_idx ON public.audit_logs (entity_type, entity_id);
CREATE INDEX IF NOT EXISTS audit_logs_actor_idx ON public.audit_logs (actor_id, event_at DESC);

ALTER TABLE public.audit_logs ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS audit_logs_developer_owner_read ON public.audit_logs;
CREATE POLICY audit_logs_developer_owner_read
ON public.audit_logs
FOR SELECT TO authenticated
USING (
  public.has_role(auth.uid(), 'owner'::public.app_role)
  OR lower(COALESCE(auth.jwt() ->> 'email', '')) = 'rahulmahajan080808@gmail.com'
);
GRANT SELECT ON public.audit_logs TO authenticated;
REVOKE INSERT, UPDATE, DELETE, TRUNCATE ON public.audit_logs FROM anon, authenticated;

CREATE OR REPLACE FUNCTION public.capture_audit_log()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_old jsonb;
  v_new jsonb;
  v_changed jsonb := '{}'::jsonb;
  v_actor_id uuid := auth.uid();
  v_actor_email text := NULLIF(auth.jwt() ->> 'email', '');
  v_actor_name text;
  v_entity_id uuid;
  v_entity_label text;
BEGIN
  IF TG_OP = 'DELETE' THEN
    v_old := to_jsonb(OLD);
    v_new := NULL;
  ELSIF TG_OP = 'INSERT' THEN
    v_old := NULL;
    v_new := to_jsonb(NEW);
  ELSE
    v_old := to_jsonb(OLD);
    v_new := to_jsonb(NEW);
  END IF;

  IF TG_OP = 'INSERT' THEN
    SELECT COALESCE(jsonb_object_agg(k, jsonb_build_object('old', NULL, 'new', value)), '{}'::jsonb)
      INTO v_changed FROM jsonb_each(v_new) AS e(k, value);
  ELSIF TG_OP = 'DELETE' THEN
    SELECT COALESCE(jsonb_object_agg(k, jsonb_build_object('old', value, 'new', NULL)), '{}'::jsonb)
      INTO v_changed FROM jsonb_each(v_old) AS e(k, value);
  ELSE
    SELECT COALESCE(jsonb_object_agg(n.key, jsonb_build_object('old', o.value, 'new', n.value)), '{}'::jsonb)
      INTO v_changed
      FROM jsonb_each(v_new) AS n
      JOIN jsonb_each(v_old) AS o ON o.key = n.key
      WHERE n.value IS DISTINCT FROM o.value;
    IF v_changed = '{}'::jsonb THEN
      RETURN NEW;
    END IF;
  END IF;

  v_entity_id := COALESCE(
    NULLIF(COALESCE(v_new, v_old) ->> 'id', '')::uuid,
    NULLIF(COALESCE(v_new, v_old) ->> 'user_id', '')::uuid
  );
  v_entity_label := COALESCE(
    NULLIF(COALESCE(v_new, v_old) ->> 'bill_number', ''),
    NULLIF(COALESCE(v_new, v_old) ->> 'name', ''),
    NULLIF(COALESCE(v_new, v_old) ->> 'employee_name', ''),
    NULLIF(COALESCE(v_new, v_old) ->> 'full_name', ''),
    CASE WHEN v_entity_id IS NOT NULL THEN left(v_entity_id::text, 8) END
  );

  IF TG_TABLE_NAME = 'payments' THEN
    SELECT concat_ws(' · ', s.name, COALESCE(b.bill_number, 'Advance payment'))
      INTO v_entity_label
      FROM public.shops s
      LEFT JOIN public.bills b ON b.id = NULLIF(COALESCE(v_new, v_old) ->> 'bill_id', '')::uuid
      WHERE s.id = NULLIF(COALESCE(v_new, v_old) ->> 'shop_id', '')::uuid;
  ELSIF TG_TABLE_NAME = 'payment_allocations' THEN
    SELECT concat_ws(' · ', s.name, b.bill_number)
      INTO v_entity_label
      FROM public.bills b
      JOIN public.shops s ON s.id = b.shop_id
      WHERE b.id = NULLIF(COALESCE(v_new, v_old) ->> 'bill_id', '')::uuid;
  ELSIF TG_TABLE_NAME = 'payment_corrections' THEN
    SELECT concat_ws(' · ', s.name, COALESCE(b.bill_number, 'Payment correction'))
      INTO v_entity_label
      FROM public.payments p
      JOIN public.shops s ON s.id = p.shop_id
      LEFT JOIN public.bills b ON b.id = p.bill_id
      WHERE p.id = NULLIF(COALESCE(v_new, v_old) ->> 'payment_id', '')::uuid;
  END IF;

  IF TG_TABLE_NAME = 'profiles' THEN
    v_actor_name := COALESCE(v_new ->> 'full_name', v_old ->> 'full_name');
  END IF;
  IF v_actor_id IS NOT NULL THEN
    SELECT COALESCE(v_actor_name, p.full_name)
      INTO v_actor_name
      FROM public.profiles p
      WHERE p.id = v_actor_id;
  END IF;

  INSERT INTO public.audit_logs (
    actor_id, actor_name, actor_email, action, entity_type, entity_id,
    entity_label, old_data, new_data, changed_fields
  ) VALUES (
    v_actor_id,
    COALESCE(v_actor_name, v_actor_email, 'System'),
    v_actor_email,
    TG_OP,
    TG_TABLE_NAME,
    v_entity_id,
    v_entity_label,
    v_old,
    v_new,
    v_changed
  );

  IF TG_OP = 'DELETE' THEN RETURN OLD; END IF;
  RETURN NEW;
END;
$$;

DO $$
DECLARE
  t text;
BEGIN
  FOREACH t IN ARRAY ARRAY[
    'shops',
    'bills',
    'payments',
    'payment_allocations',
    'payment_corrections',
    'profiles',
    'user_roles'
  ]
  LOOP
    EXECUTE format('DROP TRIGGER IF EXISTS audit_%I_changes ON public.%I', t, t);
    EXECUTE format(
      'CREATE TRIGGER audit_%I_changes AFTER INSERT OR UPDATE OR DELETE ON public.%I FOR EACH ROW EXECUTE FUNCTION public.capture_audit_log()',
      t, t
    );
  END LOOP;
END;
$$;
