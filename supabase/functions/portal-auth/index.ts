import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response(null, { headers: corsHeaders });

  const supabase = createClient(
    Deno.env.get('SUPABASE_URL')!,
    Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
  );

  try {
    const { action, orgSlug, phone, otp } = await req.json();

    // Find organization by slug
    const { data: org } = await supabase
      .from('organizations')
      .select('id, name')
      .eq('slug', orgSlug)
      .single();

    if (!org) {
      return new Response(JSON.stringify({ error: 'Organization not found' }),
        { status: 404, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
    }

    if (action === 'send_otp') {
      // Normalize phone - take last 10 digits
      const cleanPhone = (phone || '').replace(/\D/g, '');
      const normalizedPhone = cleanPhone.length > 10 ? cleanPhone.slice(-10) : cleanPhone;

      if (normalizedPhone.length !== 10) {
        return new Response(JSON.stringify({ error: 'Enter a valid 10-digit mobile number' }),
          { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
      }

      // Find customer by phone (try exact, then fuzzy with last 10 digits)
      const { data: customers } = await supabase
        .from('customers')
        .select('id, customer_name, portal_enabled, phone')
        .eq('organization_id', org.id)
        .eq('portal_enabled', true)
        .is('deleted_at', null)
        .ilike('phone', `%${normalizedPhone}`);

      const customer = customers?.find(c => {
        const cPhone = (c.phone || '').replace(/\D/g, '');
        return cPhone.endsWith(normalizedPhone);
      });

      if (!customer) {
        return new Response(
          JSON.stringify({ error: 'This mobile number is not registered for portal access. Contact your supplier.' }),
          { status: 403, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        );
      }

      // Generate 6-digit OTP
      const otpCode = Math.floor(100000 + Math.random() * 900000).toString();
      const expiresAt = new Date(Date.now() + 10 * 60 * 1000); // 10 minutes

      // Store OTP in customer record
      await supabase.from('customers').update({
        portal_otp: otpCode,
        portal_otp_expires_at: expiresAt.toISOString(),
      }).eq('id', customer.id);

      // Send OTP via WhatsApp
      const { data: waSettings } = await supabase
        .from('whatsapp_api_settings')
        .select('access_token, phone_number_id, api_version')
        .eq('organization_id', org.id)
        .single();

      if (waSettings?.access_token && waSettings?.phone_number_id) {
        const waPhone = normalizedPhone.length === 10 ? `91${normalizedPhone}` : normalizedPhone;
        const version = waSettings.api_version || 'v21.0';

        await fetch(`https://graph.facebook.com/${version}/${waSettings.phone_number_id}/messages`, {
          method: 'POST',
          headers: {
            'Authorization': `Bearer ${waSettings.access_token}`,
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({
            messaging_product: 'whatsapp',
            to: waPhone,
            type: 'text',
            text: {
              body: `Your ${org.name} Buyer Portal OTP is: *${otpCode}*\n\nValid for 10 minutes. Do not share this with anyone.`
            }
          }),
        });
      }

      return new Response(
        JSON.stringify({ success: true, message: 'OTP sent on WhatsApp', customerName: customer.customer_name }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    if (action === 'verify_otp') {
      const cleanPhone = (phone || '').replace(/\D/g, '');
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
        return new Response(JSON.stringify({ error: 'Customer not found' }),
          { status: 403, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
      }

      if (customer.portal_otp !== otp) {
        return new Response(JSON.stringify({ error: 'Invalid OTP. Please try again.' }),
          { status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
      }

      if (!customer.portal_otp_expires_at || new Date(customer.portal_otp_expires_at) < new Date()) {
        return new Response(JSON.stringify({ error: 'OTP has expired. Please request a new one.' }),
          { status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
      }

      // Create session token
      const sessionToken = crypto.randomUUID() + '-' + crypto.randomUUID();
      const sessionExpires = new Date(Date.now() + 30 * 24 * 60 * 60 * 1000); // 30 days

      await supabase.from('portal_sessions').insert({
        customer_id: customer.id,
        organization_id: org.id,
        session_token: sessionToken,
        expires_at: sessionExpires.toISOString(),
      });

      // Clear OTP and update last login
      await supabase.from('customers').update({
        portal_otp: null,
        portal_otp_expires_at: null,
        portal_last_login: new Date().toISOString(),
      }).eq('id', customer.id);

      return new Response(
        JSON.stringify({
          success: true,
          sessionToken,
          customerId: customer.id,
          customerName: customer.customer_name,
          priceType: customer.portal_price_type || 'last_sale',
          discountPercent: customer.discount_percent || 0,
        }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    return new Response(JSON.stringify({ error: 'Invalid action' }),
      { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });

  } catch (err) {
    console.error('portal-auth error:', err);
    return new Response(JSON.stringify({ error: 'Internal server error' }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
  }
});
