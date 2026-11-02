// E-invoice (IRN) for notes: generate or cancel the IRN of a sales debit note.
// Industrial mode, Phase 2 step 2. Sale bills keep using generate-einvoice and
// cancel-einvoice, which this function does not touch.
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';
import {
  buildNoteEInvoicePayload,
  debitNoteToNoteInput,
  duplicateIrnInfo,
  irnCancelHoursLeft,
  parseIrpDateTime,
  perioneErrorText,
  perioneSucceeded,
  IRN_CANCEL_REASONS,
} from '../_shared/einvoiceNote.ts';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

interface NoteRequest {
  action: 'generate' | 'cancel';
  kind: 'debit';
  noteId: string;
  organizationId: string;
  testMode?: boolean;
  reasonCode?: string;
  remarks?: string;
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

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response(null, { headers: corsHeaders });

  try {
    const authHeader = req.headers.get('Authorization');
    if (!authHeader) return json({ success: false, error: 'No authorization header' }, 401);

    const body = (await req.json()) as NoteRequest;
    const { action, kind, noteId, organizationId } = body;
    if (action !== 'generate' && action !== 'cancel') return json({ success: false, error: 'Unknown action' }, 400);
    if (kind !== 'debit') return json({ success: false, error: 'Only debit notes are supported yet' }, 400);
    if (!noteId || !UUID.test(noteId)) return json({ success: false, error: 'Invalid noteId' }, 400);
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

    const { data: note, error: noteError } = await supabase
      .from('sales')
      .select(
        'id, sale_number, sale_date, sale_type, net_amount, customer_name, customer_address, customer_phone, debit_note_details, deleted_at, irn, ack_date, einvoice_status, einvoice_test_mode, customers:customer_id (gst_number, customer_name, address, phone, email)',
      )
      .eq('id', noteId)
      .eq('organization_id', organizationId)
      .maybeSingle();
    if (noteError) throw new Error(`Could not read the debit note: ${noteError.message}`);
    if (!note || note.sale_type !== 'debit_note' || note.deleted_at) {
      return json({ success: false, error: 'Debit note not found. It may have been deleted.' });
    }

    const { data: settingsData } = await supabase
      .from('settings')
      .select('business_name, address, mobile_number, email_id, gst_number, sale_settings')
      .eq('organization_id', organizationId)
      .maybeSingle();
    // deno-lint-ignore no-explicit-any
    const einvoiceSettings = ((settingsData?.sale_settings as Record<string, any>) || {}).einvoice_settings || {};
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

    const markFailed = async (error: string) => {
      await supabase.from('sales').update({ einvoice_status: 'failed', einvoice_error: error.slice(0, 500) }).eq('id', noteId);
    };

    if (action === 'cancel') {
      if (!note.irn || note.einvoice_status !== 'generated') {
        return json({ success: false, error: 'This debit note has no active IRN to cancel.' });
      }
      if (irnCancelHoursLeft(note.ack_date) <= 0) {
        return json({
          success: false,
          code: 'CANCEL_WINDOW',
          error: 'The IRP allows cancelling an IRN only within 24 hours. Raise a credit note against it instead.',
        });
      }
      const reasonCode = IRN_CANCEL_REASONS.some((r) => r.code === body.reasonCode) ? body.reasonCode! : '4';
      const remarks = String(body.remarks ?? '').replace(/\s+/g, ' ').trim().slice(0, 100) ||
        IRN_CANCEL_REASONS.find((r) => r.code === reasonCode)!.label;

      // Cancel in the same environment (sandbox or live) the IRN came from.
      const testMode = note.einvoice_test_mode ?? body.testMode ?? true;
      const baseUrl = testMode ? 'https://staging.perione.in' : 'https://api.perione.in';
      const ip = await getPublicIP();
      const auth = await perioneAuth(baseUrl, creds, ip);
      if ('error' in auth) return json({ success: false, code: 'AUTH_FAILED', error: auth.error });

      const resp = await fetch(`${baseUrl}/einvoice/type/CANCEL/version/V1_03?email=${encodeURIComponent(creds.email)}`, {
        method: 'POST',
        headers: perioneHeaders(creds, ip, auth.token),
        body: JSON.stringify({ Irn: note.irn, CnlRsn: reasonCode, CnlRem: remarks }),
      });
      const respText = await resp.text();
      // deno-lint-ignore no-explicit-any
      let data: any = null;
      try {
        data = JSON.parse(respText);
      } catch {
        return json({ success: false, error: `The IRP sent an unreadable reply (HTTP ${resp.status}).` });
      }
      if (!perioneSucceeded(data)) {
        const error = perioneErrorText(data, 'Cancellation failed');
        await supabase.from('sales').update({ einvoice_error: `Cancel: ${error}`.slice(0, 500) }).eq('id', noteId);
        return json({ success: false, error });
      }
      await supabase.from('sales').update({ einvoice_status: 'cancelled', einvoice_error: null }).eq('id', noteId);
      return json({ success: true, message: 'IRN cancelled' });
    }

    // Generate
    if (note.irn && note.einvoice_status !== 'cancelled') {
      return json({ success: false, code: 'ALREADY', error: 'This debit note already has an IRN.', irn: note.irn });
    }
    if (note.irn && note.einvoice_status === 'cancelled') {
      return json({
        success: false,
        code: 'CANCELLED_BEFORE',
        error: 'Its IRN was cancelled, and the IRP never gives the same number a second IRN. Make a new debit note.',
      });
    }

    const input = debitNoteToNoteInput(
      { sale_number: note.sale_number, sale_date: note.sale_date, net_amount: note.net_amount },
      note.debit_note_details,
    );
    if (!input) return json({ success: false, error: 'This debit note has no GST lines saved. Open and save it again.' });

    // deno-lint-ignore no-explicit-any
    const cust = (note.customers ?? {}) as any;
    const built = buildNoteEInvoicePayload(
      input,
      {
        gstin: creds.gstin,
        name: settingsData?.business_name || '',
        address: (settingsData?.address as string) || '',
        phone: settingsData?.mobile_number,
        email: settingsData?.email_id,
      },
      {
        gstin: cust.gst_number || '',
        name: note.customer_name || cust.customer_name || '',
        address: note.customer_address || cust.address || '',
        phone: note.customer_phone || cust.phone,
        email: cust.email,
      },
    );
    if (!built.ok) {
      await markFailed(built.error);
      return json({ success: false, code: built.code, error: built.error });
    }

    const testMode = body.testMode ?? true;
    const baseUrl = testMode ? 'https://staging.perione.in' : 'https://api.perione.in';
    const ip = await getPublicIP();
    const auth = await perioneAuth(baseUrl, creds, ip);
    if ('error' in auth) {
      await markFailed(auth.error);
      return json({ success: false, code: 'AUTH_FAILED', error: auth.error });
    }

    const resp = await fetch(`${baseUrl}/einvoice/type/GENERATE/version/V1_03?email=${encodeURIComponent(creds.email)}`, {
      method: 'POST',
      headers: perioneHeaders(creds, ip, auth.token),
      body: JSON.stringify(built.payload),
    });
    const respText = await resp.text();
    // deno-lint-ignore no-explicit-any
    let data: any = null;
    try {
      data = JSON.parse(respText);
    } catch {
      const error = `The IRP sent an unreadable reply (HTTP ${resp.status}).`;
      await markFailed(error);
      return json({ success: false, error });
    }

    if (!perioneSucceeded(data)) {
      // Already reported earlier (e.g. a timed-out first try): keep the IRN the IRP holds.
      const dup = duplicateIrnInfo(data);
      if (dup) {
        await supabase
          .from('sales')
          .update({
            irn: dup.irn,
            ack_no: dup.ackNo || null,
            ack_date: parseIrpDateTime(dup.ackDt),
            einvoice_status: 'generated',
            einvoice_error: 'IRN was already at the IRP; its QR code was not sent back.',
            einvoice_test_mode: testMode,
          })
          .eq('id', noteId);
        return json({ success: true, irn: dup.irn, ackNo: dup.ackNo, duplicate: true });
      }
      const error = perioneErrorText(data, 'E-invoice generation failed');
      await markFailed(error);
      return json({ success: false, error });
    }

    const out = data.data || {};
    const { error: saveError } = await supabase
      .from('sales')
      .update({
        irn: out.Irn,
        ack_no: out.AckNo != null ? String(out.AckNo) : null,
        ack_date: parseIrpDateTime(out.AckDt) ?? new Date().toISOString(),
        signed_invoice: out.SignedInvoice ?? null,
        einvoice_qr_code: out.SignedQRCode ?? null,
        einvoice_status: 'generated',
        einvoice_error: null,
        einvoice_test_mode: testMode,
      })
      .eq('id', noteId);
    if (saveError) {
      // The IRN exists at the IRP: return it so the shop can note it down.
      return json({ success: false, irn: out.Irn, error: `IRN ${out.Irn} was generated but could not be saved: ${saveError.message}` });
    }
    return json({ success: true, irn: out.Irn, ackNo: out.AckNo, ackDate: out.AckDt });
  } catch (error) {
    console.error('einvoice-note error:', error);
    return json({ success: false, error: error instanceof Error ? error.message : 'Unknown error' }, 500);
  }
});
