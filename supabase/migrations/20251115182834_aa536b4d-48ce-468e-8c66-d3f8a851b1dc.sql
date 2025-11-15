-- Create subscription tier enum
CREATE TYPE public.subscription_tier AS ENUM ('free', 'basic', 'professional', 'enterprise');

-- Create organizations table
CREATE TABLE public.organizations (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL,
  subscription_tier subscription_tier NOT NULL DEFAULT 'free',
  enabled_features JSONB NOT NULL DEFAULT '[]'::jsonb,
  settings JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

-- Create organization members table to link users to organizations
CREATE TABLE public.organization_members (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id UUID NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  role app_role NOT NULL DEFAULT 'user',
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  UNIQUE(organization_id, user_id)
);

-- Add organization_id to existing tables
ALTER TABLE public.products ADD COLUMN organization_id UUID REFERENCES public.organizations(id) ON DELETE CASCADE;
ALTER TABLE public.customers ADD COLUMN organization_id UUID REFERENCES public.organizations(id) ON DELETE CASCADE;
ALTER TABLE public.suppliers ADD COLUMN organization_id UUID REFERENCES public.organizations(id) ON DELETE CASCADE;
ALTER TABLE public.employees ADD COLUMN organization_id UUID REFERENCES public.organizations(id) ON DELETE CASCADE;
ALTER TABLE public.sales ADD COLUMN organization_id UUID REFERENCES public.organizations(id) ON DELETE CASCADE;
ALTER TABLE public.purchase_bills ADD COLUMN organization_id UUID REFERENCES public.organizations(id) ON DELETE CASCADE;
ALTER TABLE public.settings ADD COLUMN organization_id UUID REFERENCES public.organizations(id) ON DELETE CASCADE;
ALTER TABLE public.size_groups ADD COLUMN organization_id UUID REFERENCES public.organizations(id) ON DELETE CASCADE;

-- Enable RLS
ALTER TABLE public.organizations ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.organization_members ENABLE ROW LEVEL SECURITY;

-- Create helper function to get user's organization IDs
CREATE OR REPLACE FUNCTION public.get_user_organization_ids(user_id UUID)
RETURNS SETOF UUID
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT organization_id 
  FROM public.organization_members 
  WHERE organization_members.user_id = $1;
$$;

-- Create helper function to check if user belongs to organization
CREATE OR REPLACE FUNCTION public.user_belongs_to_org(user_id UUID, org_id UUID)
RETURNS BOOLEAN
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM public.organization_members
    WHERE organization_members.user_id = $1
      AND organization_members.organization_id = $2
  );
$$;

-- Create helper function to check organization role
CREATE OR REPLACE FUNCTION public.has_org_role(user_id UUID, org_id UUID, required_role app_role)
RETURNS BOOLEAN
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM public.organization_members
    WHERE organization_members.user_id = $1
      AND organization_members.organization_id = $2
      AND organization_members.role = $3
  );
$$;

-- RLS policies for organizations
CREATE POLICY "Users can view their organizations"
  ON public.organizations FOR SELECT
  USING (id IN (SELECT public.get_user_organization_ids(auth.uid())));

CREATE POLICY "Admins can update their organization"
  ON public.organizations FOR UPDATE
  USING (public.has_org_role(auth.uid(), id, 'admin'));

CREATE POLICY "Anyone can create organizations"
  ON public.organizations FOR INSERT
  WITH CHECK (auth.uid() IS NOT NULL);

-- RLS policies for organization_members
CREATE POLICY "Users can view members of their organizations"
  ON public.organization_members FOR SELECT
  USING (organization_id IN (SELECT public.get_user_organization_ids(auth.uid())));

CREATE POLICY "Admins can manage members in their organization"
  ON public.organization_members FOR ALL
  USING (public.has_org_role(auth.uid(), organization_id, 'admin'))
  WITH CHECK (public.has_org_role(auth.uid(), organization_id, 'admin'));

-- Update RLS policies for products
DROP POLICY IF EXISTS "Allow all operations on products for authenticated users" ON public.products;
DROP POLICY IF EXISTS "Allow read" ON public.products;

CREATE POLICY "Users can view products in their organizations"
  ON public.products FOR SELECT
  USING (organization_id IN (SELECT public.get_user_organization_ids(auth.uid())));

CREATE POLICY "Admins and managers can insert products"
  ON public.products FOR INSERT
  WITH CHECK (
    public.user_belongs_to_org(auth.uid(), organization_id)
    AND (public.has_org_role(auth.uid(), organization_id, 'admin') OR public.has_org_role(auth.uid(), organization_id, 'manager'))
  );

