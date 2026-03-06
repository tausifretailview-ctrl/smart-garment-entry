

## Fix: A5 Invoice Print Issues from Dashboard

### Problems Identified (from screenshots)

1. **Sub Total / Grand Total cut off**: The template's inner wrapper uses `maxHeight: calc(210mm - 4mm)` with `overflow: hidden` for A5 vertical format (line 554-555 of `ModernWholesaleTemplate.tsx`). When the summary section extends beyond this height, it gets clipped — visible in the screenshot where amounts next to "Sub Total", "Taxable Amt", "GRAND TOTAL" are missing.

2. **Invoice number & date font too large for A5**: Currently `6.5pt` — needs to be smaller.

3. **MRP column showing on A5**: The MRP column header and cells are always rendered regardless of paper size.

### Fix (single file: `src/components/invoice-templates/ModernWholesaleTemplate.tsx`)

**1. Fix clipped totals** — Change `overflow: "hidden"` to `overflow: "visible"` on the inner border wrapper (line 555). This lets the summary render fully when content is slightly taller than the container. The `@page` CSS and print margins already handle page boundaries correctly.

**2. Reduce invoice number/date font** — Decrease from `6.5pt` to `5.5pt` for A5 format in the invoice metadata section (lines 315, 319).

**3. Remove MRP column for A5** — Conditionally hide the MRP header cell (line 338) and data cell (line 357) when `isA5` is true. Also remove the corresponding empty row cell. Redistribute the freed horizontal space to other columns.

### No other files need changes — the dashboard container and print logic are correct; the issue is purely within the template's A5 rendering constraints.

