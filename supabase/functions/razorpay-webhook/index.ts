import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type, x-razorpay-signature',
};

serve(async (req) => {
  // Handle CORS
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
    const supabaseServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
    const razorpayWebhookSecret = Deno.env.get('RAZORPAY_WEBHOOK_SECRET');

    const supabase = createClient(supabaseUrl, supabaseServiceKey);

    // Get the webhook payload
    const payload = await req.text();
    const signature = req.headers.get('x-razorpay-signature');

    // Verify webhook signature if secret is configured
    if (razorpayWebhookSecret && signature) {
      const encoder = new TextEncoder();
      const key = await crypto.subtle.importKey(
        'raw',
        encoder.encode(razorpayWebhookSecret),
        { name: 'HMAC', hash: 'SHA-256' },
        false,
        ['verify']
      );

      const data = encoder.encode(payload);
      const signatureBytes = new Uint8Array(
        signature.match(/.{1,2}/g)!.map(byte => parseInt(byte, 16))
      );

      const isValid = await crypto.subtle.verify('HMAC', key, signatureBytes, data);
      
      if (!isValid) {
        console.error('Invalid Razorpay webhook signature');
        return new Response(
          JSON.stringify({ error: 'Invalid signature' }),
          { status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        );
      }
    }

    const webhookData = JSON.parse(payload);
    console.log('Razorpay webhook received:', webhookData.event);

    // Handle payment link paid event
    if (webhookData.event === 'payment_link.paid') {
      const paymentLinkId = webhookData.payload?.payment_link?.entity?.id;
      const paymentId = webhookData.payload?.payment?.entity?.id;
      const amount = webhookData.payload?.payment?.entity?.amount / 100; // Convert paise to rupees

      if (paymentLinkId) {
        // Update payment_links table
        const { data: paymentLink, error: fetchError } = await supabase
          .from('payment_links')
          .select('id, sale_id, legacy_invoice_id')
          .eq('gateway_link_id', paymentLinkId)
          .single();

        if (fetchError) {
          console.error('Error fetching payment link:', fetchError);
        } else if (paymentLink) {
          // Update payment link status
          const { error: updateError } = await supabase
            .from('payment_links')
            .update({
              status: 'paid',
              paid_at: new Date().toISOString(),
              gateway_payment_id: paymentId,
            })
            .eq('id', paymentLink.id);

          if (updateError) {
            console.error('Error updating payment link:', updateError);
          }

          // Update invoice payment status if linked
          if (paymentLink.sale_id) {
            await supabase
              .from('sales')
              .update({
                payment_status: 'paid',
                paid_amount: amount,
              })
              .eq('id', paymentLink.sale_id);
          }

          if (paymentLink.legacy_invoice_id) {
            await supabase
              .from('legacy_invoices')
              .update({
                payment_status: 'paid',
              })
              .eq('id', paymentLink.legacy_invoice_id);
          }

          console.log(`Payment link ${paymentLinkId} marked as paid`);
        }
      }
    }

    // Handle payment link expired event
    if (webhookData.event === 'payment_link.expired') {
      const paymentLinkId = webhookData.payload?.payment_link?.entity?.id;

      if (paymentLinkId) {
        await supabase
          .from('payment_links')
          .update({ status: 'expired' })
          .eq('gateway_link_id', paymentLinkId);

        console.log(`Payment link ${paymentLinkId} marked as expired`);
      }
    }

    return new Response(
      JSON.stringify({ success: true }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );

  } catch (error: unknown) {
    console.error('Razorpay webhook error:', error);
    const errorMessage = error instanceof Error ? error.message : 'Unknown error';
    return new Response(
      JSON.stringify({ error: 'Internal server error', message: errorMessage }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }
});
