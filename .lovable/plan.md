

# Add Advances & Adjustments Tabs to Customer History Dialog

## Current State
The CustomerHistoryDialog has 6 tabs: Sales, Legacy, Payments, Returns, C/Notes, Refunds. It shows advance balance in the summary card but has no detail view for individual advance entries or balance adjustments.

## Plan

### 1. Add two new tabs to `src/components/CustomerHistoryDialog.tsx`

**New data queries:**
- **Advances query**: Fetch from `customer_advances` for this customer, ordered by `advance_date` desc. Fields: `advance_number`, `advance_date`, `amount`, `used_amount`, `status`, `payment_method`, `description`
- **Adjustments query**: Fetch from `customer_balance_adjustments` for this customer, ordered by `adjustment_date` desc. Fields: `adjustment_date`, `reason`, `previous_outstanding`, `new_outstanding`, `outstanding_difference`, `previous_advance`, `new_advance`, `advance_difference`

**Tab bar changes:**
- Expand from 6 to 8 columns: `sm:grid-cols-8`
- Add "Advances (N)" tab with `Wallet` icon
- Add "Adjustments (N)" tab with `Scale` icon (from lucide)

**Advances tab content:**
| Advance # | Date | Amount | Used | Unused | Method | Status |
Shows each advance with status badge (active=green, partially_used=orange, fully_used=secondary). "Unused" column = `amount - used_amount`.

**Adjustments tab content:**
| Date | Reason | Prev O/S | New O/S | Diff | Prev Adv | New Adv | Adv Diff |
Shows each balance adjustment entry with outstanding_difference colored (positive=red debit, negative=green credit) and advance_difference similarly colored.

### File changes
- **`src/components/CustomerHistoryDialog.tsx`** — Add 2 queries, 2 tabs, 2 tab content sections

