

## Issue: "Barcode Required" Error — Already Fixed, Users Need Cache Refresh

### Analysis

I reviewed the current code thoroughly. The fix is **already correctly implemented**:

1. **`ProductEntryDialog.tsx` line 846**: The barcode validation is guarded with `!hideOpeningQty` — so it **never fires** in the Purchase Entry context
2. **`ProductEntryDialog.tsx` line 798-800**: Only variants with `purchase_qty > 0` are validated in purchase context
3. **`ProductEntryDialog.tsx` line 914-916**: Only variants with `purchase_qty > 0` are created and get barcodes at save time

The code is correct. The users are seeing the old behavior because their **browsers have cached the previous JavaScript bundle**.

### Recommended Action

No code changes are needed. To resolve for users:

1. **Hard refresh**: Users should press `Ctrl + Shift + R` (Windows) or `Cmd + Shift + R` (Mac) to force-reload
2. **Clear cache**: If hard refresh doesn't work, clear browser cache or open in an incognito/private window
3. **PWA cache**: If the app is installed as a PWA, users may need to uninstall and reinstall the app, or clear the service worker cache

### Optional: Force Cache Bust

If you want, I can add a cache-busting mechanism (like incrementing a version in the service worker or manifest) to force all users to get the latest code automatically. Want me to plan that instead?

