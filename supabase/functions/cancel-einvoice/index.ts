import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

interface CancelRequest {
  saleId: string;
  organizationId: string;
  reason: string; // 'duplicate' | 'data_error' | 'cancelled' | 'others'
  remarks?: string;
  testMode?: boolean;
}

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

    const { saleId, organizationId, reason, remarks, testMode = true }: CancelRequest = await req.json();

    const uuidRegex = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
    if (!saleId || !uuidRegex.test(saleId)) {
      return new Response(
        JSON.stringify({ success: false, error: 'Invalid saleId format' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }
    if (!organizationId || !uuidRegex.test(organizationId)) {
      return new Response(
        JSON.stringify({ success: false, error: 'Invalid organizationId format' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // Verify user token
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

    // Fetch sale
    const { data: sale, error: saleError } = await supabase
      .from('sales')
      .select('id, sale_number, irn, ack_no, ack_date, einvoice_status, created_at, einvoice_test_mode')
      .eq('id', saleId)
      .single();

    if (saleError || !sale) {
      throw new Error(`Sale not found: ${saleError?.message}`);
    }

    if (!sale.irn) {
      return new Response(
        JSON.stringify({ success: false, error: 'No IRN found for this invoice. Cannot cancel.' }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    if (sale.einvoice_status === 'cancelled') {
      return new Response(
        JSON.stringify({ success: false, error: 'IRN already cancelled.' }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // Check 24-hour window
    const ackDate = sale.ack_date ? new Date(sale.ack_date) : new Date(sale.created_at);
    const hoursSinceGeneration = (Date.now() - ackDate.getTime()) / (1000 * 60 * 60);
    if (hoursSinceGeneration > 24) {
      return new Response(
        JSON.stringify({ success: false, error: 'IRN can only be cancelled within 24 hours of generation.' }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // Get credentials
    const { data: settingsData } = await supabase
      .from('settings')
      .select('sale_settings, gst_number')
      .eq('organization_id', organizationId)
      .maybeSingle();

    const saleSettings = (settingsData?.sale_settings as Record<string, any>) || {};
    const einvoiceSettings = saleSettings?.einvoice_settings || {};

    const clientId = einvoiceSettings?.api_client_id || Deno.env.get('PERIONE_CLIENT_ID') || '';
    const clientSecret = einvoiceSettings?.api_client_secret || Deno.env.get('PERIONE_CLIENT_SECRET') || '';
    const username = einvoiceSettings?.api_username || Deno.env.get('PERIONE_USERNAME') || '';
    const password = einvoiceSettings?.api_password || Deno.env.get('PERIONE_PASSWORD') || '';
    const apiEmail = einvoiceSettings?.api_email || '';
    const sellerGstin = einvoiceSettings?.seller_gstin || settingsData?.gst_number || '';

    if (!clientId || !clientSecret || !username || !password || !sellerGstin) {
      return new Response(
        JSON.stringify({ success: false, error: 'E-Invoice API credentials not fully configured.' }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // Use the test mode that was active when IRN was generated
    // to ensure cancel hits the same environment (staging vs production)
    const effectiveTestMode = sale.einvoice_test_mode !== null && sale.einvoice_test_mode !== undefined
      ? sale.einvoice_test_mode
      : testMode;
    const baseUrl = effectiveTestMode ? 'https://staging.perione.in' : 'https://api.perione.in';
    const ipAddress = await getPublicIP();

    // Step 1: Authenticate
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

    if (authData.status_cd !== 'Success' || !authData.data?.AuthToken) {
      const errorMsg = authData.ErrorDetails?.ErrorMessage || 'Authentication failed';
      return new Response(
        JSON.stringify({ success: false, error: `Auth failed: ${errorMsg}` }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // Step 2: Cancel IRN
    // Reason codes: 1 = Duplicate, 2 = Data Entry Mistake, 3 = Order Cancelled, 4 = Others
    const reasonCodeMap: Record<string, string> = {
      duplicate: '1',
      data_error: '2',
      cancelled: '3',
      others: '4',
    };
    const cnlRsn = reasonCodeMap[reason] || '4';
    const cnlRem = remarks || reason;

    const cancelUrl = `${baseUrl}/einvoice/type/CANCEL/version/V1_03?email=${encodeURIComponent(apiEmail)}`;
    const cancelResponse = await fetch(cancelUrl, {
      method: 'POST',
      headers: {
        'email': apiEmail,
        'username': username,
        'ip_address': ipAddress,
        'client_id': clientId,
        'client_secret': clientSecret,
        'gstin': sellerGstin,
        'auth-token': authData.data!.AuthToken,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        Irn: sale.irn,
        CnlRsn: cnlRsn,
        CnlRem: cnlRem,
      }),
    });

    const cancelData = await cancelResponse.json();
    console.log('Cancel response:', JSON.stringify(cancelData));

    const cancelSuccess = cancelData.status_cd === 'Success' ||
      cancelData.status_cd === 1 ||
      String(cancelData.status_cd) === '1' ||
      !!cancelData.data?.Irn;

    if (!cancelSuccess) {
      const extractErr = (d: any): string => {
        if (!d) return '';
        if (typeof d === 'string') return d;
        if (Array.isArray(d)) return d.map((e: any) => e.ErrorMessage || JSON.stringify(e)).join('; ');
        return d.ErrorMessage || d.message || JSON.stringify(d);
      };
      const errorMsg = extractErr(cancelData.ErrorDetails)
        || cancelData.status_desc
        || cancelData.message
        || 'Cancellation failed';

      await supabase.from('sales').update({
        einvoice_error: `Cancel Error: ${errorMsg}`,
      }).eq('id', saleId);

      return new Response(
        JSON.stringify({ success: false, error: errorMsg }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // Update sale record
    await supabase.from('sales').update({
      einvoice_status: 'cancelled',
      einvoice_error: null,
    }).eq('id', saleId);

    return new Response(
      JSON.stringify({ success: true, message: 'IRN cancelled successfully' }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  } catch (error) {
    console.error('Cancel IRN error:', error);
    return new Response(
      JSON.stringify({ success: false, error: error instanceof Error ? error.message : 'Unknown error' }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }
});
