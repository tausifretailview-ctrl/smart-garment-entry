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
  templateParams?: string[]; // Parameters for template message
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

async function fetchNamedTemplateParamNames(opts: {
  accessToken: string;
  wabaId?: string | null;
  templateName: string;
}): Promise<string[] | null> {
  const wabaId = String(opts.wabaId ?? '').trim();
  if (!wabaId) return null;

  // Fetch template metadata to detect NAMED parameter format
  const url = `https://graph.facebook.com/v21.0/${wabaId}/message_templates?name=${encodeURIComponent(
    opts.templateName
  )}&limit=1`;

  try {
    const res = await fetch(url, {
      method: 'GET',
      headers: {
        Authorization: `Bearer ${opts.accessToken}`,
      },
    });

    const data = await res.json();
    const tpl = data?.data?.[0];

    if (!tpl || tpl.parameter_format !== 'NAMED') return null;

    // Meta returns named params inside example.body_text_named_params for BODY component
    const bodyComponent = Array.isArray(tpl.components)
      ? tpl.components.find((c: any) => String(c?.type ?? '').toUpperCase() === 'BODY')
      : null;

    const named = bodyComponent?.example?.body_text_named_params;
    if (!Array.isArray(named) || named.length === 0) return null;

    const names = named
      .map((p: any) => String(p?.param_name ?? '').trim())
      .filter((n: string) => n.length > 0);

    return names.length > 0 ? names : null;
  } catch (_e) {
    return null;
  }
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
      templateParams,
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
    
    // Build the request payload
    // Use template message if templateName is provided (required for business-initiated messages)
    // Otherwise use text message (only works within 24-hour customer service window)
    let payload: Record<string, unknown>;
    
    const rawTemplateName = typeof templateName === 'string' ? templateName : '';
    const cleanedTemplateName = rawTemplateName.trim();

    if (cleanedTemplateName !== '') {
      // Template message - required for business-initiated messages outside 24-hour window
      console.log('Sending template message:', cleanedTemplateName);
      console.log('Template name raw:', JSON.stringify(rawTemplateName));
      console.log('Template params received:', JSON.stringify(templateParams));
      console.log('Template params length:', templateParams?.length || 0);

      const templatePayload: Record<string, unknown> = {
        messaging_product: "whatsapp",
        recipient_type: "individual",
        to: formattedPhone,
        type: "template",
        template: {
          name: cleanedTemplateName,
          language: { code: "en" },
        }
      };

      // Add template parameters if provided
      if (templateParams && Array.isArray(templateParams) && templateParams.length > 0) {
        const normalizedParams = templateParams.map((p) => String(p ?? '').trim());
        const missingParamIndexes = normalizedParams
          .map((val, idx) => ({ val, idx }))
          .filter(({ val }) => val.length === 0)
          .map(({ idx }) => idx);

        if (missingParamIndexes.length > 0) {
          console.log('ERROR: Template params contain empty values at indexes:', missingParamIndexes);
          console.log('Template params (normalized):', JSON.stringify(normalizedParams));

          // Update log entry so UI shows exactly what's missing
          if (logEntry) {
            await supabase
              .from('whatsapp_logs')
              .update({
                status: 'failed',
                sent_at: new Date().toISOString(),
                error_message: `Template parameter(s) empty at index(es): ${missingParamIndexes.join(', ')}`,
                provider_response: {
                  error: {
                    code: 'TEMPLATE_PARAMS_EMPTY',
                    message: 'One or more WhatsApp template parameters are empty',
                    missingParamIndexes,
                    templateName,
                    templateType,
                  },
                },
              })
              .eq('id', logEntry.id);
          }

          return new Response(
            JSON.stringify({
              success: false,
              error: 'One or more template parameters are empty',
              details: {
                missingParamIndexes,
                templateName,
                templateType,
              },
            }),
            { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
          );
        }

        const namedParamNames = await fetchNamedTemplateParamNames({
          accessToken: settings.access_token,
          wabaId: settings.waba_id,
          templateName: cleanedTemplateName,
        });

        const bodyParameters = normalizedParams.map((text, idx) => {
          const base: Record<string, string> = {
            type: 'text',
            text,
          };

          // If template is configured as NAMED, Meta requires `parameter_name`.
          // We fetch the expected names from template metadata.
          if (namedParamNames && namedParamNames[idx]) {
            base.parameter_name = namedParamNames[idx];
          }

          return base;
        });
 
        console.log('Body parameters:', JSON.stringify(bodyParameters));
 
        (templatePayload.template as Record<string, unknown>).components = [
          {
            type: "body",
            parameters: bodyParameters
          }
        ];
      } else {
        console.log('WARNING: No template params provided for template message!');
      }
      
      console.log('Final payload:', JSON.stringify(templatePayload));
      payload = templatePayload;
    } else {
      // Text message - only works if customer has messaged within 24 hours
      console.log('Sending text message (24-hour window required)');
      payload = {
        messaging_product: "whatsapp",
        recipient_type: "individual",
        to: formattedPhone,
        type: "text",
        text: {
          preview_url: true,
          body: message
        }
      };
    }

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
