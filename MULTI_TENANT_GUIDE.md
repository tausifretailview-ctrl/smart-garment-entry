# Multi-Tenant Architecture Guide

## Overview

Your Smart Inventory Management System now supports **multi-tenant architecture**, allowing you to serve unlimited clients from a single application instance. Each client gets their own isolated data space (organization) with customizable features and subscription tiers.

## Key Features

### 1. Organization Management
- **Multiple Organizations**: Each user can belong to multiple organizations
- **Data Isolation**: Complete data separation between organizations using Row-Level Security (RLS)
- **Organization Switching**: Users can easily switch between organizations they belong to
- **Role-Based Access**: Each user has a role (admin, manager, user) within each organization

### 2. Feature Flags
Enable or disable features per organization without deploying new code:

**Available Features:**
- `advanced_reports` - Advanced reporting capabilities (Professional tier)
- `loyalty_points` - Loyalty points system (Professional tier)
- `multi_location` - Multi-location support (Enterprise tier)
- `custom_branding` - Custom branding options (Basic tier)
- `api_access` - API access for integrations (Enterprise tier)
- `bulk_operations` - Bulk data operations (Professional tier)

### 3. Subscription Tiers
Four subscription tiers with different capabilities:
- **Free** - Basic features, limited functionality
- **Basic** - Custom branding + all free features
- **Professional** - Advanced reports, loyalty points, bulk operations + all basic features
- **Enterprise** - Multi-location, API access + all professional features

## How It Works

### For New Users

1. **Sign Up** → User creates an account
2. **Create Organization** → User is prompted to create their first organization
3. **Auto-Admin Role** → User becomes admin of their organization
4. **Start Using** → Access all features based on subscription tier

### For Existing Users

Users can:
- Switch between organizations using the organization selector in the header
- Join multiple organizations if invited by admins
- Have different roles in different organizations

### Data Isolation

All data is automatically scoped to the current organization:
- **Products** - Only see products from your organization
- **Sales** - Only see sales from your organization
- **Customers** - Only see customers from your organization
- **Reports** - All reports filter by organization automatically

This is enforced at the database level using Row-Level Security (RLS), making it impossible for users to access data from other organizations.

## Administration

### Organization Management (Admin Only)

Admins can access **Organization Management** from the sidebar to:

1. **Update Organization Details**
   - Change organization name
   - Update subscription tier

2. **Manage Features**
   - Enable/disable feature flags
   - Control which features are available to users

3. **Manage Members**
   - View all organization members
   - See member roles (admin, manager, user)

### Using Feature Gates in Code

To conditionally show/hide features based on subscription or flags:

```tsx
import { FeatureGate } from "@/components/FeatureGate";
import { useOrganization } from "@/contexts/OrganizationContext";

// Wrap feature in FeatureGate
<FeatureGate feature="advanced_reports" requiredTier="professional">
  <AdvancedReportsComponent />
</FeatureGate>

// Or check in code
const { hasFeature, canAccessFeature } = useOrganization();

if (hasFeature("loyalty_points")) {
  // Show loyalty points feature
}

if (canAccessFeature("api_access", "enterprise")) {
  // Show API access
}
```

## Cost Efficiency

### Single Project vs Multiple Projects

**Before (Separate Projects):**
- 10 clients = 10 Lovable Cloud instances
- Cost: $25-$270+ per month

**After (Multi-Tenant):**
- 10 clients = 1 Lovable Cloud instance
- Cost: $45-$120 per month
- **Savings: 50-70%**

### Scaling

The system automatically scales with your business:
- Add unlimited organizations
- Single codebase for all clients
- One deployment reaches all clients
- Centralized updates and bug fixes

## Customization Per Client

You have complete control over what each client sees:

### Option 1: Feature Flags
Enable/disable specific features per organization
```
Organization A: ["advanced_reports", "loyalty_points"]
Organization B: ["custom_branding"]
```

### Option 2: Subscription Tiers
Group features into packages
```
Organization A: Professional Tier
Organization B: Basic Tier
```

### Option 3: Custom Settings
Store organization-specific configuration
```json
{
  "organization_id": "abc-123",
  "settings": {
    "theme_color": "#FF5733",
    "logo_url": "https://...",
    "custom_field_1": "value"
  }
}
```

## Security

### Database Security
- **RLS Policies**: All tables have Row-Level Security enabled
- **Organization Scoping**: Queries automatically filter by organization_id
- **Security Definer Functions**: Helper functions run with elevated privileges to prevent recursion

### Authentication
- Standard email/password authentication
- Each user linked to organizations via `organization_members` table
- Roles stored separately in `user_roles` table

### Data Validation
- Organization IDs validated at database level
- Foreign key constraints ensure data integrity
- No cross-organization data leakage possible

## Migration from Single-Tenant

If you have existing data:

1. **Create Default Organization** for existing data
2. **Assign All Users** to the default organization as admins
3. **Update All Records** to link to the default organization
4. **Verify RLS** policies are working correctly

## Troubleshooting

### Users Can't See Data
- Check if user belongs to an organization
- Verify organization_id is set on all records
- Check RLS policies in backend

### Features Not Showing
- Verify feature flag is enabled in Organization Management
- Check if subscription tier supports the feature
- Ensure FeatureGate is used correctly

### Performance Issues
- Add indexes on organization_id columns
- Monitor query performance in backend
- Consider database instance upgrade if needed

## Next Steps

1. **Test Organization Creation**: Sign up as a new user and create an organization
2. **Enable Features**: Go to Organization Management and enable feature flags
3. **Update Queries**: Ensure all data queries include organization filtering
4. **Add Custom Features**: Use the feature flag system to add client-specific features

## Support

For issues or questions about the multi-tenant architecture:
1. Check this guide first
2. Review RLS policies in the backend
3. Test with different user roles
4. Verify organization membership
