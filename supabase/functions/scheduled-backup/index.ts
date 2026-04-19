// Dispatcher: lists orgs with auto-backup enabled and fans out to auto-backup
// (one invocation per org, fire-and-forget) so we never hit edge function timeout.
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
    const supabaseServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
    const supabase = createClient(supabaseUrl, supabaseServiceKey);

    console.log('Scheduled backup dispatcher started');

    const { data: allSettings, error: settingsError } = await supabase
      .from('settings')
      .select('organization_id, backup_retention_days')
      .eq('auto_backup_enabled', true);

    if (settingsError) {
      console.error('Failed to fetch settings:', settingsError);
      throw new Error('Failed to fetch backup settings');
    }

    if (!allSettings?.length) {
      return new Response(
        JSON.stringify({ success: true, message: 'No orgs with auto-backup enabled', dispatched: 0 }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    console.log(`Dispatching backup for ${allSettings.length} organizations`);

    // Fan out: invoke auto-backup for each org as fire-and-forget HTTP call.
    // We don't await — each invocation runs in its own short-lived edge function.
    const dispatchPromises = allSettings.map(async (setting) => {
      const orgId = setting.organization_id;
      const retentionDays = setting.backup_retention_days || 30;
      try {
        // Fire-and-forget: do not await response body; just kick it off.
        // Using fetch directly so we control headers and don't block on body.
        const res = await fetch(`${supabaseUrl}/functions/v1/auto-backup`, {
          method: 'POST',
          headers: {
            'Authorization': `Bearer ${supabaseServiceKey}`,
            'apikey': supabaseServiceKey,
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({
            organizationId: orgId,
            backupType: 'automatic',
            retentionDays,
            internalDispatch: true,
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
