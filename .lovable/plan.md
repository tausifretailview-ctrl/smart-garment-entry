

# Fix: Field Sales "Access Denied" on Mobile Data

## Problem
The Field Sales app shows "Access Denied" when using mobile data (slower connections), but works fine on WiFi. This is a **race condition** between the organization context loading and the field sales access check.

## Root Cause
The `useFieldSalesAccess` hook depends on `currentOrganization?.id` from the OrganizationContext. On slower connections:
1. The organization data takes longer to fetch
2. While it's loading, `currentOrganization` is `null`
3. This causes the access query to be **disabled** (`enabled: false`)
4. TanStack Query v5 returns `isLoading: false` when disabled (the query simply hasn't started)
5. The SalesmanLayout sees `isLoading=false` + `hasAccess=false` and immediately shows **"Access Denied"**

On WiFi, the organization loads fast enough that by the time the component renders, everything is ready.

## Solution
Update `useFieldSalesAccess` to also expose the organization loading state, so the SalesmanLayout knows to keep showing the loading spinner while the organization context is still loading.

## Technical Changes

### 1. File: `src/hooks/useFieldSalesAccess.tsx`
- Import `useOrganization`'s `loading` state
- Include org loading in the returned `isLoading` value
- If the organization context is still loading, treat the whole hook as "still loading"

```typescript
// Add org loading state
const { currentOrganization, loading: orgLoading } = useOrganization();

// Return combined loading state
return {
  hasAccess: !!data,
  employeeName: data?.employee_name || null,
  isLoading: isLoading || orgLoading,
};
```

This single change ensures:
- On slow mobile data, the spinner continues showing while the org context loads
- Once the org context resolves, the access query fires and resolves normally
- The 8-second safety timeout in SalesmanLayout still applies as a fallback
- No changes needed to the layout or any other component
