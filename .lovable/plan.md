
# Organization Data Reset Utility

## Overview
Add a self-service "Reset Organization Data" feature to the Backup tab in Settings. This allows organization administrators to completely wipe all trial/test data and start fresh with reset sequences - without needing manual database intervention.

## Safety Features

| Safety Measure | Description |
|----------------|-------------|
| **Admin-Only Access** | Only users with `organizationRole === "admin"` can see and use this feature |
| **Multi-Step Confirmation** | Requires typing organization name to confirm |
| **Organization-Scoped** | All deletions strictly filtered by current `organization_id` |
| **Backup Reminder** | Prompts user to download backup before proceeding |
| **Progress Feedback** | Shows real-time progress during reset operation |

## User Interface

The reset utility will be added as a new Card section in `BackupSettings.tsx` with:

1. **Warning Banner** - Red/destructive styling with clear warning message
2. **Data Summary** - Shows counts of records that will be deleted (customers, products, sales, etc.)
3. **Confirmation Dialog** - Multi-step AlertDialog requiring:
   - Checkbox to confirm backup was taken
   - Type organization name to confirm
4. **Progress Indicator** - Shows deletion progress with table names

## Technical Implementation

### Files to Create/Modify

| File | Action | Purpose |
|------|--------|---------|
| `src/components/OrganizationResetDialog.tsx` | **Create** | New dialog component with confirmation flow |
| `src/components/BackupSettings.tsx` | **Modify** | Add Reset section with admin check |
| `src/hooks/useOrganizationReset.tsx` | **Create** | Hook to handle reset logic and API calls |
| `supabase/functions/reset-organization/index.ts` | **Create** | Edge function to execute secure server-side deletion |

### Edge Function: `reset-organization`

The reset operation will be performed via a secure edge function that:
1. Validates the user is an admin of the organization
2. Executes deletions in the correct order (child tables first)
3. Resets barcode_sequence to starting value
4. Clears bill_number_sequence
5. Returns success/failure status

```text
Deletion Order (respecting foreign keys):
1.  sale_items
2.  sale_return_items
3.  purchase_return_items
4.  purchase_items
5.  quotation_items
6.  sale_order_items
7.  purchase_order_items
8.  delivery_challan_items
9.  voucher_items
10. stock_movements
11. batch_stock
12. sale_returns
13. purchase_returns
14. sales
15. purchase_bills
16. quotations
17. sale_orders
18. purchase_orders
19. delivery_challans
20. credit_notes
21. customer_advances
22. customer_brand_discounts
23. customer_product_prices
24. customer_points_history
25. gift_redemptions
26. product_images
27. product_variants
28. products
29. customers
30. suppliers
31. size_groups
32. employees
33. legacy_invoices
34. drafts
35. whatsapp_messages
36. whatsapp_conversations
37. whatsapp_logs
38. sms_logs
39. barcode_sequence (RESET to starting value)
40. bill_number_sequence (DELETE)
```

### Component: OrganizationResetDialog

```text
+------------------------------------------+
|  Reset Organization Data                 |
+------------------------------------------+
|  WARNING: This action is irreversible!   |
|                                          |
|  This will permanently delete:           |
|  - 59 Products & Variants                |
|  - 15 Customers                          |
|  - 19 Sales Invoices                     |
|  - 3 Purchase Bills                      |
|  - All stock movements                   |
|  - Recycle bin contents                  |
|                                          |
|  Barcode sequence will reset to start.   |
|  Bill numbers will start from 1.         |
|                                          |
|  [x] I have downloaded a backup          |
|                                          |
|  Type "ORGANIZATION NAME" to confirm:    |
|  [                                    ]  |
|                                          |
|  [Cancel]              [Reset All Data]  |
+------------------------------------------+
```

### Hook: useOrganizationReset

```typescript
interface ResetProgress {
  currentStep: string;
  stepsCompleted: number;
  totalSteps: number;
}

interface UseOrganizationReset {
  // Fetch current data counts
  dataCounts: Record<string, number> | null;
  isLoadingCounts: boolean;
  
  // Reset operation
  resetOrganization: () => Promise<void>;
  isResetting: boolean;
  progress: ResetProgress | null;
  
  // Get barcode starting value from org settings
  barcodeStartValue: number;
}
```

### BackupSettings Update

Add a new Card at the bottom of BackupSettings (only visible to admins):

```tsx
{organizationRole === "admin" && (
  <Card className="border-destructive">
    <CardHeader>
      <CardTitle className="text-destructive flex items-center gap-2">
        <Trash2 className="h-5 w-5" />
        Reset Organization Data
      </CardTitle>
      <CardDescription>
        Permanently delete all data and start fresh. This cannot be undone.
      </CardDescription>
    </CardHeader>
    <CardContent>
      <OrganizationResetDialog />
    </CardContent>
  </Card>
)}
```

## Barcode Sequence Reset Logic

The barcode starting value will be determined from:
1. Organization settings (if configured)
2. Default pattern based on organization ID digit (e.g., org 1 = 10001001, org 2 = 20001001)

Current pattern observed:
- Organization barcodes follow format: `{org_digit}0001001`
- The reset will restore `next_barcode` to this starting value

## Security Considerations

1. **Edge Function Authentication**: Validates JWT token and checks `organization_members` role
2. **Organization Isolation**: Every DELETE uses `WHERE organization_id = $1`
3. **RLS Policies**: Existing RLS policies provide additional protection layer
4. **Audit Trail**: Optionally log reset action to `backup_logs` table with type `reset`

## Dependencies

No new dependencies required. Uses existing:
- `@radix-ui/react-alert-dialog` for confirmation dialog
- `sonner` for toast notifications
- `@tanstack/react-query` for data fetching

## Testing Checklist

- [ ] Only admins can see the reset section
- [ ] Confirmation requires exact organization name match
- [ ] Backup checkbox must be checked
- [ ] Reset button disabled until all confirmations complete
- [ ] Progress shows during deletion
- [ ] All tables cleared for organization only
- [ ] Other organizations unaffected
- [ ] Barcode sequence reset correctly
- [ ] Bill sequences cleared
- [ ] Success/error toast shown
- [ ] Redirect to dashboard after reset
