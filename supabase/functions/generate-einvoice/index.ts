import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

interface InvoiceRequest {
  saleId: string;
  organizationId: string;
  testMode?: boolean;
}

interface WhiteBooksAuthResponse {
  Status: number;
  Data: {
    AuthToken: string;
    TokenExpiry: string;
  };
  ErrorDetails: any;
}

interface EInvoicePayload {
  Version: string;
  TranDtls: {
    TaxSch: string;
    SupTyp: string;
    RegRev: string;
    EcmGstin: string | null;
    IgstOnIntra: string;
  };
  DocDtls: {
    Typ: string;
    No: string;
    Dt: string;
  };
  SellerDtls: {
    Gstin: string;
    LglNm: string;
    TrdNm: string;
    Addr1: string;
    Addr2: string;
    Loc: string;
    Pin: number;
    Stcd: string;
    Ph: string;
    Em: string;
  };
  BuyerDtls: {
    Gstin: string;
    LglNm: string;
    TrdNm: string;
    Pos: string;
    Addr1: string;
    Addr2: string;
    Loc: string;
    Pin: number;
    Stcd: string;
    Ph: string;
    Em: string;
  };
  ItemList: Array<{
    SlNo: string;
    PrdDesc: string;
    IsServc: string;
    HsnCd: string;
    Barcde: string;
    Qty: number;
    FreeQty: number;
    Unit: string;
    UnitPrice: number;
    TotAmt: number;
    Discount: number;
    PreTaxVal: number;
    AssAmt: number;
    GstRt: number;
    IgstAmt: number;
    CgstAmt: number;
    SgstAmt: number;
    CesRt: number;
    CesAmt: number;
    CesNonAdvlAmt: number;
    StateCesRt: number;
    StateCesAmt: number;
    StateCesNonAdvlAmt: number;
    OthChrg: number;
    TotItemVal: number;
  }>;
  ValDtls: {
    AssVal: number;
    CgstVal: number;
    SgstVal: number;
    IgstVal: number;
    CesVal: number;
    StCesVal: number;
    Discount: number;
    OthChrg: number;
    RndOffAmt: number;
    TotInvVal: number;
    TotInvValFc: number;
  };
  PayDtls: {
    Nm: string;
    AccDet: string;
    Mode: string;
    FinInsBr: string;
    PayTerm: string;
    PayInstr: string;
    CrTrn: string;
    DirDr: string;
    CrDay: number;
    PaidAmt: number;
    PaymtDue: number;
  };
  RefDtls: {
    InvRm: string;
  };
  EwbDtls: {
    TransId: string;
    TransName: string;
    Distance: number;
    TransDocNo: string;
    TransDocDt: string;
    VehNo: string;
    VehType: string;
    TransMode: string;
  };
}

// Helper function to format date to DD/MM/YYYY
function formatDateForEInvoice(dateString: string): string {
  const date = new Date(dateString);
  const day = String(date.getDate()).padStart(2, '0');
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const year = date.getFullYear();
  return `${day}/${month}/${year}`;
}

// Helper function to extract state code from GSTIN (first 2 digits)
function getStateCodeFromGstin(gstin: string): string {
  if (!gstin || gstin.length < 2) return '29'; // Default to Karnataka
  return gstin.substring(0, 2);
}

// Helper function to get IP address
async function getPublicIP(): Promise<string> {
  try {
    const response = await fetch('https://api.ipify.org?format=json');
    const data = await response.json();
    return data.ip;
  } catch (error) {
    console.log('Could not get public IP, using default');
    return '127.0.0.1';
  }
}

