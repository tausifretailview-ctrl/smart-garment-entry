-- Create account_ledgers table for chart of accounts
CREATE TABLE public.account_ledgers (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id UUID REFERENCES public.organizations(id) ON DELETE CASCADE,
  account_name TEXT NOT NULL,
  account_type TEXT NOT NULL, -- 'asset', 'liability', 'equity', 'income', 'expense'
  parent_account_id UUID REFERENCES public.account_ledgers(id) ON DELETE SET NULL,
  opening_balance NUMERIC DEFAULT 0,
  current_balance NUMERIC DEFAULT 0,
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);

-- Create voucher_entries table for all accounting transactions
CREATE TABLE public.voucher_entries (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id UUID REFERENCES public.organizations(id) ON DELETE CASCADE,
  voucher_number TEXT NOT NULL,
  voucher_type TEXT NOT NULL, -- 'payment', 'receipt', 'journal', 'contra'
  voucher_date DATE NOT NULL DEFAULT CURRENT_DATE,
  reference_type TEXT, -- 'customer', 'supplier', 'employee', 'expense'
  reference_id UUID, -- ID of customer/supplier/employee
  description TEXT,
  total_amount NUMERIC NOT NULL DEFAULT 0,
  created_by UUID REFERENCES auth.users(id),
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);

-- Create voucher_items table for double-entry bookkeeping
CREATE TABLE public.voucher_items (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  voucher_id UUID REFERENCES public.voucher_entries(id) ON DELETE CASCADE NOT NULL,
  account_id UUID REFERENCES public.account_ledgers(id) NOT NULL,
  debit_amount NUMERIC DEFAULT 0,
  credit_amount NUMERIC DEFAULT 0,
  description TEXT,
  created_at TIMESTAMPTZ DEFAULT now()
);

-- Enable RLS
ALTER TABLE public.account_ledgers ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.voucher_entries ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.voucher_items ENABLE ROW LEVEL SECURITY;

-- RLS Policies for account_ledgers
CREATE POLICY "Users can view ledgers in their organizations"
  ON public.account_ledgers FOR SELECT
  USING (organization_id IN (SELECT get_user_organization_ids(auth.uid())));

CREATE POLICY "Admins can manage ledgers"
  ON public.account_ledgers FOR ALL
  USING (has_org_role(auth.uid(), organization_id, 'admin'::app_role))
  WITH CHECK (has_org_role(auth.uid(), organization_id, 'admin'::app_role));

-- RLS Policies for voucher_entries
CREATE POLICY "Users can view vouchers in their organizations"
  ON public.voucher_entries FOR SELECT
  USING (organization_id IN (SELECT get_user_organization_ids(auth.uid())));

CREATE POLICY "Admins and managers can manage vouchers"
  ON public.voucher_entries FOR ALL
  USING (
    user_belongs_to_org(auth.uid(), organization_id) AND
    (has_org_role(auth.uid(), organization_id, 'admin'::app_role) OR 
     has_org_role(auth.uid(), organization_id, 'manager'::app_role))
  )
  WITH CHECK (
    user_belongs_to_org(auth.uid(), organization_id) AND
    (has_org_role(auth.uid(), organization_id, 'admin'::app_role) OR 
     has_org_role(auth.uid(), organization_id, 'manager'::app_role))
  );

-- RLS Policies for voucher_items
CREATE POLICY "Users can view voucher items in their organizations"
  ON public.voucher_items FOR SELECT
  USING (
    voucher_id IN (
      SELECT id FROM voucher_entries 
      WHERE organization_id IN (SELECT get_user_organization_ids(auth.uid()))
    )
  );

CREATE POLICY "Admins and managers can manage voucher items"
  ON public.voucher_items FOR ALL
  USING (
    voucher_id IN (
      SELECT id FROM voucher_entries ve
      WHERE user_belongs_to_org(auth.uid(), ve.organization_id) AND
        (has_org_role(auth.uid(), ve.organization_id, 'admin'::app_role) OR 
         has_org_role(auth.uid(), ve.organization_id, 'manager'::app_role))
    )
  )
  WITH CHECK (
    voucher_id IN (
      SELECT id FROM voucher_entries ve
      WHERE user_belongs_to_org(auth.uid(), ve.organization_id) AND
        (has_org_role(auth.uid(), ve.organization_id, 'admin'::app_role) OR 
         has_org_role(auth.uid(), ve.organization_id, 'manager'::app_role))
    )
  );

-- Create indexes for performance
CREATE INDEX idx_account_ledgers_org ON account_ledgers(organization_id);
CREATE INDEX idx_voucher_entries_org ON voucher_entries(organization_id);
CREATE INDEX idx_voucher_entries_date ON voucher_entries(voucher_date);
CREATE INDEX idx_voucher_items_voucher ON voucher_items(voucher_id);
CREATE INDEX idx_voucher_items_account ON voucher_items(account_id);

-- Create function to generate voucher numbers
CREATE OR REPLACE FUNCTION public.generate_voucher_number(p_type TEXT, p_date DATE DEFAULT CURRENT_DATE)
RETURNS TEXT
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_prefix TEXT;
  v_count INTEGER;
  v_number TEXT;
BEGIN
  -- Set prefix based on type
  v_prefix := CASE p_type
    WHEN 'payment' THEN 'PAY'
    WHEN 'receipt' THEN 'RCP'
    WHEN 'journal' THEN 'JV'
    WHEN 'contra' THEN 'CNT'
    ELSE 'VCH'
  END;
  
  -- Get count for today
  SELECT COUNT(*) + 1 INTO v_count
  FROM voucher_entries
  WHERE voucher_type = p_type
    AND DATE(created_at) = p_date;
  
  -- Format: PREFIX/DDMMYY/NNN
  v_number := v_prefix || '/' || 
              TO_CHAR(p_date, 'DDMMYY') || '/' ||
              LPAD(v_count::TEXT, 3, '0');
  
  RETURN v_number;
END;
$function$;