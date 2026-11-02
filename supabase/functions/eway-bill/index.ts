// E-way bills (EWB). Industrial mode, Phase 2 step 4: the e-way bill of a sale bill
// from its e-invoice (IRN), through PeriOne's e-invoice API on the shop's existing
// e-invoice login: GENERATE_EWAYBILL, and GETEWAYBILLIRN to read back one the IRP
// already holds. Saved in public.eway_bills. Shops whose E-Way Bill switch (Settings >
// Sale > E-Invoice) is off are refused before anything is read; Industrial mode shops
// have it on by default. generate-einvoice, cancel-einvoice and einvoice-note are
// not touched.
// Step 5b: vehicle update (Part B), cancel and extend, through PeriOne's e-way bill API
// (/ewaybillapi/v1.03), which has its own client id / secret and EWB username / password.
// Step 6a: direct e-way bill (genewaybill) for a sale bill without an e-invoice, on the
// same e-way bill API keys. Step 6b: the same for a delivery challan (document CHL, with
// why the goods move: job work, own use, others…), linked by eway_bills.challan_id.
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';
import {
  indiaTodayIso,
  irpSupplyTypeOf,
  isExportSupplyType,
  parseIrpDateTime,
  perioneErrorText,
  saleBillToIrnInput,
} from '../_shared/einvoiceNote.ts';
import { einvoiceUnit } from '../_shared/uqc.ts';
import {
  buildDirectEwbPayload,
  challanEwbLines,
  buildEwbByIrnPayload,
  buildEwbCancelPayload,
  buildEwbExtendPayload,
  buildEwbVehiclePayload,
  cleanVehicleNo,
  ewbAlreadyGenerated,
  ewbApiData,
  ewbApiErrorText,
  ewbApiValidUpto,
  ewbDistance,
  ewbGenReplyInfo,
  ewbReplyInfo,
  ewayBillEnabled,
  isEwbTransportMode,
  type EwbExtendInput,
  type EwbPortAddress,
  type EwbReplyInfo,
  type EwbShipTo,
  type EwbTransportInput,
  type EwbVehicleUpdateInput,
} from '../_shared/ewayBill.ts';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

type IrnAction = 'generate' | 'sync';
type EwbApiAction = 'test' | 'vehicle' | 'cancel' | 'extend' | 'direct' | 'challan';

interface EwbRequest {
  /**
   * generate: new EWB from the bill's IRN. sync: read the EWB the IRP holds for that IRN.
   * test: check the e-way bill API login. vehicle / cancel / extend: change one e-way bill.
   * direct: new EWB for a sale bill without an e-invoice (saleId).
   * challan: new EWB for a delivery challan (challanId), with why the goods move (subSupply).
   */
  action: IrnAction | EwbApiAction;
  saleId?: string;
  challanId?: string;
  /** challan: NIC outward sub supply type (4 job work, 5 own use, 8 others…) and, for 8, a reason. */
  subSupply?: { code?: string | null; desc?: string | null };
  ewayBillId?: string;
  organizationId: string;
  transport?: EwbTransportInput;
  exportPort?: EwbPortAddress;
  vehicle?: EwbVehicleUpdateInput;
  cancel?: { reasonCode: number | string; remark?: string | null };
  extend?: EwbExtendInput;
  /** direct: where the goods go, when the bill's address has no PIN or the buyer has no GSTIN. */
  shipTo?: EwbShipTo;
}

const IRN_ACTIONS: string[] = ['generate', 'sync'];
const EWB_API_ACTIONS: string[] = ['test', 'vehicle', 'cancel', 'extend', 'direct', 'challan'];
/** E-way bill API actions on a sale bill (the rest act on an e-way bill). */
const SALE_EWB_ACTIONS: string[] = ['direct'];

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

/* PeriOne e-way bill API (step 5b) ----------------------------------- */

type EwbApiCreds = {
  clientId: string;
  clientSecret: string;
  username: string;
  password: string;
  email: string;
  gstin: string;
};

