import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

// Helper to find organization by phone number ID from settings
async function findOrganizationByPhoneId(supabase: any, phoneNumberId: string) {
  const { data } = await supabase
    .from('whatsapp_api_settings')
    .select('*')
    .eq('phone_number_id', phoneNumberId)
    .single();
  
  return data;
}

// Helper to get or create conversation
async function getOrCreateConversation(
  supabase: any, 
  organizationId: string, 
  customerPhone: string,
  customerName?: string
) {
  // Try to find existing conversation
  const { data: existing } = await supabase
    .from('whatsapp_conversations')
    .select('*')
    .eq('organization_id', organizationId)
    .eq('customer_phone', customerPhone)
    .single();

  if (existing) {
    return existing;
  }

  // Create new conversation
  const { data: newConv, error } = await supabase
    .from('whatsapp_conversations')
    .insert({
      organization_id: organizationId,
      customer_phone: customerPhone,
      customer_name: customerName,
      last_message_at: new Date().toISOString(),
      unread_count: 0,
    })
    .select()
    .single();

  if (error) {
    console.error('Error creating conversation:', error);
    throw error;
  }

  return newConv;
}

// Helper to get conversation history
async function getConversationHistory(supabase: any, conversationId: string, limit: number = 10) {
  const { data } = await supabase
    .from('whatsapp_messages')
    .select('direction, message_text, sent_at')
    .eq('conversation_id', conversationId)
    .order('sent_at', { ascending: false })
    .limit(limit);
  
  return (data || []).reverse();
}

// Helper to get customer info
async function getCustomerInfo(supabase: any, organizationId: string, phone: string) {
  // Format phone for search
  const cleanPhone = phone.replace(/\D/g, '').slice(-10);
  
  const { data: customer } = await supabase
    .from('customers')
    .select('id, customer_name, phone, opening_balance, points_balance')
    .eq('organization_id', organizationId)
    .or(`phone.ilike.%${cleanPhone}%,phone.ilike.%${phone}%`)
    .maybeSingle();

  if (!customer) return null;

  // Get recent sales
  const { data: sales } = await supabase
    .from('sales')
    .select('sale_number, sale_date, net_amount, payment_status')
    .eq('organization_id', organizationId)
    .eq('customer_id', customer.id)
    .is('deleted_at', null)
    .order('sale_date', { ascending: false })
    .limit(5);

  // Calculate outstanding
  const { data: balance } = await supabase
    .rpc('get_customer_balance', { p_customer_id: customer.id })
    .maybeSingle();

  return {
    ...customer,
    recent_sales: sales || [],
    outstanding_balance: balance?.balance || 0
  };
}

// Generate AI response
async function generateAIResponse(
  settings: any,
  customerMessage: string,
  conversationHistory: any[],
  customerInfo: any
) {
  const LOVABLE_API_KEY = Deno.env.get('LOVABLE_API_KEY');
  
  if (!LOVABLE_API_KEY) {
    console.error('LOVABLE_API_KEY not configured');
    return null;
  }

  // Build context about the customer
  let customerContext = '';
  if (customerInfo) {
    customerContext = `
Customer Information:
- Name: ${customerInfo.customer_name}
- Phone: ${customerInfo.phone}
- Outstanding Balance: ₹${customerInfo.outstanding_balance || 0}
- Points Balance: ${customerInfo.points_balance || 0}

Recent Invoices:
${customerInfo.recent_sales?.map((s: any) => 
  `- ${s.sale_number} (${s.sale_date}): ₹${s.net_amount} - ${s.payment_status}`
).join('\n') || 'No recent invoices'}
`;
  }

  // Build conversation history for context
  const historyMessages = conversationHistory.map(msg => ({
    role: msg.direction === 'inbound' ? 'user' : 'assistant',
    content: msg.message_text
  }));

  const systemPrompt = `${settings.chatbot_system_prompt || 'You are a helpful business assistant.'}

Business: ${settings.business_name || 'Our Business'}

${customerContext}

Guidelines:
- Keep responses under 500 characters for mobile readability
- Be helpful, friendly, and professional
- If asked about invoices/payments, reference the customer info above
- If asked to speak to a human, say you'll connect them with the team
- Format prices with ₹ symbol
- Use simple formatting suitable for WhatsApp`;

  try {
    const response = await fetch('https://ai.gateway.lovable.dev/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${LOVABLE_API_KEY}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        model: 'google/gemini-2.5-flash',
        messages: [
          { role: 'system', content: systemPrompt },
          ...historyMessages,
          { role: 'user', content: customerMessage }
        ],
        max_tokens: 200,
      }),
    });

    if (!response.ok) {
      console.error('AI API error:', response.status, await response.text());
      return null;
    }

    const data = await response.json();
    return data.choices?.[0]?.message?.content || null;
  } catch (error) {
    console.error('AI generation error:', error);
    return null;
  }
}

