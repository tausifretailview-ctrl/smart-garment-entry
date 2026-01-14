-- Add RLS policy to allow platform admins to view all WhatsApp logs
CREATE POLICY "Platform admins can view all whatsapp logs" 
ON public.whatsapp_logs 
FOR SELECT 
USING (
  has_role(auth.uid(), 'platform_admin'::app_role)
);