import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type, x-verify',
};

serve(async (req) => {
  // Handle CORS
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
    const supabaseServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
    const saltKey = Deno.env.get('PHONEPE_SALT_KEY');
    const saltIndex = Deno.env.get('PHONEPE_SALT_INDEX') || '1';

    const supabase = createClient(supabaseUrl, supabaseServiceKey);

    // Handle both GET (redirect) and POST (callback) methods
    let transactionId: string | null = null;
    let responseData: any = null;

    if (req.method === 'GET') {
      // Handle redirect callback
      const url = new URL(req.url);
      transactionId = url.searchParams.get('txnId');
    } else {
      // Handle POST callback
      const body = await req.json();
      
      // Verify checksum if salt key is configured
      if (saltKey && body.response) {
        const checksum = req.headers.get('x-verify');
        if (checksum) {
          const [hash, index] = checksum.split('###');
          
          const encoder = new TextEncoder();
          const data = encoder.encode(body.response + '/pg/v1/pay' + saltKey);
          const hashBuffer = await crypto.subtle.digest('SHA-256', data);
          const hashArray = Array.from(new Uint8Array(hashBuffer));
          const calculatedHash = hashArray.map(b => b.toString(16).padStart(2, '0')).join('');

          if (calculatedHash !== hash) {
            console.error('Invalid PhonePe callback checksum');
            return new Response(
              JSON.stringify({ error: 'Invalid checksum' }),
              { status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
            );
          }
        }

        // Decode response
        responseData = JSON.parse(atob(body.response));
        transactionId = responseData?.data?.merchantTransactionId;
      }
    }

    console.log('PhonePe webhook received for transaction:', transactionId);

    if (transactionId) {
      // Fetch payment link by gateway_link_id
      const { data: paymentLink, error: fetchError } = await supabase
        .from('payment_links')
        .select('id, sale_id, legacy_invoice_id, amount')
        .eq('gateway_link_id', transactionId)
        .single();

      if (fetchError) {
        console.error('Error fetching payment link:', fetchError);
      } else if (paymentLink) {
        // Check payment status with PhonePe (optional, for verification)
        const paymentStatus = responseData?.code === 'PAYMENT_SUCCESS' ? 'paid' : 
                             responseData?.code === 'PAYMENT_PENDING' ? 'created' : 'cancelled';

        // Update payment link status
        const { error: updateError } = await supabase
          .from('payment_links')
          .update({
            status: paymentStatus,
            paid_at: paymentStatus === 'paid' ? new Date().toISOString() : null,
            gateway_payment_id: responseData?.data?.transactionId || null,
          })
          .eq('id', paymentLink.id);

        if (updateError) {
          console.error('Error updating payment link:', updateError);
        }

        // Update invoice payment status if payment is successful
        if (paymentStatus === 'paid') {
          if (paymentLink.sale_id) {
            await supabase
              .from('sales')
              .update({
                payment_status: 'paid',
                paid_amount: paymentLink.amount,
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

          console.log(`Payment for transaction ${transactionId} marked as paid`);
        }
      }
    }

    // For GET requests (redirect), redirect to a success/failure page
    if (req.method === 'GET') {
      const redirectUrl = `${Deno.env.get('SITE_URL') || 'https://example.com'}/payment-status?txnId=${transactionId}`;
      return new Response(null, {
        status: 302,
        headers: {
          ...corsHeaders,
          'Location': redirectUrl,
        },
      });
    }

    return new Response(
      JSON.stringify({ success: true }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );

  } catch (error: unknown) {
    console.error('PhonePe webhook error:', error);
    const errorMessage = error instanceof Error ? error.message : 'Unknown error';
    return new Response(
      JSON.stringify({ error: 'Internal server error', message: errorMessage }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }
});