// Send WhatsApp message
async function sendWhatsAppMessage(
  settings: any,
  recipientPhone: string,
  message: string
) {
  const url = `https://graph.facebook.com/v18.0/${settings.phone_number_id}/messages`;
  
  try {
    const response = await fetch(url, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${settings.access_token}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        messaging_product: 'whatsapp',
        recipient_type: 'individual',
        to: recipientPhone,
        type: 'text',
        text: { body: message }
      }),
    });

    const data = await response.json();
    
    if (!response.ok) {
      console.error('WhatsApp send error:', data);
      return null;
    }

    return data.messages?.[0]?.id || null;
  } catch (error) {
    console.error('WhatsApp send error:', error);
    return null;
  }
}

// Check if message contains handoff keywords
function shouldHandoff(message: string, keywords: string[]): boolean {
  const lowerMessage = message.toLowerCase();
  return keywords.some(keyword => lowerMessage.includes(keyword.toLowerCase()));
}

// Check if within business hours
function isWithinBusinessHours(settings: any): boolean {
  if (!settings.business_hours_enabled) return true;
  
  const now = new Date();
  const currentTime = now.toLocaleTimeString('en-US', { 
    hour12: false, 
    timeZone: 'Asia/Kolkata' 
  });
  
  const start = settings.business_hours_start || '09:00';
  const end = settings.business_hours_end || '18:00';
  
  return currentTime >= start && currentTime <= end;
}

