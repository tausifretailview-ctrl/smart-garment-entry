-- Activity Log: product edits stored the whole product row twice (before + after),
-- ~1.7 KB per edit. On 28 Oct 2026 that was 107k of 161k audit_logs rows and
-- 171 MB of the 239 MB table.
--
-- Product UPDATE rows now keep only the changed columns, plus product_name,
-- brand and category so Activity Log and Price History still show which product
-- it was. Edits that change nothing except updated_at are no longer logged.
-- CREATE and DELETE rows are unchanged. Existing rows are not touched.

CREATE OR REPLACE FUNCTION public.audit_product_changes()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_old jsonb;
  v_new jsonb;
  v_old_changed jsonb := '{}'::jsonb;
  v_new_changed jsonb := '{}'::jsonb;
  v_key text;
BEGIN
  IF TG_OP = 'INSERT' THEN
    PERFORM log_audit(
      'CREATE',
      'product',
      NEW.id,
      NULL,
      to_jsonb(NEW),
      jsonb_build_object('table', 'products')
    );
  ELSIF TG_OP = 'UPDATE' THEN
    v_old := to_jsonb(OLD);
    v_new := to_jsonb(NEW);
    FOR v_key IN SELECT jsonb_object_keys(v_new) LOOP
      IF v_key <> 'updated_at' AND (v_old -> v_key) IS DISTINCT FROM (v_new -> v_key) THEN
        v_old_changed := v_old_changed || jsonb_build_object(v_key, v_old -> v_key);
        v_new_changed := v_new_changed || jsonb_build_object(v_key, v_new -> v_key);
      END IF;
    END LOOP;

    IF v_new_changed = '{}'::jsonb THEN
      RETURN NEW;
    END IF;

    PERFORM log_audit(
      'UPDATE',
      'product',
      NEW.id,
      jsonb_build_object('product_name', OLD.product_name, 'brand', OLD.brand, 'category', OLD.category) || v_old_changed,
      jsonb_build_object('product_name', NEW.product_name, 'brand', NEW.brand, 'category', NEW.category) || v_new_changed,
      jsonb_build_object('table', 'products')
    );
  ELSIF TG_OP = 'DELETE' THEN
    PERFORM log_audit(
      'DELETE',
      'product',
      OLD.id,
      to_jsonb(OLD),
      NULL,
      jsonb_build_object('table', 'products')
    );
  END IF;

  RETURN COALESCE(NEW, OLD);
END;
$$;
