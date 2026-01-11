-- Add follow-up on button click settings to whatsapp_api_settings
ALTER TABLE whatsapp_api_settings
ADD COLUMN IF NOT EXISTS send_followup_on_button_click BOOLEAN DEFAULT false,
ADD COLUMN IF NOT EXISTS button_followup_message TEXT DEFAULT '📄 Thank you for viewing your invoice!

Here are your links:
🌐 Website: {website}
📷 Instagram: {instagram}

Rate us: ⭐⭐⭐⭐⭐';

-- Add tracking columns to whatsapp_logs for pending follow-ups
ALTER TABLE whatsapp_logs
ADD COLUMN IF NOT EXISTS pending_followup BOOLEAN DEFAULT false,
ADD COLUMN IF NOT EXISTS followup_data JSONB;