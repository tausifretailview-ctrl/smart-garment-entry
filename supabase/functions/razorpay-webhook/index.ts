import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type, x-razorpay-signature',
};

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, 'Content-Type': 'application/json' },
  });
}

/** Constant-time compare so a wrong signature leaks no timing information. */
function timingSafeEqual(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return diff === 0;
}

async function hmacSha256Hex(secret: string, message: string): Promise<string> {
  const encoder = new TextEncoder();
  const key = await crypto.subtle.importKey(
    'raw',
    encoder.encode(secret),
    { name: 'HMAC', hash: 'SHA-256' },
    false,
    ['sign'],
  );
  const signature = await crypto.subtle.sign('HMAC', key, encoder.encode(message));
  return Array.from(new Uint8Array(signature))
    .map((b) => b.toString(16).padStart(2, '0'))
    .join('');
}

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const supabase = createClient(
      Deno.env.get('SUPABASE_URL')!,
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,
    );

    const signature = req.headers.get('x-razorpay-signature');
    if (!signature) {
      console.error('Razorpay webhook: missing signature header');
      return json({ error: 'Missing signature' }, 401);
    }

    // Signature is computed over the RAW body, so read text before parsing.
    const rawBody = await req.text();

    let payload: Record<string, any>;
    try {
      payload = JSON.parse(rawBody);
    } catch {
      return json({ error: 'Invalid JSON body' }, 400);
    }

    const event: string | undefined = payload?.event;
    const entity = payload?.payload?.payment_link?.entity
      ?? payload?.payload?.payment?.entity?.payment_link
      ?? null;
    const paymentEntity = payload?.payload?.payment?.entity ?? null;

    const gatewayLinkId: string | null = entity?.id
      ?? paymentEntity?.notes?.payment_link_id
      ?? null;

    if (!gatewayLinkId) {
      console.log(`Razorpay webhook "${event}": no payment link id in payload, ignoring`);
      return json({ success: true, ignored: true });
    }

    // Locate the tenant from the link. Nothing is trusted until the signature
    // is verified with THAT organization's own webhook secret below.
    const { data: paymentLink, error: linkError } = await supabase
      .from('payment_links')
      .select('id, organization_id, sale_id, legacy_invoice_id, amount, status')
      .eq('gateway_link_id', gatewayLinkId)
      .maybeSingle();

    if (linkError) {
      console.error('Razorpay webhook: payment link lookup failed:', linkError);
      return json({ error: 'Lookup failed' }, 500);
    }
    if (!paymentLink) {
      console.log(`Razorpay webhook: unknown payment link ${gatewayLinkId}, ignoring`);
      return json({ success: true, ignored: true });
    }

    const { data: secrets, error: secretsError } = await supabase
      .from('payment_gateway_secrets')
      .select('razorpay_webhook_secret')
      .eq('organization_id', paymentLink.organization_id)
      .maybeSingle();

    if (secretsError) {
      console.error('Razorpay webhook: secret lookup failed:', secretsError);
      return json({ error: 'Lookup failed' }, 500);
    }

    const webhookSecret = secrets?.razorpay_webhook_secret;
    if (!webhookSecret) {
      console.error(
        `Razorpay webhook: no webhook secret configured for organization ${paymentLink.organization_id}`,
      );
      return json({ error: 'Webhook not configured for this organization' }, 400);
    }

    const expected = await hmacSha256Hex(webhookSecret, rawBody);
    if (!timingSafeEqual(expected, signature)) {
      console.error('Razorpay webhook: signature mismatch');
      return json({ error: 'Invalid signature' }, 401);
    }

    // ---- Verified beyond this point ----

    const isPaid = event === 'payment_link.paid'
      || (event === 'payment.captured' && !!paymentEntity);

    if (!isPaid) {
      if (event === 'payment_link.cancelled' || event === 'payment_link.expired') {
        await supabase
          .from('payment_links')
          .update({ status: 'cancelled', updated_at: new Date().toISOString() })
          .eq('id', paymentLink.id)
          .eq('organization_id', paymentLink.organization_id);
      }
      return json({ success: true, event });
    }

    if (paymentLink.status === 'paid') {
      console.log(`Razorpay webhook: link ${gatewayLinkId} already settled, skipping`);
      return json({ success: true, duplicate: true });
    }

    const gatewayPaymentId: string = paymentEntity?.id
      ?? entity?.id
      ?? gatewayLinkId;

    // Prefer the amount actually captured by the gateway over the requested amount.
    const capturedPaise = typeof paymentEntity?.amount === 'number'
      ? paymentEntity.amount
      : (typeof entity?.amount_paid === 'number' ? entity.amount_paid : null);
    const amount = capturedPaise !== null
      ? capturedPaise / 100
      : Number(paymentLink.amount);

    if (!isFinite(amount) || amount <= 0) {
      console.error('Razorpay webhook: could not determine a valid amount');
      return json({ error: 'Invalid amount' }, 400);
    }

    // Record as a receipt voucher. The database triggers recompute the sale's
    // paid amount, payment status and the customer ledger — we never write
    // sales.paid_amount directly, which is what used to cause ledger drift.
    const { error: rpcError } = await supabase.rpc('record_online_payment_receipt', {
      p_org_id: paymentLink.organization_id,
      p_payment_link_id: paymentLink.id,
      p_gateway_payment_id: gatewayPaymentId,
      p_amount: amount,
      p_payment_method: 'online',
    });

    if (rpcError) {
      console.error('Razorpay webhook: failed to record receipt:', rpcError);
      // Non-2xx makes Razorpay retry, which is what we want here.
      return json({ error: 'Failed to record payment', details: rpcError.message }, 500);
    }

    if (paymentLink.legacy_invoice_id) {
      const { error: legacyError } = await supabase
        .from('legacy_invoices')
        .update({ payment_status: 'paid' })
        .eq('id', paymentLink.legacy_invoice_id)
        .eq('organization_id', paymentLink.organization_id);
      if (legacyError) {
        console.error('Razorpay webhook: legacy invoice update failed:', legacyError);
      }
    }

    console.log(`Razorpay webhook: recorded ${amount} for link ${gatewayLinkId}`);
    return json({ success: true });
  } catch (error: unknown) {
    console.error('Razorpay webhook error:', error);
    const message = error instanceof Error ? error.message : 'Unknown error';
    return json({ error: 'Internal server error', details: message }, 500);
  }
});
