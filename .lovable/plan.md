

## Roll-wise Entry: Fix Amount Calculation & Default Qty

**Problem**: When roll-wise entry is enabled for MTR products in Purchase Invoice, the current logic sets `qty = roll.meters` (e.g., 79). The user wants:
- **Qty = 1** per roll (each roll is one piece)
- **Subtotal = meters × purchase price** (e.g., 79 MTR × ₹95 = ₹7,505)

The size field already stores the meter value correctly. The fix is simply changing qty to 1 while keeping the line_total as `meters × purPrice`.

### Changes

**File: `src/pages/PurchaseEntry.tsx`** (lines 2100-2118)

Update the roll entry row creation:
- Change `qty: roll.meters` → `qty: 1`
- Keep `line_total: roll.meters * purPrice - discAmount` (subtotal based on meters, not qty)

This means each roll row will show:
- Size: `79 MTR`
- Qty: `1`
- Pur. Rate: `₹95`
- Subtotal: `₹7,505` (79 × 95)

The qty=1 makes sense because each roll is one physical unit being purchased. The meter value in the size column describes the roll length, and the total is meters-based.

