import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

// Helper to find organization by phone number ID from settings
async function findOrganizationByPhoneId(supabase: any, phoneNumberId: string) {
  const { data } = await supabase
    .from('whatsapp_api_settings')
    .select('organization_id')
    .eq('phone_number_id', phoneNumberId)
    .single();
  
  return data?.organization_id;
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
                
                // Find organization by phone_number_id
                const organizationId = await findOrganizationByPhoneId(supabase, phoneNumberId);
                
                if (!organizationId) {
                  console.error('Organization not found for phone_number_id:', phoneNumberId);
                  continue;
                }

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
