-- Add slug column to organizations table
ALTER TABLE public.organizations 
ADD COLUMN slug TEXT UNIQUE;

-- Update existing organizations with slugs (URL-friendly versions)
UPDATE public.organizations 
SET slug = 'gurukrupasarees' 
WHERE name = 'Gurukrupa Silk Sarees';

UPDATE public.organizations 
SET slug = 'adtechagency' 
WHERE name = 'AdTechAgency';

-- Make slug required after populating existing records
ALTER TABLE public.organizations 
ALTER COLUMN slug SET NOT NULL;

-- Create index for faster slug lookups
CREATE INDEX idx_organizations_slug ON public.organizations(slug);

-- Add RLS policy for public slug lookups (needed for login page)
CREATE POLICY "Anyone can view organization by slug"
ON public.organizations
FOR SELECT
TO public
USING (true);