function ewbApiHeaders(creds: EwbApiCreds, ip: string): Record<string, string> {
  return {
    ip_address: ip,
    client_id: creds.clientId,
    client_secret: creds.clientSecret,
    gstin: creds.gstin,
    'Content-Type': 'application/json',
    Accept: 'application/json',
  };
}

/** Log in to the e-way bill API; PeriOne keeps the session for the calls that follow. */
async function ewbApiAuth(baseUrl: string, creds: EwbApiCreds, ip: string): Promise<{ ok: true } | { ok: false; error: string }> {
  const url = `${baseUrl}/ewaybillapi/v1.03/authenticate?email=${encodeURIComponent(creds.email)}` +
    `&username=${encodeURIComponent(creds.username)}&password=${encodeURIComponent(creds.password)}`;
  const resp = await fetch(url, { method: 'GET', headers: ewbApiHeaders(creds, ip) });
  const data = await readReply(resp);
  if (data === null) return { ok: false, error: `E-way bill login failed (HTTP ${resp.status}).` };
  if (!ewbApiData(data)) {
    return { ok: false, error: `E-way bill login failed: ${ewbApiErrorText(data, 'check the e-way bill keys in Settings')}` };
  }
  return { ok: true };
}

async function ewbApiPost(
  baseUrl: string,
  op: 'vehewb' | 'canewb' | 'extendvalidity' | 'genewaybill',
  creds: EwbApiCreds,
  ip: string,
  payload: Record<string, unknown>,
): Promise<{ ok: true; data: Record<string, unknown> } | { ok: false; error: string }> {
  const resp = await fetch(`${baseUrl}/ewaybillapi/v1.03/ewayapi/${op}?email=${encodeURIComponent(creds.email)}`, {
    method: 'POST',
    headers: ewbApiHeaders(creds, ip),
    body: JSON.stringify(payload),
  });
  const reply = await readReply(resp);
  if (reply === null) return { ok: false, error: `The e-way bill system sent an unreadable reply (HTTP ${resp.status}).` };
  const data = ewbApiData(reply);
  if (!data) return { ok: false, error: ewbApiErrorText(reply, 'The e-way bill system did not accept it') };
  return { ok: true, data };
}

/**
 * Step 6a: e-way bill for a sale bill without an e-invoice, through genewaybill. Bills with an
 * IRN (and export bills, which need one) get theirs from the IRN instead.
 */
