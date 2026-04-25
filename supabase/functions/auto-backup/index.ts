import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

// Purge backup files in storage and backup_logs older than retentionDays for one org.
// Caps at 1000 files per run for safety. Returns counts.
async function purgeOldBackups(
  supabase: any,
  organizationId: string,
  retentionDays: number,
): Promise<{ files_deleted: number; logs_deleted: number }> {
  let filesDeleted = 0;
  let logsDeleted = 0;
  const cutoff = new Date(Date.now() - retentionDays * 24 * 60 * 60 * 1000);

  try {
    // List files in {orgId}/ folder (cap 1000)
    const { data: files, error: listErr } = await supabase.storage
      .from('organization-backups')
      .list(organizationId, { limit: 1000, sortBy: { column: 'created_at', order: 'asc' } });

    if (listErr) {
      console.error(`Purge list failed for ${organizationId}:`, listErr.message);
    } else if (files?.length) {
      const toDelete = files
        .filter(f => f.created_at && new Date(f.created_at) < cutoff)
        .map(f => `${organizationId}/${f.name}`);

      if (toDelete.length) {
        const { error: delErr } = await supabase.storage
          .from('organization-backups')
          .remove(toDelete);
        if (delErr) {
          console.error(`Purge delete failed for ${organizationId}:`, delErr.message);
        } else {
          filesDeleted = toDelete.length;
          console.log(`Purged ${filesDeleted} old backup files for org ${organizationId}`);
        }
      }
    }
  } catch (err) {
    console.error(`Purge storage error for ${organizationId}:`, err);
  }

  try {
    // Purge backup_logs via RPC helper (created in migration)
    const { data, error } = await supabase.rpc('purge_old_backup_logs' as any, {
      p_org_id: organizationId,
      p_days: retentionDays,
    } as any);
    if (error) {
      console.error(`Purge logs RPC failed for ${organizationId}:`, error.message);
    } else {
      logsDeleted = (data as number) || 0;
      if (logsDeleted > 0) console.log(`Purged ${logsDeleted} old backup_log rows for org ${organizationId}`);
    }
  } catch (err) {
    console.error(`Purge logs error for ${organizationId}:`, err);
  }

  return { files_deleted: filesDeleted, logs_deleted: logsDeleted };
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
    const supabaseServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
    const supabase = createClient(supabaseUrl, supabaseServiceKey);

    const body = await req.json();
    const { organizationId, backupType = 'automatic', retentionDays: bodyRetention, internalDispatch = false } = body;
    if (!organizationId) throw new Error('Organization ID is required');

    // Auth: either internal dispatcher (service role JWT) or end-user with org membership
    if (!internalDispatch) {
      const authHeader = req.headers.get('Authorization');
      if (!authHeader) throw new Error('Missing authorization header');

      const userClient = createClient(supabaseUrl, Deno.env.get('SUPABASE_ANON_KEY')!, {
        global: { headers: { Authorization: authHeader } }
      });
      const { data: { user }, error: authError } = await userClient.auth.getUser();
      if (authError || !user) throw new Error('Unauthorized');

      const { data: membership } = await supabase
        .from('organization_members')
        .select('id')
        .eq('organization_id', organizationId)
        .eq('user_id', user.id)
        .single();
      if (!membership) throw new Error('User does not belong to this organization');
    }

    // Resolve retention days (prefer body, else read from settings)
    let retentionDays = typeof bodyRetention === 'number' ? bodyRetention : null;
    if (retentionDays === null) {
      const { data: s } = await supabase
        .from('settings')
        .select('backup_retention_days')
        .eq('organization_id', organizationId)
        .single();
      retentionDays = (s as any)?.backup_retention_days || 30;
    }

    // Get org name
    const { data: org } = await supabase
      .from('organizations')
      .select('name')
      .eq('id', organizationId)
      .single();
    const orgName = (org as any)?.name || 'Organization';

    // Create backup log
    const { data: backupLog, error: logError } = await supabase
      .from('backup_logs')
      .insert({
        organization_id: organizationId,
        backup_type: backupType,
        status: 'in_progress',
      })
      .select()
      .single();
    if (logError) throw new Error('Failed to create backup log');

    console.log('Starting cloud backup for organization:', organizationId);

    const orgScopedTables = [
      'customers', 'suppliers', 'products', 'product_variants',
      'sales', 'sale_returns', 'purchase_bills', 'purchase_returns',
      'quotations', 'sale_orders', 'credit_notes', 'voucher_entries',
      'account_ledgers', 'employees', 'settings',
    ];

    const lineItemTables: Record<string, { parent: string; foreignKey: string }> = {
      'sale_items': { parent: 'sales', foreignKey: 'sale_id' },
      'sale_return_items': { parent: 'sale_returns', foreignKey: 'return_id' },
      'purchase_items': { parent: 'purchase_bills', foreignKey: 'bill_id' },
      'purchase_return_items': { parent: 'purchase_returns', foreignKey: 'return_id' },
      'quotation_items': { parent: 'quotations', foreignKey: 'quotation_id' },
      'sale_order_items': { parent: 'sale_orders', foreignKey: 'sale_order_id' },
    };

    const backupData: Record<string, unknown[]> = {};
    const recordsCounts: Record<string, number> = {};

    for (const table of orgScopedTables) {
      try {
        const { data, error } = await supabase.from(table).select('*').eq('organization_id', organizationId);
        backupData[table] = error ? [] : (data || []);
        recordsCounts[table] = backupData[table].length;
      } catch {
        backupData[table] = [];
        recordsCounts[table] = 0;
      }
    }

    for (const [table, config] of Object.entries(lineItemTables)) {
      const parentData = backupData[config.parent] as any[];
      if (!parentData?.length) {
        backupData[table] = [];
        recordsCounts[table] = 0;
        continue;
      }
      try {
        const parentIds = parentData.map(p => p.id);
        const { data, error } = await supabase.from(table).select('*').in(config.foreignKey, parentIds);
        backupData[table] = error ? [] : (data || []);
        recordsCounts[table] = backupData[table].length;
      } catch {
        backupData[table] = [];
        recordsCounts[table] = 0;
      }
    }

    const allTables = [...orgScopedTables, ...Object.keys(lineItemTables)];

    const backupContent = JSON.stringify({
      metadata: {
        organization_id: organizationId,
        organization_name: orgName,
        backup_date: new Date().toISOString(),
        backup_type: backupType,
        tables_included: allTables,
        records_count: recordsCounts,
      },
      data: backupData,
    }, null, 2);

    const fileSize = new TextEncoder().encode(backupContent).length;
    const today = new Date().toISOString().split('T')[0];
    const storagePath = `${organizationId}/${today}.json`;

    const { error: uploadError } = await supabase.storage
      .from('organization-backups')
      .upload(storagePath, backupContent, {
        contentType: 'application/json',
        upsert: true,
      });

    if (uploadError) {
      console.error('Storage upload failed:', uploadError);
      await supabase.from('backup_logs').update({
        status: 'failed',
        error_message: `Storage upload failed: ${uploadError.message}`,
        completed_at: new Date().toISOString(),
      }).eq('id', (backupLog as any).id);

      // Log failure for observability
      await supabase.from('app_error_logs').insert({
        organization_id: organizationId,
        operation: 'auto_backup',
        error_message: `Storage upload failed: ${uploadError.message}`,
      });

      throw new Error(`Storage upload failed: ${uploadError.message}`);
    }

    const fileName = `${orgName.replace(/[^a-zA-Z0-9]/g, '_')}_backup_${today}.json`;

    await supabase.from('backup_logs').update({
      status: 'completed',
      file_name: fileName,
      storage_path: storagePath,
      file_size: fileSize,
      tables_included: allTables,
      records_count: recordsCounts,
      completed_at: new Date().toISOString(),
    }).eq('id', (backupLog as any).id);

    await supabase.from('settings').update({
      last_auto_backup_at: new Date().toISOString(),
    }).eq('organization_id', organizationId);

    // Retention purge (per-org, honors backup_retention_days)
    const purgeResult = await purgeOldBackups(supabase, organizationId, retentionDays);

    return new Response(
      JSON.stringify({
        success: true,
        message: 'Cloud backup completed',
        file_name: fileName,
        storage_path: storagePath,
        file_size: fileSize,
        records_count: recordsCounts,
        retention_days: retentionDays,
        purged: purgeResult,
      }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );

  } catch (error: unknown) {
    console.error('Auto-backup error:', error);
    const errorMessage = error instanceof Error ? error.message : 'Backup failed';
    return new Response(
      JSON.stringify({ success: false, error: errorMessage }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }
});
