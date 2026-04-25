import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version',
};

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response(null, { headers: corsHeaders });

  const supabase = createClient(
    Deno.env.get('SUPABASE_URL')!,
    Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
  );

  const json = (data: unknown, status = 200) =>
    new Response(JSON.stringify(data), {
      status,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });

  try {
    const body = await req.json();
    const { action, orgSlug, phone, otp } = body;

    if (!orgSlug) return json({ error: 'orgSlug is required' }, 400);

    // Find organization by slug
    const { data: org, error: orgError } = await supabase
      .from('organizations')
      .select('id, name')
      .eq('slug', orgSlug)
      .single();

    if (orgError || !org) {
      console.error('Org not found:', orgSlug, orgError);
      return json({ error: 'Organization not found. Check the portal URL.' }, 404);
    }

    // ─── SEND OTP ───────────────────────────────────────────────────────────
    if (action === 'send_otp') {
      if (!phone) return json({ error: 'Phone number is required' }, 400);

      const cleanPhone = phone.replace(/\D/g, '');
      const normalizedPhone = cleanPhone.length > 10 ? cleanPhone.slice(-10) : cleanPhone;

      if (normalizedPhone.length !== 10) {
        return json({ error: 'Enter a valid 10-digit mobile number' }, 400);
      }

      // Find customer by phone - try fuzzy match with last 10 digits
      const { data: customers, error: custError } = await supabase
        .from('customers')
        .select('id, customer_name, portal_enabled, phone')
        .eq('organization_id', org.id)
        .eq('portal_enabled', true)
        .is('deleted_at', null)
        .ilike('phone', `%${normalizedPhone}`);

      if (custError) {
        console.error('Customer lookup error:', custError);
        return json({ error: 'Database error. Please try again.' }, 500);
      }

      const customer = customers?.find(c => {
        const cPhone = (c.phone || '').replace(/\D/g, '');
        return cPhone.endsWith(normalizedPhone);
      });

      if (!customer) {
        return json({
          error: 'This mobile number is not registered for portal access. Contact your supplier.'
        }, 403);
      }

      return await processOTPSend(supabase, customer, org, normalizedPhone, json);
    }

    // ─── VERIFY OTP ─────────────────────────────────────────────────────────
    if (action === 'verify_otp') {
      if (!phone || !otp) return json({ error: 'Phone and OTP are required' }, 400);

      const cleanPhone = phone.replace(/\D/g, '');
      const normalizedPhone = cleanPhone.length > 10 ? cleanPhone.slice(-10) : cleanPhone;

      // Find customer by phone
      const { data: customers } = await supabase
        .from('customers')
        .select('id, customer_name, portal_otp, portal_otp_expires_at, portal_price_type, discount_percent, phone')
        .eq('organization_id', org.id)
        .eq('portal_enabled', true)
        .is('deleted_at', null)
        .ilike('phone', `%${normalizedPhone}`);

      const customer = customers?.find(c => {
        const cPhone = (c.phone || '').replace(/\D/g, '');
        return cPhone.endsWith(normalizedPhone);
      });

      if (!customer) {
        return json({ error: 'Customer not found. Please re-enter your number.' }, 403);
      }

      if (!customer.portal_otp) {
        return json({ error: 'No OTP found. Please request a new OTP.' }, 401);
      }

      if (String(customer.portal_otp).trim() !== String(otp).trim()) {
        return json({ error: 'Incorrect OTP. Please try again.' }, 401);
      }

      if (customer.portal_otp_expires_at && new Date(customer.portal_otp_expires_at) < new Date()) {
        return json({ error: 'OTP has expired. Please request a new one.' }, 401);
      }

      // Create 30-day session token
      const sessionToken = crypto.randomUUID() + '-' + crypto.randomUUID();
      const sessionExpires = new Date(Date.now() + 30 * 24 * 60 * 60 * 1000);

      const { error: sessionError } = await supabase.from('portal_sessions').insert({
        customer_id: customer.id,
        organization_id: org.id,
        session_token: sessionToken,
        expires_at: sessionExpires.toISOString(),
      });

      if (sessionError) {
        console.error('Session creation error:', sessionError);
        return json({ error: 'Failed to create session. Please try again.' }, 500);
      }

      // Clear OTP + update last login
      await supabase.from('customers').update({
        portal_otp: null,
        portal_otp_expires_at: null,
        portal_last_login: new Date().toISOString(),
      }).eq('id', customer.id);

      return json({
        success: true,
        sessionToken,
        customerId: customer.id,
        customerName: customer.customer_name,
        priceType: customer.portal_price_type || 'last_sale',
        discountPercent: customer.discount_percent || 0,
      });
    }

    return json({ error: 'Invalid action. Must be send_otp or verify_otp.' }, 400);

  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : 'Unknown error';
    console.error('portal-auth unhandled error:', message);
    return json({ error: `Server error: ${message}` }, 500);
  }
});

