-- Calendar - Planner (Nov 2026): work entries on dates.
--
-- planner_entries: one row per task / payment collection / cheque deposit / supplier payment /
-- other note on a date, with the employees it is for. Phase 1 is a reminder only: a cheque or
-- collection entry does not post anything to the accounts.
-- * entry_type: task | collection | cheque | supplier_payment | other
-- * status: pending | done | cancelled. A pending entry on or before today shows red.
-- * cheque_status (cheque entries): received | deposited | cleared | bounced
-- * assigned_employee_ids: employees (Employee Master) tagged on the entry.
-- * deleted_at: removed entries stay for history.
-- Row rules: members of the organization read and write their organization's entries; a linked
-- customer / supplier must be the same organization's.
-- Safe to run more than once.

CREATE TABLE IF NOT EXISTS public.planner_entries (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  entry_date date NOT NULL,
  entry_time time,
  entry_type text NOT NULL DEFAULT 'task'
    CHECK (entry_type IN ('task', 'collection', 'cheque', 'supplier_payment', 'other')),
  title text NOT NULL CHECK (length(btrim(title)) > 0),
  notes text,
  customer_id uuid REFERENCES public.customers(id) ON DELETE SET NULL,
  supplier_id uuid REFERENCES public.suppliers(id) ON DELETE SET NULL,
  party_name text,
  amount numeric(14, 2) CHECK (amount IS NULL OR amount >= 0),
  cheque_number text,
  bank_name text,
  cheque_status text CHECK (cheque_status IS NULL OR cheque_status IN ('received', 'deposited', 'cleared', 'bounced')),
  priority text NOT NULL DEFAULT 'normal' CHECK (priority IN ('normal', 'high')),
  status text NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'done', 'cancelled')),
  assigned_employee_ids uuid[] NOT NULL DEFAULT '{}',
  done_at timestamptz,
  done_by uuid,
  created_by uuid DEFAULT auth.uid(),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  deleted_at timestamptz
);

CREATE INDEX IF NOT EXISTS planner_entries_org_date_idx
  ON public.planner_entries (organization_id, entry_date)
  WHERE deleted_at IS NULL;
CREATE INDEX IF NOT EXISTS planner_entries_org_pending_idx
  ON public.planner_entries (organization_id, entry_date)
  WHERE deleted_at IS NULL AND status = 'pending';
CREATE INDEX IF NOT EXISTS planner_entries_assigned_idx
  ON public.planner_entries USING gin (assigned_employee_ids);

CREATE OR REPLACE FUNCTION public.planner_entries_touch()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public, pg_temp
AS $$
BEGIN
  NEW.updated_at := now();
  IF NEW.status = 'done' AND (TG_OP = 'INSERT' OR OLD.status IS DISTINCT FROM 'done') THEN
    NEW.done_at := coalesce(NEW.done_at, now());
    NEW.done_by := coalesce(NEW.done_by, auth.uid());
  ELSIF NEW.status <> 'done' THEN
    NEW.done_at := NULL;
    NEW.done_by := NULL;
  END IF;
  IF TG_OP = 'UPDATE' THEN
    -- The shop and the author of an entry do not change.
    NEW.organization_id := OLD.organization_id;
    NEW.created_by := OLD.created_by;
    NEW.created_at := OLD.created_at;
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS planner_entries_touch ON public.planner_entries;
CREATE TRIGGER planner_entries_touch
  BEFORE INSERT OR UPDATE ON public.planner_entries
  FOR EACH ROW EXECUTE FUNCTION public.planner_entries_touch();

ALTER TABLE public.planner_entries ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS planner_entries_select ON public.planner_entries;
CREATE POLICY planner_entries_select ON public.planner_entries
  FOR SELECT TO authenticated
  USING (organization_id IN (SELECT public.get_user_organization_ids(auth.uid())));

DROP POLICY IF EXISTS planner_entries_insert ON public.planner_entries;
CREATE POLICY planner_entries_insert ON public.planner_entries
  FOR INSERT TO authenticated
  WITH CHECK (
    organization_id IN (SELECT public.get_user_organization_ids(auth.uid()))
    AND (customer_id IS NULL OR EXISTS (
      SELECT 1 FROM public.customers c WHERE c.id = customer_id AND c.organization_id = planner_entries.organization_id))
    AND (supplier_id IS NULL OR EXISTS (
      SELECT 1 FROM public.suppliers s WHERE s.id = supplier_id AND s.organization_id = planner_entries.organization_id)));

DROP POLICY IF EXISTS planner_entries_update ON public.planner_entries;
CREATE POLICY planner_entries_update ON public.planner_entries
  FOR UPDATE TO authenticated
  USING (organization_id IN (SELECT public.get_user_organization_ids(auth.uid())))
  WITH CHECK (
    organization_id IN (SELECT public.get_user_organization_ids(auth.uid()))
    AND (customer_id IS NULL OR EXISTS (
      SELECT 1 FROM public.customers c WHERE c.id = customer_id AND c.organization_id = planner_entries.organization_id))
    AND (supplier_id IS NULL OR EXISTS (
      SELECT 1 FROM public.suppliers s WHERE s.id = supplier_id AND s.organization_id = planner_entries.organization_id)));

-- Entries are removed by setting deleted_at (an update); no hard delete from the app.
DROP POLICY IF EXISTS planner_entries_delete ON public.planner_entries;

GRANT SELECT, INSERT, UPDATE ON public.planner_entries TO authenticated;

-- Checks (read-only) after running:
--   SELECT count(*) FROM public.planner_entries;
