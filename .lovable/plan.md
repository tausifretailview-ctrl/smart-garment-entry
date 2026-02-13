

## Fix: Delivery Dashboard Excel Export Issues

### Problem 1: Double File Download
The "Export Excel" button click may be propagating to parent elements or firing twice. The fix is to add `e.stopPropagation()` to the button's onClick handler and prevent rapid double-clicks.

### Problem 2: Single Consolidated Excel File
Currently, the export already puts all selected invoices into one file. The user wants all selected customers consolidated properly in a single file -- this is already working, but we will ensure robustness.

---

### Technical Changes

**File: `src/pages/DeliveryDashboard.tsx`**

1. **Prevent double-download**: 
   - Add a `isExporting` state flag to prevent the function from running twice
   - Add `e.stopPropagation()` to the button click handler
   - Disable the button while export is in progress

2. **Update `exportToExcel` function** (lines 329-421):
   ```typescript
   const [isExporting, setIsExporting] = useState(false);

   const exportToExcel = (e: React.MouseEvent) => {
     e.stopPropagation();
     if (isExporting) return; // Guard against double-click
     setIsExporting(true);
     
     try {
       // ... existing export logic (unchanged)
     } finally {
       setIsExporting(false);
     }
   };
   ```

3. **Update Export button** (lines 579-587):
   - Add `isExporting` to disabled condition
   - Pass event to handler: `onClick={(e) => exportToExcel(e)}`

### Summary
- One small state variable and guard clause prevents double file downloads
- No changes to the Excel content format (already exports all selected invoices in one file)
- Minimal, focused fix

