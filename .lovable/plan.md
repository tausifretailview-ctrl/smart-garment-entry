

## Garment GST Auto-Bump (₹2625 Threshold Rule)

Per Indian GST law for garments & footwear: items priced above ₹1000 (HSN-based threshold, customizable as ₹2625 in your case) attract **18% GST** instead of 5%. Add an org-level toggle that auto-switches Sale GST % to 18% when the Sale Price (incl. GST) crosses the threshold.

### What you'll get

1. **New Setting** (Settings → Purchase tab → "Product Defaults" section):
   - Toggle: **"Auto-set Sale GST 18% above price threshold (Garment/Footwear rule)"** — default OFF
   - Numeric input: **"Threshold price (incl. GST)"** — default `2625`
   - Helper text: "When sale price exceeds this value, Sale GST % auto-changes to 18%. Below or equal, it follows Purchase GST %."

2. **Auto-Apply behavior** — wherever Sale Price is entered/changed:
   - **Product Entry page** (`src/pages/ProductEntry.tsx`) — when `default_sale_price` changes
   - **Product Entry Dialog** (`src/components/ProductEntryDialog.tsx`) — when `default_sale_price` or any variant `sale_price` changes (used inside Purchase Bill add-product flow shown in your screenshot)
   - **Purchase Entry** (`src/pages/PurchaseEntry.tsx`) — when sale_price column is edited per row, auto-update that row's `gst_per` to 18 if above threshold
   - Visual cue: when auto-bumped, show a small amber chip "Auto 18% (>₹2625)" next to Sale GST field

3. **Rule logic** (single helper `applyGarmentGstRule(salePrice, currentGst, settings)`):
   ```
   if (settings.garment_gst_rule_enabled && salePrice > settings.garment_gst_threshold) 
     return 18
   return currentGst   // unchanged
   ```
   - Only **upgrades** to 18% — never downgrades, so manual overrides stick if user picks higher.
   - When sale price drops back below threshold, GST resets to Purchase GST % (only if it was previously auto-bumped — tracked by a transient flag, not persisted).

### Technical changes

- **`src/pages/Settings.tsx`** — extend `PurchaseSettings` interface with `garment_gst_rule_enabled?: boolean` and `garment_gst_threshold?: number`; add UI block in Purchase tab near `default_tax_rate`.
- **`src/lib/utils.ts`** (or new `src/utils/gstRules.ts`) — export `applyGarmentGstRule()` helper.
- **`src/pages/ProductEntry.tsx`** — read settings via `useSettings()`; in the `default_sale_price` onChange handler call helper and update `sale_gst_percent`.
- **`src/components/ProductEntryDialog.tsx`** — same pattern at `default_sale_price` change + variant `sale_price` change.
- **`src/pages/PurchaseEntry.tsx`** — apply in row update path where `sale_price` is edited so each line item's `gst_per` follows the rule.
- No DB migration needed — settings stored in existing `settings.purchase_settings` JSONB column.

### Out of scope (confirm if you want these too)

- Retroactive update of existing products' GST (would be a separate "Bulk Apply" admin action).
- POS sale-time override (currently GST is taken from product master, so master fix propagates automatically).

