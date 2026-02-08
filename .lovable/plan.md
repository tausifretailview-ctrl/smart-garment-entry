
# Add Organization Type Selection to "Create New Organization" Dialog

## Overview

When creating a new organization in the Platform Admin dashboard, you need the ability to select whether it's a **Business** (default ERP) or **School** (School ERP module). Currently, this option is missing from the creation dialog.

---

## What Will Be Changed

### 1. Update Database Function

Modify the `platform_create_organization` RPC function to accept a new `p_organization_type` parameter:

```sql
CREATE OR REPLACE FUNCTION public.platform_create_organization(
  p_name text,
  p_enabled_features text[] DEFAULT ARRAY[]::text[],
  p_admin_email text DEFAULT NULL::text,
  p_organization_type text DEFAULT 'business'  -- NEW PARAMETER
)
```

### 2. Update the "Create New Organization" Dialog

Add a radio group or select dropdown before the "Enabled Features" section:

```text
+----------------------------------+
| Create New Organization          |
| -------------------------------- |
| Organization Name *              |
| [                             ]  |
|                                  |
| Admin Email (optional)           |
| [                             ]  |
|                                  |
| Organization Type *              |  <-- NEW
| ○ Business ERP (default)         |  <-- NEW
| ○ School ERP                     |  <-- NEW
|                                  |
| Enabled Features                 |
| [ ] Advanced Reports             |
| ...                              |
+----------------------------------+
```

### 3. Update the Organization Card Display

Show a badge indicating whether the organization is "Business" or "School" type in the organization cards list.

---

## Files to Modify

| File | Change |
|------|--------|
| `supabase/migrations/xxx_add_org_type_to_create.sql` | Update RPC function with `p_organization_type` parameter |
| `src/pages/PlatformAdmin.tsx` | Add state for organization type, add radio group UI, update mutation call |

---

## Implementation Details

### Frontend Changes (PlatformAdmin.tsx)

1. **Add new state variable:**
```typescript
const [orgType, setOrgType] = useState<"business" | "school">("business");
```

2. **Add Organization Type selector in dialog:**
```tsx
<div className="space-y-2">
  <Label>Organization Type *</Label>
  <RadioGroup value={orgType} onValueChange={setOrgType}>
    <div className="flex items-center space-x-2">
      <RadioGroupItem value="business" id="type-business" />
      <Label htmlFor="type-business">Business ERP</Label>
    </div>
    <div className="flex items-center space-x-2">
      <RadioGroupItem value="school" id="type-school" />
      <Label htmlFor="type-school">School ERP</Label>
    </div>
  </RadioGroup>
</div>
```

3. **Update mutation to pass type:**
```typescript
const { data, error } = await supabase.rpc("platform_create_organization", {
  p_name: orgName,
  p_enabled_features: selectedFeatures,
  p_admin_email: adminEmail || null,
  p_organization_type: orgType,  // NEW
});
```

4. **Show type badge on org cards:**
```tsx
<Badge variant={org.organization_type === "school" ? "default" : "secondary"}>
  {org.organization_type === "school" ? "🎓 School" : "Business"}
</Badge>
```

### Database Changes

Update the RPC function to insert the organization type:

```sql
INSERT INTO public.organizations (
  name, slug, subscription_tier, 
  enabled_features, settings, 
  organization_number, organization_type  -- ADD THIS
)
VALUES (
  p_name, v_slug, 'professional', 
  array_to_json(p_enabled_features)::jsonb, '{}'::jsonb, 
  v_next_org_number, p_organization_type  -- ADD THIS
)
```

---

## Result

After this change:
- Platform admins can select "Business ERP" or "School ERP" when creating organizations
- School organizations will automatically show the School module sidebar items
- Business organizations continue to work as before
- The organization cards will display a badge indicating the type
