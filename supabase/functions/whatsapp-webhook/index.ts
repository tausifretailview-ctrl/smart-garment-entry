import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

// Helper to find organization by phone number ID from settings
async function findOrganizationByPhoneId(supabase: any, phoneNumberId: string) {
  // First check if any org has this specific phone_number_id
  const { data: orgSettings } = await supabase
    .from('whatsapp_api_settings')
    .select('*')
    .eq('phone_number_id', phoneNumberId)
    .eq('use_default_api', false)
    .maybeSingle();
  
  if (orgSettings) {
    return orgSettings;
  }

  // Check if this is the platform default phone number
  const { data: platformSettings } = await supabase
    .from('platform_settings')
    .select('setting_value')
    .eq('setting_key', 'default_whatsapp_api')
    .single();

  if (platformSettings) {
    const defaultCreds = platformSettings.setting_value as Record<string, unknown>;
    if (defaultCreds.phone_number_id === phoneNumberId) {
      // This is the shared platform number - return platform settings merged with null org
      return {
        ...defaultCreds,
        organization_id: null, // Will need special routing
        is_platform_default: true,
      };
    }
  }

  return null;
}

// Helper to find organization for a customer phone using the shared API
async function findOrganizationByCustomerPhone(supabase: any, customerPhone: string) {
  const cleanPhone = customerPhone.replace(/\D/g, '').slice(-10);
  const fullPhone = customerPhone.replace(/\D/g, '');
  
  console.log(`Looking up organization for customer phone: ${customerPhone} (clean: ${cleanPhone})`);
  
  // Priority 1: Check whatsapp_logs for the most recent outbound message to this customer
  // This is the most reliable way to find which org sent a message to this customer
  const { data: recentLog } = await supabase
    .from('whatsapp_logs')
    .select('organization_id')
    .or(`phone_number.ilike.%${cleanPhone}%,phone_number.ilike.%${fullPhone}%`)
    .order('created_at', { ascending: false })
    .limit(1)
    .maybeSingle();

  if (recentLog?.organization_id) {
    console.log(`Found org from whatsapp_logs: ${recentLog.organization_id}`);
    const { data: orgSettings } = await supabase
      .from('whatsapp_api_settings')
      .select('*')
      .eq('organization_id', recentLog.organization_id)
      .maybeSingle();
    
    if (orgSettings) return orgSettings;
  }
  
  // Priority 2: Check existing conversations (most recent interaction)
  const { data: conversation } = await supabase
    .from('whatsapp_conversations')
    .select('organization_id')
    .or(`customer_phone.ilike.%${cleanPhone}%,customer_phone.ilike.%${fullPhone}%`)
    .order('last_message_at', { ascending: false })
    .limit(1)
    .maybeSingle();

  if (conversation?.organization_id) {
    console.log(`Found org from whatsapp_conversations: ${conversation.organization_id}`);
    const { data: orgSettings } = await supabase
      .from('whatsapp_api_settings')
      .select('*')
      .eq('organization_id', conversation.organization_id)
      .maybeSingle();
    
    if (orgSettings) return orgSettings;
  }

  // Priority 3: Check customers table across all orgs (most recent customer)
  const { data: customer } = await supabase
    .from('customers')
    .select('organization_id')
    .or(`phone.ilike.%${cleanPhone}%,phone.ilike.%${fullPhone}%`)
    .is('deleted_at', null)
    .order('created_at', { ascending: false })
    .limit(1)
    .maybeSingle();

  if (customer?.organization_id) {
    console.log(`Found org from customers table: ${customer.organization_id}`);
    const { data: orgSettings } = await supabase
      .from('whatsapp_api_settings')
      .select('*')
      .eq('organization_id', customer.organization_id)
      .maybeSingle();
    
    return orgSettings;
  }

  console.log('No organization found for this customer phone');
  return null;
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
                let settings = await findOrganizationByPhoneId(supabase, phoneNumberId);
                
                // If this is the platform default number, we need special routing
                if (settings?.is_platform_default) {
                  console.log('Incoming message on shared platform number, routing by customer phone...');
                  
                  // Get customer phone from first message
                  const firstMessage = change.value.messages[0];
                  const senderPhone = firstMessage?.from;
                  
                  if (senderPhone) {
                    const routedSettings = await findOrganizationByCustomerPhone(supabase, senderPhone);
                    if (routedSettings) {
                      console.log('Routed to organization:', routedSettings.organization_id);
                      // Merge platform credentials with org settings
                      settings = {
                        ...routedSettings,
                        phone_number_id: settings.phone_number_id,
                        access_token: settings.access_token,
                        waba_id: settings.waba_id,
                      };
                    } else {
                      console.error('Could not route message - no organization found for customer:', senderPhone);
                      continue;
                    }
                  }
                }
                
                if (!settings || !settings.organization_id) {
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

                  // Check if this is a button click from a template CTA - 24-hour window now open!
                  if (settings.send_followup_on_button_click) {
                    const buttonText = message.button?.text || 
                                       message.interactive?.button_reply?.title ||
                                       message.interactive?.list_reply?.title || '';
                    const buttonId = message.interactive?.button_reply?.id ||
                                     message.interactive?.list_reply?.id || '';
                    
                    console.log(`User interaction: "${buttonText}" (ID: ${buttonId}) from ${senderPhone}`);
                    
                    const cleanPhone = senderPhone.replace(/\D/g, '').slice(-10);
                    
                    // Check if this is a "Feedback" FLOW button click - auto-send invoice link after
                    const isFeedbackButton = buttonText.toLowerCase().includes('feedback') || 
                                             buttonId.toLowerCase().includes('feedback');
                    
                    if (isFeedbackButton && messageType === 'button') {
                      console.log('Feedback button clicked, auto-sending invoice link...');
                      
                      // Get pending followup data
                      const { data: pendingLogs } = await supabase
                        .from('whatsapp_logs')
                        .select('*')
                        .eq('organization_id', organizationId)
                        .ilike('phone_number', `%${cleanPhone}%`)
                        .eq('pending_followup', true)
                        .order('created_at', { ascending: false })
                        .limit(1);
                      
                      if (pendingLogs && pendingLogs.length > 0) {
                        const log = pendingLogs[0];
                        const followupData = log.followup_data as Record<string, string> | null;
                        
                        if (followupData && followupData.invoice_link) {
                          const invoiceMessage = (settings.followup_invoice_message || '📄 Thank you for your feedback! 🙏\n\nHere is your invoice link:\n{invoice_link}\n\nInvoice No: {sale_number}\nWe appreciate your business! 💫')
                            .replace('{invoice_link}', followupData.invoice_link || '')
                            .replace('{sale_number}', followupData.sale_number || '')
                            .replace('{customer_name}', followupData.customer_name || '');
                          
                          const wamidReply = await sendWhatsAppMessage(settings, senderPhone, invoiceMessage);
                          
                          if (wamidReply) {
                            await supabase.from('whatsapp_messages').insert({
                              organization_id: organizationId,
                              conversation_id: conversation.id,
                              wamid: wamidReply,
                              direction: 'outbound',
                              message_type: 'text',
                              message_text: invoiceMessage,
                              status: 'sent',
                              sent_at: new Date().toISOString(),
                            });
                            console.log('Auto-sent invoice link after feedback button click');
                            
                            // Mark followup as completed
                            await supabase
                              .from('whatsapp_logs')
                              .update({ pending_followup: false })
                              .eq('id', log.id);
                          }
                        }
                      }
                      continue; // Skip further processing for feedback button
                    }
                    
                    // Check if user selected one of our quick reply options
                    if (buttonId === 'invoice_link' || buttonId === 'social_media' || 
                        buttonId === 'google_review' || buttonId === 'chat_with_us') {
                      
                      // Get pending followup data
                      const { data: pendingLogs } = await supabase
                        .from('whatsapp_logs')
                        .select('*')
                        .eq('organization_id', organizationId)
                        .ilike('phone_number', `%${cleanPhone}%`)
                        .eq('pending_followup', true)
                        .order('created_at', { ascending: false })
                        .limit(1);
                      
                      if (pendingLogs && pendingLogs.length > 0) {
                        const log = pendingLogs[0];
                        const followupData = log.followup_data as Record<string, string> | null;
                        
                        if (followupData) {
                          let responseMessage = '';
                          
                          if (buttonId === 'invoice_link') {
                            responseMessage = (settings.followup_invoice_message || '📄 Here is your invoice link:\n{invoice_link}\n\nInvoice No: {sale_number}\nThank you for your business!')
                              .replace('{invoice_link}', followupData.invoice_link || '')
                              .replace('{sale_number}', followupData.sale_number || '')
                              .replace('{customer_name}', followupData.customer_name || '');
                          } else if (buttonId === 'social_media') {
                            responseMessage = (settings.followup_social_message || '📱 Connect with us on social media:\n\n🌐 Website: {website}\n📷 Instagram: {instagram}\n📘 Facebook: {facebook}')
                              .replace('{website}', followupData.website || '')
                              .replace('{instagram}', followupData.instagram || '')
                              .replace('{facebook}', followupData.facebook || '');
                          } else if (buttonId === 'google_review') {
                            responseMessage = (settings.followup_review_message || '⭐ We would love your feedback!\n\nPlease take a moment to rate us:\n{google_review}')
                              .replace('{google_review}', followupData.google_review || '');
                          } else if (buttonId === 'chat_with_us') {
                            const whatsappLink = `https://wa.me/${settings.phone_number_id?.replace(/\D/g, '')}`;
                            responseMessage = (settings.followup_chat_message || '💬 Chat with us directly!\n\nClick here to start a conversation:\n{whatsapp_link}')
                              .replace('{whatsapp_link}', followupData.whatsapp_link || whatsappLink);
                          }
                          
                          // Remove empty placeholder lines
                          responseMessage = responseMessage
                            .split('\n')
                            .filter(line => !line.includes('{') || line.trim() === '')
                            .join('\n')
                            .replace(/\n{3,}/g, '\n\n');
                          
                          if (responseMessage.trim()) {
                            const wamidReply = await sendWhatsAppMessage(settings, senderPhone, responseMessage);
                            
                            if (wamidReply) {
                              await supabase.from('whatsapp_messages').insert({
                                organization_id: organizationId,
                                conversation_id: conversation.id,
                                wamid: wamidReply,
                                direction: 'outbound',
                                message_type: 'text',
                                message_text: responseMessage,
                                status: 'sent',
                                sent_at: new Date().toISOString(),
                              });
                              console.log(`Sent ${buttonId} response to customer`);
                            }
                          }
                        }
                      }
                      continue; // Skip AI chatbot for menu selections
                    }
                    
                    // Check if this is a button click from template CTA (Invoice Details, Chat With Us, etc.)
                    if (messageType === 'button' || 
                        (messageType === 'interactive' && message.interactive?.type === 'button_reply' && 
                         !['invoice_link', 'social_media', 'google_review', 'chat_with_us'].includes(buttonId))) {
                      
                      // Check for pending follow-ups for this customer
                      const { data: pendingLogs } = await supabase
                        .from('whatsapp_logs')
                        .select('*')
                        .eq('organization_id', organizationId)
                        .ilike('phone_number', `%${cleanPhone}%`)
                        .eq('pending_followup', true)
                        .order('created_at', { ascending: false })
                        .limit(1);
                      
                      if (pendingLogs && pendingLogs.length > 0) {
                        const log = pendingLogs[0];
                        const followupData = log.followup_data as Record<string, string> | null;
                        
                        if (followupData) {
                          // Send interactive button menu asking what customer needs
                          const menuMessage = settings.followup_menu_message || 'Thank you for your interest! 🙏\n\nPlease select what you need:';
                          
                          const interactivePayload = {
                            messaging_product: 'whatsapp',
                            recipient_type: 'individual',
                            to: senderPhone,
                            type: 'interactive',
                            interactive: {
                              type: 'button',
                              body: {
                                text: menuMessage
                              },
                              action: {
                                buttons: [
                                  { type: 'reply', reply: { id: 'invoice_link', title: '📄 Invoice Link' } },
                                  { type: 'reply', reply: { id: 'social_media', title: '📱 Social Media' } },
                                  { type: 'reply', reply: { id: 'google_review', title: '⭐ Google Review' } }
                                ]
                              }
                            }
                          };
                          
                          // WhatsApp allows max 3 buttons, so we send chat option as text
                          try {
                            const menuResponse = await fetch(
                              `https://graph.facebook.com/v18.0/${settings.phone_number_id}/messages`,
                              {
                                method: 'POST',
                                headers: {
                                  'Authorization': `Bearer ${settings.access_token}`,
                                  'Content-Type': 'application/json',
                                },
                                body: JSON.stringify(interactivePayload),
                              }
                            );
                            
                            if (menuResponse.ok) {
                              const menuResult = await menuResponse.json();
                              const menuWamid = menuResult.messages?.[0]?.id;
                              
                              if (menuWamid) {
                                await supabase.from('whatsapp_messages').insert({
                                  organization_id: organizationId,
                                  conversation_id: conversation.id,
                                  wamid: menuWamid,
                                  direction: 'outbound',
                                  message_type: 'interactive',
                                  message_text: menuMessage,
                                  status: 'sent',
                                  sent_at: new Date().toISOString(),
                                });
                                
                                // Also send "Chat with us" as a separate text with link
                                const whatsappLink = `https://wa.me/${settings.phone_number_id?.replace(/\D/g, '')}`;
                                const chatOption = `\n💬 Or chat with us directly: ${whatsappLink}`;
                                await sendWhatsAppMessage(settings, senderPhone, chatOption);
                                
                                console.log('Sent interactive menu after button click!');
                              }
                            } else {
                              console.error('Failed to send interactive menu:', await menuResponse.text());
                            }
                          } catch (err) {
                            console.error('Error sending interactive menu:', err);
                          }
                        }
                      }
                    }
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
