import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

async function getPublicIP(): Promise<string> {
  try {
    const response = await fetch('https://api.ipify.org?format=json');
    const data = await response.json();
    return data.ip;
  } catch {
    return '127.0.0.1';
  }
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const authHeader = req.headers.get('Authorization');
    if (!authHeader) {
      return new Response(
        JSON.stringify({ success: false, error: 'No authorization header' }),
        { status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    const { organizationId }: { organizationId: string } = await req.json();

    // Verify user
    const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
    const supabaseAuth = createClient(supabaseUrl, Deno.env.get('SUPABASE_ANON_KEY') ?? '', {
      global: { headers: { Authorization: authHeader } }
    });
    const { data: { user }, error: authError } = await supabaseAuth.auth.getUser();
    if (authError || !user) {
      return new Response(
        JSON.stringify({ success: false, error: 'Unauthorized' }),
        { status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    const supabase = createClient(supabaseUrl, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!);

    const { data: settingsData } = await supabase
      .from('settings')
      .select('sale_settings, gst_number')
      .eq('organization_id', organizationId)
      .maybeSingle();

    const saleSettings = (settingsData?.sale_settings as Record<string, any>) || {};
    const einvoiceSettings = saleSettings?.einvoice_settings || {};

    const clientId = einvoiceSettings?.api_client_id || '';
    const clientSecret = einvoiceSettings?.api_client_secret || '';
    const username = einvoiceSettings?.api_username || '';
    const password = einvoiceSettings?.api_password || '';
    const apiEmail = einvoiceSettings?.api_email || '';
    const sellerGstin = einvoiceSettings?.seller_gstin || settingsData?.gst_number || '';
    const testMode = einvoiceSettings?.test_mode ?? true;

    if (!clientId || !clientSecret || !username || !password) {
      return new Response(
        JSON.stringify({ success: false, error: 'API credentials are incomplete. Please fill all fields.' }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    if (!sellerGstin) {
      return new Response(
        JSON.stringify({ success: false, error: 'Seller GSTIN not configured. Set it in Business Details or Sandbox override.' }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    const baseUrl = testMode ? 'https://staging.perione.in' : 'https://api.perione.in';
    const ipAddress = await getPublicIP();

    const authUrl = `${baseUrl}/einvoice/authenticate?email=${encodeURIComponent(apiEmail)}`;
    const authResp = await fetch(authUrl, {
      method: 'GET',
      headers: {
        'username': username,
        'password': password,
        'ip_address': ipAddress,
        'client_id': clientId,
        'client_secret': clientSecret,
        'gstin': sellerGstin,
        'Content-Type': 'application/json',
      },
    });

    const authData = await authResp.json();

    if (authData.Status === 1 && authData.Data?.AuthToken) {
      return new Response(
        JSON.stringify({
          success: true,
          message: `Connected successfully${testMode ? ' (Sandbox)' : ' (Production)'}`,
          tokenExpiry: authData.Data.TokenExpiry,
        }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    } else {
      const errorMsg = authData.ErrorDetails?.ErrorMessage ||
        authData.ErrorDetails?.message ||
        (typeof authData.ErrorDetails === 'string' ? authData.ErrorDetails : null) ||
        'Authentication failed - check credentials';
      return new Response(
        JSON.stringify({ success: false, error: errorMsg }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }
  } catch (error) {
    console.error('Test connection error:', error);
    return new Response(
      JSON.stringify({ success: false, error: error instanceof Error ? error.message : 'Unknown error' }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }
});
