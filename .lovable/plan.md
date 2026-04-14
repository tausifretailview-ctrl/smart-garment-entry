

## Add Toggle to Control Price Selection Dialog in POS

### Problem
During POS sales, the "Select Price" dialog pops up every time a product's last purchase price differs from the master price. This interrupts the fast scanning flow for many users.

### Solution
Add a new toggle **"Ask Price When Last Purchase Differs"** in Settings under the Sale Settings section, and check it before showing the dialog in both POS Sales and Sales Invoice.

### Changes

**1. Settings.tsx — Add new toggle**
Add a switch for `ask_price_on_scan` in the Sale Settings section (after the "Customer Price Memory" toggle, around line 2069):
- Label: "Ask Price When Last Purchase Differs"
- Description: "Show price selection dialog when last purchase price differs from master price during billing"
- Default: `true` (preserves current behavior)

**2. POSSales.tsx — Check the setting before showing dialog**
At line 1655, wrap the price dialog trigger in a check:
- Read `sale_settings.ask_price_on_scan` from the settings hook
- If `false`, skip the dialog and use master price silently
- If `true` (or not set), show the dialog as before

**3. SalesInvoice.tsx — Same check**
Apply the same guard around the price dialog trigger in the Sales Invoice page.

### No database changes needed
The setting is stored inside the existing `sale_settings` JSONB column — no migration required.