Deno.serve(async (req) => {
  // Handle CORS preflight
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  const url = new URL(req.url);

  // Webhook verification (GET request from Meta)
  if (req.method === 'GET') {
    const mode = url.searchParams.get('hub.mode');
    const token = url.searchParams.get('hub.verify_token');
    const challenge = url.searchParams.get('hub.challenge');

    // The verify token should match what you configured in Meta
    const verifyToken = Deno.env.get('WHATSAPP_VERIFY_TOKEN') || 'lovable_whatsapp_webhook';

    if (mode === 'subscribe' && token === verifyToken) {
      console.log('Webhook verified successfully');
      return new Response(challenge, { status: 200 });
    } else {
      console.error('Webhook verification failed');
      return new Response('Forbidden', { status: 403 });
    }
  }

  // Handle webhook events (POST request from Meta)
  if (req.method === 'POST') {
    try {
      const body = await req.json();
      console.log('Webhook received:', JSON.stringify(body, null, 2));

      const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
      const supabaseKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
      const supabase = createClient(supabaseUrl, supabaseKey);

      // Process webhook entries
      if (body.entry) {
        for (const entry of body.entry) {
          if (entry.changes) {
            for (const change of entry.changes) {
              const phoneNumberId = change.value?.metadata?.phone_number_id;
              
              // Process status updates
              if (change.value && change.value.statuses) {
                for (const status of change.value.statuses) {
                  const wamid = status.id;
                  const newStatus = status.status; // sent, delivered, read, failed
                  const timestamp = status.timestamp ? new Date(parseInt(status.timestamp) * 1000).toISOString() : new Date().toISOString();

                  console.log(`Status update: ${wamid} -> ${newStatus} at ${timestamp}`);

                  // Find and update the log entry by wamid
                  const updateData: Record<string, any> = {
                    status: newStatus,
                  };

                  if (newStatus === 'delivered') {
                    updateData.delivered_at = timestamp;
                  } else if (newStatus === 'read') {
                    updateData.read_at = timestamp;
                    updateData.delivered_at = timestamp;
                  } else if (newStatus === 'failed') {
                    updateData.error_message = status.errors?.[0]?.message || 'Message delivery failed';
                  }

                  // Update whatsapp_logs
                  const { error: logError } = await supabase
                    .from('whatsapp_logs')
                    .update(updateData)
                    .eq('wamid', wamid);

                  if (logError) {
                    console.error('Error updating whatsapp_logs:', logError);
                  }

                  // Update whatsapp_messages if exists
                  const { error: msgError } = await supabase
                    .from('whatsapp_messages')
                    .update(updateData)
                    .eq('wamid', wamid);

                  if (msgError) {
                    console.error('Error updating whatsapp_messages:', msgError);
                  }

                  console.log(`Updated status for wamid: ${wamid} to: ${newStatus}`);
                }
              }

              // Process incoming messages
              if (change.value && change.value.messages) {
                console.log('Processing incoming messages:', change.value.messages);
                
                // Find organization settings by phone_number_id
                const settings = await findOrganizationByPhoneId(supabase, phoneNumberId);
                
                if (!settings) {
                  console.error('Settings not found for phone_number_id:', phoneNumberId);
                  continue;
                }

                const organizationId = settings.organization_id;

                for (const message of change.value.messages) {
                  const senderPhone = message.from;
                  const messageType = message.type;
                  const wamid = message.id;
                  const timestamp = message.timestamp ? new Date(parseInt(message.timestamp) * 1000).toISOString() : new Date().toISOString();
                  
                  // Get message text based on type
                  let messageText = '';
                  if (messageType === 'text') {
                    messageText = message.text?.body || '';
                  } else if (messageType === 'button') {
                    messageText = message.button?.text || '';
                  } else if (messageType === 'interactive') {
                    messageText = message.interactive?.button_reply?.title || message.interactive?.list_reply?.title || '';
                  } else {
                    messageText = `[${messageType}]`;
                  }

                  // Get contact name if available
                  const contactName = change.value.contacts?.[0]?.profile?.name;

                  console.log(`Incoming message from ${senderPhone}: ${messageText}`);

                  // Get or create conversation
                  const conversation = await getOrCreateConversation(
                    supabase,
                    organizationId,
                    senderPhone,
                    contactName
                  );

                  // Insert the message
                  const { error: insertError } = await supabase
                    .from('whatsapp_messages')
                    .insert({
                      organization_id: organizationId,
                      conversation_id: conversation.id,
                      wamid: wamid,
                      direction: 'inbound',
                      message_type: messageType,
                      message_text: messageText,
                      status: 'received',
                      sent_at: timestamp,
                    });

                  if (insertError) {
                    console.error('Error inserting message:', insertError);
                  } else {
                    console.log('Message inserted successfully');
                  }

                  // Update conversation
                  const { error: updateError } = await supabase
                    .from('whatsapp_conversations')
                    .update({
                      last_message_at: timestamp,
                      unread_count: conversation.unread_count + 1,
                      customer_name: contactName || conversation.customer_name,
                    })
                    .eq('id', conversation.id);

                  if (updateError) {
                    console.error('Error updating conversation:', updateError);
                  }

                  // AI Chatbot Response
                  if (settings.chatbot_enabled && settings.is_active && messageText) {
                    console.log('AI Chatbot is enabled, generating response...');

                    // Check handoff keywords
                    const handoffKeywords = settings.handoff_keywords || ['human', 'agent', 'support'];
                    if (shouldHandoff(messageText, handoffKeywords)) {
                      const handoffMessage = "I'll connect you with our team. Someone will respond shortly. Thank you for your patience! 🙏";
                      const wamidReply = await sendWhatsAppMessage(settings, senderPhone, handoffMessage);
                      
                      if (wamidReply) {
                        await supabase.from('whatsapp_messages').insert({
                          organization_id: organizationId,
                          conversation_id: conversation.id,
                          wamid: wamidReply,
                          direction: 'outbound',
                          message_type: 'text',
                          message_text: handoffMessage,
                          status: 'sent',
                          sent_at: new Date().toISOString(),
                        });
                      }
                      continue;
                    }

                    // Check business hours
                    if (!isWithinBusinessHours(settings)) {
                      const outsideHoursMsg = settings.outside_hours_message || 
                        "Thank you for your message. Our business hours are 9 AM to 6 PM. We will respond during business hours.";
                      const wamidReply = await sendWhatsAppMessage(settings, senderPhone, outsideHoursMsg);
                      
                      if (wamidReply) {
                        await supabase.from('whatsapp_messages').insert({
                          organization_id: organizationId,
                          conversation_id: conversation.id,
                          wamid: wamidReply,
                          direction: 'outbound',
                          message_type: 'text',
                          message_text: outsideHoursMsg,
                          status: 'sent',
                          sent_at: new Date().toISOString(),
                        });
                      }
                      continue;
                    }

                    // Get conversation history
                    const history = await getConversationHistory(supabase, conversation.id, 10);
                    
                    // Get customer info
                    const customerInfo = await getCustomerInfo(supabase, organizationId, senderPhone);
                    
                    // Generate AI response
                    const aiResponse = await generateAIResponse(
                      settings,
                      messageText,
                      history,
                      customerInfo
                    );

                    if (aiResponse) {
                      console.log('AI Response:', aiResponse);
                      
                      // Send the AI response
                      const wamidReply = await sendWhatsAppMessage(settings, senderPhone, aiResponse);
                      
                      if (wamidReply) {
                        // Save the outbound message
                        await supabase.from('whatsapp_messages').insert({
                          organization_id: organizationId,
                          conversation_id: conversation.id,
                          wamid: wamidReply,
                          direction: 'outbound',
                          message_type: 'text',
                          message_text: aiResponse,
                          status: 'sent',
                          sent_at: new Date().toISOString(),
                        });
                        
                        console.log('AI response sent successfully');
                      }
                    } else {
                      console.log('No AI response generated');
                    }
                  }
                }
              }
            }
          }
        }
      }

      return new Response(JSON.stringify({ success: true }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        status: 200,
      });
    } catch (error: unknown) {
      console.error('Webhook processing error:', error);
      const errorMessage = error instanceof Error ? error.message : 'Unknown error';
      return new Response(JSON.stringify({ error: errorMessage }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        status: 500,
      });
    }
  }

  return new Response('Method not allowed', { status: 405 });
});
