-- ADEEBAAREEBA: salesman commission rows were stored under the bill header,
-- so Salesman Commission qty counted another person's pieces on that header.
-- Move each row onto the line salesman (sale_items.salesman, else sales.salesman).
-- sale_amount, commission_amount, and payment_status stay as stored.
-- Org: b230c582-4f0b-420f-b18b-bef26c2f5ce8 (slug adeebaareeba).
-- Dry-run (no writes): scripts/dry-run-adeeba-commission-line-salesman.sql
-- Tag: [commission_line_salesman_repair_20261004]

DO $$
DECLARE
  v_org uuid := 'b230c582-4f0b-420f-b18b-bef26c2f5ce8';
  r_comm record;
  r_item record;
  v_emp uuid;
  v_notes text;
  v_to_name text;
BEGIN
  CREATE TEMP TABLE comm_open ON COMMIT DROP AS
  SELECT
    sc.id,
    sc.sale_id,
    sc.product_id,
    sc.product_name,
    sc.sale_amount,
    sc.employee_name,
    sc.employee_id,
    sc.notes,
    sc.commission_amount,
    sc.payment_status,
    sc.created_at
  FROM public.salesman_commissions sc
  WHERE sc.organization_id = v_org
    AND sc.sale_id IS NOT NULL;

  CREATE TEMP TABLE item_open ON COMMIT DROP AS
  SELECT
    si.id,
    si.sale_id,
    si.product_id::text AS product_id,
    si.product_name,
    si.quantity,
    si.created_at,
    CASE
      WHEN COALESCE(si.net_after_discount, 0) > 0 THEN si.net_after_discount
      ELSE GREATEST(0::numeric, COALESCE(si.line_total, 0) - COALESCE(si.discount_share, 0))
    END AS line_net,
    btrim(COALESCE(NULLIF(btrim(si.salesman), ''), s.salesman)) AS line_salesman,
    false AS used
  FROM public.sale_items si
  JOIN public.sales s
    ON s.id = si.sale_id
   AND s.organization_id = v_org
  WHERE si.organization_id = v_org
    AND si.deleted_at IS NULL
    AND s.deleted_at IS NULL;

  FOR r_comm IN
    SELECT * FROM comm_open ORDER BY id
  LOOP
    SELECT *
    INTO r_item
    FROM item_open i
    WHERE i.used = false
      AND i.sale_id = r_comm.sale_id
      AND (
        (r_comm.product_id IS NOT NULL AND i.product_id = r_comm.product_id)
        OR lower(btrim(COALESCE(i.product_name, ''))) = lower(btrim(COALESCE(r_comm.product_name, '')))
      )
    ORDER BY
      CASE
        WHEN btrim(COALESCE(i.line_salesman, '')) <> ''
         AND btrim(i.line_salesman) = btrim(COALESCE(r_comm.employee_name, ''))
        THEN 0 ELSE 1
      END,
      CASE
        WHEN abs(i.line_net - COALESCE(r_comm.sale_amount, 0)) <= 0.05 THEN 0
        ELSE 1
      END,
      i.created_at,
      i.id
    LIMIT 1;

    IF NOT FOUND OR r_item.id IS NULL THEN
      CONTINUE;
    END IF;

    UPDATE item_open SET used = true WHERE id = r_item.id;

    v_to_name := btrim(COALESCE(r_item.line_salesman, ''));
    IF v_to_name = '' OR v_to_name = btrim(COALESCE(r_comm.employee_name, '')) THEN
      CONTINUE;
    END IF;

    SELECT e.id
    INTO v_emp
    FROM public.employees e
    WHERE e.organization_id = v_org
      AND e.deleted_at IS NULL
      AND e.employee_name = v_to_name
    ORDER BY e.created_at
    LIMIT 1;

    v_notes := btrim(COALESCE(r_comm.notes, ''));
    IF v_notes NOT LIKE '%[commission_line_salesman_repair_20261004]%' THEN
      v_notes := CASE
        WHEN v_notes = '' THEN '[commission_line_salesman_repair_20261004]'
        ELSE v_notes || ' [commission_line_salesman_repair_20261004]'
      END;
    END IF;

    UPDATE public.salesman_commissions sc
    SET
      employee_name = v_to_name,
      employee_id = v_emp,
      notes = v_notes,
      updated_at = now()
    WHERE sc.id = r_comm.id
      AND sc.organization_id = v_org;
  END LOOP;
END $$;
