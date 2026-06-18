
## Goal

Add a **user-scoped restriction**: only the user who created a POS invoice / purchase bill / payment entry may **Modify** or **Delete** it. Other users see the row but the Edit / Delete buttons are disabled with a tooltip ("Only <creator> can modify this entry"). Admin / Owner role bypasses the restriction.

This closes the root cause of the "POS bills disappearing in multi-user setup" issue documented for Mulund Mobility — even with the destructive-edit confirm dialog already shipped, the right fix is to prevent the wrong user from opening another user's bill at all.

## Your hypothesis about POS auto-loading the last saved invoice

Verified — **it does not happen.** The POS cart (`pos_cart_${orgId}` in `sessionStorage`) only stores the *in-progress* cart for the current tab; it is cleared after a successful save. POS edit-mode is only entered when a user explicitly clicks the **pencil / Modify** button on a row in the POS Dashboard, which calls `handleEditSale(sale.id)` and navigates with that sale id. So the bug is never "POS opened last invoice automatically" — it is always "user clicked Modify on a stale row that belonged to another terminal."

The fix below targets exactly that click.

## Scope

Three modules, same pattern:

| Module | Dashboard file | Edit handler | Delete handler | DB column |
| --- | --- | --- | --- | --- |
| POS / Invoice sales | `src/pages/POSDashboard.tsx`, `src/pages/SalesInvoiceDashboard.tsx` | `handleEditSale` | `handleDeleteSale` | `sales.created_by` |
| Purchase bills | `src/pages/PurchaseBillDashboard.tsx` | row Edit click → `/purchase/edit/:id` | `handleDeleteClick` / `handleDeleteConfirm` | `purchase_bills.created_by` |
| Payments | accounts payment dialogs (entry under `voucher_entries`) | `useAccountsPaymentDialogs` open-for-edit | delete in same hook | `voucher_entries.created_by` |

(Sale returns, delivery challans, quotations, sale orders are out of scope for this pass — call them out in the closing message so the user can decide if they want a follow-up.)

## Implementation

### 1. Single source of truth for the rule

New helper `src/lib/entryOwnership.ts`:

```ts
export function canModifyEntry(opts: {
  currentUserId: string | undefined;
  createdBy: string | null | undefined;
  isOwnerOrAdmin: boolean;
}): { allowed: boolean; reason?: string };
```

Returns `allowed = true` when `isOwnerOrAdmin` OR `createdBy === currentUserId` OR `createdBy` is null (legacy rows with no creator are left editable to avoid breaking historical data — flagged in the message back to the user).

### 2. Resolve "is owner/admin" once per session

Reuse `useUserRoles()` (already in the project) to detect `owner` / `admin`. Resolve creator's display name via the existing `useOrganizationMembers` / user map already used on dashboards (no extra round-trip).

### 3. Wire the helper into the three dashboards (frontend guard)

For each Edit / Delete button on a row:

- Compute `const { allowed, reason } = canModifyEntry({...})`.
- If not allowed → render the button **disabled** with a tooltip "Only <Creator Name> or an admin can modify this entry".
- Mirror the same check inside the click handler (`handleEditSale`, `handleDeleteSale`, purchase delete, payment edit/delete) so even a programmatic call is rejected with a toast.

### 4. Backend enforcement (defence-in-depth)

Tighten the RLS UPDATE / DELETE policies on the three tables so the database rejects the same operation even if the UI is bypassed:

- `sales` — UPDATE / DELETE allowed only when `created_by = auth.uid()` OR caller has `owner` / `admin` role via the existing `has_role(...)` security-definer function. SELECT and INSERT policies untouched. Soft-delete writes (`deleted_at`) follow the same UPDATE rule.
- `purchase_bills` — same pattern.
- `voucher_entries` — same pattern.

This is a single migration; existing policies are dropped and recreated. SELECT is unchanged so dashboards keep showing every row to every user.

### 5. Show creator name on the row (small UX add)

The three dashboards already fetch user maps; surface a small "by <creator first name>" label on each row so users see ownership at a glance, not only when they hover a disabled button.

### 6. Audit doc update

Append a "Permanent fix shipped" section to `docs/mulund-multi-user-pos-audit-2026-06-18.md` describing the new rule and pointing to the helper / RLS change.

## Out of scope (call out, do not build now)

- Sale returns, delivery challans, quotations, sale orders, school fee receipts — same pattern can be applied later if the user confirms.
- A configurable "Edit others' bills" right in the User Rights screen — could be added next; for now Owner / Admin is the only escape hatch, matching Tally / Vyapar default.

## Files touched

- New: `src/lib/entryOwnership.ts`
- Edit: `src/pages/POSDashboard.tsx`, `src/pages/SalesInvoiceDashboard.tsx`, `src/pages/PurchaseBillDashboard.tsx`, `src/hooks/useAccountsPaymentDialogs.ts`
- Edit: `docs/mulund-multi-user-pos-audit-2026-06-18.md`
- One Supabase migration: tighten UPDATE / DELETE RLS on `sales`, `purchase_bills`, `voucher_entries`

No data migration needed. Legacy rows with `created_by IS NULL` remain editable by anyone (Owner / Admin can always edit them) so old data is not locked out.