CREATE POLICY "Admins and managers can update products"
  ON public.products FOR UPDATE
  USING (
    public.user_belongs_to_org(auth.uid(), organization_id)
    AND (public.has_org_role(auth.uid(), organization_id, 'admin') OR public.has_org_role(auth.uid(), organization_id, 'manager'))
  );

CREATE POLICY "Admins can delete products"
  ON public.products FOR DELETE
  USING (public.has_org_role(auth.uid(), organization_id, 'admin'));

-- Update RLS for product_variants
DROP POLICY IF EXISTS "Allow all operations on product_variants for authenticated user" ON public.product_variants;
DROP POLICY IF EXISTS "Allow read" ON public.product_variants;

CREATE POLICY "Users can view variants in their organizations"
  ON public.product_variants FOR SELECT
  USING (
    product_id IN (
      SELECT id FROM public.products 
      WHERE organization_id IN (SELECT public.get_user_organization_ids(auth.uid()))
    )
  );

CREATE POLICY "Admins and managers can manage variants"
  ON public.product_variants FOR ALL
  USING (
    product_id IN (
      SELECT p.id FROM public.products p
      WHERE p.organization_id IN (SELECT public.get_user_organization_ids(auth.uid()))
        AND (public.has_org_role(auth.uid(), p.organization_id, 'admin') 
             OR public.has_org_role(auth.uid(), p.organization_id, 'manager'))
    )
  )
  WITH CHECK (
    product_id IN (
      SELECT p.id FROM public.products p
      WHERE p.organization_id IN (SELECT public.get_user_organization_ids(auth.uid()))
        AND (public.has_org_role(auth.uid(), p.organization_id, 'admin') 
             OR public.has_org_role(auth.uid(), p.organization_id, 'manager'))
    )
  );

-- Update RLS for customers
DROP POLICY IF EXISTS "Authenticated users can view customers" ON public.customers;
DROP POLICY IF EXISTS "Admins and managers can insert customers" ON public.customers;
DROP POLICY IF EXISTS "Admins and managers can update customers" ON public.customers;
DROP POLICY IF EXISTS "Only admins can delete customers" ON public.customers;

CREATE POLICY "Users can view customers in their organizations"
  ON public.customers FOR SELECT
  USING (organization_id IN (SELECT public.get_user_organization_ids(auth.uid())));

CREATE POLICY "Admins and managers can manage customers"
  ON public.customers FOR INSERT
  WITH CHECK (
    public.user_belongs_to_org(auth.uid(), organization_id)
    AND (public.has_org_role(auth.uid(), organization_id, 'admin') OR public.has_org_role(auth.uid(), organization_id, 'manager'))
  );

CREATE POLICY "Admins and managers can update customers"
  ON public.customers FOR UPDATE
  USING (
    public.user_belongs_to_org(auth.uid(), organization_id)
    AND (public.has_org_role(auth.uid(), organization_id, 'admin') OR public.has_org_role(auth.uid(), organization_id, 'manager'))
  );

CREATE POLICY "Admins can delete customers"
  ON public.customers FOR DELETE
  USING (public.has_org_role(auth.uid(), organization_id, 'admin'));

-- Update RLS for suppliers
DROP POLICY IF EXISTS "Authenticated users can view suppliers" ON public.suppliers;
DROP POLICY IF EXISTS "Admins and managers can insert suppliers" ON public.suppliers;
DROP POLICY IF EXISTS "Admins and managers can update suppliers" ON public.suppliers;
DROP POLICY IF EXISTS "Only admins can delete suppliers" ON public.suppliers;

CREATE POLICY "Users can view suppliers in their organizations"
  ON public.suppliers FOR SELECT
  USING (organization_id IN (SELECT public.get_user_organization_ids(auth.uid())));

CREATE POLICY "Admins and managers can manage suppliers"
  ON public.suppliers FOR ALL
  USING (
    public.user_belongs_to_org(auth.uid(), organization_id)
    AND (public.has_org_role(auth.uid(), organization_id, 'admin') OR public.has_org_role(auth.uid(), organization_id, 'manager'))
  )
  WITH CHECK (
    public.user_belongs_to_org(auth.uid(), organization_id)
    AND (public.has_org_role(auth.uid(), organization_id, 'admin') OR public.has_org_role(auth.uid(), organization_id, 'manager'))
  );

-- Update RLS for employees
DROP POLICY IF EXISTS "Authenticated users can view employees" ON public.employees;
DROP POLICY IF EXISTS "Admins and managers can insert employees" ON public.employees;
DROP POLICY IF EXISTS "Admins and managers can update employees" ON public.employees;
DROP POLICY IF EXISTS "Only admins can delete employees" ON public.employees;

CREATE POLICY "Users can view employees in their organizations"
  ON public.employees FOR SELECT
  USING (organization_id IN (SELECT public.get_user_organization_ids(auth.uid())));

