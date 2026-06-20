ALTER TABLE public.organizations 
  ADD COLUMN IF NOT EXISTS is_suspended boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS suspension_reason text;

UPDATE public.organizations 
  SET is_suspended = true, 
      suspension_reason = 'Payment Pending. Please contact support to resume your subscription.'
  WHERE slug = 'kids-zone';