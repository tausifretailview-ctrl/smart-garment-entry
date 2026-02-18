

## Phase 1: Refactor Accounts.tsx (3,518 lines to ~6 focused components)

### Problem
The `Accounts.tsx` file is a 3,518-line monolith containing 9 tabs, ~50 state variables, 3 mutations, and multiple data queries all in one component. This makes it extremely hard to maintain, debug, and extend.

### Refactoring Strategy

Extract each tab into its own component file, moving the relevant state, queries, and mutations with it. The parent `Accounts.tsx` will become a thin orchestrator (~300 lines) that only handles:
- Shared data (settings, organization context)
- Tab navigation and URL params
- Dashboard metric cards
- Dialog rendering for receipts

### New Component Files

| New File | Lines Extracted | Responsibility |
|----------|----------------|----------------|
| `src/components/accounts/CustomerPaymentTab.tsx` | ~600 lines | Customer search, invoice selection, payment form, receipt creation mutation, recent payments table with pagination, edit/delete |
| `src/components/accounts/SupplierPaymentTab.tsx` | ~420 lines | Supplier search, bill selection, payment form, recent supplier payments table, cheque print |
| `src/components/accounts/EmployeeSalaryTab.tsx` | ~120 lines | Employee selector, salary form, recent salary table |
| `src/components/accounts/ExpensesTab.tsx` | ~100 lines | Expense category, amount form, recent expenses table |
| `src/components/accounts/VoucherEntryTab.tsx` | ~35 lines | All voucher entries table view |
| `src/components/accounts/ReconciliationTab.tsx` | ~470 lines | Date/customer/status filters, summary cards, source breakdown, reconciliation table with export |
| `src/components/accounts/AccountsDashboardCards.tsx` | ~150 lines | Payment stats cards + dashboard metric cards |

### Shared Logic

A shared hook `src/hooks/useVoucherMutation.tsx` will encapsulate the core `createVoucher` mutation logic since both Customer and Supplier payment tabs use it. It will accept parameters for voucher type, reference info, and invoice/bill selections, and return the mutation + receipt data.

### What Stays in Accounts.tsx (~300 lines)

- Tab state management (URL params)
- Organization context
- Settings query (shared by receipt dialog)
- Receipt dialog rendering (shared across tabs)
- Edit payment dialog
- Layout structure with Tabs component
- Advance booking and balance adjustment dialogs

### Implementation Order

1. Create `AccountsDashboardCards.tsx` -- extract stat cards and metric cards
2. Create `useVoucherMutation.tsx` -- extract shared mutation logic
3. Create `CustomerPaymentTab.tsx` -- largest extraction, includes form + recent table + pagination
4. Create `SupplierPaymentTab.tsx` -- form + recent table + cheque print
5. Create `EmployeeSalaryTab.tsx` -- simple form + table
6. Create `ExpensesTab.tsx` -- simple form + table
7. Create `VoucherEntryTab.tsx` -- simple table
8. Create `ReconciliationTab.tsx` -- filters + cards + table + export
9. Slim down `Accounts.tsx` to orchestrator

### Technical Notes

- Each component receives `organizationId`, `settings`, and callback props (e.g., `onShowReceipt`) as needed
- Query keys remain the same to preserve cache invalidation across tabs
- The `resetForm` logic moves into each tab's local state
- The `createVoucher` mutation will be parameterized in the shared hook so each tab passes its own config
- No database changes needed -- this is purely a frontend refactor
- No user-facing behavior changes -- everything works exactly the same after refactoring

