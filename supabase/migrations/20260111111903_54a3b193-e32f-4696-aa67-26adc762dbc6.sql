-- Add AI chatbot settings columns to whatsapp_api_settings
ALTER TABLE public.whatsapp_api_settings 
ADD COLUMN IF NOT EXISTS chatbot_enabled boolean DEFAULT false,
ADD COLUMN IF NOT EXISTS chatbot_greeting text DEFAULT 'Hello! I''m an AI assistant. How can I help you today?',
ADD COLUMN IF NOT EXISTS chatbot_system_prompt text DEFAULT 'You are a helpful business assistant. Keep responses concise and mobile-friendly (under 500 characters). Help customers with invoice inquiries, order status, payment information, and general business questions.',
ADD COLUMN IF NOT EXISTS business_hours_enabled boolean DEFAULT false,
ADD COLUMN IF NOT EXISTS business_hours_start time DEFAULT '09:00',
ADD COLUMN IF NOT EXISTS business_hours_end time DEFAULT '18:00',
ADD COLUMN IF NOT EXISTS outside_hours_message text DEFAULT 'Thank you for your message. Our business hours are 9 AM to 6 PM. We will respond during business hours.',
ADD COLUMN IF NOT EXISTS handoff_keywords text[] DEFAULT ARRAY['human', 'agent', 'support', 'help', 'speak to someone']::text[];