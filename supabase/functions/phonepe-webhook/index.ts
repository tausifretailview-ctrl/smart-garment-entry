import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type, x-verify',
};

function resolvePaymentStatus(code: string | undefined | null): 'paid' | 'created' | 'cancelled' | null {
  if (code === 'PAYMENT_SUCCESS') return 'paid';
  if (code === 'PAYMENT_PENDING') return 'created';
  if (code === 'PAYMENT_ERROR' || code === 'PAYMENT_DECLINED') return 'cancelled';
  return null;
}

serve(async (req) => {
  // Handle CORS
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  // GET redirect callback — redirect only, never touch the database
  if (req.method === 'GET') {
    try {
      const url = new URL(req.url);
      const transactionId = url.searchParams.get('txnId');
      const redirectUrl = `${Deno.env.get('SITE_URL') || 'https://example.com'}/payment-status?txnId=${transactionId}`;
      return new Response(null, {
        status: 302,
        headers: {
          ...corsHeaders,
          'Location': redirectUrl,
        },
      });
    } catch (error: unknown) {
      console.error('PhonePe redirect error:', error);
      return new Response(
        JSON.stringify({ error: 'Internal server error' }),
        { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }
  }

  try {
    const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
    const supabaseServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
    const saltKey = Deno.env.get('PHONEPE_SALT_KEY');

    // Reject if salt key is not configured
    if (!saltKey) {
      console.error('PHONEPE_SALT_KEY not configured - rejecting request');
      return new Response(
        JSON.stringify({ error: 'Webhook not configured' }),
        { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    const supabase = createClient(supabaseUrl, supabaseServiceKey);

    const body = await req.json();
    const checksum = req.headers.get('x-verify');

    if (!checksum) {
      console.error('Missing PhonePe webhook checksum - rejecting request');
      return new Response(
        JSON.stringify({ error: 'Missing checksum' }),
        { status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    if (!body.response) {
      console.error('Missing PhonePe response body');
      return new Response(
        JSON.stringify({ error: 'Invalid checksum' }),
        { status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    const checksumParts = checksum.split('###');
    if (checksumParts.length !== 2 || !checksumParts[0] || !checksumParts[1]) {
      console.error('Invalid PhonePe checksum format');
      return new Response(
        JSON.stringify({ error: 'Invalid checksum' }),
        { status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    const [hash] = checksumParts;

    try {
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
    } catch (verifyErr) {
      console.error('PhonePe checksum verification failed:', verifyErr);
      return new Response(
        JSON.stringify({ error: 'Invalid checksum' }),
        { status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    let responseData: Record<string, unknown>;
    try {
      responseData = JSON.parse(atob(body.response));
    } catch (decodeErr) {
      console.error('Failed to decode PhonePe response:', decodeErr);
      return new Response(
        JSON.stringify({ error: 'Invalid checksum' }),
        { status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    const transactionId = (responseData?.data as { merchantTransactionId?: string } | undefined)
      ?.merchantTransactionId ?? null;

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
        const responseCode = typeof responseData?.code === 'string' ? responseData.code : null;
        const paymentStatus = resolvePaymentStatus(responseCode);

        if (paymentStatus === null) {
          console.log(
            `PhonePe callback for ${transactionId}: unknown or absent code "${responseCode ?? ''}" — no status change`,
          );
        } else {
          // Update payment link status
          const { error: updateError } = await supabase
            .from('payment_links')
            .update({
              status: paymentStatus,
              paid_at: paymentStatus === 'paid' ? new Date().toISOString() : null,
              gateway_payment_id: (responseData?.data as { transactionId?: string } | undefined)?.transactionId || null,
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
    }

    return new Response(
      JSON.stringify({ success: true }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );

  } catch (error: unknown) {
    console.error('PhonePe webhook error:', error);
    return new Response(
      JSON.stringify({ error: 'Internal server error' }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }
});