async function directEwayBill(ctx: {
  // deno-lint-ignore no-explicit-any
  supabase: any;
  organizationId: string;
  saleId: string;
  userId: string;
  seller: { name: string; address: string };
  testMode: boolean;
  creds: EwbApiCreds;
  ip: string;
  transport: EwbTransportInput;
  shipTo: EwbShipTo | null;
}): Promise<Response> {
  const { supabase, organizationId, saleId } = ctx;
  const { data: sale, error: saleError } = await supabase
    .from('sales')
    .select(
      'id, sale_number, sale_date, sale_type, net_amount, flat_discount_amount, other_charges, round_off, notes, b2b_details, is_cancelled, deleted_at, irn, einvoice_status, customer_name, customer_address, customers:customer_id (gst_number, customer_name, address)',
    )
    .eq('id', saleId)
    .eq('organization_id', organizationId)
    .maybeSingle();
  if (saleError) throw new Error(`Could not read the bill: ${saleError.message}`);
  if (!sale || sale.deleted_at || sale.sale_type === 'debit_note') {
    return json({ success: false, error: 'This bill was not found. It may have been deleted.' });
  }
  if (sale.is_cancelled) return json({ success: false, error: 'This bill is cancelled, so it needs no e-way bill.' });
  if (sale.irn && sale.einvoice_status === 'generated') {
    return json({ success: false, code: 'HAS_IRN', error: 'This bill has an e-invoice. Make its e-way bill from the IRN.' });
  }
  if (isExportSupplyType(irpSupplyTypeOf(sale.b2b_details))) {
    return json({ success: false, code: 'NO_IRN', error: 'Export bills get their e-way bill from the e-invoice. Generate the IRN first.' });
  }

  const { data: existing, error: existingError } = await supabase
    .from('eway_bills')
    .select('id, ewb_no')
    .eq('organization_id', organizationId)
    .eq('sale_id', saleId)
    .eq('status', 'active')
    .limit(1)
    .maybeSingle();
  if (existingError) {
    if (/eway_bills|does not exist|schema cache/i.test(existingError.message || '')) {
      return json({ success: false, code: 'MISSING_SQL', error: 'Run the Phase 2 step 4 SQL first: it adds the e-way bill table.' });
    }
    throw new Error(`Could not read e-way bills: ${existingError.message}`);
  }
  if (existing) return json({ success: false, code: 'ALREADY', error: `This bill already has e-way bill ${existing.ewb_no}.`, ewbNo: existing.ewb_no });

  const { data: items, error: itemsError } = await supabase
    .from('sale_items')
    .select('product_id, product_name, hsn_code, quantity, unit_price, line_total, gst_percent, is_dc_item, deleted_at')
    .eq('sale_id', saleId);
  if (itemsError) throw new Error(`Could not read the bill lines: ${itemsError.message}`);
  // deno-lint-ignore no-explicit-any
  const rows = (items ?? []) as any[];
  const ids = [...new Set(rows.map((i) => String(i.product_id ?? '')).filter(Boolean))];
  const uomById = new Map<string, string>();
  for (let i = 0; i < ids.length; i += 200) {
    const { data, error } = await supabase
      .from('products')
      .select('id, uom')
      .eq('organization_id', organizationId)
      .in('id', ids.slice(i, i + 200));
    if (error) break;
    for (const p of data ?? []) uomById.set(String(p.id), String(p.uom ?? ''));
  }
  const input = saleBillToIrnInput(
    sale,
    rows.map((i) => ({ ...i, unit: einvoiceUnit(uomById.get(String(i.product_id ?? '')) ?? '', i.hsn_code) })),
  );
  if (!input) return json({ success: false, code: 'INVALID', field: 'lines', error: 'This bill has no goods lines with GST (challan items only).' });

  const saleDate = String(sale.sale_date ?? '').slice(0, 10);
  const built = buildDirectEwbPayload({
    docNo: sale.sale_number,
    docDate: saleDate,
    today: indiaTodayIso(),
    seller: { gstin: ctx.creds.gstin, name: ctx.seller.name, address: ctx.seller.address },
    buyer: {
      gstin: sale.customers?.gst_number ?? null,
      name: sale.customer_name || sale.customers?.customer_name || null,
      address: sale.customer_address || sale.customers?.address || null,
    },
    shipTo: ctx.shipTo,
    lines: input.lines.map((l) => ({
      description: l.description,
      hsn: l.hsn,
      qty: l.qty,
      unit: l.unit || 'PCS',
      taxable: l.taxable,
      gstPercent: l.gstPercent,
      gstAmount: l.gstAmount,
    })),
    netAmount: input.netAmount,
    transport: ctx.transport,
  });
  if (built.ok === false) {
    const bad = built as { field: string; error: string };
    return json({ success: false, code: 'INVALID', field: bad.field, error: bad.error });
  }
  const { payload, partAOnly } = built as { payload: Record<string, unknown>; partAOnly: boolean };

  const baseUrl = ctx.testMode ? 'https://staging.perione.in' : 'https://api.perione.in';
  const auth = await ewbApiAuth(baseUrl, ctx.creds, ctx.ip);
  if (auth.ok === false) return json({ success: false, code: 'AUTH_FAILED', error: (auth as { error: string }).error });
  const res = await ewbApiPost(baseUrl, 'genewaybill', ctx.creds, ctx.ip, payload);
  if (res.ok === false) return json({ success: false, error: (res as { error: string }).error });
  const info = ewbGenReplyInfo((res as { data: Record<string, unknown> }).data);
  if (!info) return json({ success: false, error: 'The e-way bill system did not send an e-way bill number. Check the portal before trying again.' });

  const t = ctx.transport;
  const vehicleNo = cleanVehicleNo(t.vehicleNo);
  const km = ewbDistance(t.distanceKm);
  const row: Record<string, unknown> = {
    organization_id: organizationId,
    sale_id: saleId,
    doc_type: 'INV',
    doc_no: sale.sale_number,
    doc_date: saleDate || null,
    irn: null,
    ewb_no: info.ewbNo,
    ewb_date: info.ewbDate ?? new Date().toISOString(),
    valid_till: info.validTill,
    status: 'active',
    generated_via: 'direct',
    test_mode: ctx.testMode,
    created_by: ctx.userId,
    updated_at: new Date().toISOString(),
    trans_mode: isEwbTransportMode(t.mode) ? t.mode : 'road',
    distance_km: km && km > 0 ? km : null,
    transporter_id: String(t.transporterId ?? '').trim().toUpperCase() || null,
    transporter_name: String(t.transporterName ?? '').trim() || null,
    vehicle_no: vehicleNo || null,
    vehicle_type: vehicleNo ? (t.vehicleType === 'O' ? 'O' : 'R') : null,
    trans_doc_no: String(t.transDocNo ?? '').replace(/\s+/g, '') || null,
    trans_doc_date: /^\d{4}-\d{2}-\d{2}$/.test(String(t.transDocDate ?? '')) ? t.transDocDate : null,
  };
  const { error: saveError } = await supabase.from('eway_bills').upsert(row, { onConflict: 'organization_id,ewb_no,test_mode' });
  if (saveError) {
    return json({ success: false, ewbNo: info.ewbNo, error: `E-way bill ${info.ewbNo} was made but could not be saved: ${saveError.message}. Note the number down.` });
  }
  return json({ success: true, ewbNo: info.ewbNo, ewbDate: info.ewbDate, validTill: info.validTill, partAOnly });
}