Deno.serve(async (req) => {
  // Handle CORS preflight requests
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const { saleId, organizationId, testMode = true }: InvoiceRequest = await req.json();

    console.log(`Generating e-Invoice for sale: ${saleId}, org: ${organizationId}, testMode: ${testMode}`);

    // Initialize Supabase client
    const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
    const supabaseKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
    const supabase = createClient(supabaseUrl, supabaseKey);

    // Fetch sale data with items
    const { data: sale, error: saleError } = await supabase
      .from('sales')
      .select(`*, sale_items (*), customers:customer_id (gst_number, customer_name, address, phone, email)`)
      .eq('id', saleId)
      .single();

    if (saleError || !sale) {
      throw new Error(`Failed to fetch sale: ${saleError?.message || 'Sale not found'}`);
    }

    console.log('Sale data fetched:', sale.sale_number);

    // Check if e-invoice already generated
    if (sale.irn) {
      return new Response(
        JSON.stringify({ 
          success: false, 
          error: 'E-Invoice already generated for this sale',
          irn: sale.irn 
        }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // Fetch organization name
    const { data: orgData, error: orgError } = await supabase
      .from('organizations')
      .select('name')
      .eq('id', organizationId)
      .single();

    if (orgError) {
      console.error('Organization fetch error:', orgError.message);
    }

    // Fetch settings from the settings table (where GST number and API credentials are stored)
    const { data: settingsData, error: settingsError } = await supabase
      .from('settings')
      .select('*')
      .eq('organization_id', organizationId)
      .maybeSingle();

    if (settingsError) {
      console.error('Settings fetch error:', settingsError.message);
    }

    const saleSettings = (settingsData?.sale_settings as Record<string, any>) || {};
    const einvoiceSettings = saleSettings?.einvoice_settings || {};
    
    console.log('Settings loaded - GST:', settingsData?.gst_number, 'Business:', settingsData?.business_name);

    // Get WhiteBooks API credentials with priority:
    // 1. Per-organization settings (from UI)
    // 2. Global Supabase secrets (fallback)
    const clientId = einvoiceSettings?.api_client_id || Deno.env.get('WHITEBOOKS_CLIENT_ID') || '';
    const clientSecret = einvoiceSettings?.api_client_secret || Deno.env.get('WHITEBOOKS_CLIENT_SECRET') || '';
    const username = einvoiceSettings?.api_username || Deno.env.get('WHITEBOOKS_USERNAME') || '';
    const password = einvoiceSettings?.api_password || Deno.env.get('WHITEBOOKS_PASSWORD') || '';
    const apiEmail = einvoiceSettings?.api_email || (username ? `${username}@whitebooks.in` : '');

    console.log('API credentials source:', einvoiceSettings?.api_username ? 'UI Settings' : 'Environment Secrets');

    // Validate required credentials
    if (!clientId) {
      return new Response(
        JSON.stringify({ 
          success: false, 
          error: 'WhiteBooks Client ID not configured. Please add it in Settings → Sale → E-Invoice Settings',
          code: 'MISSING_CLIENT_ID'
        }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }
    if (!clientSecret) {
      return new Response(
        JSON.stringify({ 
          success: false, 
          error: 'WhiteBooks Client Secret not configured. Please add it in Settings → Sale → E-Invoice Settings',
          code: 'MISSING_CLIENT_SECRET'
        }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }
    if (!username) {
      return new Response(
        JSON.stringify({ 
          success: false, 
          error: 'WhiteBooks Username not configured. Please add it in Settings → Sale → E-Invoice Settings',
          code: 'MISSING_USERNAME'
        }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }
    if (!password) {
      return new Response(
        JSON.stringify({ 
          success: false, 
          error: 'WhiteBooks Password not configured. Please add it in Settings → Sale → E-Invoice Settings',
          code: 'MISSING_PASSWORD'
        }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // Get seller GSTIN with priority:
    // 1. e-Invoice settings override (for sandbox testing)
    // 2. Business details GST number from settings table
    // 3. Environment variable fallback
    const sellerGstin = einvoiceSettings?.seller_gstin || settingsData?.gst_number || Deno.env.get('SELLER_GSTIN') || '';
    
    if (!sellerGstin) {
      return new Response(
        JSON.stringify({ 
          success: false, 
          error: 'Seller GSTIN not configured. Please add GST Number in Settings → Business Details',
          code: 'MISSING_SELLER_GSTIN'
        }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }
    
    console.log('Using Seller GSTIN:', sellerGstin);

    // Get buyer GSTIN
    const buyerGstin = sale.customers?.gst_number || '';
    if (!buyerGstin) {
      throw new Error('Buyer GSTIN is required for B2B e-Invoice generation');
    }

    // Get public IP
    const ipAddress = await getPublicIP();
    console.log('Using IP address:', ipAddress);

    // Determine API base URL based on test mode
    const baseUrl = testMode 
      ? 'https://apisandbox.whitebooks.in' 
      : 'https://api.whitebooks.in';

    // Step 1: Authenticate with WhiteBooks API
    console.log('Authenticating with WhiteBooks API...');
    console.log('Using email:', apiEmail, 'username:', username);
    const authUrl = `${baseUrl}/einvoice/authenticate?email=${encodeURIComponent(apiEmail)}`;
    
    const authResponse = await fetch(authUrl, {
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

    const authData: WhiteBooksAuthResponse = await authResponse.json();
    console.log('Auth response status:', authData.Status);
    console.log('Auth response details:', JSON.stringify(authData));

    if (authData.Status !== 1 || !authData.Data?.AuthToken) {
      const errorMsg = authData.ErrorDetails?.ErrorMessage || 
                       authData.ErrorDetails?.message ||
                       (typeof authData.ErrorDetails === 'string' ? authData.ErrorDetails : null) ||
                       'Authentication failed - check credentials';
      console.error('Authentication failed:', errorMsg);
      
      // Update sale with error
      await supabase
        .from('sales')
        .update({ 
          einvoice_status: 'failed',
          einvoice_error: `Auth Error: ${errorMsg}`
        })
        .eq('id', saleId);

      // Return 200 with error details for better UI handling
      return new Response(
        JSON.stringify({ 
          success: false, 
          error: `WhiteBooks authentication failed: ${errorMsg}`,
          code: 'AUTH_FAILED'
        }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    const authToken = authData.Data.AuthToken;
    console.log('Authentication successful, token received');

    // Step 2: Build e-Invoice payload in NIC format
    const sellerStateCode = getStateCodeFromGstin(sellerGstin);
    const buyerStateCode = getStateCodeFromGstin(buyerGstin);
    const isInterState = sellerStateCode !== buyerStateCode;

    // Build item list
    const itemList = sale.sale_items.map((item: any, index: number) => {
      const gstRate = item.gst_percent || 0;
      const taxableValue = item.line_total / (1 + gstRate / 100);
      const gstAmount = item.line_total - taxableValue;
      
      return {
        SlNo: String(index + 1),
        PrdDesc: item.product_name || '',
        IsServc: 'N',
        HsnCd: item.hsn_code || '62099000', // Default HSN for garments
        Barcde: item.barcode || '',
        Qty: item.quantity,
        FreeQty: 0,
        Unit: 'PCS',
        UnitPrice: item.unit_price,
        TotAmt: item.quantity * item.unit_price,
        Discount: item.discount_percent || 0,
        PreTaxVal: taxableValue,
        AssAmt: Number(taxableValue.toFixed(2)),
        GstRt: gstRate,
        IgstAmt: isInterState ? Number(gstAmount.toFixed(2)) : 0,
        CgstAmt: !isInterState ? Number((gstAmount / 2).toFixed(2)) : 0,
        SgstAmt: !isInterState ? Number((gstAmount / 2).toFixed(2)) : 0,
        CesRt: 0,
        CesAmt: 0,
        CesNonAdvlAmt: 0,
        StateCesRt: 0,
        StateCesAmt: 0,
        StateCesNonAdvlAmt: 0,
        OthChrg: 0,
        TotItemVal: Number(item.line_total.toFixed(2)),
      };
    });

    // Calculate totals
    const totalTaxableValue = itemList.reduce((sum: number, item: any) => sum + item.AssAmt, 0);
    const totalCgst = itemList.reduce((sum: number, item: any) => sum + item.CgstAmt, 0);
    const totalSgst = itemList.reduce((sum: number, item: any) => sum + item.SgstAmt, 0);
    const totalIgst = itemList.reduce((sum: number, item: any) => sum + item.IgstAmt, 0);

    const einvoicePayload: EInvoicePayload = {
      Version: '1.1',
      TranDtls: {
        TaxSch: 'GST',
        SupTyp: 'B2B',
        RegRev: 'N',
        EcmGstin: null,
        IgstOnIntra: 'N',
      },
      DocDtls: {
        Typ: 'INV',
        No: sale.sale_number,
        Dt: formatDateForEInvoice(sale.sale_date),
      },
      SellerDtls: {
        Gstin: sellerGstin,
        LglNm: settingsData?.business_name || orgData?.name || 'Business Name',
        TrdNm: settingsData?.business_name || orgData?.name || 'Business Name',
        Addr1: (settingsData?.address as string)?.substring(0, 100) || 'Address Line 1',
        Addr2: '',
        Loc: (settingsData?.address as string)?.split(',').pop()?.trim() || 'City',
        Pin: parseInt((settingsData?.address as string)?.match(/\d{6}/)?.[0] || '560001'),
        Stcd: sellerStateCode,
        Ph: settingsData?.mobile_number || '',
        Em: settingsData?.email_id || '',
      },
      BuyerDtls: {
        Gstin: buyerGstin,
        LglNm: sale.customer_name || sale.customers?.customer_name || 'Customer',
        TrdNm: sale.customer_name || sale.customers?.customer_name || 'Customer',
        Pos: buyerStateCode,
        Addr1: sale.customer_address?.substring(0, 100) || sale.customers?.address?.substring(0, 100) || 'Address',
        Addr2: '',
        Loc: sale.customer_address?.split(',').pop()?.trim() || 'City',
        Pin: parseInt(sale.customer_address?.match(/\d{6}/)?.[0] || '560001'),
        Stcd: buyerStateCode,
        Ph: sale.customer_phone || sale.customers?.phone || '',
        Em: sale.customers?.email || '',
      },
      ItemList: itemList,
      ValDtls: {
        AssVal: Number(totalTaxableValue.toFixed(2)),
        CgstVal: Number(totalCgst.toFixed(2)),
        SgstVal: Number(totalSgst.toFixed(2)),
        IgstVal: Number(totalIgst.toFixed(2)),
        CesVal: 0,
        StCesVal: 0,
        Discount: Number((sale.flat_discount_amount || 0).toFixed(2)),
        OthChrg: 0,
        RndOffAmt: Number((sale.round_off || 0).toFixed(2)),
        TotInvVal: Number(sale.net_amount.toFixed(2)),
        TotInvValFc: 0,
      },
      PayDtls: {
        Nm: '',
        AccDet: '',
        Mode: '',
        FinInsBr: '',
        PayTerm: '',
        PayInstr: '',
        CrTrn: '',
        DirDr: '',
        CrDay: 0,
        PaidAmt: Number((sale.paid_amount || 0).toFixed(2)),
        PaymtDue: Number(((sale.net_amount || 0) - (sale.paid_amount || 0)).toFixed(2)),
      },
      RefDtls: {
        InvRm: sale.notes || '',
      },
      EwbDtls: {
        TransId: '',
        TransName: '',
        Distance: 0,
        TransDocNo: '',
        TransDocDt: '',
        VehNo: '',
        VehType: '',
        TransMode: '',
      },
    };

    console.log('E-Invoice payload built, generating...');

    // Step 3: Generate e-Invoice
    const generateUrl = `${baseUrl}/einvoice/type/GENERATE/version/V1_03?email=${encodeURIComponent(apiEmail)}`;
    
    const generateResponse = await fetch(generateUrl, {
      method: 'POST',
      headers: {
        'email': apiEmail,
        'username': username,
        'ip_address': ipAddress,
        'client_id': clientId,
        'client_secret': clientSecret,
        'gstin': sellerGstin,
        'auth-token': authToken,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(einvoicePayload),
    });

    const generateData = await generateResponse.json();
    console.log('Generate response status:', generateData.Status);

    if (generateData.Status !== 1) {
      const errorMsg = generateData.ErrorDetails?.ErrorMessage || 
                       generateData.ErrorDetails?.[0]?.ErrorMessage ||
                       JSON.stringify(generateData.ErrorDetails) ||
                       'E-Invoice generation failed';
      console.error('E-Invoice generation failed:', errorMsg);
      
      // Update sale with error
      await supabase
        .from('sales')
        .update({ 
          einvoice_status: 'failed',
          einvoice_error: errorMsg
        })
        .eq('id', saleId);

      return new Response(
        JSON.stringify({ success: false, error: errorMsg }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // Step 4: Save e-Invoice data to sales table
    const einvoiceData = generateData.Data;
    const { error: updateError } = await supabase
      .from('sales')
      .update({
        irn: einvoiceData.Irn,
        ack_no: einvoiceData.AckNo?.toString(),
        ack_date: einvoiceData.AckDt ? new Date(einvoiceData.AckDt.split('/').reverse().join('-')).toISOString() : null,
        signed_invoice: einvoiceData.SignedInvoice,
        einvoice_qr_code: einvoiceData.SignedQRCode,
        einvoice_status: 'generated',
        einvoice_error: null,
      })
      .eq('id', saleId);

    if (updateError) {
      console.error('Failed to update sale with e-invoice data:', updateError);
      throw new Error(`Failed to save e-invoice data: ${updateError.message}`);
    }

    console.log('E-Invoice generated successfully:', einvoiceData.Irn);

    return new Response(
      JSON.stringify({
        success: true,
        irn: einvoiceData.Irn,
        ackNo: einvoiceData.AckNo,
        ackDate: einvoiceData.AckDt,
        qrCode: einvoiceData.SignedQRCode,
        message: 'E-Invoice generated successfully',
      }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );

  } catch (error) {
    console.error('E-Invoice generation error:', error);
    return new Response(
      JSON.stringify({ 
        success: false, 
        error: error instanceof Error ? error.message : 'Unknown error occurred' 
      }),
      { 
        status: 500,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' } 
      }
    );
  }
});
