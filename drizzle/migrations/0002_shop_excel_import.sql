ALTER TABLE public.shops ADD COLUMN shop_name text, ADD COLUMN contact_person text, ADD COLUMN mobile_number text, ADD COLUMN area text, ADD COLUMN incharge text;
UPDATE public.shops SET shop_name = name, contact_person = contact_name, mobile_number = phone;
CREATE OR REPLACE FUNCTION public.sync_shop_import_fields() RETURNS trigger LANGUAGE plpgsql SET search_path = public AS $$
BEGIN
 IF TG_OP = 'INSERT' THEN
  NEW.name := COALESCE(NEW.shop_name, NEW.name);
  NEW.shop_name := NEW.name;
  NEW.contact_name := COALESCE(NEW.contact_person, NEW.contact_name);
  NEW.contact_person := NEW.contact_name;
  NEW.phone := COALESCE(NEW.mobile_number, NEW.phone);
  NEW.mobile_number := NEW.phone;
 ELSE
  IF NEW.shop_name IS DISTINCT FROM OLD.shop_name THEN NEW.name := NEW.shop_name; ELSE NEW.shop_name := NEW.name; END IF;
  IF NEW.contact_person IS DISTINCT FROM OLD.contact_person THEN NEW.contact_name := NEW.contact_person; ELSE NEW.contact_person := NEW.contact_name; END IF;
  IF NEW.mobile_number IS DISTINCT FROM OLD.mobile_number THEN NEW.phone := NEW.mobile_number; ELSE NEW.mobile_number := NEW.phone; END IF;
 END IF;
 RETURN NEW;
END $$;
CREATE TRIGGER sync_shop_import_fields BEFORE INSERT OR UPDATE ON public.shops FOR EACH ROW EXECUTE FUNCTION public.sync_shop_import_fields();
CREATE OR REPLACE FUNCTION public.import_shops(_rows jsonb) RETURNS jsonb LANGUAGE plpgsql SECURITY INVOKER SET search_path = public AS $$
DECLARE r jsonb; result jsonb := '[]'::jsonb; mobile text; new_id uuid; row_no integer; reason text;
BEGIN
 IF NOT public.has_role(auth.uid(), 'owner'::public.app_role) THEN RAISE EXCEPTION 'Only the owner can import shops'; END IF;
 IF jsonb_typeof(_rows) IS DISTINCT FROM 'array' THEN RAISE EXCEPTION 'Expected shop records'; END IF;
 IF jsonb_array_length(_rows) < 1 OR jsonb_array_length(_rows) > 5000 THEN RAISE EXCEPTION 'Invalid number of records'; END IF;
 LOCK TABLE public.shops IN SHARE ROW EXCLUSIVE MODE;
 FOR r IN SELECT value FROM jsonb_array_elements(_rows) LOOP
  row_no := COALESCE((r->>'row_number')::integer, 0);
  BEGIN
   reason := NULL;
   IF jsonb_typeof(r->'shop_name') IS DISTINCT FROM 'string' OR length(btrim(r->>'shop_name')) = 0 THEN reason := 'Shop Name is required'; END IF;
   IF jsonb_typeof(r->'mobile_number') IS DISTINCT FROM 'string' THEN reason := 'Mobile Number must be text'; END IF;
   IF length(COALESCE(r->>'shop_name','')) > 120 OR length(COALESCE(r->>'contact_person','')) > 120 OR length(COALESCE(r->>'mobile_number','')) > 40 OR length(COALESCE(r->>'area','')) > 200 OR length(COALESCE(r->>'address','')) > 1000 OR length(COALESCE(r->>'incharge','')) > 120 THEN reason := 'One or more fields are too long'; END IF;
   mobile := regexp_replace(COALESCE(r->>'mobile_number',''), '[^0-9]', '', 'g');
   IF btrim(COALESCE(r->>'mobile_number','')) <> '' AND (length(mobile) < 7 OR length(mobile) > 15 OR (r->>'mobile_number') !~ '^\+?[0-9 ()-]+$') THEN reason := 'Invalid Mobile Number'; END IF;
   IF reason IS NOT NULL THEN
    result := result || jsonb_build_array(jsonb_build_object('row_number', row_no, 'status', 'failed', 'message', reason));
   ELSIF mobile <> '' AND EXISTS (SELECT 1 FROM public.shops s WHERE regexp_replace(COALESCE(s.mobile_number,s.phone,''), '[^0-9]', '', 'g') = mobile) THEN
    result := result || jsonb_build_array(jsonb_build_object('row_number', row_no, 'status', 'duplicate', 'message', 'Mobile number already exists'));
   ELSE
    INSERT INTO public.shops (name, shop_name, contact_person, mobile_number, area, address, incharge)
    VALUES (btrim(r->>'shop_name'), btrim(r->>'shop_name'), NULLIF(btrim(r->>'contact_person'),''), NULLIF(btrim(r->>'mobile_number'),''), NULLIF(btrim(r->>'area'),''), NULLIF(btrim(r->>'address'),''), NULLIF(btrim(r->>'incharge'),'')) RETURNING id INTO new_id;
    result := result || jsonb_build_array(jsonb_build_object('row_number', row_no, 'status', 'successful', 'message', 'Imported', 'id', new_id));
   END IF;
  EXCEPTION WHEN OTHERS THEN
   result := result || jsonb_build_array(jsonb_build_object('row_number', row_no, 'status', 'failed', 'message', 'Could not save this shop'));
  END;
 END LOOP;
 RETURN result;
END $$;
REVOKE ALL ON FUNCTION public.import_shops(jsonb) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.import_shops(jsonb) TO authenticated;
