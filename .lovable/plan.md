

## Add Inline Calculator to Price Input Fields

### Overview
Create a reusable `CalculatorInput` component that wraps price inputs, allowing users to type math expressions (e.g., `610+10%`, `500*2`) and get auto-calculated results on Tab/Enter/blur. Apply it to all price fields in Product Entry, Purchase Entry, and Quick Add Product.

### New File: `src/components/ui/calculator-input.tsx`

A self-contained component with:
- **Expression detection**: Checks if input contains operators (`+`, `-`, `*`, `/`, `%`) beyond a leading negative sign
- **Evaluation engine**: Safe left-to-right tokenizer supporting `X+Y%` (percentage of running total), plain arithmetic, and chained expressions — no `eval()`
- **Live preview tooltip**: Blue-tinted badge below the input showing `= 475.00` in real-time as user types
- **Visual indicator**: Blue left border when expression mode is active
- **Keyboard handling**: Tab calculates + moves to next field, Enter calculates + stays, Escape reverts
- **Props**: `value`, `onChange(number)`, `placeholder`, `className`, `disabled`, `id`, `onKeyDown` (passthrough)
- Input uses `type="text"` with `inputMode="decimal"` for mobile numeric keyboard while allowing operators

### Changes to `src/pages/ProductEntry.tsx` (3 spots)

1. **Purchase Price** (line ~2131): Replace `<Input type="number">` with `<CalculatorInput>`. On calculate, apply markup logic to update sale price (existing behavior preserved).

2. **Sale Price** (line ~2180): Replace with `<CalculatorInput>`. On calculate, back-calculate markup % (existing behavior preserved).

3. **MRP** (line ~2208): Replace with `<CalculatorInput>`.

The existing `onChange` handlers stay the same — `CalculatorInput` calls `onChange(calculatedNumber)` with the final numeric result, so markup recalculation continues working identically.

### Changes to `src/pages/PurchaseEntry.tsx` (3 spots)

1. **Pur.Rate column** (line ~3016): Replace `<Input type="number">` with `<CalculatorInput>`, calling `updateLineItem(temp_id, "pur_price", value)`.

2. **Sale.Rate column** (line ~3033): Same pattern for sale_price.

3. **MRP column** (line ~3051): Same pattern for mrp.

4. **Mobile pur_price input** (line ~2545): Replace with `<CalculatorInput>`.

### Changes to `src/components/mobile/QuickAddProductDialog.tsx` (2 spots)

- Purchase Price and Sale Price inputs: Replace with `<CalculatorInput>`.

### Scope
- 1 new file (~120 lines)
- 3 existing files modified (import + swap `<Input>` → `<CalculatorInput>` at price fields)
- No backend/DB changes
- No changes to validation, form submission, or data flow — the component outputs a plain number

