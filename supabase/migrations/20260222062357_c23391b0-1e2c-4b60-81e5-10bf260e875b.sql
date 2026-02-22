-- Allow fee_head_id to be nullable for imported balance fee collections
ALTER TABLE public.student_fees ALTER COLUMN fee_head_id DROP NOT NULL;