

## Plan: Add Draft Save Feature to Field Sales Order Entry

### Problem
When field salesmen are booking orders on their mobile devices and:
- They receive an incoming phone call
- The internet connection drops
- The app goes to background for too long

...the sale order data they were entering gets lost because the Field Sales app doesn't save drafts.

### Solution Overview
Integrate the existing `useDraftSave` hook (already used in the main app's Sale Order Entry) into the Field Sales `SalesmanOrderEntry.tsx` page. This will:
1. Auto-save the order to the database every 15 seconds
2. Save immediately when the app goes to background (visibility change)
3. Save when navigating away from the page
4. Show a resume dialog when returning to let the salesman continue from where they left off

---

## Technical Implementation

### Files to Modify

**1. `src/pages/salesman/SalesmanOrderEntry.tsx`**

Add draft save integration:

- Import the `useDraftSave` hook and `DraftResumeDialog` component
- Add a new draft type `salesman_sale_order` (to keep separate from desktop drafts)
- Initialize the hook with the sale order data structure
- Create a `loadDraftData` callback to restore state from saved draft
- Show `DraftResumeDialog` when a draft exists on page load
- Update `updateCurrentData` whenever order data changes (customer, items, notes)
- Start auto-save timer when component mounts
- Delete draft when order is successfully saved
- Add visibility change handler to save immediately when app goes to background

**2. `src/hooks/useDraftSave.tsx`**

Extend the draft type:

- Add `salesman_sale_order` to the `DraftType` union type

**3. `src/components/DraftResumeDialog.tsx`**

Add label for new draft type:

- Add `salesman_sale_order: "Sale Order"` to the `typeLabels` mapping

---

## Key Code Changes

### SalesmanOrderEntry.tsx - Hook Integration

```typescript
// Add imports
import { useDraftSave } from "@/hooks/useDraftSave";
import { DraftResumeDialog } from "@/components/DraftResumeDialog";

// In component, add hook
const {
  hasDraft,
  draftData,
  saveDraft,
  deleteDraft,
  updateCurrentData,
  startAutoSave,
  stopAutoSave,
} = useDraftSave('salesman_sale_order');

// Add state for dialog
const [showDraftDialog, setShowDraftDialog] = useState(false);
```

### Draft Data Structure

The draft will store:
- `selectedCustomer` - Customer info (id, name, phone, address, balance)
- `orderItems` - Array of items with product, variant, quantity, prices
- `notes` - Order notes
- `orderNumber` - Generated order number

### Visibility Change Handler (Mobile-Specific)

```typescript
useEffect(() => {
  const handleVisibilityChange = () => {
    if (document.visibilityState === 'hidden' && orderItems.length > 0) {
      // Save immediately when app goes to background
      saveDraft(getCurrentDraftData(), false);
    }
  };
  
  document.addEventListener('visibilitychange', handleVisibilityChange);
  return () => document.removeEventListener('visibilitychange', handleVisibilityChange);
}, [orderItems, saveDraft]);
```

### Load Draft Data Callback

```typescript
const loadDraftData = useCallback((data: any) => {
  if (!data) return;
  setSelectedCustomer(data.selectedCustomer || null);
  setOrderItems(data.orderItems || []);
  setNotes(data.notes || "");
  if (data.orderNumber) setOrderNumber(data.orderNumber);
  toast.success("Previous order restored");
}, []);
```

### Update Current Data Effect

```typescript
useEffect(() => {
  if (orderItems.length > 0 || selectedCustomer) {
    updateCurrentData({
      selectedCustomer,
      orderItems,
      notes,
      orderNumber,
    });
  }
}, [selectedCustomer, orderItems, notes, orderNumber, updateCurrentData]);
```

### Delete Draft on Successful Save

```typescript
// In saveOrder function, after successful save:
await deleteDraft(); // Clear draft after successful save
```

---

## User Experience Flow

1. **Salesman opens New Order page** → Check for existing draft
2. **Draft found** → Show dialog: "Resume previous order?" with options:
   - "Resume Draft" - Restore all data
   - "Start Fresh" - Delete draft and start new
3. **While entering order** → Auto-save every 15 seconds silently
4. **Phone call interrupts** → Visibility change triggers immediate save
5. **Salesman returns to app** → Data is preserved, can continue
6. **Order saved successfully** → Draft is deleted

---

## Benefits

- **No data loss** on interruptions (calls, network issues, accidental navigation)
- **Seamless experience** - salesman can continue exactly where they left off
- **Per-user isolation** - each salesman's draft is separate
- **Automatic cleanup** - drafts are deleted after successful order save
- **Low overhead** - uses existing database infrastructure and RLS policies

