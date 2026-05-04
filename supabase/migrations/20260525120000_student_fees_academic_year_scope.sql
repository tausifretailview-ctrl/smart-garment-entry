-- Fee receipts live in student_fees; academic_year_id scopes payments to a session.
-- Net carried opening (fees_opening_is_net) must not be reduced by receipts tagged to the wrong year.

COMMENT ON COLUMN public.student_fees.academic_year_id IS
  'Academic session for this fee line. Balance queries scope payments to the active session so net carried-forward opening is not reduced twice.';

CREATE INDEX IF NOT EXISTS idx_student_fees_org_student_ay
  ON public.student_fees (organization_id, student_id, academic_year_id)
  WHERE status IS DISTINCT FROM 'deleted';