const MISSING_6B_SQL = 'Run the Phase 2 step 6b SQL first: it links e-way bills to delivery challans.';

/** The step 6b SQL (eway_bills.challan_id) has not run, or the step 4 table is missing. */
function missingChallanColumn(message: string | null | undefined): boolean {
  return /challan_id|sub_supply|eway_bills|does not exist|schema cache/i.test(String(message ?? ''));
}

/** Transport columns of a new eway_bills row, as typed in the dialog. */
function transportColumns(t: EwbTransportInput): Record<string, unknown> {
  const vehicleNo = cleanVehicleNo(t.vehicleNo);
  const km = ewbDistance(t.distanceKm);
  return {
    trans_mode: isEwbTransportMode(t.mode) ? t.mode : 'road',
    distance_km: km && km > 0 ? km : null,
    transporter_id: String(t.transporterId ?? '').trim().toUpperCase() || null,
    transporter_name: String(t.transporterName ?? '').trim() || null,
    vehicle_no: vehicleNo || null,
    vehicle_type: vehicleNo ? (t.vehicleType === 'O' ? 'O' : 'R') : null,
    trans_doc_no: String(t.transDocNo ?? '').replace(/\s+/g, '') || null,
    trans_doc_date: /^\d{4}-\d{2}-\d{2}$/.test(String(t.transDocDate ?? '')) ? t.transDocDate : null,
  };
}

/**
 * Step 6b: e-way bill for a delivery challan through genewaybill (document type CHL). Challans
 * carry no GST: each line is read at its product's sale GST rate, GST-inclusive, as the challan
 * print shows it.
 */
