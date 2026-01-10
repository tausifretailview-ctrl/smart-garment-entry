import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

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
              if (change.value && change.value.statuses) {
                // Process status updates
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
                    // Also set delivered_at if not already set
                    updateData.delivered_at = timestamp;
                  } else if (newStatus === 'failed') {
                    updateData.error_message = status.errors?.[0]?.message || 'Message delivery failed';
                  }

                  const { error } = await supabase
                    .from('whatsapp_logs')
                    .update(updateData)
                    .eq('wamid', wamid);

                  if (error) {
                    console.error('Error updating whatsapp_logs:', error);
                  } else {
                    console.log(`Updated log for wamid: ${wamid} to status: ${newStatus}`);
                  }
                }
              }

              // Process incoming messages (optional - for future use)
              if (change.value && change.value.messages) {
                console.log('Incoming messages:', change.value.messages);
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