CREATE POLICY "Admins and managers can manage employees"
  ON public.employees FOR ALL
  USING (
    public.user_belongs_to_org(auth.uid(), organization_id)
    AND (public.has_org_role(auth.uid(), organization_id, 'admin') OR public.has_org_role(auth.uid(), organization_id, 'manager'))
  )
  WITH CHECK (
    public.user_belongs_to_org(auth.uid(), organization_id)
    AND (public.has_org_role(auth.uid(), organization_id, 'admin') OR public.has_org_role(auth.uid(), organization_id, 'manager'))
  );

-- Update RLS for sales
DROP POLICY IF EXISTS "Authenticated users can view sales" ON public.sales;
DROP POLICY IF EXISTS "Authenticated users can insert sales" ON public.sales;
DROP POLICY IF EXISTS "Admins and managers can update sales" ON public.sales;
DROP POLICY IF EXISTS "Only admins can delete sales" ON public.sales;

CREATE POLICY "Users can view sales in their organizations"
  ON public.sales FOR SELECT
  USING (organization_id IN (SELECT public.get_user_organization_ids(auth.uid())));

CREATE POLICY "Users can create sales in their organizations"
  ON public.sales FOR INSERT
  WITH CHECK (public.user_belongs_to_org(auth.uid(), organization_id));

CREATE POLICY "Admins and managers can update sales"
  ON public.sales FOR UPDATE
  USING (
    public.user_belongs_to_org(auth.uid(), organization_id)
    AND (public.has_org_role(auth.uid(), organization_id, 'admin') OR public.has_org_role(auth.uid(), organization_id, 'manager'))
  );

CREATE POLICY "Admins can delete sales"
  ON public.sales FOR DELETE
  USING (public.has_org_role(auth.uid(), organization_id, 'admin'));

-- Update RLS for purchase_bills
DROP POLICY IF EXISTS "Admins and managers can access purchase_bills" ON public.purchase_bills;

CREATE POLICY "Admins and managers can view purchase bills"
  ON public.purchase_bills FOR SELECT
  USING (
    public.user_belongs_to_org(auth.uid(), organization_id)
    AND (public.has_org_role(auth.uid(), organization_id, 'admin') OR public.has_org_role(auth.uid(), organization_id, 'manager'))
  );

CREATE POLICY "Admins and managers can manage purchase bills"
  ON public.purchase_bills FOR ALL
  USING (
    public.user_belongs_to_org(auth.uid(), organization_id)
    AND (public.has_org_role(auth.uid(), organization_id, 'admin') OR public.has_org_role(auth.uid(), organization_id, 'manager'))
  )
  WITH CHECK (
    public.user_belongs_to_org(auth.uid(), organization_id)
    AND (public.has_org_role(auth.uid(), organization_id, 'admin') OR public.has_org_role(auth.uid(), organization_id, 'manager'))
  );

-- Update RLS for settings
DROP POLICY IF EXISTS "Authenticated users can view settings" ON public.settings;
DROP POLICY IF EXISTS "Admins can update settings" ON public.settings;
DROP POLICY IF EXISTS "Admins can insert settings" ON public.settings;

CREATE POLICY "Users can view settings in their organizations"
  ON public.settings FOR SELECT
  USING (organization_id IN (SELECT public.get_user_organization_ids(auth.uid())));

CREATE POLICY "Admins can manage settings"
  ON public.settings FOR ALL
  USING (public.has_org_role(auth.uid(), organization_id, 'admin'))
  WITH CHECK (public.has_org_role(auth.uid(), organization_id, 'admin'));

-- Update RLS for size_groups
DROP POLICY IF EXISTS "Allow all operations on size_groups for authenticated users" ON public.size_groups;

CREATE POLICY "Users can view size groups in their organizations"
  ON public.size_groups FOR SELECT
  USING (organization_id IN (SELECT public.get_user_organization_ids(auth.uid())));

CREATE POLICY "Admins and managers can manage size groups"
  ON public.size_groups FOR ALL
  USING (
    public.user_belongs_to_org(auth.uid(), organization_id)
    AND (public.has_org_role(auth.uid(), organization_id, 'admin') OR public.has_org_role(auth.uid(), organization_id, 'manager'))
  )
  WITH CHECK (
    public.user_belongs_to_org(auth.uid(), organization_id)
    AND (public.has_org_role(auth.uid(), organization_id, 'admin') OR public.has_org_role(auth.uid(), organization_id, 'manager'))
  );

-- Add trigger for updated_at
CREATE TRIGGER update_organizations_updated_at
  BEFORE UPDATE ON public.organizations
  FOR EACH ROW
  EXECUTE FUNCTION public.update_updated_at_column();