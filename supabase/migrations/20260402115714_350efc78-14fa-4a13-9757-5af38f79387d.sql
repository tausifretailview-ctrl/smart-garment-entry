
DROP POLICY IF EXISTS "org_fee_receipt_sequence_all" ON fee_receipt_sequence;

CREATE POLICY "org_fee_receipt_sequence_select" ON fee_receipt_sequence
  FOR SELECT USING (organization_id IN (
    SELECT organization_id FROM organization_members WHERE user_id = auth.uid()
  ));

CREATE POLICY "org_fee_receipt_sequence_insert" ON fee_receipt_sequence
  FOR INSERT WITH CHECK (organization_id IN (
    SELECT organization_id FROM organization_members WHERE user_id = auth.uid()
  ));

CREATE POLICY "org_fee_receipt_sequence_update" ON fee_receipt_sequence
  FOR UPDATE USING (organization_id IN (
    SELECT organization_id FROM organization_members WHERE user_id = auth.uid()
  ));
