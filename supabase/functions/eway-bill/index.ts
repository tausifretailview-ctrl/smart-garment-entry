// E-way bills (EWB). Industrial mode, Phase 2 step 4: the e-way bill of a sale bill
// from its e-invoice (IRN), through PeriOne's e-invoice API on the shop's existing
// e-invoice login: GENERATE_EWAYBILL, and GETEWAYBILLIRN to read back one the IRP
// already holds. Saved in public.eway_bills. Shops without Industrial mode are refused
// before anything is read. generate-einvoice, cancel-einvoice and einvoice-note are
// not touched.
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';
import { indiaTodayIso, irpSupplyTypeOf, isExportSupplyType, parseIrpDateTime, perioneErrorText } from '../_shared/einvoiceNote.ts';
import {
  buildEwbByIrnPayload,
  cleanVehicleNo,
  ewbAlreadyGenerated,
  ewbDistance,
  ewbReplyInfo,
  isEwbTransportMode,
  type EwbPortAddress,
  type EwbReplyInfo,
  type EwbTransportInput,
} from '../_shared/ewayBill.ts';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

interface EwbRequest {
  /** generate: new EWB from the bill's IRN. sync: read the EWB the IRP holds for that IRN. */
  action: 'generate' | 'sync';
  saleId: string;
  organizationId: string;
  transport?: EwbTransportInput;
  exportPort?: EwbPortAddress;
}

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

function json(body: Record<string, unknown>, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, 'Content-Type': 'application/json' },
  });
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

type Creds = {
  clientId: string;
  clientSecret: string;
  username: string;
  password: string;
  email: string;
  gstin: string;
};

async function perioneAuth(baseUrl: string, creds: Creds, ip: string): Promise<{ token: string } | { error: string }> {
  const resp = await fetch(`${baseUrl}/einvoice/authenticate?email=${encodeURIComponent(creds.email)}`, {
    method: 'GET',
    headers: {
      username: creds.username,
      password: creds.password,
      ip_address: ip,
      client_id: creds.clientId,
      client_secret: creds.clientSecret,
      gstin: creds.gstin,
      'Content-Type': 'application/json',
    },
  });
  // deno-lint-ignore no-explicit-any
  let data: any = null;
  try {
    data = await resp.json();
  } catch {
    return { error: `PeriOne login failed (HTTP ${resp.status})` };
  }
  if (data?.status_cd !== 'Success' || !data?.data?.AuthToken) {
    return { error: `PeriOne login failed: ${perioneErrorText(data, 'check the e-invoice login in Settings')}` };
  }
  return { token: String(data.data.AuthToken) };
}

function perioneHeaders(creds: Creds, ip: string, token: string) {
  return {
    email: creds.email,
    username: creds.username,
    ip_address: ip,
    client_id: creds.clientId,
    client_secret: creds.clientSecret,
    gstin: creds.gstin,
    'auth-token': token,
    'Content-Type': 'application/json',
  };
}

