-- Add policy to allow admins to insert roles for any user
CREATE POLICY "Admins can insert roles for users"
ON public.user_roles
FOR INSERT
WITH CHECK (has_role(auth.uid(), 'admin'::app_role) OR has_role(auth.uid(), 'platform_admin'::app_role));