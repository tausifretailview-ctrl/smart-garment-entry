-- Allow reusing admission_number after soft-delete (deleted_at set).
-- Active students (deleted_at IS NULL) remain unique per org + admission_number.

ALTER TABLE public.students
  DROP CONSTRAINT IF EXISTS students_organization_id_admission_number_key;

CREATE UNIQUE INDEX IF NOT EXISTS students_organization_id_admission_number_active_key
  ON public.students (organization_id, admission_number)
  WHERE deleted_at IS NULL;
