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
    const resendApiKey = Deno.env.get('RESEND_API_KEY');
    const supabase = createClient(supabaseUrl, supabaseServiceKey);

    console.log('Scheduled backup started');

    // Get all organizations with auto_backup_enabled
    const { data: allSettings, error: settingsError } = await supabase
      .from('settings')
      .select('organization_id, backup_email, backup_retention_days')
      .eq('auto_backup_enabled', true);

    if (settingsError) {
      console.error('Failed to fetch settings:', settingsError);
      throw new Error('Failed to fetch backup settings');
    }

    if (!allSettings?.length) {
      console.log('No organizations have auto-backup enabled');
      return new Response(
        JSON.stringify({ success: true, message: 'No orgs with auto-backup enabled', processed: 0 }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    console.log(`Processing ${allSettings.length} organizations`);

    const results: { orgId: string; success: boolean; error?: string }[] = [];

    for (const setting of allSettings) {
      const orgId = setting.organization_id;
      const backupEmail = setting.backup_email || 'tausifpatel728@gmail.com';
      const retentionDays = setting.backup_retention_days || 30;

      try {
        // Get org name
        const { data: org } = await supabase
          .from('organizations')
          .select('name')
          .eq('id', orgId)
          .single();
        const orgName = org?.name || 'Organization';

        // Create backup log
        const { data: backupLog, error: logError } = await supabase
          .from('backup_logs')
          .insert({
            organization_id: orgId,
            backup_type: 'automatic',
            status: 'in_progress',
          })
          .select()
          .single();

        if (logError) {
          console.error(`Failed to create backup log for ${orgId}:`, logError);
          results.push({ orgId, success: false, error: 'Failed to create log' });
          continue;
        }

        // Gather data
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
            const { data, error } = await supabase.from(table).select('*').eq('organization_id', orgId);
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
        const today = new Date().toISOString().split('T')[0];

        const backupContent = JSON.stringify({
          metadata: {
            organization_id: orgId,
            organization_name: orgName,
            backup_date: new Date().toISOString(),
            backup_type: 'automatic',
            tables_included: allTables,
            records_count: recordsCounts,
          },
          data: backupData,
        }, null, 2);

        const fileSize = new TextEncoder().encode(backupContent).length;
        const storagePath = `${orgId}/${today}.json`;
        const fileName = `${orgName.replace(/[^a-zA-Z0-9]/g, '_')}_backup_${today}.json`;

        // Upload to storage
        const { error: uploadError } = await supabase.storage
          .from('organization-backups')
          .upload(storagePath, backupContent, {
            contentType: 'application/json',
            upsert: true,
          });

        if (uploadError) {
          console.error(`Storage upload failed for ${orgId}:`, uploadError);
          await supabase.from('backup_logs').update({
            status: 'failed',
            error_message: `Storage upload failed: ${uploadError.message}`,
            completed_at: new Date().toISOString(),
          }).eq('id', backupLog.id);
          results.push({ orgId, success: false, error: uploadError.message });
          continue;
        }

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

        // Update last_auto_backup_at
        await supabase.from('settings').update({
          last_auto_backup_at: new Date().toISOString(),
        }).eq('organization_id', orgId);

        // Send email with backup file attached via Resend
        if (resendApiKey) {
          try {
            // Convert backup content to base64 for attachment
            const encoder = new TextEncoder();
            const uint8Array = encoder.encode(backupContent);
            let binaryStr = '';
            for (let i = 0; i < uint8Array.length; i++) {
              binaryStr += String.fromCharCode(uint8Array[i]);
            }
            const base64Content = btoa(binaryStr);

            const totalRecords = Object.values(recordsCounts).reduce((sum, count) => sum + count, 0);

            const emailResponse = await fetch('https://api.resend.com/emails', {
              method: 'POST',
              headers: {
                'Authorization': `Bearer ${resendApiKey}`,
                'Content-Type': 'application/json',
              },
              body: JSON.stringify({
                from: 'EzzyERP Backup <onboarding@resend.dev>',
                to: [backupEmail],
                subject: `Weekly Backup - ${orgName} (${today})`,
                html: `
                  <h2>Weekly Backup Report</h2>
                  <p><strong>Organization:</strong> ${orgName}</p>
                  <p><strong>Date:</strong> ${today}</p>
                  <p><strong>Total Records:</strong> ${totalRecords}</p>
                  <p><strong>File Size:</strong> ${(fileSize / 1024).toFixed(1)} KB</p>
                  <h3>Tables Included:</h3>
                  <ul>
                    ${Object.entries(recordsCounts)
                      .filter(([_, count]) => count > 0)
                      .map(([table, count]) => `<li>${table}: ${count} records</li>`)
                      .join('')}
                  </ul>
                  <p>The backup file is attached to this email.</p>
                  <p style="color: #666; font-size: 12px;">This is an automated backup from EzzyERP.</p>
                `,
                attachments: [
                  {
                    filename: fileName,
                    content: base64Content,
                    type: 'application/json',
                  }
                ],
              }),
            });

            if (!emailResponse.ok) {
              const emailError = await emailResponse.text();
              console.error(`Email failed for ${orgId}:`, emailError);
            } else {
              console.log(`Backup email sent to ${backupEmail} for ${orgName}`);
            }
          } catch (emailErr) {
            console.error(`Email send error for ${orgId}:`, emailErr);
          }
        } else {
          console.warn('RESEND_API_KEY not set, skipping email');
        }

        // Cleanup old backups
        const cutoffDate = new Date();
        cutoffDate.setDate(cutoffDate.getDate() - retentionDays);

        const { data: oldFiles } = await supabase.storage
          .from('organization-backups')
          .list(orgId);

        if (oldFiles?.length) {
          const filesToDelete = oldFiles
            .filter(f => {
              const dateStr = f.name.replace('.json', '');
              const fileDate = new Date(dateStr);
              return fileDate < cutoffDate;
            })
            .map(f => `${orgId}/${f.name}`);

          if (filesToDelete.length > 0) {
            await supabase.storage.from('organization-backups').remove(filesToDelete);
          }
        }

        await supabase.from('backup_logs')
          .delete()
          .eq('organization_id', orgId)
          .eq('backup_type', 'automatic')
          .lt('created_at', cutoffDate.toISOString());

        results.push({ orgId, success: true });
        console.log(`Backup completed for ${orgName}`);

      } catch (orgError: unknown) {
        const msg = orgError instanceof Error ? orgError.message : 'Unknown error';
        console.error(`Backup failed for org ${orgId}:`, msg);
        results.push({ orgId, success: false, error: msg });
      }
    }

    const successCount = results.filter(r => r.success).length;
    const failCount = results.filter(r => !r.success).length;

    return new Response(
      JSON.stringify({
        success: true,
        message: `Scheduled backup complete: ${successCount} succeeded, ${failCount} failed`,
        processed: results.length,
        results,
      }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );

  } catch (error: unknown) {
    console.error('Scheduled backup error:', error);
    const errorMessage = error instanceof Error ? error.message : 'Scheduled backup failed';
    return new Response(
      JSON.stringify({ success: false, error: errorMessage }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }
});