/** JSON body of a PeriOne reply, or null when it isn't JSON. */
async function readReply(resp: Response): Promise<unknown | null> {
  const text = await resp.text();
  try {
    return JSON.parse(text);
  } catch {
    return null;
  }
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response(null, { headers: corsHeaders });

  try {
    const authHeader = req.headers.get('Authorization');
    if (!authHeader) return json({ success: false, error: 'No authorization header' }, 401);

    const body = (await req.json()) as EwbRequest;
    const { action, saleId, organizationId } = body;
    if (action !== 'generate' && action !== 'sync') return json({ success: false, error: 'Unknown action' }, 400);
    if (!saleId || !UUID.test(saleId)) return json({ success: false, error: 'Invalid saleId' }, 400);
    if (!organizationId || !UUID.test(organizationId)) return json({ success: false, error: 'Invalid organizationId' }, 400);

    const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
    const supabaseAuth = createClient(supabaseUrl, Deno.env.get('SUPABASE_ANON_KEY') ?? '', {
      global: { headers: { Authorization: authHeader } },
    });
    const { data: { user }, error: authError } = await supabaseAuth.auth.getUser();
    if (authError || !user) return json({ success: false, error: 'Unauthorized' }, 401);

    const supabase = createClient(supabaseUrl, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!);

    const { data: membership } = await supabase
      .from('organization_members')
      .select('id')
      .eq('organization_id', organizationId)
      .eq('user_id', user.id)
      .maybeSingle();
    if (!membership) return json({ success: false, error: 'Forbidden' }, 403);

    // Industrial mode only: the Platform Admin feature and the shop's own switch.
    const [{ data: org }, { data: settingsData }] = await Promise.all([
      supabase.from('organizations').select('enabled_features').eq('id', organizationId).maybeSingle(),
      supabase.from('settings').select('gst_number, sale_settings').eq('organization_id', organizationId).maybeSingle(),
    ]);
    const features = Array.isArray(org?.enabled_features) ? org.enabled_features : [];
    // deno-lint-ignore no-explicit-any
    const saleSettings = ((settingsData?.sale_settings as Record<string, any>) || {});
    if (!features.includes('industrial_mode') || saleSettings?.industrial_mode?.enabled !== true) {
      return json({ success: false, code: 'NOT_INDUSTRIAL', error: 'E-way bills need Industrial mode (Settings > Sale).' }, 403);
    }

    const { data: sale, error: saleError } = await supabase
      .from('sales')
      .select('id, sale_number, sale_date, sale_type, b2b_details, is_cancelled, deleted_at, irn, einvoice_status, einvoice_test_mode')
      .eq('id', saleId)
      .eq('organization_id', organizationId)
      .maybeSingle();
    if (saleError) throw new Error(`Could not read the bill: ${saleError.message}`);
    if (!sale || sale.deleted_at || sale.sale_type === 'debit_note') {
      return json({ success: false, error: 'This bill was not found. It may have been deleted.' });
    }
    if (sale.is_cancelled) return json({ success: false, error: 'This bill is cancelled, so it needs no e-way bill.' });
    if (!sale.irn || sale.einvoice_status !== 'generated') {
      return json({
        success: false,
        code: 'NO_IRN',
        error: sale.einvoice_status === 'cancelled'
          ? 'Its e-invoice (IRN) is cancelled, so it can\'t get an e-way bill.'
          : 'Generate the e-invoice (IRN) of this bill first.',
      });
    }

    const { data: existing, error: existingError } = await supabase
      .from('eway_bills')
      .select('id, ewb_no, ewb_date, valid_till, status')
      .eq('organization_id', organizationId)
      .eq('sale_id', saleId)
      .eq('status', 'active')
      .limit(1)
      .maybeSingle();
    if (existingError) {
      if (/eway_bills|does not exist|schema cache/i.test(existingError.message || '')) {
        return json({
          success: false,
          code: 'MISSING_SQL',
          error: 'Run the Phase 2 step 4 SQL first: it adds the e-way bill table.',
        });
      }
      throw new Error(`Could not read e-way bills: ${existingError.message}`);
    }
    if (existing && action === 'generate') {
      return json({ success: false, code: 'ALREADY', error: `This bill already has e-way bill ${existing.ewb_no}.`, ewbNo: existing.ewb_no });
    }

    // deno-lint-ignore no-explicit-any
    const einvoiceSettings = (saleSettings.einvoice_settings || {}) as Record<string, any>;
    const creds: Creds = {
      clientId: einvoiceSettings.api_client_id || Deno.env.get('PERIONE_CLIENT_ID') || '',
      clientSecret: einvoiceSettings.api_client_secret || Deno.env.get('PERIONE_CLIENT_SECRET') || '',
      username: einvoiceSettings.api_username || Deno.env.get('PERIONE_USERNAME') || '',
      password: einvoiceSettings.api_password || Deno.env.get('PERIONE_PASSWORD') || '',
      email: einvoiceSettings.api_email || '',
      gstin: String(einvoiceSettings.seller_gstin || settingsData?.gst_number || Deno.env.get('SELLER_GSTIN') || '')
        .trim()
        .toUpperCase(),
    };
    if (!creds.clientId || !creds.clientSecret || !creds.username || !creds.password) {
      return json({
        success: false,
        code: 'MISSING_CREDENTIALS',
        error: 'E-invoice login not set up. Add the PeriOne details in Settings > Sale > E-Invoice Settings.',
      });
    }

    // Same environment (sandbox or live) as the bill's IRN.
    const testMode = sale.einvoice_test_mode ?? einvoiceSettings.test_mode ?? true;
    const baseUrl = testMode ? 'https://staging.perione.in' : 'https://api.perione.in';
    const transport: EwbTransportInput = body.transport ?? { mode: 'road' };
    const saleDate = String(sale.sale_date ?? '').slice(0, 10);

    const save = async (info: EwbReplyInfo, withTransport: boolean) => {
      const row: Record<string, unknown> = {
        organization_id: organizationId,
        sale_id: saleId,
        doc_type: 'INV',
        doc_no: sale.sale_number,
        doc_date: saleDate || null,
        irn: sale.irn,
        ewb_no: info.ewbNo,
        ewb_date: parseIrpDateTime(info.ewbDate) ?? new Date().toISOString(),
        valid_till: parseIrpDateTime(info.validTill),
        status: info.status === 'CNL' ? 'cancelled' : 'active',
        generated_via: 'irn',
        test_mode: testMode,
        created_by: user.id,
        updated_at: new Date().toISOString(),
      };
      if (withTransport) {
        const km = ewbDistance(transport.distanceKm);
        Object.assign(row, {
          trans_mode: isEwbTransportMode(transport.mode) ? transport.mode : 'road',
          distance_km: km && km > 0 ? km : null,
          transporter_id: String(transport.transporterId ?? '').trim().toUpperCase() || null,
          transporter_name: String(transport.transporterName ?? '').trim() || null,
          vehicle_no: cleanVehicleNo(transport.vehicleNo) || null,
          vehicle_type: cleanVehicleNo(transport.vehicleNo) ? (transport.vehicleType === 'O' ? 'O' : 'R') : null,
          trans_doc_no: String(transport.transDocNo ?? '').replace(/\s+/g, '') || null,
          trans_doc_date: /^\d{4}-\d{2}-\d{2}$/.test(String(transport.transDocDate ?? '')) ? transport.transDocDate : null,
        });
      }
      return await supabase.from('eway_bills').upsert(row, { onConflict: 'organization_id,ewb_no,test_mode' });
    };

    const ip = await getPublicIP();
    const auth = await perioneAuth(baseUrl, creds, ip);
    if ('error' in auth) return json({ success: false, code: 'AUTH_FAILED', error: auth.error });

    const fetchByIrn = async (): Promise<EwbReplyInfo | null> => {
      const url = `${baseUrl}/einvoice/type/GETEWAYBILLIRN/version/V1_03?param1=${encodeURIComponent(sale.irn)}` +
        `&supplier_gstn=${encodeURIComponent(creds.gstin)}&email=${encodeURIComponent(creds.email)}`;
      const resp = await fetch(url, { method: 'GET', headers: perioneHeaders(creds, ip, auth.token) });
      return ewbReplyInfo(await readReply(resp));
    };

    if (action === 'sync') {
      const info = await fetchByIrn();
      if (!info) return json({ success: false, code: 'NOT_FOUND', error: 'The IRP has no e-way bill for this bill\'s IRN.' });
      const { error: saveError } = await save(info, false);
      if (saveError) return json({ success: false, ewbNo: info.ewbNo, error: `E-way bill ${info.ewbNo} was found but could not be saved: ${saveError.message}` });
      return json({ success: true, found: true, ewbNo: info.ewbNo, ewbDate: info.ewbDate, validTill: info.validTill, status: info.status });
    }

    const built = buildEwbByIrnPayload({
      irn: sale.irn,
      docDate: saleDate,
      today: indiaTodayIso(),
      transport,
      exportPort: body.exportPort ?? null,
      isExport: isExportSupplyType(irpSupplyTypeOf(sale.b2b_details)),
    });
    if (!built.ok) return json({ success: false, code: 'INVALID', field: built.field, error: built.error });

    const resp = await fetch(`${baseUrl}/einvoice/type/GENERATE_EWAYBILL/version/V1_03?email=${encodeURIComponent(creds.email)}`, {
      method: 'POST',
      headers: perioneHeaders(creds, ip, auth.token),
      body: JSON.stringify(built.payload),
    });
    const data = await readReply(resp);
    if (data === null) return json({ success: false, error: `The IRP sent an unreadable reply (HTTP ${resp.status}).` });

    let info = ewbReplyInfo(data);
    let found = false;
    if (!info) {
      const error = perioneErrorText(data, 'E-way bill generation failed');
      // Already made earlier (a timed-out first try, or on the portal): read it back and keep it.
      if (ewbAlreadyGenerated(data, error)) {
        info = await fetchByIrn();
        found = !!info;
      }
      if (!info) return json({ success: false, error });
    }

    const { error: saveError } = await save(info, !found);
    if (saveError) {
      // The EWB exists at the IRP: return the number so the shop can note it down.
      return json({ success: false, ewbNo: info.ewbNo, error: `E-way bill ${info.ewbNo} was made but could not be saved: ${saveError.message}` });
    }
    return json({
      success: true,
      found,
      partAOnly: built.partAOnly,
      ewbNo: info.ewbNo,
      ewbDate: info.ewbDate,
      validTill: info.validTill,
    });
  } catch (error) {
    console.error('eway-bill error:', error);
    return json({ success: false, error: error instanceof Error ? error.message : 'Unknown error' }, 500);
  }
});
