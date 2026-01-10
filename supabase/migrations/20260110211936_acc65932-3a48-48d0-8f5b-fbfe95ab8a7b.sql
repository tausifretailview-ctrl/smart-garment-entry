-- Create table to store WhatsApp conversations/threads
CREATE TABLE public.whatsapp_conversations (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  organization_id UUID NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  customer_phone VARCHAR(20) NOT NULL,
  customer_name VARCHAR(255),
  customer_id UUID REFERENCES public.customers(id),
  last_message_at TIMESTAMP WITH TIME ZONE DEFAULT now(),
  unread_count INTEGER DEFAULT 0,
  status VARCHAR(20) DEFAULT 'active',
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  UNIQUE(organization_id, customer_phone)
);

-- Create table to store individual messages
CREATE TABLE public.whatsapp_messages (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  organization_id UUID NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  conversation_id UUID NOT NULL REFERENCES public.whatsapp_conversations(id) ON DELETE CASCADE,
  wamid VARCHAR(255),
  direction VARCHAR(10) NOT NULL, -- 'inbound' or 'outbound'
  message_type VARCHAR(50) DEFAULT 'text',
  message_text TEXT,
  media_url TEXT,
  status VARCHAR(20) DEFAULT 'sent',
  sent_at TIMESTAMP WITH TIME ZONE DEFAULT now(),
  delivered_at TIMESTAMP WITH TIME ZONE,
  read_at TIMESTAMP WITH TIME ZONE,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

-- Enable RLS
ALTER TABLE public.whatsapp_conversations ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.whatsapp_messages ENABLE ROW LEVEL SECURITY;

-- Create RLS policies for whatsapp_conversations
CREATE POLICY "Users can view conversations for their organization"
ON public.whatsapp_conversations
FOR SELECT
USING (
  organization_id IN (
    SELECT organization_id FROM public.organization_members WHERE user_id = auth.uid()
  )
);

CREATE POLICY "Users can insert conversations for their organization"
ON public.whatsapp_conversations
FOR INSERT
WITH CHECK (
  organization_id IN (
    SELECT organization_id FROM public.organization_members WHERE user_id = auth.uid()
  )
);

CREATE POLICY "Users can update conversations for their organization"
ON public.whatsapp_conversations
FOR UPDATE
USING (
  organization_id IN (
    SELECT organization_id FROM public.organization_members WHERE user_id = auth.uid()
  )
);

-- Create RLS policies for whatsapp_messages
CREATE POLICY "Users can view messages for their organization"
ON public.whatsapp_messages
FOR SELECT
USING (
  organization_id IN (
    SELECT organization_id FROM public.organization_members WHERE user_id = auth.uid()
  )
);

CREATE POLICY "Users can insert messages for their organization"
ON public.whatsapp_messages
FOR INSERT
WITH CHECK (
  organization_id IN (
    SELECT organization_id FROM public.organization_members WHERE user_id = auth.uid()
  )
);

CREATE POLICY "Users can update messages for their organization"
ON public.whatsapp_messages
FOR UPDATE
USING (
  organization_id IN (
    SELECT organization_id FROM public.organization_members WHERE user_id = auth.uid()
  )
);

-- Service role bypass for webhook
CREATE POLICY "Service role can manage conversations"
ON public.whatsapp_conversations
FOR ALL
USING (true)
WITH CHECK (true);

CREATE POLICY "Service role can manage messages"
ON public.whatsapp_messages
FOR ALL
USING (true)
WITH CHECK (true);

-- Create indexes for performance
CREATE INDEX idx_whatsapp_conversations_org ON public.whatsapp_conversations(organization_id);
CREATE INDEX idx_whatsapp_conversations_phone ON public.whatsapp_conversations(customer_phone);
CREATE INDEX idx_whatsapp_messages_conversation ON public.whatsapp_messages(conversation_id);
CREATE INDEX idx_whatsapp_messages_wamid ON public.whatsapp_messages(wamid);

-- Enable realtime for messages
ALTER PUBLICATION supabase_realtime ADD TABLE public.whatsapp_messages;
ALTER PUBLICATION supabase_realtime ADD TABLE public.whatsapp_conversations;