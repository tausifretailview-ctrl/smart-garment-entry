-- Industrial mode, Phase 3 step 3d (part 2): "Dispatch from" godown on Delivery Challans.
--
-- A delivery challan moves no stock (it has been a document only since October 2026), so this
-- part only keeps the godown a challan was sent from. When the challan becomes a Sales Invoice,
-- the screen sends that invoice out of the same godown with godown_sync_doc('sale', ...) from
-- step 3d-1, so the goods leave that godown at the moment they leave the shop's stock.
--
-- Changes two functions from step 3d-1 (_godown_doc_head and godown_sync_doc). No table,
-- trigger or challan function changes, and nothing runs for shops not using godowns.

DO $$
BEGIN
  IF to_regclass('public.godown_doc_places') IS NULL THEN
    RAISE EXCEPTION 'Run the Phase 3 step 3d-1 SQL first';
  END IF;
END;
$$;

-- 1. A document's header now also knows delivery challans. ------------------------------------
CREATE OR REPLACE FUNCTION public._godown_doc_head(p_ref_type text, p_doc_id uuid)
RETURNS TABLE (organization_id uuid, doc_no text, doc_date date, active boolean)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT s.organization_id, s.sale_number, (s.sale_date AT TIME ZONE 'Asia/Kolkata')::date,
         (s.deleted_at IS NULL AND NOT COALESCE(s.is_cancelled, false))
    FROM public.sales s
   WHERE p_ref_type = 'sale' AND s.id = p_doc_id
  UNION ALL
  SELECT c.organization_id, c.challan_number, (c.challan_date AT TIME ZONE 'Asia/Kolkata')::date,
         (c.deleted_at IS NULL AND COALESCE(c.status, '') <> 'cancelled')
    FROM public.delivery_challans c
   WHERE p_ref_type = 'challan' AND c.id = p_doc_id;
$$;

-- 2. Called by the screens after a save. A challan only keeps its godown (no stock moves);
--    a sale takes its goods from the godown as in step 3d-1. Pass Main to go back to the shop.
CREATE OR REPLACE FUNCTION public.godown_sync_doc(p_ref_type text, p_doc_id uuid, p_godown_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_org uuid;
  v_out jsonb;
  v_g public.godowns%ROWTYPE;
BEGIN
  SELECT h.organization_id INTO v_org FROM public._godown_doc_head(p_ref_type, p_doc_id) h;
  IF v_org IS NULL THEN
    RAISE EXCEPTION 'Document not found';
  END IF;
  PERFORM public._assert_org_access(v_org);
  IF p_godown_id IS NULL THEN
    RAISE EXCEPTION 'Pick the godown the goods go out of';
  END IF;

  IF p_ref_type = 'challan' THEN
    SELECT * INTO v_g
      FROM public.godowns g
     WHERE g.id = p_godown_id AND g.organization_id = v_org;
    IF NOT FOUND THEN
      RAISE EXCEPTION 'Pick the godown the goods go out of';
    END IF;
    IF NOT v_g.is_active AND NOT EXISTS (
      SELECT 1 FROM public.godown_doc_places dp
       WHERE dp.ref_type = p_ref_type AND dp.doc_id = p_doc_id AND dp.godown_id = v_g.id
    ) THEN
      RAISE EXCEPTION 'Godown % is closed. Pick another godown.', v_g.name;
    END IF;
    v_out := jsonb_build_object('godown_id', v_g.id, 'godown_name', v_g.name, 'is_main', v_g.godown_type = 'main',
                                'moved', 0, 'moved_back', 0, 'short', '[]'::jsonb);
  ELSE
    v_out := public._godown_sync_doc(v_org, p_ref_type, p_doc_id, p_godown_id,
                                     initcap(replace(p_ref_type, '_', ' ')));
  END IF;

  IF COALESCE((v_out ->> 'is_main')::boolean, true) THEN
    DELETE FROM public.godown_doc_places WHERE ref_type = p_ref_type AND doc_id = p_doc_id;
  ELSE
    INSERT INTO public.godown_doc_places AS dp (ref_type, doc_id, organization_id, godown_id, updated_at, updated_by)
    VALUES (p_ref_type, p_doc_id, v_org, p_godown_id, now(), auth.uid())
    ON CONFLICT (ref_type, doc_id)
    DO UPDATE SET godown_id = EXCLUDED.godown_id, updated_at = now(), updated_by = auth.uid();
  END IF;
  RETURN v_out;
END;
$$;

REVOKE ALL ON FUNCTION public._godown_doc_head(text, uuid) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.godown_sync_doc(text, uuid, uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.godown_sync_doc(text, uuid, uuid) TO authenticated;

NOTIFY pgrst, 'reload schema';
