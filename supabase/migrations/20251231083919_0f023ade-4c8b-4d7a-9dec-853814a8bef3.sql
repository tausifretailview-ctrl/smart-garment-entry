
-- Create gift_rewards table for gift item redemption
CREATE TABLE public.gift_rewards (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  organization_id UUID NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  gift_name TEXT NOT NULL,
  description TEXT,
  points_required INTEGER NOT NULL DEFAULT 100,
  valid_from DATE NOT NULL DEFAULT CURRENT_DATE,
  valid_until DATE,
  stock_qty INTEGER NOT NULL DEFAULT 0,
  is_active BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT now()
);

-- Create gift_redemptions table to track gift claims
CREATE TABLE public.gift_redemptions (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  organization_id UUID NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  customer_id UUID NOT NULL REFERENCES public.customers(id) ON DELETE CASCADE,
  gift_reward_id UUID NOT NULL REFERENCES public.gift_rewards(id) ON DELETE CASCADE,
  points_used INTEGER NOT NULL,
  redeemed_at TIMESTAMP WITH TIME ZONE DEFAULT now(),
  redeemed_by UUID,
  notes TEXT
);

-- Add indexes
CREATE INDEX idx_gift_rewards_org ON public.gift_rewards(organization_id);
CREATE INDEX idx_gift_rewards_active ON public.gift_rewards(organization_id, is_active) WHERE is_active = true;
CREATE INDEX idx_gift_redemptions_customer ON public.gift_redemptions(customer_id);
CREATE INDEX idx_gift_redemptions_org ON public.gift_redemptions(organization_id);

-- Enable RLS
ALTER TABLE public.gift_rewards ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.gift_redemptions ENABLE ROW LEVEL SECURITY;

-- RLS policies for gift_rewards
CREATE POLICY "Users can view gift rewards in their organizations"
  ON public.gift_rewards FOR SELECT
  USING (organization_id IN (SELECT get_user_organization_ids(auth.uid())));

CREATE POLICY "Admins and managers can manage gift rewards"
  ON public.gift_rewards FOR ALL
  USING (user_belongs_to_org(auth.uid(), organization_id) AND 
         (has_org_role(auth.uid(), organization_id, 'admin') OR 
          has_org_role(auth.uid(), organization_id, 'manager')))
  WITH CHECK (user_belongs_to_org(auth.uid(), organization_id) AND 
              (has_org_role(auth.uid(), organization_id, 'admin') OR 
               has_org_role(auth.uid(), organization_id, 'manager')));

-- RLS policies for gift_redemptions
CREATE POLICY "Users can view gift redemptions in their organizations"
  ON public.gift_redemptions FOR SELECT
  USING (organization_id IN (SELECT get_user_organization_ids(auth.uid())));

CREATE POLICY "Users can create gift redemptions in their organizations"
  ON public.gift_redemptions FOR INSERT
  WITH CHECK (user_belongs_to_org(auth.uid(), organization_id));

CREATE POLICY "Admins can delete gift redemptions"
  ON public.gift_redemptions FOR DELETE
  USING (has_org_role(auth.uid(), organization_id, 'admin'));
