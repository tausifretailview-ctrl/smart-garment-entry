import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

interface PaymentLinkRequest {
  gateway: 'razorpay' | 'phonepe';
  amount: number;
  customerName: string;
  customerPhone?: string;
  invoiceNumber?: string;
  organizationId: string;
}

serve(async (req) => {
  // Handle CORS
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const body: PaymentLinkRequest = await req.json();
    const { gateway, amount, customerName, customerPhone, invoiceNumber, organizationId } = body;

    if (!gateway || !amount || !customerName || !organizationId) {
      return new Response(
        JSON.stringify({ error: 'Missing required fields' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    if (gateway === 'razorpay') {
      // Create Razorpay payment link
      const razorpayKeyId = Deno.env.get('RAZORPAY_KEY_ID');
      const razorpayKeySecret = Deno.env.get('RAZORPAY_KEY_SECRET');

      if (!razorpayKeyId || !razorpayKeySecret) {
        return new Response(
          JSON.stringify({ error: 'Razorpay credentials not configured' }),
          { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        );
      }

      const auth = btoa(`${razorpayKeyId}:${razorpayKeySecret}`);
      
      const paymentLinkPayload = {
        amount: Math.round(amount * 100), // Amount in paise
        currency: 'INR',
        accept_partial: false,
        description: invoiceNumber ? `Payment for ${invoiceNumber}` : `Payment from ${customerName}`,
        customer: {
          name: customerName,
          contact: customerPhone || undefined,
        },
        notify: {
          sms: !!customerPhone,
          email: false,
        },
        reminder_enable: true,
        callback_url: `${Deno.env.get('SUPABASE_URL')}/functions/v1/razorpay-webhook`,
        callback_method: 'get',
      };

      const response = await fetch('https://api.razorpay.com/v1/payment_links', {
        method: 'POST',
        headers: {
          'Authorization': `Basic ${auth}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(paymentLinkPayload),
      });

      if (!response.ok) {
        const errorData = await response.json();
        console.error('Razorpay API error:', errorData);
        return new Response(
          JSON.stringify({ error: 'Failed to create Razorpay payment link', details: errorData }),
          { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        );
      }

      const data = await response.json();
      
      return new Response(
        JSON.stringify({
          paymentUrl: data.short_url,
          gatewayLinkId: data.id,
        }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );

    } else if (gateway === 'phonepe') {
      // Create PhonePe payment link
      const merchantId = Deno.env.get('PHONEPE_MERCHANT_ID');
      const saltKey = Deno.env.get('PHONEPE_SALT_KEY');
      const saltIndex = Deno.env.get('PHONEPE_SALT_INDEX') || '1';

      if (!merchantId || !saltKey) {
        return new Response(
          JSON.stringify({ error: 'PhonePe credentials not configured' }),
          { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        );
      }

      // Generate unique transaction ID
      const transactionId = `TXN_${Date.now()}_${Math.random().toString(36).substring(7)}`;
      
      const payload = {
        merchantId,
        merchantTransactionId: transactionId,
        amount: Math.round(amount * 100), // Amount in paise
        redirectUrl: `${Deno.env.get('SUPABASE_URL')}/functions/v1/phonepe-webhook?txnId=${transactionId}`,
        redirectMode: 'POST',
        callbackUrl: `${Deno.env.get('SUPABASE_URL')}/functions/v1/phonepe-webhook`,
        paymentInstrument: {
          type: 'PAY_PAGE',
        },
      };

      const payloadBase64 = btoa(JSON.stringify(payload));
      
      // Create checksum
      const encoder = new TextEncoder();
      const data = encoder.encode(payloadBase64 + '/pg/v1/pay' + saltKey);
      const hashBuffer = await crypto.subtle.digest('SHA-256', data);
      const hashArray = Array.from(new Uint8Array(hashBuffer));
      const hashHex = hashArray.map(b => b.toString(16).padStart(2, '0')).join('');
      const checksum = hashHex + '###' + saltIndex;

      // PhonePe API call (using sandbox for now, switch to production URL when ready)
      const phonepeUrl = 'https://api-preprod.phonepe.com/apis/pg-sandbox/pg/v1/pay';
      
      const response = await fetch(phonepeUrl, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'X-VERIFY': checksum,
        },
        body: JSON.stringify({ request: payloadBase64 }),
      });

      const responseData = await response.json();

      if (!responseData.success) {
        console.error('PhonePe API error:', responseData);
        return new Response(
          JSON.stringify({ error: 'Failed to create PhonePe payment link', details: responseData }),
          { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        );
      }

      return new Response(
        JSON.stringify({
          paymentUrl: responseData.data?.instrumentResponse?.redirectInfo?.url,
          gatewayLinkId: transactionId,
        }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    return new Response(
      JSON.stringify({ error: 'Invalid gateway specified' }),
      { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );

  } catch (error: unknown) {
    console.error('Error creating payment link:', error);
    const errorMessage = error instanceof Error ? error.message : 'Unknown error';
    return new Response(
      JSON.stringify({ error: 'Internal server error', message: errorMessage }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }
});
