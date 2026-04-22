-- Allow org members to delete their own advance bookings (was missing — caused silent failures)
CREATE POLICY "Users can delete advances for their organization"
ON public.customer_advances
FOR DELETE
USING (
  organization_id IN (
    SELECT organization_members.organization_id
    FROM organization_members
    WHERE organization_members.user_id = auth.uid()
  )
);

-- Allow org members to delete refund records (needed when cleaning up an advance)
CREATE POLICY "Users can delete refunds in their organization"
ON public.advance_refunds
FOR DELETE
USING (
  organization_id IN (
    SELECT organization_members.organization_id
    FROM organization_members
    WHERE organization_members.user_id = auth.uid()
  )
);

-- Cascade refunds when an advance is deleted, so FK does not block deletion
ALTER TABLE public.advance_refunds
  DROP CONSTRAINT IF EXISTS advance_refunds_advance_id_fkey;

ALTER TABLE public.advance_refunds
  ADD CONSTRAINT advance_refunds_advance_id_fkey
  FOREIGN KEY (advance_id) REFERENCES public.customer_advances(id) ON DELETE CASCADE;