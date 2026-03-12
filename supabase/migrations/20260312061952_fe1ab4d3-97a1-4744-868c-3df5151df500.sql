
ALTER TABLE public.students ADD COLUMN IF NOT EXISTS is_new_admission boolean NOT NULL DEFAULT false;
