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

    // Verify auth
    const authHeader = req.headers.get('Authorization');
    if (!authHeader) {
      throw new Error('Missing authorization header');
    }

    const userClient = createClient(supabaseUrl, Deno.env.get('SUPABASE_ANON_KEY')!, {
      global: { headers: { Authorization: authHeader } }
    });
    const { data: { user }, error: authError } = await userClient.auth.getUser();
    if (authError || !user) {
      throw new Error('Unauthorized');
    }

    const { organizationId, backupType = 'automatic' } = await req.json();
    if (!organizationId) throw new Error('Organization ID is required');

    // Verify membership
    const { data: membership } = await supabase
      .from('organization_members')
      .select('id')
      .eq('organization_id', organizationId)
      .eq('user_id', user.id)
      .single();
    if (!membership) throw new Error('User does not belong to this organization');

    // Get org name
    const { data: org } = await supabase
      .from('organizations')
      .select('name')
      .eq('id', organizationId)
      .single();
    const orgName = org?.name || 'Organization';

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

    // Gather data (same tables as existing backup)
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

    // Upload to storage bucket
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
      }).eq('id', backupLog.id);
      throw new Error(`Storage upload failed: ${uploadError.message}`);
    }

    const fileName = `${orgName.replace(/[^a-zA-Z0-9]/g, '_')}_backup_${today}.json`;

    // Update backup log
    await supabase.from('backup_logs').update({
      status: 'completed',
      file_name: fileName,
      storage_path: storagePath,
      file_size: fileSize,
      tables_included: allTables,
      records_count: recordsCounts,
      completed_at: new Date().toISOString(),
    }).eq('id', backupLog.id);

    // Update last_auto_backup_at in settings
    await supabase.from('settings').update({
      last_auto_backup_at: new Date().toISOString(),
    }).eq('organization_id', organizationId);

    // Cleanup old backups based on retention
    const { data: settings } = await supabase
      .from('settings')
      .select('backup_retention_days')
      .eq('organization_id', organizationId)
      .single();

    const retentionDays = (settings as any)?.backup_retention_days || 30;
    const cutoffDate = new Date();
    cutoffDate.setDate(cutoffDate.getDate() - retentionDays);

    // Delete old backup files from storage
    const { data: oldFiles } = await supabase.storage
      .from('organization-backups')
      .list(organizationId);

    if (oldFiles?.length) {
      const filesToDelete = oldFiles
        .filter(f => {
          const dateStr = f.name.replace('.json', '');
          const fileDate = new Date(dateStr);
          return fileDate < cutoffDate;
        })
        .map(f => `${organizationId}/${f.name}`);

      if (filesToDelete.length > 0) {
        await supabase.storage.from('organization-backups').remove(filesToDelete);
        console.log(`Cleaned up ${filesToDelete.length} old backup files`);
      }
    }

    // Delete old backup log entries
    await supabase.from('backup_logs')
      .delete()
      .eq('organization_id', organizationId)
      .eq('backup_type', 'automatic')
      .lt('created_at', cutoffDate.toISOString());

    return new Response(
      JSON.stringify({
        success: true,
        message: 'Cloud backup completed',
        file_name: fileName,
        storage_path: storagePath,
        file_size: fileSize,
        records_count: recordsCounts,
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
