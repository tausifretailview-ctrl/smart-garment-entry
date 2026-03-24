

## Two Issues to Fix in Purchase "Add New Product" Dialog

### Issue 1: Price changes via backspace not updating in bill
**Root Cause**: When user changes `default_pur_price` or `default_sale_price` in the Add New Product dialog AFTER variants have already been generated, the variant prices are NOT updated. Variants are created with prices at generation time (lines 641-642 of ProductEntryDialog.tsx), but subsequent edits to the default prices don't propagate to existing variants. So when the product is added to the bill, the old variant prices are used.

**Fix**: Add a `useEffect` in `ProductEntryDialog.tsx` that watches `formData.default_pur_price` and `formData.default_sale_price`. When these change AND variants exist, update all variant prices to match the new defaults. This mirrors real-world behavior where the default price is the "master" price for all sizes unless individually overridden.

### Issue 2: Show existing stored products history
**What it does**: Display a list/dropdown of recently created products from the database when the Add New Product dialog opens. This helps users reference previous products' details (prices, categories, etc.).

**Fix**: Already partially implemented via the "Copy from Existing" search field (line 340-375). This searches products by name/brand/category. The feature exists but may need better visibility. Will add a "Recent Products" section that shows the last 5-10 products created by this organization, displayed as clickable chips/cards at the top of the dialog for quick reference.

---

### Technical Changes

**File: `src/components/ProductEntryDialog.tsx`**

1. **Sync default prices to variants** — Add a `useEffect` that updates all variant `pur_price`/`sale_price`/`mrp` whenever `formData.default_pur_price`, `formData.default_sale_price`, or `formData.default_mrp` changes and variants already exist:
   ```typescript
   useEffect(() => {
     if (variants.length > 0 && showVariants) {
       setVariants(prev => prev.map(v => ({
         ...v,
         pur_price: formData.default_pur_price ?? v.pur_price,
         sale_price: formData.default_sale_price ?? v.sale_price,
         mrp: formData.default_mrp ?? v.mrp,
       })));
     }
   }, [formData.default_pur_price, formData.default_sale_price, formData.default_mrp]);
   ```

2. **Show recent products on dialog open** — Fetch last 10 products for the organization when dialog opens. Display them as a compact horizontal scrollable list below the "Copy from Existing" field, showing product name, brand, and sale price. Clicking one populates the form (same as existing `handleCopyFromProduct`).

