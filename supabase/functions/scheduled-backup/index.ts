// Dispatcher: backs up every non-suspended organization and fans out to auto-backup
// (one invocation per org) so we never hit edge function timeout.
//
// Fan-out is staggered + sequential with rate-limit retry. The previous Promise.all
// blast tripped Supabase nested edge-function rate limits ("retry after ~60 seconds")
// and left most orgs without a backup_logs row for the night. HTTP 546 from auto-backup
// is WORKER_RESOURCE_LIMIT (CPU/memory) and is treated as failure, not success.
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
import {
  NIGHTLY_DISPATCH_MAX_RATE_LIMIT_RETRIES,
  NIGHTLY_DISPATCH_MIN_GAP_MS,
  NIGHTLY_DISPATCH_SOFT_DEADLINE_MS,
  NIGHTLY_DISPATCH_STAGGER_WINDOW_MS,
  type NightlyDispatchResult,
  isRateLimitFailure,
  isSuccessfulDispatchStatus,
  isWorkerResourceLimitStatus,
  orgDispatchOffsetMs,
  resolveRetryAfterMs,
  sleepMs,
  sortOrgsForStaggeredDispatch,
} from "../_shared/nightlyBackupDispatch.ts";

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


// deno-lint-ignore no-explicit-any
type ServiceClient = any;

async function recordDispatchFailure(
  supabase: ServiceClient,
  orgId: string,
  errorMessage: string,
): Promise<void> {
  const now = new Date().toISOString();
  const { error: logError } = await supabase.from('backup_logs').insert({
    organization_id: orgId,
    backup_type: 'automatic',
    status: 'failed',
    error_message: errorMessage,
    started_at: now,
    completed_at: now,
  });
  if (logError) {
    console.error(`Failed to insert backup_logs failure for ${orgId}:`, logError.message);
  }

  const { error: appError } = await supabase.from('app_error_logs').insert({
    organization_id: orgId,
    operation: 'scheduled_backup_dispatch',
    error_message: errorMessage,
  });
  if (appError) {
    console.error(`Failed to insert app_error_logs for ${orgId}:`, appError.message);
  }
}

