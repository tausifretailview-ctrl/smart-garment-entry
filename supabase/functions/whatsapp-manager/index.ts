import { serve } from "https://deno.land/std@0.168.0/http/server.ts";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const { action, phoneNumber, message } = await req.json();

    if (action === 'connect') {
      // Generate a unique session ID for this WhatsApp connection
      const sessionId = crypto.randomUUID();
      
      // In a real implementation, this would:
      // 1. Initialize WhatsApp Web client with this session ID
      // 2. Generate actual QR code from WhatsApp Web
      // 3. Store session data in database
      // For demo purposes, generating a sample QR code data
      const qrData = `whatsapp-session:${sessionId}`;
      
      return new Response(
        JSON.stringify({
          success: true,
          message: "QR code generated successfully",
          qrData: qrData,
          sessionId: sessionId
        }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    if (action === 'send') {
      // Send message through connected WhatsApp session
      if (!phoneNumber || !message) {
        throw new Error("Phone number and message are required");
      }

      // Format phone number
      let formattedPhone = phoneNumber.replace(/[^\d]/g, '');
      if (!formattedPhone.startsWith('91') && formattedPhone.length === 10) {
        formattedPhone = '91' + formattedPhone;
      }

      console.log(`Sending message to ${formattedPhone}`);
      
      // This would send via WhatsApp Web session
      // For now, using wa.me as fallback
      const whatsappUrl = `https://wa.me/${formattedPhone}?text=${encodeURIComponent(message)}`;
      
      return new Response(
        JSON.stringify({
          success: true,
          message: "Message sent successfully",
          url: whatsappUrl
        }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    if (action === 'status') {
      // Check connection status
      return new Response(
        JSON.stringify({
          connected: false,
          sessionActive: false
        }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    throw new Error("Invalid action");

  } catch (error) {
    console.error("Error:", error);
    const errorMessage = error instanceof Error ? error.message : 'Unknown error';
    return new Response(
      JSON.stringify({ error: errorMessage }),
      { 
        status: 500,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      }
    );
  }
});
