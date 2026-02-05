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
  messageType?: string; // 'text' for manual messages, 'template' for template messages
  templateType?: string; // Type of template: sales_invoice, quotation, etc.
  templateName?: string;
  templateParams?: string[]; // Direct parameters (legacy support)
  saleData?: Record<string, unknown>; // Dynamic data for parameter building
  referenceId?: string;
  referenceType?: string;
  // Document attachment for PDF sending
  documentUrl?: string; // Public URL of PDF document
  documentFilename?: string; // Display filename for the document
  documentCaption?: string; // Caption for the document message
  // Document header template (direct PDF in template - bypasses 24h window)
  useDocumentHeaderTemplate?: boolean;
  documentHeaderTemplateName?: string;
  pdfBlob?: string; // Base64 encoded PDF for Meta upload
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

// Upload PDF to Meta's media endpoint and get media_id for template with document header
async function uploadPdfToMeta(
  pdfBlob: string, // Base64 encoded PDF
  filename: string,
  phoneNumberId: string,
  accessToken: string
): Promise<string | null> {
  try {
    console.log('Uploading PDF to Meta media endpoint...');
    
    // Decode base64 to binary
    const binaryString = atob(pdfBlob);
    const bytes = new Uint8Array(binaryString.length);
    for (let i = 0; i < binaryString.length; i++) {
      bytes[i] = binaryString.charCodeAt(i);
    }
    
    // Create form data for upload
    const formData = new FormData();
    formData.append('file', new Blob([bytes], { type: 'application/pdf' }), filename);
    formData.append('messaging_product', 'whatsapp');
    formData.append('type', 'application/pdf');
    
    const uploadUrl = `https://graph.facebook.com/v21.0/${phoneNumberId}/media`;
    
    const response = await fetch(uploadUrl, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${accessToken}`,
      },
      body: formData,
    });
    
    const data = await response.json();
    
    if (response.ok && data.id) {
      console.log('PDF uploaded to Meta, media_id:', data.id);
      return data.id;
    } else {
      console.error('Meta media upload failed:', data);
      return null;
    }
  } catch (error) {
    console.error('Error uploading PDF to Meta:', error);
    return null;
  }
}

// Send template message with document header (PDF embedded in template)
async function sendDocumentHeaderTemplate(
  phoneNumberId: string,
  accessToken: string,
  toPhone: string,
  templateName: string,
  templateLanguage: string,
  mediaId: string,
  filename: string,
  bodyParameters: Array<Record<string, string>>
): Promise<{ success: boolean; messageId?: string; error?: string; responseData?: any }> {
  const metaApiUrl = `https://graph.facebook.com/v21.0/${phoneNumberId}/messages`;
  
  const components: Array<Record<string, unknown>> = [
    {
      type: "header",
      parameters: [
        {
          type: "document",
          document: {
            id: mediaId,
            filename: filename,
          },
        },
      ],
    },
  ];
  
  // Add body parameters if present
  if (bodyParameters.length > 0) {
    components.push({
      type: "body",
      parameters: bodyParameters,
    });
  }
  
  const payload = {
    messaging_product: "whatsapp",
    recipient_type: "individual",
    to: toPhone,
    type: "template",
    template: {
      name: templateName,
      language: { code: templateLanguage },
      components: components,
    },
  };
  
  console.log('Sending document header template:', JSON.stringify(payload));
  
  const response = await fetch(metaApiUrl, {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${accessToken}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(payload),
  });
  
  const responseData = await response.json();
  console.log('Document header template response:', JSON.stringify(responseData));
  
  if (response.ok && responseData.messages?.[0]?.id) {
    return { success: true, messageId: responseData.messages[0].id, responseData };
  } else {
    return { 
      success: false, 
      error: responseData.error?.message || 'Failed to send document header template',
      responseData 
    };
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
      messageType,
      templateType,
      templateName,
      templateParams,
      saleData,
      referenceId, 
      referenceType,
      documentUrl,
      documentFilename,
      documentCaption,
      useDocumentHeaderTemplate,
      documentHeaderTemplateName,
      pdfBlob
    }: SendWhatsAppRequest = await req.json();

    // Validate required fields - message is optional for template messages
    if (!organizationId || !phone) {
      return new Response(
        JSON.stringify({ 
          success: false, 
          error: 'Missing required fields: organizationId, phone' 
        }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // For non-template messages, message is required
    const isTemplateMessage = templateType || templateName;
    if (!isTemplateMessage && !message) {
      return new Response(
        JSON.stringify({ 
          success: false, 
          error: 'Message is required for non-template messages' 
        }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // Determine if this is a text message or template message
    const isTextMessage = messageType === 'text' || (!templateName && !templateType);

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

    // ========== DUPLICATE MESSAGE PREVENTION ==========
    // Check if a message was already sent for this invoice within the cooldown period
    if (referenceId && referenceType === 'sale') {
      const { data: existingLog } = await supabase
        .from('whatsapp_logs')
        .select('id, status, created_at')
        .eq('reference_id', referenceId)
        .eq('template_type', templateType || 'sales_invoice')
        .in('status', ['sent', 'delivered', 'read', 'pending'])
        .order('created_at', { ascending: false })
        .limit(1)
        .maybeSingle();

      if (existingLog) {
        const hoursSinceLastSend = (Date.now() - new Date(existingLog.created_at).getTime()) / (1000 * 60 * 60);
        
        // Block if message was sent within last 60 minutes
        if (hoursSinceLastSend < 1) {
          console.log(`Duplicate message blocked for sale ${referenceId} - message already sent ${hoursSinceLastSend.toFixed(2)} hours ago`);
          return new Response(
            JSON.stringify({ 
              success: true, 
              skipped: true,
              reason: 'Message already sent for this invoice within the last 60 minutes'
            }),
            { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
          );
        }
      }
    }
    // ===================================================

    // Create pending log entry
    const { data: logEntry, error: logError } = await supabase
      .from('whatsapp_logs')
      .insert({
        organization_id: organizationId,
        phone_number: formattedPhone,
        message: message,
        template_name: templateName || null,
        template_type: templateType || (isTextMessage ? 'manual_message' : 'unknown'),
        status: 'pending',
        reference_id: referenceId || null,
        reference_type: referenceType || null,
      })
      .select()
      .single();

    if (logError) {
      console.error('Error creating log entry:', logError);
    }

    // Check if we should use document header template (PDF embedded in template header)
    // This bypasses the 24-hour window restriction since it's a template message
    console.log('Document header check - useDocumentHeaderTemplate:', useDocumentHeaderTemplate);
    console.log('Document header check - pdfBlob present:', !!pdfBlob, pdfBlob ? `length: ${pdfBlob.length}` : 'N/A');
    console.log('Document header check - documentHeaderTemplateName:', documentHeaderTemplateName);
    console.log('Document header check - orgSettings template:', orgSettings?.invoice_document_template_name);
    
    const shouldUseDocumentHeader = useDocumentHeaderTemplate && 
      pdfBlob && 
      (documentHeaderTemplateName || orgSettings?.invoice_document_template_name);
    
    console.log('shouldUseDocumentHeader:', shouldUseDocumentHeader);
    
    if (shouldUseDocumentHeader) {
      console.log('Using document header template for direct PDF delivery');
      
      const docTemplateName = documentHeaderTemplateName || orgSettings?.invoice_document_template_name;
      
      // Fetch template language
      let docTemplateLanguage = 'en_US';
      const { data: docMetaTemplates } = await supabase
        .from('whatsapp_meta_templates')
        .select('template_language')
        .eq('organization_id', organizationId)
        .eq('template_name', docTemplateName);
      
      if (docMetaTemplates && docMetaTemplates.length > 0) {
        const enUSTemplate = docMetaTemplates.find((t: any) => t.template_language === 'en_US');
        docTemplateLanguage = (enUSTemplate || docMetaTemplates[0]).template_language;
      }
      
      // Upload PDF to Meta
      const mediaId = await uploadPdfToMeta(
        pdfBlob,
        documentFilename || 'Invoice.pdf',
        settings.phone_number_id,
        settings.access_token
      );
      
      if (!mediaId) {
        console.error('Failed to upload PDF to Meta, falling back to regular template');
        // Continue with regular flow below
      } else {
        // Build body parameters for document header template
        let docBodyParams: Array<Record<string, string>> = [];
        
        // Get param mapping from orgSettings if available
        const docParamMapping = orgSettings?.invoice_document_template_params as any[] | null;
        
        if (docParamMapping && docParamMapping.length > 0 && saleData) {
          const { data: companySettings } = await supabase
            .from('settings')
            .select('business_name')
            .eq('organization_id', organizationId)
            .maybeSingle();
          
          const orgName = companySettings?.business_name || 'Our Company';
          const params = buildTemplateParams(docParamMapping, saleData, orgName);
          docBodyParams = params.map((text) => ({ type: 'text', text }));
        }
        
        // Send document header template
        const docResult = await sendDocumentHeaderTemplate(
          settings.phone_number_id,
          settings.access_token,
          formattedPhone,
          docTemplateName,
          docTemplateLanguage,
          mediaId,
          documentFilename || 'Invoice.pdf',
          docBodyParams
        );
        
        // Update log entry
        if (logEntry) {
          await supabase
            .from('whatsapp_logs')
            .update({
              status: docResult.success ? 'sent' : 'failed',
              wamid: docResult.messageId || null,
              sent_at: new Date().toISOString(),
              error_message: docResult.error || null,
              provider_response: docResult.responseData,
              template_name: docTemplateName,
            })
            .eq('id', logEntry.id);
        }
        
        if (docResult.success) {
          return new Response(
            JSON.stringify({ 
              success: true, 
              messageId: docResult.messageId,
              documentEmbedded: true,
              logId: logEntry?.id
            }),
            { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
          );
        } else {
          return new Response(
            JSON.stringify({ 
              success: false, 
              error: docResult.error || 'Failed to send document header template',
              details: docResult.responseData
            }),
            { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
          );
        }
      }
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

      // Fetch template info including components from stored meta templates
      // Prefer en_US over en as it's more common for Meta templates
      let templateLanguage = 'en_US'; // Default fallback - en_US is more common for Meta
      let templateComponents: any[] | null = null;
      
      const { data: metaTemplates } = await supabase
        .from('whatsapp_meta_templates')
        .select('template_language, components')
        .eq('organization_id', organizationId)
        .eq('template_name', cleanedTemplateName);

      if (metaTemplates && metaTemplates.length > 0) {
        // Prefer en_US if multiple languages exist, otherwise use the first one found
        const enUSTemplate = metaTemplates.find((t: any) => t.template_language === 'en_US');
        const selectedTemplate = enUSTemplate || metaTemplates[0];
        templateLanguage = selectedTemplate.template_language;
        templateComponents = selectedTemplate.components as any[];
        console.log('Using stored template language:', templateLanguage);
        console.log('Template components from DB:', JSON.stringify(templateComponents));
      } else {
        console.log('Template not found in DB, using default language: en_US');
      }

      // Check if this template requires a DOCUMENT header - if so, we need PDF
      const headerComponent = templateComponents?.find((c: any) => c?.type?.toUpperCase() === 'HEADER');
      const requiresDocumentHeader = headerComponent?.format?.toUpperCase() === 'DOCUMENT';
      
      if (requiresDocumentHeader) {
        // This template has DOCUMENT header but no pdfBlob was provided
        // This is a configuration error - user should use "Direct PDF Delivery" instead
        console.error('Template requires DOCUMENT header but pdfBlob was not provided');
        console.log('This template should be configured in "Direct PDF Delivery" settings, not "Invoice Template"');
        
        // Return a helpful error message without blocking
        if (logEntry) {
          await supabase
            .from('whatsapp_logs')
            .update({
              status: 'failed',
              sent_at: new Date().toISOString(),
              error_message: 'Template has DOCUMENT header - requires PDF. Move this template to "Direct PDF Delivery" settings.',
              provider_response: {
                error: {
                  code: 'DOCUMENT_HEADER_REQUIRED',
                  message: 'This template has DOCUMENT header type. Configure it in "Direct PDF Delivery" settings with PDF enabled.',
                  templateName: cleanedTemplateName,
                  headerType: 'DOCUMENT',
                  suggestion: 'In WhatsApp Settings: 1) Enable "Direct PDF Delivery", 2) Select this template there, 3) Use a TEXT/NONE header template for "Invoice Template"',
                },
              },
            })
            .eq('id', logEntry.id);
        }
        
        return new Response(
          JSON.stringify({
            success: false,
            error: 'Template has DOCUMENT header - configure it in "Direct PDF Delivery" settings instead.',
            code: 'DOCUMENT_HEADER_REQUIRED',
            details: {
              templateName: cleanedTemplateName,
              headerType: 'DOCUMENT',
              solution: 'Use "Direct PDF Delivery" setting for DOCUMENT header templates. Select a TEXT/NONE header template for "Invoice Template".',
            },
          }),
          { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        );
      }

      // Determine which params to use - either directly provided or built from saleData
      let finalTemplateParams: string[] = [];
      
      if (templateParams && Array.isArray(templateParams) && templateParams.length > 0) {
        // Use directly provided params (legacy support)
        finalTemplateParams = templateParams;
      } else if (saleData && orgSettings && templateType) {
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

        // Build components array
        const components: Array<Record<string, unknown>> = [];
        
        // Add body component if we have body parameters
        if (bodyParameters.length > 0) {
          components.push({
            type: "body",
            parameters: bodyParameters
          });
        }

        // Check if template has FLOW buttons and add button component if needed
        // FLOW buttons require explicit button component with sub_type: "flow"
        if (templateComponents && Array.isArray(templateComponents)) {
          const buttonsComponent = templateComponents.find(
            (c: any) => c?.type?.toUpperCase() === 'BUTTONS'
          );
          
          if (buttonsComponent?.buttons && Array.isArray(buttonsComponent.buttons)) {
            buttonsComponent.buttons.forEach((btn: any, idx: number) => {
              if (btn?.type?.toUpperCase() === 'FLOW') {
                // For FLOW buttons, we need to include the button component
                // with the button text as parameter
                components.push({
                  type: "button",
                  sub_type: "flow",
                  index: String(idx),
                  parameters: [
                    {
                      type: "action",
                      action: {
                        flow_token: "unused" // Required but can be any string for navigate flows
                      }
                    }
                  ]
                });
                console.log(`Added FLOW button component at index ${idx}`);
              }
            });
          }
        }

        // Set components on template payload
        if (components.length > 0) {
          (templatePayload.template as Record<string, unknown>).components = components;
        }
        
        console.log('Components being sent:', JSON.stringify(components));
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
                // If a PDF was generated for this invoice, store it so we can send it after user interaction
                document_url: String(documentUrl || ''),
                document_filename: String(documentFilename || ''),
                document_caption: String(documentCaption || ''),
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

    // Send document attachment if provided (after template message)
    let documentMessageId: string | undefined;
    let documentError: string | undefined;
    if (documentUrl && response.ok) {
      console.log('Sending document attachment:', documentUrl);
      
      const documentPayload = {
        messaging_product: "whatsapp",
        recipient_type: "individual",
        to: formattedPhone,
        type: "document",
        document: {
          link: documentUrl,
          filename: documentFilename || "Invoice.pdf",
          caption: documentCaption || ""
        }
      };

      try {
        const docResponse = await fetch(metaApiUrl, {
          method: 'POST',
          headers: {
            'Authorization': `Bearer ${settings.access_token}`,
            'Content-Type': 'application/json',
          },
          body: JSON.stringify(documentPayload),
        });

        const docResponseData = await docResponse.json();
        console.log('Document API Response:', JSON.stringify(docResponseData));

        if (docResponse.ok && docResponseData.messages?.[0]?.id) {
          documentMessageId = docResponseData.messages[0].id;
          console.log('Document sent successfully:', documentMessageId);
          
          // Log the document message separately with success status
          await supabase
            .from('whatsapp_logs')
            .insert({
              organization_id: organizationId,
              phone_number: formattedPhone,
              message: `PDF Document: ${documentFilename || 'Invoice.pdf'}`,
              template_type: 'document_attachment',
              status: 'sent',
              wamid: documentMessageId,
              reference_id: referenceId || null,
              reference_type: referenceType || null,
              sent_at: new Date().toISOString(),
              provider_response: docResponseData,
            });
        } else {
          // Document failed - extract error details
          const errorCode = docResponseData?.error?.code || 'UNKNOWN';
          const errorTitle = docResponseData?.error?.message || docResponseData?.error?.title || 'Document send failed';
          documentError = `${errorCode}: ${errorTitle}`;
          console.error('Document send failed:', documentError, docResponseData);
          
          // Log the failed document attempt - but DON'T let it affect the main success
          // Error 131047 = "Re-engagement message" - customer hasn't replied in 24h so document (non-template) can't be sent
          const isReEngagementError = errorCode === 131047 || 
            docResponseData?.error?.title === 'Re-engagement message' ||
            String(docResponseData?.error?.message || '').includes('Re-engagement');
          
          await supabase
            .from('whatsapp_logs')
            .insert({
              organization_id: organizationId,
              phone_number: formattedPhone,
              message: `PDF Document: ${documentFilename || 'Invoice.pdf'}`,
              template_type: 'document_attachment',
              status: 'failed',
              reference_id: referenceId || null,
              reference_type: referenceType || null,
              sent_at: new Date().toISOString(),
              provider_response: docResponseData,
              error_message: isReEngagementError 
                ? 'Document not sent: Customer must reply first (24-hour window expired). Template message was sent successfully.'
                : documentError,
            });
        }
      } catch (docError) {
        const errMsg = docError instanceof Error ? docError.message : 'Unknown error';
        documentError = errMsg;
        console.error('Error sending document:', docError);
        
        // Log the exception
        await supabase
          .from('whatsapp_logs')
          .insert({
            organization_id: organizationId,
            phone_number: formattedPhone,
            message: `PDF Document: ${documentFilename || 'Invoice.pdf'}`,
            template_type: 'document_attachment',
            status: 'failed',
            reference_id: referenceId || null,
            reference_type: referenceType || null,
            sent_at: new Date().toISOString(),
            error_message: `Exception: ${errMsg}`,
          });
        // Don't fail the main request if document fails
      }
    }

    return new Response(
      JSON.stringify({ 
        success: true, 
        messageId: responseData.messages?.[0]?.id,
        documentMessageId,
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
