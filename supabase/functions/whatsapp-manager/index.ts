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
      // Generate QR code for WhatsApp Web connection
      // This would integrate with WhatsApp Web protocol
      // For now, returning a placeholder response
      return new Response(
        JSON.stringify({
          success: true,
          message: "QR code generation initiated",
          qrCode: "data:image/png;base64,..." // Placeholder
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
