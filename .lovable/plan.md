

# Allow Editing Paid Invoices via User Rights

## Overview

Currently, the Sales Invoice Dashboard locks invoices when `payment_status === 'completed'`, preventing edit and delete actions. You want to enable specific users (like the BCCS organization customer) to edit paid invoices temporarily.

The best approach is to add a new **Special Right** called "Edit Paid Invoices" that can be granted to specific users, giving admins granular control over who can modify fully paid invoices.

---

## Current Behavior

| Status | Edit Button | Delete Button |
|--------|-------------|---------------|
| Pending | Enabled | Enabled |
| Partial | Enabled | Enabled |
| Completed | Locked | Locked |

---

## Proposed Solution

Add a new special permission that administrators can toggle for specific users.

### New Permission

| ID | Name | Description |
|----|------|-------------|
| `edit_paid_invoices` | Edit Paid Invoices | Allow editing/deleting fully paid invoices |

---

## Implementation Steps

### 1. Add New Special Right to UserRights Page

**File:** `src/pages/UserRights.tsx`

Add to the `specialRights` array:
```text
{
  id: "edit_paid_invoices",
  name: "Edit Paid Invoices",
  description: "Allow editing and deleting fully paid invoices"
}
```

### 2. Update Sales Invoice Dashboard Logic

**File:** `src/pages/SalesInvoiceDashboard.tsx`

- Import and use `useUserPermissions` hook
- Check for `edit_paid_invoices` special permission
- Modify the lock condition to allow editing if user has the permission

**Current Logic (lines 1723-1743):**
```text
{columnSettings.modify && (
  invoice.payment_status === 'completed' ? (
    <Button disabled><Lock /></Button>
  ) : (
    <Button><Edit /></Button>
  )
)}
```

**New Logic:**
```text
{columnSettings.modify && (
  invoice.payment_status === 'completed' && !hasSpecialPermission('edit_paid_invoices') ? (
    <Button disabled><Lock /></Button>
  ) : (
    <Button><Edit /></Button>
  )
)}
```

---

## Files to Modify

| File | Change |
|------|--------|
| `src/pages/UserRights.tsx` | Add `edit_paid_invoices` to specialRights array |
| `src/pages/SalesInvoiceDashboard.tsx` | Import useUserPermissions and apply permission check |

---

## How Admins Will Use This

1. Go to **User Rights Management** page
2. Select the user (e.g., BCCS customer/staff member)
3. In **Special Rights** section, enable **"Edit Paid Invoices"**
4. Click **Save Permissions**

The user can now edit paid invoices. To revoke access later, simply uncheck the permission.

---

## Technical Details

### Permission Check Flow

```text
┌─────────────────────────────────────────────────────────┐
│                  Invoice Actions                         │
├─────────────────────────────────────────────────────────┤
│  Is payment_status === 'completed'?                      │
│      │                                                   │
│      ├── NO ──→ Show Edit/Delete buttons                │
│      │                                                   │
│      └── YES ──→ Check hasSpecialPermission             │
│                  ('edit_paid_invoices')                  │
│                      │                                   │
│                      ├── TRUE ──→ Show Edit/Delete       │
│                      │                                   │
│                      └── FALSE ──→ Show Lock icon        │
└─────────────────────────────────────────────────────────┘
```

### Admin Users

Admin users (`organizationRole === 'admin'`) automatically have full access (permissions return `null` which means all permissions are granted), so they can always edit paid invoices.

