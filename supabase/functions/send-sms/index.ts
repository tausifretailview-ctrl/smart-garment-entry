import { serve } from "https://deno.land/std@0.190.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

interface SendSMSRequest {
  organizationId: string;
  phoneNumber: string;
  templateType: string;
  placeholders: Record<string, string>;
  referenceId?: string;
  referenceType?: string;
}

const handler = async (req: Request): Promise<Response> => {
  // Handle CORS preflight requests
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    // Authenticate the requesting user
    const authHeader = req.headers.get("Authorization");
    if (!authHeader) {
      return new Response(
        JSON.stringify({ error: "No authorization header" }),
        { status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const supabaseServiceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const msg91ApiKey = Deno.env.get("MSG91_API_KEY");

    // Verify the user's token
    const { createClient: createAnonClient } = await import("https://esm.sh/@supabase/supabase-js@2");
    const supabaseAuth = createAnonClient(supabaseUrl, Deno.env.get("SUPABASE_ANON_KEY") ?? "", {
      global: { headers: { Authorization: authHeader } }
    });
    const { data: { user }, error: authError } = await supabaseAuth.auth.getUser();
    if (authError || !user) {
      return new Response(
        JSON.stringify({ error: "Unauthorized" }),
        { status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    if (!msg91ApiKey) {
      console.error("MSG91_API_KEY not configured");
      return new Response(
        JSON.stringify({ error: "SMS provider not configured. Please add MSG91_API_KEY in settings." }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const supabase = createClient(supabaseUrl, supabaseServiceKey);

    const { organizationId, phoneNumber, templateType, placeholders, referenceId, referenceType }: SendSMSRequest = await req.json();

    console.log(`Processing SMS request for org: ${organizationId}, type: ${templateType}, phone: ${phoneNumber}`);

    // Get SMS settings for the organization
    const { data: smsSettings, error: settingsError } = await supabase
      .from("sms_settings")
      .select("*")
      .eq("organization_id", organizationId)
      .single();

    if (settingsError && settingsError.code !== "PGRST116") {
      console.error("Error fetching SMS settings:", settingsError);
      throw new Error("Failed to fetch SMS settings");
    }

    if (!smsSettings?.is_active) {
      console.log("SMS is not active for this organization");
      return new Response(
        JSON.stringify({ error: "SMS is not enabled for this organization" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Get the template
    const { data: template, error: templateError } = await supabase
      .from("sms_templates")
      .select("*")
      .eq("organization_id", organizationId)
      .eq("template_type", templateType)
      .eq("is_active", true)
      .single();

    if (templateError || !template) {
      console.error("Template not found:", templateError);
      return new Response(
        JSON.stringify({ error: `SMS template '${templateType}' not found` }),
        { status: 404, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Replace placeholders in the message
    let message = template.message_template;
    for (const [key, value] of Object.entries(placeholders)) {
      message = message.replace(new RegExp(`{${key}}`, "g"), value || "");
    }

    // Format phone number (ensure it has country code)
    let formattedPhone = phoneNumber.replace(/\D/g, "");
    if (formattedPhone.length === 10) {
      formattedPhone = "91" + formattedPhone;
    }

    console.log(`Sending SMS to ${formattedPhone}: ${message.substring(0, 50)}...`);

    // Send SMS via MSG91
    const msg91Response = await fetch("https://control.msg91.com/api/v5/flow/", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "authkey": msg91ApiKey,
      },
      body: JSON.stringify({
        flow_id: template.dlt_template_id || "",
        sender: smsSettings?.sender_id || "NOTIFY",
        mobiles: formattedPhone,
        VAR1: message,
      }),
    });

    const msg91Data = await msg91Response.json();
    console.log("MSG91 Response:", JSON.stringify(msg91Data));

    const status = msg91Data.type === "success" ? "sent" : "failed";

    // Log the SMS
    const { error: logError } = await supabase.from("sms_logs").insert({
      organization_id: organizationId,
      template_type: templateType,
      phone_number: phoneNumber,
      message: message,
      status: status,
      provider_response: msg91Data,
      reference_id: referenceId || null,
      reference_type: referenceType || null,
    });

    if (logError) {
      console.error("Error logging SMS:", logError);
    }

    if (status === "failed") {
      return new Response(
        JSON.stringify({ error: "Failed to send SMS", details: msg91Data }),
        { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    return new Response(
      JSON.stringify({ success: true, message: "SMS sent successfully", data: msg91Data }),
      { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  } catch (error: any) {
    console.error("Error in send-sms function:", error);
    return new Response(
      JSON.stringify({ error: "An internal error occurred" }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
};

serve(handler);
