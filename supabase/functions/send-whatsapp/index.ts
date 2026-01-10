import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

interface SendWhatsAppRequest {
  organizationId: string;
  phone: string;
  message: string;
  templateType: string;
  templateName?: string;
  referenceId?: string;
  referenceType?: string;
}

// Format phone number for WhatsApp (ensure country code)
function formatPhoneNumber(phone: string): string {
  if (!phone) return "";
  
  // Remove all non-digit characters
  const cleaned = phone.replace(/\D/g, "");
  
  // Add 91 prefix for Indian numbers if not present
  if (cleaned.length === 10) {
    return `91${cleaned}`;
  }
  
  return cleaned;
}

serve(async (req) => {
  // Handle CORS preflight
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
    const supabaseServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
    
    const supabase = createClient(supabaseUrl, supabaseServiceKey);

    const { 
      organizationId, 
      phone, 
      message, 
      templateType,
      templateName,
      referenceId, 
      referenceType 
    }: SendWhatsAppRequest = await req.json();

    // Validate required fields
    if (!organizationId || !phone || !message || !templateType) {
      return new Response(
        JSON.stringify({ 
          success: false, 
          error: 'Missing required fields: organizationId, phone, message, templateType' 
        }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // Fetch WhatsApp API settings for the organization
    const { data: settings, error: settingsError } = await supabase
      .from('whatsapp_api_settings')
      .select('*')
      .eq('organization_id', organizationId)
      .single();

    if (settingsError || !settings) {
      return new Response(
        JSON.stringify({ 
          success: false, 
          error: 'WhatsApp API settings not configured for this organization' 
        }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    if (!settings.is_active) {
      return new Response(
        JSON.stringify({ 
          success: false, 
          error: 'WhatsApp API integration is disabled' 
        }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    if (!settings.phone_number_id || !settings.access_token) {
      return new Response(
        JSON.stringify({ 
          success: false, 
          error: 'WhatsApp API credentials not configured (missing phone_number_id or access_token)' 
        }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    const formattedPhone = formatPhoneNumber(phone);
    
    if (!formattedPhone || formattedPhone.length < 10) {
      return new Response(
        JSON.stringify({ 
          success: false, 
          error: 'Invalid phone number format' 
        }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // Create pending log entry
    const { data: logEntry, error: logError } = await supabase
      .from('whatsapp_logs')
      .insert({
        organization_id: organizationId,
        phone_number: formattedPhone,
        message: message,
        template_name: templateName || null,
        template_type: templateType,
        status: 'pending',
        reference_id: referenceId || null,
        reference_type: referenceType || null,
      })
      .select()
      .single();

    if (logError) {
      console.error('Error creating log entry:', logError);
    }

    // Call Meta WhatsApp Business API
    const metaApiUrl = `https://graph.facebook.com/v21.0/${settings.phone_number_id}/messages`;
    
    // Build the request payload - using text message for now
    // For template messages, you would need to configure message templates in Meta Business Manager
    const payload = {
      messaging_product: "whatsapp",
      recipient_type: "individual",
      to: formattedPhone,
      type: "text",
      text: {
        preview_url: true,
        body: message
      }
    };

    console.log('Sending WhatsApp message to:', formattedPhone);
    console.log('Using phone_number_id:', settings.phone_number_id);

    const response = await fetch(metaApiUrl, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${settings.access_token}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(payload),
    });

    const responseData = await response.json();
    console.log('Meta API Response:', JSON.stringify(responseData));

    // Update log entry with response
    if (logEntry) {
      const updateData: Record<string, unknown> = {
        provider_response: responseData,
        sent_at: new Date().toISOString(),
      };

      if (response.ok && responseData.messages?.[0]?.id) {
        updateData.status = 'sent';
        updateData.wamid = responseData.messages[0].id;
      } else {
        updateData.status = 'failed';
        updateData.error_message = responseData.error?.message || 'Unknown error from Meta API';
      }

      await supabase
        .from('whatsapp_logs')
        .update(updateData)
        .eq('id', logEntry.id);
    }

    if (!response.ok) {
      console.error('Meta API Error:', responseData);
      return new Response(
        JSON.stringify({ 
          success: false, 
          error: responseData.error?.message || 'Failed to send message via WhatsApp API',
          details: responseData.error
        }),
        { status: response.status, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    return new Response(
      JSON.stringify({ 
        success: true, 
        messageId: responseData.messages?.[0]?.id,
        logId: logEntry?.id
      }),
      { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );

  } catch (error: unknown) {
    console.error('Error in send-whatsapp function:', error);
    const errorMessage = error instanceof Error ? error.message : 'Internal server error';
    return new Response(
      JSON.stringify({ 
        success: false, 
        error: errorMessage 
      }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }
});
