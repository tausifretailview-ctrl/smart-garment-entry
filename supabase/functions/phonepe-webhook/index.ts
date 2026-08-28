import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type, x-verify',
};

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, 'Content-Type': 'application/json' },
  });
}

function timingSafeEqual(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return diff === 0;
}

async function sha256Hex(input: string): Promise<string> {
  const buffer = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(input));
  return Array.from(new Uint8Array(buffer))
    .map((b) => b.toString(16).padStart(2, '0'))
    .join('');
}

function resolvePaymentStatus(code: string | undefined | null): 'paid' | 'created' | 'cancelled' | null {
  if (code === 'PAYMENT_SUCCESS') return 'paid';
  if (code === 'PAYMENT_PENDING') return 'created';
  if (code === 'PAYMENT_ERROR' || code === 'PAYMENT_DECLINED') return 'cancelled';
  return null;
}

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  // Browser redirect after checkout — redirect only, never touch the database.
  if (req.method === 'GET') {
    const url = new URL(req.url);
    const transactionId = url.searchParams.get('txnId') ?? '';
    const siteUrl = Deno.env.get('SITE_URL') || 'https://app.inventoryshop.in';
    return new Response(null, {
      status: 302,
      headers: {
        ...corsHeaders,
        'Location': `${siteUrl}/payment-status?txnId=${encodeURIComponent(transactionId)}`,
      },
    });
  }

  try {
    const supabase = createClient(
      Deno.env.get('SUPABASE_URL')!,
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,
    );

    const checksum = req.headers.get('x-verify');
    if (!checksum) {
      console.error('PhonePe webhook: missing checksum header');
      return json({ error: 'Missing checksum' }, 401);
    }

    const body = await req.json();
    if (!body?.response || typeof body.response !== 'string') {
      console.error('PhonePe webhook: missing response body');
      return json({ error: 'Invalid payload' }, 400);
    }

    const [hash, receivedSaltIndex] = checksum.split('###');
    if (!hash || !receivedSaltIndex) {
      console.error('PhonePe webhook: malformed checksum');
      return json({ error: 'Invalid checksum' }, 401);
    }

    let responseData: Record<string, any>;
    try {
      responseData = JSON.parse(atob(body.response));
    } catch (decodeErr) {
      console.error('PhonePe webhook: failed to decode response:', decodeErr);
      return json({ error: 'Invalid payload' }, 400);
    }

    const transactionId: string | null = responseData?.data?.merchantTransactionId ?? null;
    if (!transactionId) {
      console.log('PhonePe webhook: no merchantTransactionId, ignoring');
      return json({ success: true, ignored: true });
    }

    // Resolve the tenant first; the checksum is then verified against that
    // organization's own salt key. Nothing is acted on before verification.
    const { data: paymentLink, error: linkError } = await supabase
      .from('payment_links')
      .select('id, organization_id, sale_id, legacy_invoice_id, amount, status')
      .eq('gateway_link_id', transactionId)
      .maybeSingle();

    if (linkError) {
      console.error('PhonePe webhook: payment link lookup failed:', linkError);
      return json({ error: 'Lookup failed' }, 500);
    }
    if (!paymentLink) {
      console.log(`PhonePe webhook: unknown transaction ${transactionId}, ignoring`);
      return json({ success: true, ignored: true });
    }

    const { data: secrets, error: secretsError } = await supabase
      .from('payment_gateway_secrets')
      .select('phonepe_salt_key, phonepe_salt_index')
      .eq('organization_id', paymentLink.organization_id)
      .maybeSingle();

    if (secretsError) {
      console.error('PhonePe webhook: secret lookup failed:', secretsError);
      return json({ error: 'Lookup failed' }, 500);
    }

    const saltKey = secrets?.phonepe_salt_key;
    if (!saltKey) {
      console.error(
        `PhonePe webhook: no salt key configured for organization ${paymentLink.organization_id}`,
      );
      return json({ error: 'Webhook not configured for this organization' }, 400);
    }

    const expected = await sha256Hex(body.response + '/pg/v1/pay' + saltKey);
    if (!timingSafeEqual(expected, hash)) {
      console.error('PhonePe webhook: checksum mismatch');
      return json({ error: 'Invalid checksum' }, 401);
    }

    // ---- Verified beyond this point ----

    const paymentStatus = resolvePaymentStatus(
      typeof responseData?.code === 'string' ? responseData.code : null,
    );

    if (paymentStatus === null) {
      console.log(`PhonePe webhook ${transactionId}: unhandled code, no status change`);
      return json({ success: true, ignored: true });
    }

    if (paymentStatus !== 'paid') {
      await supabase
        .from('payment_links')
        .update({ status: paymentStatus, updated_at: new Date().toISOString() })
        .eq('id', paymentLink.id)
        .eq('organization_id', paymentLink.organization_id);
      return json({ success: true, status: paymentStatus });
    }

    if (paymentLink.status === 'paid') {
      console.log(`PhonePe webhook: ${transactionId} already settled, skipping`);
      return json({ success: true, duplicate: true });
    }

    const capturedPaise = typeof responseData?.data?.amount === 'number'
      ? responseData.data.amount
      : null;
    const amount = capturedPaise !== null ? capturedPaise / 100 : Number(paymentLink.amount);

    if (!isFinite(amount) || amount <= 0) {
      console.error('PhonePe webhook: could not determine a valid amount');
      return json({ error: 'Invalid amount' }, 400);
    }

    const gatewayPaymentId: string = responseData?.data?.transactionId ?? transactionId;

    // Receipt voucher, not a direct paid_amount write: the existing triggers
    // recompute the sale total and the customer ledger from it.
    const { error: rpcError } = await supabase.rpc('record_online_payment_receipt', {
      p_org_id: paymentLink.organization_id,
      p_payment_link_id: paymentLink.id,
      p_gateway_payment_id: gatewayPaymentId,
      p_amount: amount,
      p_payment_method: 'online',
    });

    if (rpcError) {
      console.error('PhonePe webhook: failed to record receipt:', rpcError);
      return json({ error: 'Failed to record payment', details: rpcError.message }, 500);
    }

    if (paymentLink.legacy_invoice_id) {
      const { error: legacyError } = await supabase
        .from('legacy_invoices')
        .update({ payment_status: 'paid' })
        .eq('id', paymentLink.legacy_invoice_id)
        .eq('organization_id', paymentLink.organization_id);
      if (legacyError) {
        console.error('PhonePe webhook: legacy invoice update failed:', legacyError);
      }
    }

    console.log(`PhonePe webhook: recorded ${amount} for transaction ${transactionId}`);
    return json({ success: true });
  } catch (error: unknown) {
    console.error('PhonePe webhook error:', error);
    const message = error instanceof Error ? error.message : 'Unknown error';
    return json({ error: 'Internal server error', details: message }, 500);
  }
});