// ─── Helper: generate + store OTP, send via WhatsApp ────────────────────────
async function processOTPSend(
  supabase: any,
  customer: { id: string; customer_name: string },
  org: { id: string; name: string },
  cleanPhone: string,
  json: (data: unknown, status?: number) => Response
): Promise<Response> {
  // Generate 6-digit OTP
  const otpCode = Math.floor(100000 + Math.random() * 900000).toString();
  const expiresAt = new Date(Date.now() + 10 * 60 * 1000); // 10 minutes

  // Store OTP in customer record FIRST
  const { error: updateError } = await supabase.from('customers').update({
    portal_otp: otpCode,
    portal_otp_expires_at: expiresAt.toISOString(),
  }).eq('id', customer.id);

  if (updateError) {
    console.error('OTP storage error:', updateError);
    return json({ error: 'Failed to generate OTP. Please try again.' }, 500);
  }

  // Try to send via existing send-whatsapp edge function
  const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
  const serviceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;

  const whatsappMessage = `🔐 *${org.name} Buyer Portal OTP*\n\nYour login OTP is: *${otpCode}*\n\nValid for 10 minutes.\nDo not share this with anyone.`;

  let otpSent = false;
  let sendError = '';

  try {
    // Send via WhatsApp directly using org's settings
    const { data: waSettings } = await supabase
      .from('whatsapp_api_settings')
      .select('access_token, phone_number_id, api_version')
      .eq('organization_id', org.id)
      .single();

    if (waSettings?.access_token && waSettings?.phone_number_id) {
      const waPhone = cleanPhone.length === 10 ? `91${cleanPhone}` : cleanPhone;
      const version = waSettings.api_version || 'v21.0';

      const waResp = await fetch(`https://graph.facebook.com/${version}/${waSettings.phone_number_id}/messages`, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${waSettings.access_token}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          messaging_product: 'whatsapp',
          to: waPhone,
          type: 'text',
          text: { body: whatsappMessage },
        }),
      });

      if (waResp.ok) {
        otpSent = true;
      } else {
        const errBody = await waResp.text();
        sendError = `WhatsApp API ${waResp.status}: ${errBody}`;
        console.error('WhatsApp send error:', sendError);
      }
    } else {
      sendError = 'WhatsApp not configured for this organization';
      console.error(sendError);
    }
  } catch (err: unknown) {
    sendError = err instanceof Error ? err.message : 'WhatsApp unavailable';
    console.error('WhatsApp call error:', sendError);
  }

  return json({
    success: true,
    message: otpSent
      ? 'OTP sent on WhatsApp'
      : 'OTP generated (WhatsApp not configured - check settings)',
    customerName: customer.customer_name,
    otpSent,
    // Include OTP when WhatsApp fails so testing is possible
    ...(!otpSent ? { devOtp: otpCode, devNote: `WhatsApp error: ${sendError}` } : {}),
  });
}