async function challanEwayBill(ctx: {
  // deno-lint-ignore no-explicit-any
  supabase: any;
  organizationId: string;
  challanId: string;
  userId: string;
  seller: { name: string; address: string };
  testMode: boolean;
  creds: EwbApiCreds;
  ip: string;
  transport: EwbTransportInput;
  shipTo: EwbShipTo | null;
  subSupply: { code?: string | null; desc?: string | null } | null;
}): Promise<Response> {
  const { supabase, organizationId, challanId } = ctx;
  const { data: challan, error: challanError } = await supabase
    .from('delivery_challans')
    .select(
      'id, challan_number, challan_date, challan_type, net_amount, round_off, status, deleted_at, customer_name, customer_address, shipping_address, customers:customer_id (gst_number, customer_name, address)',
    )
    .eq('id', challanId)
    .eq('organization_id', organizationId)
    .maybeSingle();
  if (challanError) throw new Error(`Could not read the challan: ${challanError.message}`);
  if (!challan || challan.deleted_at) return json({ success: false, error: 'This challan was not found. It may have been deleted.' });
  if (challan.status === 'cancelled') return json({ success: false, error: 'This challan is cancelled, so it needs no e-way bill.' });

  const { data: existing, error: existingError } = await supabase
    .from('eway_bills')
    .select('id, ewb_no')
    .eq('organization_id', organizationId)
    .eq('challan_id', challanId)
    .eq('status', 'active')
    .limit(1)
    .maybeSingle();
  if (existingError) {
    if (missingChallanColumn(existingError.message)) return json({ success: false, code: 'MISSING_SQL', error: MISSING_6B_SQL });
    throw new Error(`Could not read e-way bills: ${existingError.message}`);
  }
  if (existing) return json({ success: false, code: 'ALREADY', error: `This challan already has e-way bill ${existing.ewb_no}.`, ewbNo: existing.ewb_no });

  const { data: items, error: itemsError } = await supabase
    .from('delivery_challan_items')
    .select('product_id, product_name, hsn_code, quantity, line_total, deleted_at')
    .eq('challan_id', challanId);
  if (itemsError) throw new Error(`Could not read the challan lines: ${itemsError.message}`);
  // deno-lint-ignore no-explicit-any
  const rows = ((items ?? []) as any[]).filter((i) => !i.deleted_at);
  const ids = [...new Set(rows.map((i) => String(i.product_id ?? '')).filter(Boolean))];
  // deno-lint-ignore no-explicit-any
  const productById = new Map<string, any>();
  for (let i = 0; i < ids.length; i += 200) {
    const { data, error } = await supabase
      .from('products')
      .select('id, uom, hsn_code, sale_gst_percent, gst_per')
      .eq('organization_id', organizationId)
      .in('id', ids.slice(i, i + 200));
    if (error) throw new Error(`Could not read the challan products: ${error.message}`);
    for (const p of data ?? []) productById.set(String(p.id), p);
  }
  const { lines, netAmount } = challanEwbLines({
    items: rows.map((i) => {
      const p = productById.get(String(i.product_id ?? ''));
      const hsn = String(i.hsn_code || p?.hsn_code || '').replace(/\s+/g, '');
      return {
        description: String(i.product_name ?? ''),
        hsn,
        qty: Number(i.quantity) || 0,
        unit: einvoiceUnit(String(p?.uom ?? ''), hsn),
        value: Number(i.line_total) || 0,
        gstPercent: Number(p?.sale_gst_percent ?? p?.gst_per ?? 0) || 0,
      };
    }),
    netAmount: challan.net_amount,
    roundOff: challan.round_off,
  });

  const challanDate = challan.challan_date ? indiaTodayIso(new Date(challan.challan_date)) : '';
  const built = buildDirectEwbPayload({
    docNo: challan.challan_number,
    docDate: challanDate,
    today: indiaTodayIso(),
    seller: { gstin: ctx.creds.gstin, name: ctx.seller.name, address: ctx.seller.address },
    buyer: {
      gstin: challan.customers?.gst_number ?? null,
      name: challan.customer_name || challan.customers?.customer_name || null,
      address: challan.shipping_address || challan.customer_address || challan.customers?.address || null,
    },
    shipTo: ctx.shipTo,
    lines,
    netAmount,
    transport: ctx.transport,
    doc: { type: 'CHL', subSupplyType: String(ctx.subSupply?.code ?? ''), subSupplyDesc: ctx.subSupply?.desc ?? null },
  });
  if (built.ok === false) {
    const bad = built as { field: string; error: string };
    return json({ success: false, code: 'INVALID', field: bad.field, error: bad.error });
  }
  const { payload, partAOnly } = built as { payload: Record<string, unknown>; partAOnly: boolean };

  const baseUrl = ctx.testMode ? 'https://staging.perione.in' : 'https://api.perione.in';
  const auth = await ewbApiAuth(baseUrl, ctx.creds, ctx.ip);
  if (auth.ok === false) return json({ success: false, code: 'AUTH_FAILED', error: (auth as { error: string }).error });
  const res = await ewbApiPost(baseUrl, 'genewaybill', ctx.creds, ctx.ip, payload);
  if (res.ok === false) return json({ success: false, error: (res as { error: string }).error });
  const info = ewbGenReplyInfo((res as { data: Record<string, unknown> }).data);
  if (!info) return json({ success: false, error: 'The e-way bill system did not send an e-way bill number. Check the portal before trying again.' });

  const row: Record<string, unknown> = {
    organization_id: organizationId,
    sale_id: null,
    challan_id: challanId,
    doc_type: 'CHL',
    doc_no: challan.challan_number,
    doc_date: challanDate || null,
    sub_supply_type: String(payload.subSupplyType ?? ''),
    sub_supply_desc: payload.subSupplyDesc ? String(payload.subSupplyDesc) : null,
    irn: null,
    ewb_no: info.ewbNo,
    ewb_date: info.ewbDate ?? new Date().toISOString(),
    valid_till: info.validTill,
    status: 'active',
    generated_via: 'direct',
    test_mode: ctx.testMode,
    created_by: ctx.userId,
    updated_at: new Date().toISOString(),
    ...transportColumns(ctx.transport),
  };
  const { error: saveError } = await supabase.from('eway_bills').upsert(row, { onConflict: 'organization_id,ewb_no,test_mode' });
  if (saveError) {
    return json({ success: false, ewbNo: info.ewbNo, error: `E-way bill ${info.ewbNo} was made but could not be saved: ${saveError.message}. Note the number down.` });
  }
  return json({ success: true, ewbNo: info.ewbNo, ewbDate: info.ewbDate, validTill: info.validTill, partAOnly });
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response(null, { headers: corsHeaders });

  try {
    const authHeader = req.headers.get('Authorization');
    if (!authHeader) return json({ success: false, error: 'No authorization header' }, 401);

    const body = (await req.json()) as EwbRequest;
    const { action, organizationId } = body;
    const saleId = String(body.saleId ?? '');
    const challanId = String(body.challanId ?? '');
    const isIrnAction = IRN_ACTIONS.includes(action);
    if (!isIrnAction && !EWB_API_ACTIONS.includes(action)) return json({ success: false, error: 'Unknown action' }, 400);
    const onSale = isIrnAction || SALE_EWB_ACTIONS.includes(action);
    const onChallan = action === 'challan';
    if (onSale && !UUID.test(saleId)) return json({ success: false, error: 'Invalid saleId' }, 400);
    if (onChallan && !UUID.test(challanId)) return json({ success: false, error: 'Invalid challanId' }, 400);
    if (action !== 'test' && !onSale && !onChallan && !UUID.test(String(body.ewayBillId ?? ''))) {
      return json({ success: false, error: 'Invalid ewayBillId' }, 400);
    }
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

    // E-Way Bill switch (Settings > Sale > E-Invoice) with e-invoicing on; Industrial mode shops have it on by default.
    const [{ data: org }, { data: settingsData }] = await Promise.all([
      supabase.from('organizations').select('enabled_features').eq('id', organizationId).maybeSingle(),
      supabase.from('settings').select('gst_number, business_name, address, sale_settings').eq('organization_id', organizationId).maybeSingle(),
    ]);
    const features = Array.isArray(org?.enabled_features) ? org.enabled_features : [];
    // deno-lint-ignore no-explicit-any
    const saleSettings = ((settingsData?.sale_settings as Record<string, any>) || {});
    const industrialOn = features.includes('industrial_mode') && saleSettings?.industrial_mode?.enabled === true;
    if (!ewayBillEnabled(saleSettings.einvoice_settings, industrialOn)) {
      return json({
        success: false,
        code: 'EWB_OFF',
        error: 'E-way bills are off. Turn on E-Way Bill in Settings > Sale.',
      }, 403);
    }

    if (!isIrnAction) {
      // deno-lint-ignore no-explicit-any
      const ewbSettings = (saleSettings.einvoice_settings || {}) as Record<string, any>;
      const creds: EwbApiCreds = {
        clientId: ewbSettings.ewb_api_client_id || Deno.env.get('PERIONE_EWB_CLIENT_ID') || '',
        clientSecret: ewbSettings.ewb_api_client_secret || Deno.env.get('PERIONE_EWB_CLIENT_SECRET') || '',
        username: ewbSettings.ewb_api_username || Deno.env.get('PERIONE_EWB_USERNAME') || '',
        password: ewbSettings.ewb_api_password || Deno.env.get('PERIONE_EWB_PASSWORD') || '',
        email: ewbSettings.api_email || '',
        gstin: String(ewbSettings.seller_gstin || settingsData?.gst_number || '').trim().toUpperCase(),
      };
      if (!creds.clientId || !creds.clientSecret || !creds.username || !creds.password || !creds.email) {
        return json({
          success: false,
          code: 'MISSING_EWB_KEYS',
          error: 'Add the e-way bill keys and API email from PeriOne in Settings > Sale > E-Way Bill.',
        });
      }
      if (!/^[0-9]{2}[0-9A-Z]{13}$/.test(creds.gstin)) {
        return json({ success: false, error: 'Seller GSTIN is missing. Add it in Business Details (or the sandbox GSTIN in E-Invoice Settings).' });
      }
      const ip = await getPublicIP();

      if (action === 'test') {
        const testMode = ewbSettings.test_mode ?? true;
        const baseUrl = testMode ? 'https://staging.perione.in' : 'https://api.perione.in';
        const auth = await ewbApiAuth(baseUrl, creds, ip);
        if (auth.ok === false) return json({ success: false, code: 'AUTH_FAILED', error: (auth as { error: string }).error });
        return json({ success: true, message: `E-way bill login works (${testMode ? 'sandbox' : 'live'}, GSTIN ${creds.gstin}).` });
      }

      if (action === 'direct') {
        return await directEwayBill({
          // deno-lint-ignore no-explicit-any
          supabase: supabase as any,
          organizationId,
          saleId,
          userId: user.id,
          seller: { name: String(settingsData?.business_name ?? ''), address: String(settingsData?.address ?? '') },
          testMode: ewbSettings.test_mode ?? true,
          creds,
          ip,
          transport: body.transport ?? { mode: 'road' },
          shipTo: body.shipTo ?? null,
        });
      }

      if (action === 'challan') {
        return await challanEwayBill({
          // deno-lint-ignore no-explicit-any
          supabase: supabase as any,
          organizationId,
          challanId,
          userId: user.id,
          seller: { name: String(settingsData?.business_name ?? ''), address: String(settingsData?.address ?? '') },
          testMode: ewbSettings.test_mode ?? true,
          creds,
          ip,
          transport: body.transport ?? { mode: 'road' },
          shipTo: body.shipTo ?? null,
          subSupply: body.subSupply ?? null,
        });
      }

      const { data: ewb, error: ewbError } = await supabase
        .from('eway_bills')
        .select('id, ewb_no, ewb_date, valid_till, status, test_mode, doc_date, distance_km, trans_mode, vehicle_no')
        .eq('id', body.ewayBillId)
        .eq('organization_id', organizationId)
        .maybeSingle();
      if (ewbError) {
        if (/eway_bills|does not exist|schema cache/i.test(ewbError.message || '')) {
          return json({ success: false, code: 'MISSING_SQL', error: 'Run the Phase 2 step 4 SQL first: it adds the e-way bill table.' });
        }
        throw new Error(`Could not read the e-way bill: ${ewbError.message}`);
      }
      if (!ewb) return json({ success: false, error: 'This e-way bill was not found.' });
      if (ewb.status !== 'active') return json({ success: false, error: `E-way bill ${ewb.ewb_no} is already cancelled.` });

      // Same environment (sandbox or live) as the e-way bill itself.
      const baseUrl = ewb.test_mode ? 'https://staging.perione.in' : 'https://api.perione.in';
      const today = indiaTodayIso();
      const docDate = ewb.doc_date ? String(ewb.doc_date).slice(0, 10) : null;

      const built = action === 'vehicle'
        ? buildEwbVehiclePayload({ ewbNo: ewb.ewb_no, input: body.vehicle ?? { mode: 'road' }, docDate, today })
        : action === 'cancel'
          ? buildEwbCancelPayload({
            ewbNo: ewb.ewb_no,
            reasonCode: body.cancel?.reasonCode ?? null,
            remark: body.cancel?.remark ?? null,
            ewbDate: ewb.ewb_date,
          })
          : buildEwbExtendPayload({
            ewbNo: ewb.ewb_no,
            input: body.extend ?? { consignment: 'M', mode: 'road' },
            validTill: ewb.valid_till,
            distanceKm: ewb.distance_km,
            docDate,
            today,
          });
      if (built.ok === false) {
        const bad = built as { field: string; error: string };
        return json({ success: false, code: 'INVALID', field: bad.field, error: bad.error });
      }
      const payload = (built as { payload: Record<string, string | number> }).payload;

      const auth = await ewbApiAuth(baseUrl, creds, ip);
      if (auth.ok === false) return json({ success: false, code: 'AUTH_FAILED', error: (auth as { error: string }).error });

      const op = action === 'vehicle' ? 'vehewb' : action === 'cancel' ? 'canewb' : 'extendvalidity';
      const res = await ewbApiPost(baseUrl, op, creds, ip, payload);
      if (res.ok === false) return json({ success: false, error: (res as { error: string }).error });
      const data = (res as { data: Record<string, unknown> }).data;

      const now = new Date().toISOString();
      let update: Record<string, unknown>;
      if (action === 'cancel') {
        update = { status: 'cancelled', updated_at: now };
      } else {
        const t = action === 'vehicle' ? body.vehicle : body.extend;
        const moving = action === 'vehicle' || body.extend?.consignment !== 'T';
        const mode = isEwbTransportMode(t?.mode) ? t!.mode : 'road';
        const vehicleNo = cleanVehicleNo(t?.vehicleNo);
        update = { updated_at: now };
        const validUpto = ewbApiValidUpto(data);
        if (validUpto) update.valid_till = validUpto;
        if (moving) {
          Object.assign(update, {
            trans_mode: mode,
            vehicle_no: vehicleNo || null,
            vehicle_type: vehicleNo ? 'R' : null,
            trans_doc_no: String(t?.transDocNo ?? '').replace(/\s+/g, '') || null,
            trans_doc_date: /^\d{4}-\d{2}-\d{2}$/.test(String(t?.transDocDate ?? '')) ? t!.transDocDate : null,
          });
        }
      }
      const { error: saveError } = await supabase.from('eway_bills').update(update).eq('id', ewb.id);
      const done = action === 'vehicle' ? 'Vehicle updated' : action === 'cancel' ? 'E-way bill cancelled' : 'Validity extended';
      if (saveError) {
        return json({
          success: false,
          error: `${done} on the e-way bill system, but not saved here: ${saveError.message}. Press "Refresh from IRP" to read it again.`,
        });
      }
      return json({ success: true, ewbNo: ewb.ewb_no, validTill: (update.valid_till as string | undefined) ?? ewb.valid_till, message: done });
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
