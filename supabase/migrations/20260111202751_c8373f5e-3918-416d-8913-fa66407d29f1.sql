-- Add google_review_link to social_links in whatsapp_api_settings
-- Note: social_links is already JSONB, we'll just use it to store google_review as well

-- Add followup menu message templates
ALTER TABLE whatsapp_api_settings
ADD COLUMN IF NOT EXISTS followup_menu_message TEXT DEFAULT 'Thank you for your interest! 🙏

Please select what you need:',
ADD COLUMN IF NOT EXISTS followup_invoice_message TEXT DEFAULT '📄 Here is your invoice link:
{invoice_link}

Invoice No: {sale_number}
Thank you for your business!',
ADD COLUMN IF NOT EXISTS followup_social_message TEXT DEFAULT '📱 Connect with us on social media:

🌐 Website: {website}
📷 Instagram: {instagram}
📘 Facebook: {facebook}

Follow us for latest updates! 🌟',
ADD COLUMN IF NOT EXISTS followup_review_message TEXT DEFAULT '⭐ We would love your feedback!

Please take a moment to rate us:
{google_review}

Your review helps us serve you better! 🙏',
ADD COLUMN IF NOT EXISTS followup_chat_message TEXT DEFAULT '💬 Chat with us directly!

Click here to start a conversation:
{whatsapp_link}

Our team is ready to assist you!';