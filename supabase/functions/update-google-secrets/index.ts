import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

interface SecretsRequest {
  clientId: string;
  clientSecret: string;
  refreshToken: string;
}

Deno.serve(async (req) => {
  // Handle CORS preflight requests
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    // Verify the user is authenticated
    const authHeader = req.headers.get('Authorization');
    if (!authHeader) {
      throw new Error('Missing authorization header');
    }

    const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
    const supabaseServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
    const supabaseAnonKey = Deno.env.get('SUPABASE_ANON_KEY')!;

    // Create client with user's JWT to verify authentication
    const supabaseClient = createClient(supabaseUrl, supabaseAnonKey, {
      global: { headers: { Authorization: authHeader } }
    });

    const { data: { user }, error: userError } = await supabaseClient.auth.getUser();
    if (userError || !user) {
      throw new Error('Unauthorized: Invalid user session');
    }

    // Check if user is admin or platform_admin
    const { data: roles } = await supabaseClient
      .from('user_roles')
      .select('role')
      .eq('user_id', user.id);

    const isAdmin = roles?.some(r => r.role === 'admin' || r.role === 'platform_admin');
    if (!isAdmin) {
      throw new Error('Unauthorized: Only admins can update Google credentials');
    }

    // Get request body
    const { clientId, clientSecret, refreshToken }: SecretsRequest = await req.json();

    if (!clientId || !clientSecret || !refreshToken) {
      throw new Error('Missing required credentials');
    }

    // Validate refresh token format (should start with 1//)
    if (!refreshToken.startsWith('1//')) {
      throw new Error('Invalid refresh token format. Refresh token should start with "1//"');
    }

    // Validate client ID format
    if (!clientId.includes('.apps.googleusercontent.com')) {
      throw new Error('Invalid client ID format. Should end with .apps.googleusercontent.com');
    }

    // Use service role client to update secrets in vault (if available)
    // For now, we'll store in a config table or just validate the format
    // Since Supabase doesn't allow runtime secret updates via Edge Functions,
    // we'll test the credentials and return success if they work
    
    console.log('Testing Google credentials...');
    
    // Test the credentials by attempting to get an access token
    const tokenResponse = await fetch('https://oauth2.googleapis.com/token', {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({
        client_id: clientId,
        client_secret: clientSecret,
        refresh_token: refreshToken,
        grant_type: 'refresh_token',
      }),
    });

    const tokenData = await tokenResponse.json();
    
    if (!tokenResponse.ok) {
      console.error('Token validation failed:', tokenData);
      throw new Error(`Invalid credentials: ${tokenData.error_description || tokenData.error || 'Unknown error'}`);
    }

    if (!tokenData.access_token) {
      throw new Error('Credentials test failed: No access token received');
    }

    console.log('Credentials validated successfully!');

    // Since we can't update Supabase secrets from an edge function,
    // inform the user that they need to update them manually or use a different approach
    return new Response(
      JSON.stringify({
        success: true,
        message: 'Credentials validated successfully! However, you need to update the secrets in Supabase Dashboard > Settings > Edge Functions > Secrets. Use these verified values:\n\nGOOGLE_CLIENT_ID: ' + clientId.substring(0, 20) + '...\nGOOGLE_CLIENT_SECRET: (your secret)\nGOOGLE_REFRESH_TOKEN: ' + refreshToken.substring(0, 15) + '...',
        validated: true
      }),
      {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        status: 200
      }
    );

  } catch (error: any) {
    console.error('Error updating secrets:', error);
    return new Response(
      JSON.stringify({ 
        success: false, 
        error: error.message || 'Failed to update credentials'
      }),
      {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        status: 400
      }
    );
  }
});