import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

interface BackupRequest {
  organizationId: string;
  backupType: 'manual' | 'automatic';
}

async function getAccessToken(): Promise<string> {
  const clientId = Deno.env.get('GOOGLE_CLIENT_ID');
  const clientSecret = Deno.env.get('GOOGLE_CLIENT_SECRET');
  const refreshToken = Deno.env.get('GOOGLE_REFRESH_TOKEN');

  if (!clientId || !clientSecret || !refreshToken) {
    throw new Error('Google API credentials not configured');
  }

  const response = await fetch('https://oauth2.googleapis.com/token', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      client_id: clientId,
      client_secret: clientSecret,
      refresh_token: refreshToken,
      grant_type: 'refresh_token',
    }),
  });

  if (!response.ok) {
    const error = await response.text();
    console.error('Token refresh failed:', error);
    throw new Error('Failed to refresh Google access token');
  }

  const data = await response.json();
  return data.access_token;
}

async function uploadToGoogleDrive(accessToken: string, fileName: string, content: string): Promise<{ id: string; webViewLink: string }> {
  const metadata = {
    name: fileName,
    mimeType: 'application/json',
  };

  const boundary = '-------314159265358979323846';
  const delimiter = `\r\n--${boundary}\r\n`;
  const closeDelimiter = `\r\n--${boundary}--`;

  const body = 
    delimiter +
    'Content-Type: application/json; charset=UTF-8\r\n\r\n' +
    JSON.stringify(metadata) +
    delimiter +
    'Content-Type: application/json\r\n\r\n' +
    content +
    closeDelimiter;

  const uploadResponse = await fetch(
    'https://www.googleapis.com/upload/drive/v3/files?uploadType=multipart&fields=id,webViewLink',
    {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${accessToken}`,
        'Content-Type': `multipart/related; boundary=${boundary}`,
      },
      body,
    }
  );

  if (!uploadResponse.ok) {
    const error = await uploadResponse.text();
    console.error('Upload failed:', error);
    throw new Error('Failed to upload to Google Drive');
  }

  return await uploadResponse.json();
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
    const supabaseServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
    const supabase = createClient(supabaseUrl, supabaseServiceKey);

    const authHeader = req.headers.get('Authorization');
    if (!authHeader) {
      throw new Error('Missing authorization header');
    }

    // Verify user token
    const userClient = createClient(supabaseUrl, Deno.env.get('SUPABASE_ANON_KEY')!, {
      global: { headers: { Authorization: authHeader } }
    });
    const { data: { user }, error: authError } = await userClient.auth.getUser();
    if (authError || !user) {
      throw new Error('Unauthorized');
    }

    const { organizationId, backupType = 'manual' } = await req.json() as BackupRequest;

    if (!organizationId) {
      throw new Error('Organization ID is required');
    }

    // Verify user belongs to organization
    const { data: membership } = await supabase
      .from('organization_members')
      .select('id')
      .eq('organization_id', organizationId)
      .eq('user_id', user.id)
      .single();

    if (!membership) {
      throw new Error('User does not belong to this organization');
    }

    // Get organization name
    const { data: org } = await supabase
      .from('organizations')
      .select('name')
      .eq('id', organizationId)
      .single();

    const orgName = org?.name || 'Organization';

    // Create backup log entry
    const { data: backupLog, error: logError } = await supabase
      .from('backup_logs')
      .insert({
        organization_id: organizationId,
        backup_type: backupType,
        status: 'in_progress',
      })
      .select()
      .single();

    if (logError) {
      console.error('Failed to create backup log:', logError);
      throw new Error('Failed to create backup log');
    }

    console.log('Starting backup for organization:', organizationId);

    // Tables with organization_id column
    const orgScopedTables = [
      'customers',
      'suppliers',
      'products',
      'product_variants',
      'sales',
      'sale_returns',
      'purchase_bills',
      'purchase_returns',
      'quotations',
      'sale_orders',
      'credit_notes',
      'voucher_entries',
      'account_ledgers',
      'employees',
      'settings',
    ];

    // Line item tables that need to be fetched via parent relationship
    const lineItemTables = {
      'sale_items': { parent: 'sales', foreignKey: 'sale_id' },
      'sale_return_items': { parent: 'sale_returns', foreignKey: 'return_id' },
      'purchase_items': { parent: 'purchase_bills', foreignKey: 'bill_id' },
      'purchase_return_items': { parent: 'purchase_returns', foreignKey: 'return_id' },
      'quotation_items': { parent: 'quotations', foreignKey: 'quotation_id' },
      'sale_order_items': { parent: 'sale_orders', foreignKey: 'sale_order_id' },
    };

    const backupData: Record<string, unknown[]> = {};
    const recordsCounts: Record<string, number> = {};

    // Fetch organization-scoped tables
    for (const table of orgScopedTables) {
      try {
        const { data, error } = await supabase
          .from(table)
          .select('*')
          .eq('organization_id', organizationId);

        if (error) {
          console.warn(`Failed to fetch ${table}:`, error.message);
          backupData[table] = [];
          recordsCounts[table] = 0;
        } else {
          backupData[table] = data || [];
          recordsCounts[table] = data?.length || 0;
        }
      } catch (err) {
        console.warn(`Error fetching ${table}:`, err);
        backupData[table] = [];
        recordsCounts[table] = 0;
      }
    }

    // Fetch line item tables via parent IDs
    for (const [table, config] of Object.entries(lineItemTables)) {
      try {
        const parentData = backupData[config.parent] as any[];
        if (!parentData || parentData.length === 0) {
          backupData[table] = [];
          recordsCounts[table] = 0;
          continue;
        }

        const parentIds = parentData.map(p => p.id);
        const { data, error } = await supabase
          .from(table)
          .select('*')
          .in(config.foreignKey, parentIds);

        if (error) {
          console.warn(`Failed to fetch ${table}:`, error.message);
          backupData[table] = [];
          recordsCounts[table] = 0;
        } else {
          backupData[table] = data || [];
          recordsCounts[table] = data?.length || 0;
        }
      } catch (err) {
        console.warn(`Error fetching ${table}:`, err);
        backupData[table] = [];
        recordsCounts[table] = 0;
      }
    }

    const allTables = [...orgScopedTables, ...Object.keys(lineItemTables)];

    // Create backup JSON
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
    const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
    const fileName = `${orgName.replace(/[^a-zA-Z0-9]/g, '_')}_backup_${timestamp}.json`;

    console.log('Uploading to Google Drive...');

    // Get access token and upload
    let accessToken: string;
    try {
      accessToken = await getAccessToken();
    } catch (tokenError) {
      console.error('Failed to get Google access token:', tokenError);
      
      // Update backup log with failure
      await supabase
        .from('backup_logs')
        .update({
          status: 'failed',
          error_message: 'Google Drive authentication failed. Please verify your API credentials (Client ID, Client Secret, and Refresh Token) are correct.',
          completed_at: new Date().toISOString(),
        })
        .eq('id', backupLog.id);

      throw new Error('Google Drive authentication failed. Please check your credentials in Settings.');
    }

    const { id: driveFileId, webViewLink } = await uploadToGoogleDrive(accessToken, fileName, backupContent);

    console.log('Upload successful. File ID:', driveFileId);

    // Update backup log with success
    await supabase
      .from('backup_logs')
      .update({
        status: 'completed',
        file_name: fileName,
        drive_file_id: driveFileId,
        drive_file_link: webViewLink,
        file_size: fileSize,
        tables_included: allTables,
        records_count: recordsCounts,
        completed_at: new Date().toISOString(),
      })
      .eq('id', backupLog.id);

    return new Response(
      JSON.stringify({
        success: true,
        message: 'Backup completed successfully',
        file_name: fileName,
        drive_file_link: webViewLink,
        file_size: fileSize,
        records_count: recordsCounts,
      }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );

  } catch (error: unknown) {
    console.error('Backup error:', error);
    const errorMessage = error instanceof Error ? error.message : 'Backup failed';
    
    return new Response(
      JSON.stringify({
        success: false,
        error: errorMessage,
      }),
      { 
        status: 500,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      }
    );
  }
});
