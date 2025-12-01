-- Create table to track login attempts
CREATE TABLE IF NOT EXISTS public.login_attempts (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  identifier TEXT NOT NULL, -- email or IP address
  attempt_type TEXT NOT NULL, -- 'email' or 'ip'
  attempts INTEGER DEFAULT 1,
  last_attempt_at TIMESTAMPTZ DEFAULT now(),
  locked_until TIMESTAMPTZ,
  created_at TIMESTAMPTZ DEFAULT now()
);

-- Create index for faster lookups
CREATE INDEX IF NOT EXISTS idx_login_attempts_identifier ON public.login_attempts(identifier, attempt_type);
CREATE INDEX IF NOT EXISTS idx_login_attempts_locked_until ON public.login_attempts(locked_until);

-- Enable RLS
ALTER TABLE public.login_attempts ENABLE ROW LEVEL SECURITY;

-- Create function to clean up old attempts
CREATE OR REPLACE FUNCTION public.cleanup_old_login_attempts()
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  DELETE FROM public.login_attempts
  WHERE last_attempt_at < now() - INTERVAL '24 hours';
END;
$$;

-- Create function to check and record login attempts
CREATE OR REPLACE FUNCTION public.record_login_attempt(
  p_identifier TEXT,
  p_attempt_type TEXT,
  p_success BOOLEAN DEFAULT FALSE
)
RETURNS JSON
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_max_attempts INTEGER := 5;
  v_lockout_duration INTERVAL := '15 minutes';
  v_attempt_record RECORD;
  v_result JSON;
BEGIN
  -- Clean up old attempts first
  PERFORM cleanup_old_login_attempts();
  
  -- Get existing attempt record
  SELECT * INTO v_attempt_record
  FROM public.login_attempts
  WHERE identifier = p_identifier 
    AND attempt_type = p_attempt_type
  FOR UPDATE;
  
  -- Check if currently locked
  IF v_attempt_record.locked_until IS NOT NULL 
     AND v_attempt_record.locked_until > now() THEN
    v_result := json_build_object(
      'allowed', false,
      'locked_until', v_attempt_record.locked_until,
      'attempts', v_attempt_record.attempts,
      'message', 'Too many failed attempts. Please try again later.'
    );
    RETURN v_result;
  END IF;
  
  -- If successful login, clear the record
  IF p_success THEN
    DELETE FROM public.login_attempts
    WHERE identifier = p_identifier 
      AND attempt_type = p_attempt_type;
    
    v_result := json_build_object(
      'allowed', true,
      'attempts', 0,
      'message', 'Login successful'
    );
    RETURN v_result;
  END IF;
  
  -- Record failed attempt
  IF v_attempt_record IS NULL THEN
    -- First attempt
    INSERT INTO public.login_attempts (identifier, attempt_type, attempts)
    VALUES (p_identifier, p_attempt_type, 1);
    
    v_result := json_build_object(
      'allowed', true,
      'attempts', 1,
      'remaining', v_max_attempts - 1,
      'message', 'Login attempt recorded'
    );
  ELSE
    -- Increment attempts
    UPDATE public.login_attempts
    SET attempts = attempts + 1,
        last_attempt_at = now(),
        locked_until = CASE 
          WHEN attempts + 1 >= v_max_attempts 
          THEN now() + v_lockout_duration
          ELSE NULL
        END
    WHERE identifier = p_identifier 
      AND attempt_type = p_attempt_type
    RETURNING * INTO v_attempt_record;
    
    IF v_attempt_record.locked_until IS NOT NULL THEN
      v_result := json_build_object(
        'allowed', false,
        'locked_until', v_attempt_record.locked_until,
        'attempts', v_attempt_record.attempts,
        'message', 'Account temporarily locked due to too many failed attempts'
      );
    ELSE
      v_result := json_build_object(
        'allowed', true,
        'attempts', v_attempt_record.attempts,
        'remaining', v_max_attempts - v_attempt_record.attempts,
        'message', 'Login attempt recorded'
      );
    END IF;
  END IF;
  
  RETURN v_result;
END;
$$;