
# Fix Field Sales App Permanent Routing

## Problem

Users with Field Sales access rights are being redirected to the main mobile app dashboard instead of the Field Sales salesman interface after login. The issue is:

1. After login, all users are redirected to `/:orgSlug` (main dashboard)
2. The Field Sales PWA context (`?app=fieldsales`) is lost during authentication flow
3. No check is made to see if the user has Field Sales access after login

**Current flow:**
```
User logs in → Redirects to main dashboard → User sees POS, Purchase, Stock buttons (wrong!)
```

**Expected flow:**
```
User with field_sales_access logs in → Redirects to salesman dashboard → User sees Field Sales interface (correct!)
```

## Solution

Modify the login flow to check if the user has Field Sales access after authentication, and automatically redirect them to the salesman interface.

## Technical Changes

### 1. Update OrgAuth.tsx - Post-Login Field Sales Check

After successful authentication and membership verification, add a query to check if the user has `field_sales_access = true` in their employee record:

**Location:** `src/pages/OrgAuth.tsx` (around line 224-229)

**Logic to add:**
```text
After verifying membership:
1. Query employees table for user_id + organization_id + field_sales_access = true
2. If employee has field_sales_access:
   - Set sessionStorage 'fieldSalesPWA' = 'true' (for persistent context)
   - Redirect to /${organization.slug}/salesman instead of /${organization.slug}
3. Otherwise redirect to main dashboard as normal
```

### 2. No Changes Needed to Other Files

The existing infrastructure already supports this:
- `SalesmanLayout.tsx` already checks `useFieldSalesAccess()` for access control
- `RootRedirect` already respects `fieldSalesPWA` sessionStorage flag
- `ProtectedRoute` already shows orange spinner when in Field Sales context

## Files to Modify

| File | Change |
|------|--------|
| `src/pages/OrgAuth.tsx` | Add field_sales_access check after login, redirect to salesman dashboard if enabled |

## Implementation Details

**New code block in OrgAuth.tsx handleSignIn function:**
```typescript
// After membership check (line ~223), add:
// Check if user has field sales access - if so, redirect to salesman dashboard
const { data: fieldSalesEmployee } = await supabase
  .from("employees")
  .select("id")
  .eq("organization_id", organization.id)
  .eq("user_id", authData.user.id)
  .eq("field_sales_access", true)
  .is("deleted_at", null)
  .maybeSingle();

// Store in both localStorage and sessionStorage for PWA resilience
localStorage.setItem("selectedOrgSlug", organization.slug);
sessionStorage.setItem("selectedOrgSlug", organization.slug);

if (fieldSalesEmployee) {
  // Set Field Sales PWA context flag
  sessionStorage.setItem('fieldSalesPWA', 'true');
  toast.success(`Welcome to Field Sales, ${organization.name}!`);
  navigate(`/${organization.slug}/salesman`);
} else {
  toast.success(`Welcome to ${organization.name}!`);
  navigate(`/${organization.slug}`);
}
```

## User Experience After Fix

**Before:**
- Field Sales user logs in → Sees main mobile dashboard with POS, Purchase, Stock
- User confused, has to manually navigate to salesman section

**After:**
- Field Sales user logs in → Automatically goes to orange-themed Field Sales app
- User sees Home, Customers, New Order, My Orders (correct interface!)
- The Field Sales context persists even after app restart

## Alternative: Separate Login URL (Future Enhancement)

If needed later, we could also create a dedicated Field Sales login URL like `/:orgSlug/field-sales-login` that automatically sets the context. But for now, the automatic detection approach is simpler and works for existing users.
