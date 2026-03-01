import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.80.0'

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

interface AddExistingUserRequest {
  email: string
  role: 'admin' | 'manager' | 'user'
  organizationId: string
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders })
  }

  try {
    const supabaseUrl = Deno.env.get('SUPABASE_URL') ?? ''
    const supabaseServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? ''
    
    const supabaseAdmin = createClient(
      supabaseUrl,
      supabaseServiceKey,
      {
        auth: {
          autoRefreshToken: false,
          persistSession: false
        }
      }
    )

    const authHeader = req.headers.get('Authorization')
    if (!authHeader) {
      return new Response(
        JSON.stringify({ error: 'No authorization header' }),
        { status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      )
    }

    const token = authHeader.replace('Bearer ', '')
    
    // Create a client with the user's token to verify their identity
    const supabaseUser = createClient(supabaseUrl, Deno.env.get('SUPABASE_ANON_KEY') ?? '', {
      global: {
        headers: { Authorization: `Bearer ${token}` }
      }
    })
    
    const { data: { user: requestingUser }, error: authError } = await supabaseUser.auth.getUser()
    
    if (authError || !requestingUser) {
      console.error('Auth error:', authError)
      return new Response(
        JSON.stringify({ error: 'Unauthorized' }),
        { status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      )
    }
    const { email, role, organizationId }: AddExistingUserRequest = await req.json()

    // Input validation
    const uuidRegex = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/
    const validRoles = ['admin', 'manager', 'user']

    if (!email || !emailRegex.test(email) || email.length > 255) {
      return new Response(
        JSON.stringify({ error: 'Valid email address is required' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      )
    }
    if (!role || !validRoles.includes(role)) {
      return new Response(
        JSON.stringify({ error: 'Valid role is required (admin, manager, or user)' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      )
    }
    if (!organizationId || !uuidRegex.test(organizationId)) {
      return new Response(
        JSON.stringify({ error: 'Valid organizationId is required' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      )
    }

    // Check if user is platform admin or organization admin
    const { data: isPlatformAdmin } = await supabaseAdmin
      .from('user_roles')
      .select('role')
      .eq('user_id', requestingUser.id)
      .eq('role', 'platform_admin')
      .single()

    if (!isPlatformAdmin) {
      // If not platform admin, verify they're an organization admin
      const { data: membership, error: membershipError } = await supabaseAdmin
        .from('organization_members')
        .select('role')
        .eq('organization_id', organizationId)
        .eq('user_id', requestingUser.id)
        .single()

      if (membershipError || !membership || membership.role !== 'admin') {
        return new Response(
          JSON.stringify({ error: 'Only platform admins or organization admins can add users' }),
          { status: 403, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        )
      }
    }

    // Find user by email using pagination to handle large user bases
    console.log('Looking for user with email:', email)
    
    let existingUser = null
    let page = 1
    const perPage = 1000
    
    while (!existingUser) {
      const { data: { users }, error: getUserError } = await supabaseAdmin.auth.admin.listUsers({
        page,
        perPage
      })
      
      if (getUserError) {
        console.error('Error fetching users:', getUserError)
        return new Response(
          JSON.stringify({ error: 'Failed to fetch users from database' }),
          { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        )
      }

      existingUser = users.find(u => u.email?.toLowerCase() === email.toLowerCase())
      
      // If no more users to fetch, break
      if (users.length < perPage) {
        break
      }
      page++
    }
    
    if (!existingUser) {
      console.error('User not found with email:', email)
      return new Response(
        JSON.stringify({ 
          error: `User "${email}" not found. Please use "Create User" button first to create the account.`
        }),
        { status: 404, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      )
    }

    console.log('Found user:', existingUser.id)

    // Check if user is already in organization
    const { data: existingMember } = await supabaseAdmin
      .from('organization_members')
      .select('*')
      .eq('organization_id', organizationId)
      .eq('user_id', existingUser.id)
      .single()

    if (existingMember) {
      return new Response(
        JSON.stringify({ error: 'User is already a member of this organization' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      )
    }

    // Add user to organization
    console.log('Adding user to organization:', organizationId)
    const { error: orgMemberError } = await supabaseAdmin
      .from('organization_members')
      .insert({
        organization_id: organizationId,
        user_id: existingUser.id,
        role: role
      })

    if (orgMemberError) {
      console.error('Error adding user to organization:', orgMemberError)
      throw new Error(`Failed to add user to organization: ${orgMemberError.message}`)
    }

    console.log('User added to organization successfully')

    // Ensure role exists in user_roles
    const { data: existingRole } = await supabaseAdmin
      .from('user_roles')
      .select('*')
      .eq('user_id', existingUser.id)
      .eq('role', role)
      .single()

    if (!existingRole) {
      console.log('Adding role to user_roles')
      const { error: roleError } = await supabaseAdmin
        .from('user_roles')
        .insert({
          user_id: existingUser.id,
          role: role
        })
      
      if (roleError) {
        console.error('Error adding role:', roleError)
      }
    }

    console.log('Logging audit trail')
    // Log audit trail
    await supabaseAdmin.rpc('log_audit', {
      p_action: 'USER_ADDED_TO_ORG',
      p_entity_type: 'organization_member',
      p_entity_id: existingUser.id,
      p_new_values: {
        email: email,
        role: role,
        organization_id: organizationId
      },
      p_metadata: {
        added_by: requestingUser.id
      }
    })

    console.log('User assignment completed successfully')

    return new Response(
      JSON.stringify({ 
        success: true, 
        user: {
          id: existingUser.id,
          email: email,
          role: role
        }
      }),
      { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    )

  } catch (error) {
    console.error('Error in add-existing-user function:', error)
    const errorMessage = error instanceof Error ? error.message : 'An unknown error occurred'
    return new Response(
      JSON.stringify({ error: errorMessage }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    )
  }
})