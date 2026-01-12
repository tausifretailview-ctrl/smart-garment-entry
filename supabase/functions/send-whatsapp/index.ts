import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

interface TemplateParamMapping {
  index: number;
  field: string;
  label: string;
  customValue?: string;
}

interface SendWhatsAppRequest {
  organizationId: string;
  phone: string;
  message: string;
  templateType: string;
  templateName?: string;
  templateParams?: string[]; // Direct parameters (legacy support)
  saleData?: Record<string, unknown>; // Dynamic data for parameter building
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


// Build template parameters dynamically from saleData and param mapping
function buildTemplateParams(
  paramMapping: TemplateParamMapping[],
  saleData: Record<string, unknown>,
  orgName: string
): string[] {
  if (!paramMapping || paramMapping.length === 0) {
    return [];
  }

  return paramMapping.map((param) => {
    const field = param.field;
    
    switch (field) {
      case 'customer_name':
        return String(saleData.customer_name || '');
      case 'invoice_number':
      case 'quotation_number':
      case 'order_number':
        return String(saleData.sale_number || saleData.quotation_number || saleData.order_number || '');
      case 'invoice_date':
      case 'quotation_date':
      case 'order_date':
        const dateVal = saleData.sale_date || saleData.quotation_date || saleData.order_date;
        if (dateVal) {
          return new Date(String(dateVal)).toLocaleDateString('en-IN', {
            day: '2-digit',
            month: 'short',
            year: 'numeric',
          });
        }
        return '';
      case 'amount':
        const amount = saleData.net_amount || saleData.amount || 0;
        return Number(amount).toLocaleString('en-IN');
      case 'gross_amount':
        return Number(saleData.gross_amount || 0).toLocaleString('en-IN');
      case 'discount':
        return Number(saleData.discount_amount || saleData.discount || 0).toLocaleString('en-IN');
      case 'payment_status':
        return String(saleData.payment_status || 'Pending');
      case 'organization_name':
        return orgName;
      case 'items_count':
        return String(saleData.items_count || 0);
      case 'due_date':
        const dueDateVal = saleData.due_date;
        if (dueDateVal) {
          return new Date(String(dueDateVal)).toLocaleDateString('en-IN', {
            day: '2-digit',
            month: 'short',
            year: 'numeric',
          });
        }
        return '';
      case 'valid_until':
        const validUntilVal = saleData.valid_until;
        if (validUntilVal) {
          return new Date(String(validUntilVal)).toLocaleDateString('en-IN', {
            day: '2-digit',
            month: 'short',
            year: 'numeric',
          });
        }
        return '';
      case 'delivery_date':
        const deliveryDateVal = saleData.delivery_date;
        if (deliveryDateVal) {
          return new Date(String(deliveryDateVal)).toLocaleDateString('en-IN', {
            day: '2-digit',
            month: 'short',
            year: 'numeric',
          });
        }
        return '';
      case 'salesman':
        return String(saleData.salesman || '');
      case 'days_overdue':
        return String(saleData.days_overdue || 0);
      case 'contact_number':
        return String(saleData.contact_number || '');
      case 'invoice_link':
        // Build public invoice URL
        const orgSlug = String(saleData.org_slug || '');
        const saleId = String(saleData.sale_id || saleData.id || '');
        return saleId && orgSlug 
          ? `https://app.inventoryshop.in/${orgSlug}/invoice/view/${saleId}` 
          : '';
      case 'payment_link':
        return String(saleData.payment_link || '');
      case 'website':
        return String(saleData.website || '');
      case 'instagram':
        return String(saleData.instagram || '');
      case 'facebook':
        return String(saleData.facebook || '');
      case 'custom_text':
        return param.customValue || '';
      default:
        // Try to get the value directly from saleData
        return String(saleData[field] || param.customValue || '');
    }
  });
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
      saleData,
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
    const { data: orgSettings, error: settingsError } = await supabase
      .from('whatsapp_api_settings')
      .select('*')
      .eq('organization_id', organizationId)
      .maybeSingle();

    if (settingsError) {
      console.error('Error fetching org settings:', settingsError);
      return new Response(
        JSON.stringify({ 
          success: false, 
          error: 'Error fetching WhatsApp API settings' 
        }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // Determine which credentials to use
    let apiCredentials: {
      phone_number_id: string;
      access_token: string;
      waba_id?: string | null;
    };

    const useDefaultApi = orgSettings?.use_default_api !== false; // Default to true if not set

    if (useDefaultApi || !orgSettings?.phone_number_id || !orgSettings?.access_token) {
      // Use platform default credentials
      console.log('Using platform default WhatsApp API credentials');
      
      const { data: platformSettings, error: platformError } = await supabase
        .from('platform_settings')
        .select('setting_value')
        .eq('setting_key', 'default_whatsapp_api')
        .single();

      if (platformError || !platformSettings) {
        console.error('Platform settings not found:', platformError);
        return new Response(
          JSON.stringify({ 
            success: false, 
            error: 'Platform default WhatsApp API not configured' 
          }),
          { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        );
      }

      const defaultCreds = platformSettings.setting_value as Record<string, unknown>;
      
      if (!defaultCreds.phone_number_id || !defaultCreds.access_token) {
        return new Response(
          JSON.stringify({ 
            success: false, 
            error: 'Platform default WhatsApp API credentials not configured' 
          }),
          { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        );
      }

      apiCredentials = {
        phone_number_id: defaultCreds.phone_number_id as string,
        access_token: defaultCreds.access_token as string,
        waba_id: defaultCreds.waba_id as string | null,
      };
    } else {
      // Use organization's own credentials
      console.log('Using organization-specific WhatsApp API credentials');
      
      if (!orgSettings.is_active) {
        return new Response(
          JSON.stringify({ 
            success: false, 
            error: 'WhatsApp API integration is disabled' 
          }),
          { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        );
      }

      apiCredentials = {
        phone_number_id: orgSettings.phone_number_id,
        access_token: orgSettings.access_token,
        waba_id: orgSettings.waba_id,
      };
    }

    // Create a merged settings object for template fetching
    const settings = {
      ...orgSettings,
      phone_number_id: apiCredentials.phone_number_id,
      access_token: apiCredentials.access_token,
      waba_id: apiCredentials.waba_id,
    };

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
      console.log('Template params received:', JSON.stringify(templateParams));
      console.log('SaleData received:', JSON.stringify(saleData));

      // Fetch template language from stored meta templates
      let templateLanguage = 'en'; // Default fallback
      const { data: metaTemplate } = await supabase
        .from('whatsapp_meta_templates')
        .select('template_language')
        .eq('organization_id', organizationId)
        .eq('template_name', cleanedTemplateName)
        .maybeSingle();

      if (metaTemplate?.template_language) {
        templateLanguage = metaTemplate.template_language;
        console.log('Using stored template language:', templateLanguage);
      } else {
        console.log('Template not found in DB, using default language: en');
      }

      // Determine which params to use - either directly provided or built from saleData
      let finalTemplateParams: string[] = [];
      
      if (templateParams && Array.isArray(templateParams) && templateParams.length > 0) {
        // Use directly provided params (legacy support)
        finalTemplateParams = templateParams;
      } else if (saleData && orgSettings) {
        // Build params dynamically from saleData using param mapping from settings
        const paramMappingKey = `${templateType.replace('sales_', '')}_template_params`;
        const paramMapping = orgSettings[paramMappingKey] as TemplateParamMapping[] | null;
        
        // Fetch org name for the organization_name field
        const { data: companySettings } = await supabase
          .from('settings')
          .select('business_name')
          .eq('organization_id', organizationId)
          .maybeSingle();
        
        const orgName = companySettings?.business_name || 'Our Company';
        
        if (paramMapping && paramMapping.length > 0) {
          finalTemplateParams = buildTemplateParams(paramMapping, saleData, orgName);
          console.log('Built dynamic params:', JSON.stringify(finalTemplateParams));
        }
      }

      const templatePayload: Record<string, unknown> = {
        messaging_product: "whatsapp",
        recipient_type: "individual",
        to: formattedPhone,
        type: "template",
        template: {
          name: cleanedTemplateName,
          language: { code: templateLanguage },
        }
      };

      // Add template parameters if we have any
      if (finalTemplateParams.length > 0) {
        const normalizedParams = finalTemplateParams.map((p) => String(p ?? '').trim());
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

    // Mark pending follow-up when customer clicks the CTA button (WhatsApp 24h policy compliant)
    // The follow-up will be sent by whatsapp-webhook when customer clicks the template button
    if (
      response.ok && 
      templateType === 'sales_invoice' && 
      orgSettings?.send_followup_on_button_click && 
      logEntry
    ) {
      try {
        console.log('Marking pending follow-up for button click...');
        
        // Get sale_id and org_slug - either from saleData or fallback to referenceId
        const saleId = saleData?.sale_id || referenceId;
        let orgSlug = saleData?.org_slug;
        
        // If no org_slug in saleData, fetch from organization
        if (!orgSlug && organizationId) {
          const { data: org } = await supabase
            .from('organizations')
            .select('slug')
            .eq('id', organizationId)
            .single();
          orgSlug = org?.slug;
        }
        
        if (saleId && orgSlug) {
          // Build the invoice link
          const invoiceLink = `https://app.inventoryshop.in/${orgSlug}/invoice/view/${saleId}`;
          
          // Store follow-up data with the log entry - will be sent when customer clicks button
          const whatsappLink = `https://wa.me/${orgSettings.phone_number_id?.replace(/\D/g, '')}`;
          
          await supabase
            .from('whatsapp_logs')
            .update({
              pending_followup: true,
              followup_data: {
                invoice_link: invoiceLink,
                customer_name: String(saleData?.customer_name || ''),
                sale_number: String(saleData?.sale_number || ''),
                website: String(saleData?.website || orgSettings.social_links?.website || ''),
                instagram: String(saleData?.instagram || orgSettings.social_links?.instagram || ''),
                facebook: String(saleData?.facebook || orgSettings.social_links?.facebook || ''),
                google_review: String(orgSettings.social_links?.google_review || ''),
                whatsapp_link: whatsappLink,
                message_template: orgSettings.button_followup_message || '📄 Thank you for viewing your invoice!\n\nHere are your links:\n🌐 Website: {website}\n📷 Instagram: {instagram}\n\nRate us: ⭐⭐⭐⭐⭐',
              }
            })
            .eq('id', logEntry.id);
            
          console.log('Pending follow-up marked successfully with invoice link:', invoiceLink);
        } else {
          console.log('Could not mark pending follow-up - missing saleId or orgSlug');
        }
      } catch (followUpError) {
        // Don't fail the main request if marking fails
        console.error('Failed to mark pending follow-up:', followUpError);
      }
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
