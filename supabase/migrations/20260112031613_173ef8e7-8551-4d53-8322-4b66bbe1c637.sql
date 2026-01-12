-- Table to store approved Meta WhatsApp templates fetched from Meta API
CREATE TABLE IF NOT EXISTS whatsapp_meta_templates (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  organization_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  template_name TEXT NOT NULL,
  template_category TEXT,
  template_language TEXT DEFAULT 'en',
  template_status TEXT DEFAULT 'APPROVED',
  components JSONB, -- Store template structure from Meta
  created_at TIMESTAMP WITH TIME ZONE DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT now(),
  UNIQUE(organization_id, template_name, template_language)
);

-- Enable RLS
ALTER TABLE whatsapp_meta_templates ENABLE ROW LEVEL SECURITY;

-- RLS Policies for organization members
CREATE POLICY "Users can view their organization meta templates"
ON whatsapp_meta_templates
FOR SELECT
USING (
  organization_id IN (
    SELECT organization_id FROM organization_members WHERE user_id = auth.uid()
  )
);

CREATE POLICY "Users can insert their organization meta templates"
ON whatsapp_meta_templates
FOR INSERT
WITH CHECK (
  organization_id IN (
    SELECT organization_id FROM organization_members WHERE user_id = auth.uid()
  )
);

CREATE POLICY "Users can update their organization meta templates"
ON whatsapp_meta_templates
FOR UPDATE
USING (
  organization_id IN (
    SELECT organization_id FROM organization_members WHERE user_id = auth.uid()
  )
);

CREATE POLICY "Users can delete their organization meta templates"
ON whatsapp_meta_templates
FOR DELETE
USING (
  organization_id IN (
    SELECT organization_id FROM organization_members WHERE user_id = auth.uid()
  )
);

-- Add columns to whatsapp_api_settings for selected templates
ALTER TABLE whatsapp_api_settings
ADD COLUMN IF NOT EXISTS selected_invoice_template_id UUID REFERENCES whatsapp_meta_templates(id) ON DELETE SET NULL,
ADD COLUMN IF NOT EXISTS selected_quotation_template_id UUID REFERENCES whatsapp_meta_templates(id) ON DELETE SET NULL,
ADD COLUMN IF NOT EXISTS selected_sale_order_template_id UUID REFERENCES whatsapp_meta_templates(id) ON DELETE SET NULL,
ADD COLUMN IF NOT EXISTS selected_payment_reminder_template_id UUID REFERENCES whatsapp_meta_templates(id) ON DELETE SET NULL;