async function dispatchOneOrg(opts: {
  supabase: ServiceClient;
  supabaseUrl: string;
  supabaseServiceKey: string;
  extraHeaders: Record<string, string>;
  orgId: string;
  retentionDays: number;
}): Promise<NightlyDispatchResult> {
  const { supabase, supabaseUrl, supabaseServiceKey, extraHeaders, orgId, retentionDays } = opts;

  let attempts = 0;
  let lastError = 'dispatch failed';

  while (attempts <= NIGHTLY_DISPATCH_MAX_RATE_LIMIT_RETRIES) {
    attempts += 1;
    try {
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

      // Status only — backup work continues inside auto-backup.
      if (isSuccessfulDispatchStatus(res.status)) {
        return { orgId, dispatched: true, status: res.status, attempts };
      }

      const bodyText = await res.text().catch(() => '');
      if (isWorkerResourceLimitStatus(res.status)) {
        lastError =
          `auto-backup HTTP 546 WORKER_RESOURCE_LIMIT (CPU/memory)` +
          `${bodyText ? `: ${bodyText.slice(0, 200)}` : ''}`;
      } else {
        lastError =
          `auto-backup HTTP ${res.status}` +
          `${bodyText ? `: ${bodyText.slice(0, 200)}` : ''}`;
      }

      if (
        isRateLimitFailure(null, res.status, bodyText) &&
        attempts <= NIGHTLY_DISPATCH_MAX_RATE_LIMIT_RETRIES
      ) {
        const waitMs = resolveRetryAfterMs({
          retryAfterHeader: res.headers.get('Retry-After'),
          bodyText,
        });
        console.warn(
          `Rate-limited dispatching ${orgId} (HTTP ${res.status}); waiting ${waitMs}ms before retry ${attempts}/${NIGHTLY_DISPATCH_MAX_RATE_LIMIT_RETRIES}`,
        );
        await sleepMs(waitMs);
        continue;
      }

      console.error(`Dispatch failed for ${orgId}:`, lastError);
      await recordDispatchFailure(supabase, orgId, lastError);
      return { orgId, dispatched: false, status: res.status, error: lastError, attempts };
    } catch (err: unknown) {
      lastError = err instanceof Error ? err.message : 'dispatch failed';

      if (isRateLimitFailure(err) && attempts <= NIGHTLY_DISPATCH_MAX_RATE_LIMIT_RETRIES) {
        const waitMs = resolveRetryAfterMs({ err });
        console.warn(
          `Rate-limited dispatching ${orgId} (throw); waiting ${waitMs}ms before retry ${attempts}/${NIGHTLY_DISPATCH_MAX_RATE_LIMIT_RETRIES}`,
        );
        await sleepMs(waitMs);
        continue;
      }

      console.error(`Dispatch failed for ${orgId}:`, lastError);
      await recordDispatchFailure(supabase, orgId, lastError);
      return { orgId, dispatched: false, error: lastError, attempts };
    }
  }

  await recordDispatchFailure(supabase, orgId, lastError);
  return { orgId, dispatched: false, error: lastError, attempts };
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
    const staggered = sortOrgsForStaggeredDispatch(
      eligibleSettings,
      NIGHTLY_DISPATCH_STAGGER_WINDOW_MS,
    );
    console.log(
      `Dispatching backup for ${staggered.length} organizations ` +
        `(${skipped} skipped as recently backed up; stagger window ${NIGHTLY_DISPATCH_STAGGER_WINDOW_MS}ms)`,
    );

    const extraHeaders = optionalInternalDispatchHeaders();
    const startedAt = Date.now();
    const results: NightlyDispatchResult[] = [];
    let lastDispatchAt = 0;

    for (const setting of staggered) {
      const elapsed = Date.now() - startedAt;
      if (elapsed >= NIGHTLY_DISPATCH_SOFT_DEADLINE_MS) {
        // Leave remaining orgs due (last_auto_backup_at unchanged) for catch-up
        // crons — do not pretend they were attempted.
        console.warn(
          `Soft deadline ${NIGHTLY_DISPATCH_SOFT_DEADLINE_MS}ms reached after ${results.length}/${staggered.length}; deferring rest to catch-up cron`,
        );
        for (const rest of staggered.slice(results.length)) {
          results.push({
            orgId: rest.organization_id,
            dispatched: false,
            deferred: true,
            error: 'deferred_to_catchup_cron',
          });
        }
        break;
      }

      const orgId = setting.organization_id;
      const targetOffset = orgDispatchOffsetMs(orgId, NIGHTLY_DISPATCH_STAGGER_WINDOW_MS);
      const waitForSlot = targetOffset - (Date.now() - startedAt);
      if (waitForSlot > 0) await sleepMs(waitForSlot);

      const sinceLast = Date.now() - lastDispatchAt;
      if (lastDispatchAt > 0 && sinceLast < NIGHTLY_DISPATCH_MIN_GAP_MS) {
        await sleepMs(NIGHTLY_DISPATCH_MIN_GAP_MS - sinceLast);
      }

      const retentionDays = resolveNightlyRetentionDays(setting.backup_retention_days);
      const result = await dispatchOneOrg({
        supabase,
        supabaseUrl,
        supabaseServiceKey,
        extraHeaders,
        orgId,
        retentionDays,
      });
      lastDispatchAt = Date.now();
      results.push(result);
    }

    const dispatched = results.filter((r) => r.dispatched).length;
    const deferred = results.filter((r) => r.deferred).length;
    const failed = results.length - dispatched - deferred;

    console.log(
      `Dispatcher complete: ${dispatched} dispatched, ${failed} failed, ${deferred} deferred`,
    );

    return new Response(
      JSON.stringify({
        success: true,
        message:
          `Dispatched ${dispatched} backup jobs (${failed} failed, ${deferred} deferred to catch-up)`,
        dispatched,
        failed,
        deferred,
        skipped,
        default_retention_days: DEFAULT_NIGHTLY_RETENTION_DAYS,
        stagger_window_ms: NIGHTLY_DISPATCH_STAGGER_WINDOW_MS,
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
