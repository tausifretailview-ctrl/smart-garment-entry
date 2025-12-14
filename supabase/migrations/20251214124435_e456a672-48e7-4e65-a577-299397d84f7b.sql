-- Add phone column to legacy_invoices table for secondary matching criteria
ALTER TABLE public.legacy_invoices ADD COLUMN IF NOT EXISTS phone text;