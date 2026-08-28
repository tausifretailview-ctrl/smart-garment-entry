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
  returnUrl?: string;
}

// Return URLs are attacker-controllable, so only these hosts are accepted.
const ALLOWED_RETURN_HOSTS = new Set([
  'app.inventoryshop.in',
  'inventoryshop.in',
  'smart-garment-entry.lovable.app',
  'localhost',
]);

function safeReturnUrl(raw: string | undefined): string | null {
  if (!raw) return null;
  try {
    const url = new URL(raw);
    if (url.protocol !== 'https:' && url.hostname !== 'localhost') return null;
    if (!ALLOWED_RETURN_HOSTS.has(url.hostname) && !url.hostname.endsWith('.lovable.app')) {
      return null;
    }
    return url.toString();
  } catch {
    return null;
  }
}

function jsonResponse(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, 'Content-Type': 'application/json' },
  });
}

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const authHeader = req.headers.get('Authorization');
    if (!authHeader) {
      return jsonResponse({ error: 'No authorization header' }, 401);
    }

    const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
    const supabaseServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;

    // Establish the caller BEFORE touching the service-role client.
    const supabaseAuth = createClient(supabaseUrl, Deno.env.get('SUPABASE_ANON_KEY') ?? '', {
      global: { headers: { Authorization: authHeader } },
    });
    const { data: { user }, error: authError } = await supabaseAuth.auth.getUser();
    if (authError || !user) {
      return jsonResponse({ error: 'Unauthorized' }, 401);
    }

    const body: PaymentLinkRequest = await req.json();
    const { gateway, amount, customerName, customerPhone, invoiceNumber, organizationId } = body;

    if (!gateway || !amount || !customerName || !organizationId) {
      return jsonResponse({ error: 'Missing required fields' }, 400);
    }
    if (typeof amount !== 'number' || !isFinite(amount) || amount <= 0) {
      return jsonResponse({ error: 'Invalid amount' }, 400);
    }

    const admin = createClient(supabaseUrl, supabaseServiceKey);

    // The body's organizationId is untrusted: check it against the caller's membership.
    const { data: membership, error: membershipError } = await admin
      .from('organization_members')
      .select('role')
      .eq('user_id', user.id)
      .eq('organization_id', organizationId)
      .maybeSingle();

    if (membershipError) {
      console.error('Membership lookup failed:', membershipError);
      return jsonResponse({ error: 'Could not verify organization access' }, 500);
    }
    if (!membership) {
      return jsonResponse({ error: 'Not authorized for this organization' }, 403);
    }

    const { data: settings, error: settingsError } = await admin
      .from('payment_gateway_settings')
      .select('*')
      .eq('organization_id', organizationId)
      .maybeSingle();

    if (settingsError) {
      console.error('Gateway settings lookup failed:', settingsError);
      return jsonResponse({ error: 'Could not load gateway settings' }, 500);
    }
    if (!settings) {
      return jsonResponse({ error: 'Payment gateway is not configured for this organization' }, 400);
    }

    const { data: secrets, error: secretsError } = await admin
      .from('payment_gateway_secrets')
      .select('*')
      .eq('organization_id', organizationId)
      .maybeSingle();

    if (secretsError) {
      console.error('Gateway secrets lookup failed:', secretsError);
      return jsonResponse({ error: 'Could not load gateway credentials' }, 500);
    }

    const returnUrl = safeReturnUrl(body.returnUrl);

    if (gateway === 'razorpay') {
      if (!settings.razorpay_enabled) {
        return jsonResponse({ error: 'Razorpay is not enabled for this organization' }, 400);
      }

      // Per-organization credentials: money settles to the shop's own account.
      const razorpayKeyId = settings.razorpay_key_id;
      const razorpayKeySecret = secrets?.razorpay_key_secret;

      if (!razorpayKeyId || !razorpayKeySecret) {
        return jsonResponse({
          error: 'Razorpay credentials are missing. Add your Key ID and Key Secret in Settings → Payments.',
        }, 400);
      }

      const auth = btoa(`${razorpayKeyId}:${razorpayKeySecret}`);

      const paymentLinkPayload: Record<string, unknown> = {
        amount: Math.round(amount * 100), // paise
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
      };

      // callback_url is a BROWSER redirect, not the webhook. Sending the customer
      // to the webhook endpoint would land them on a JSON error page.
      if (returnUrl) {
        paymentLinkPayload.callback_url = returnUrl;
        paymentLinkPayload.callback_method = 'get';
      }

      const response = await fetch('https://api.razorpay.com/v1/payment_links', {
        method: 'POST',
        headers: {
          'Authorization': `Basic ${auth}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(paymentLinkPayload),
      });

      if (!response.ok) {
        const errorText = await response.text();
        console.error(`Razorpay API error [${response.status}]:`, errorText);
        return jsonResponse({
          error: 'Failed to create Razorpay payment link',
          status: response.status,
          details: errorText,
        }, response.status);
      }

      const data = await response.json();

      return jsonResponse({
        paymentUrl: data.short_url,
        gatewayLinkId: data.id,
      });
    }

    if (gateway === 'phonepe') {
      if (!settings.phonepe_enabled) {
        return jsonResponse({ error: 'PhonePe is not enabled for this organization' }, 400);
      }

      const merchantId = settings.phonepe_merchant_id;
      const saltKey = secrets?.phonepe_salt_key;
      const saltIndex = secrets?.phonepe_salt_index || '1';

      if (!merchantId || !saltKey) {
        return jsonResponse({
          error: 'PhonePe credentials are missing. Add your Merchant ID and Salt Key in Settings → Payments.',
        }, 400);
      }

      const transactionId = `TXN_${Date.now()}_${Math.random().toString(36).substring(7)}`;

      const payload = {
        merchantId,
        merchantTransactionId: transactionId,
        amount: Math.round(amount * 100), // paise
        redirectUrl: returnUrl ?? `${supabaseUrl}/functions/v1/phonepe-webhook?txnId=${transactionId}`,
        redirectMode: returnUrl ? 'REDIRECT' : 'POST',
        callbackUrl: `${supabaseUrl}/functions/v1/phonepe-webhook`,
        paymentInstrument: { type: 'PAY_PAGE' },
      };

      const payloadBase64 = btoa(JSON.stringify(payload));

      const encoder = new TextEncoder();
      const digestInput = encoder.encode(payloadBase64 + '/pg/v1/pay' + saltKey);
      const hashBuffer = await crypto.subtle.digest('SHA-256', digestInput);
      const hashArray = Array.from(new Uint8Array(hashBuffer));
      const hashHex = hashArray.map((b) => b.toString(16).padStart(2, '0')).join('');
      const checksum = hashHex + '###' + saltIndex;

      // Environment is per-organization; sandbox can never move real money.
      const phonepeUrl = settings.phonepe_environment === 'production'
        ? 'https://api.phonepe.com/apis/hermes/pg/v1/pay'
        : 'https://api-preprod.phonepe.com/apis/pg-sandbox/pg/v1/pay';

      const response = await fetch(phonepeUrl, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'X-VERIFY': checksum,
        },
        body: JSON.stringify({ request: payloadBase64 }),
      });

      if (!response.ok) {
        const errorText = await response.text();
        console.error(`PhonePe API error [${response.status}]:`, errorText);
        return jsonResponse({
          error: 'Failed to create PhonePe payment link',
          status: response.status,
          details: errorText,
        }, response.status);
      }

      const responseData = await response.json();

      if (!responseData.success) {
        console.error('PhonePe rejected the request:', responseData);
        return jsonResponse({
          error: 'Failed to create PhonePe payment link',
          details: responseData,
        }, 502);
      }

      return jsonResponse({
        paymentUrl: responseData.data?.instrumentResponse?.redirectInfo?.url,
        gatewayLinkId: transactionId,
      });
    }

    return jsonResponse({ error: 'Invalid gateway specified' }, 400);
  } catch (error: unknown) {
    console.error('Error creating payment link:', error);
    const message = error instanceof Error ? error.message : 'Unknown error';
    return jsonResponse({ error: 'Internal server error', details: message }, 500);
  }
});
