-- Food shops: optional FSSAI licence number on customers (shop number lives in settings.bill_barcode_settings).
ALTER TABLE public.customers ADD COLUMN IF NOT EXISTS fssai_number TEXT DEFAULT NULL;
