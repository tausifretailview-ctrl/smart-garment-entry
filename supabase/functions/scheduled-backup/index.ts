// Dispatcher: backs up every non-suspended organization and fans out to auto-backup
// (one invocation per org, fire-and-forget) so we never hit edge function timeout.
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import {
  isInternalDispatch,
  isServiceRoleRequest,
  optionalInternalDispatchHeaders,
  parseDispatchTicketFromBody,
  parseDispatchTicketHeader,
} from "../_shared/internalDispatch.ts";
import {
  DEFAULT_NIGHTLY_RETENTION_DAYS,
  isDueForNightlyBackup,
  isOrgEligibleForNightlyBackup,
  resolveNightlyRetentionDays,
} from "../_shared/nightlyBackupEligibility.ts";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type, x-internal-dispatch-secret, x-backup-dispatch-ticket',
};

interface BackupSetting {
  organization_id: string;
  backup_retention_days: number | null;
  last_auto_backup_at: string | null;
}

async function authorizeDispatcher(
  req: Request,
  supabaseUrl: string,
  supabaseServiceKey: string,
): Promise<boolean> {
  if (isInternalDispatch(req) || isServiceRoleRequest(req)) return true;

  // Ticket in the header identifies cron. Body is a fallback when pg_net strips
  // custom headers. Only after a well-formed ticket is present do we open a
  // service-role client to consume it (consume_backup_dispatch_ticket is
  // service_role-only).
  let ticket = parseDispatchTicketHeader(req);
  if (!ticket) {
    try {
      ticket = parseDispatchTicketFromBody(await req.clone().json());
    } catch {
      ticket = null;
    }
  }
  if (!ticket) return false;

  const supabase = createClient(supabaseUrl, supabaseServiceKey);
  const { data, error } = await supabase.rpc('consume_backup_dispatch_ticket', {
    p_id: ticket.id,
    p_token: ticket.token,
  });
  if (error) {
    console.error('consume_backup_dispatch_ticket failed:', error.message);
    return false;
  }
  return data === true;
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
  const supabaseServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;

  // SECURITY: this function runs with verify_jwt = false and fans out full-database
  // exports for every organization. Caller must be cron (one-time DB ticket),
  // the shared dispatch secret, or the service_role key.
  if (!(await authorizeDispatcher(req, supabaseUrl, supabaseServiceKey))) {
    console.error('Rejected scheduled-backup invocation without valid dispatch secret or ticket');
    return new Response(
      JSON.stringify({ error: 'Forbidden' }),
      { status: 403, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }

  try {
    const supabase = createClient(supabaseUrl, supabaseServiceKey);

    console.log('Scheduled backup dispatcher started');

    const { data: orgs, error: orgsError } = await supabase
      .from('organizations')
      .select('id, is_suspended');

    if (orgsError) {
      console.error('Failed to fetch organizations:', orgsError);
      throw new Error('Failed to fetch organizations');
    }

    const { data: allSettings, error: settingsError } = await supabase
      .from('settings')
      .select('organization_id, backup_retention_days, last_auto_backup_at');

    if (settingsError) {
      console.error('Failed to fetch settings:', settingsError);
      throw new Error('Failed to fetch backup settings');
    }

    const settingsByOrg = new Map(
      ((allSettings || []) as BackupSetting[]).map((row) => [row.organization_id, row]),
    );

    const eligibleOrgs = (orgs || []).filter((org) =>
      isOrgEligibleForNightlyBackup({ is_suspended: org.is_suspended }),
    );

    const eligibleSettings = eligibleOrgs
      .map((org) => {
        const setting = settingsByOrg.get(org.id);
        return {
          organization_id: org.id,
          backup_retention_days: setting?.backup_retention_days ?? null,
          last_auto_backup_at: setting?.last_auto_backup_at ?? null,
        };
      })
      .filter((setting) => isDueForNightlyBackup(setting.last_auto_backup_at));

    if (!eligibleSettings.length) {
      return new Response(
        JSON.stringify({
          success: true,
          message: 'No orgs due for auto-backup within 1 day',
          dispatched: 0,
          skipped: eligibleOrgs.length,
        }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    const skipped = eligibleOrgs.length - eligibleSettings.length;
    console.log(`Dispatching backup for ${eligibleSettings.length} organizations (${skipped} skipped as recently backed up)`);

    const extraHeaders = optionalInternalDispatchHeaders();

    // Fan out: invoke auto-backup for each org as fire-and-forget HTTP call.
    // We don't await — each invocation runs in its own short-lived edge function.
    const dispatchPromises = eligibleSettings.map(async (setting) => {
      const orgId = setting.organization_id;
      const retentionDays = resolveNightlyRetentionDays(setting.backup_retention_days);
      try {
        // Fire-and-forget: do not await response body; just kick it off.
        // Using fetch directly so we control headers and don't block on body.
        const res = await fetch(`${supabaseUrl}/functions/v1/auto-backup`, {
          method: 'POST',
          headers: {
            'Authorization': `Bearer ${supabaseServiceKey}`,
            'apikey': supabaseServiceKey,
            'Content-Type': 'application/json',
            ...extraHeaders,
          },
          body: JSON.stringify({
            organizationId: orgId,
            backupType: 'automatic',
            retentionDays,
          }),
        });
        // Just check status code; don't await body
        return { orgId, dispatched: true, status: res.status };
      } catch (err: unknown) {
        const msg = err instanceof Error ? err.message : 'dispatch failed';
        console.error(`Dispatch failed for ${orgId}:`, msg);
        return { orgId, dispatched: false, error: msg };
      }
    });

    // Await all dispatches (status codes only — actual backup runs in each child invocation)
    const results = await Promise.all(dispatchPromises);
    const dispatched = results.filter(r => r.dispatched).length;
    const failed = results.length - dispatched;

    console.log(`Dispatcher complete: ${dispatched} dispatched, ${failed} failed`);

    return new Response(
      JSON.stringify({
        success: true,
        message: `Dispatched ${dispatched} backup jobs (${failed} failed to dispatch)`,
        dispatched,
        failed,
        skipped,
        default_retention_days: DEFAULT_NIGHTLY_RETENTION_DAYS,
        results,
      }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );

  } catch (error: unknown) {
    console.error('Scheduled backup dispatcher error:', error);
    const errorMessage = error instanceof Error ? error.message : 'Dispatcher failed';
    return new Response(
      JSON.stringify({ success: false, error: errorMessage }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }
});
