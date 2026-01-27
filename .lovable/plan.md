
# Customer-wise Sale Price Detection

## Overview
When creating a Sale Order or Sale Bill (Invoice), the system will automatically detect and offer the last invoice price at which a specific product was sold to the selected customer. This creates a customer-specific pricing memory that helps maintain consistent pricing for repeat customers.

## How It Will Work

1. **When a customer is selected** and **a product is added**, the system will:
   - Check the last sale (invoice or sale order) for that customer + product combination
   - If a previous price exists that differs from the master price, show a dialog offering:
     - **Master Price** (from product_variants)
     - **Last Customer Price** (from previous invoice/order for this customer)

2. **The dialog will display:**
   - Customer name for context
   - Last sale date
   - Both price options with clear labels

3. **Automatic behavior:** If prices match, no dialog appears - the system uses the price silently.

## Database Changes Required

A new table will be created to efficiently track customer-product pricing:

```
customer_product_prices
├── id (uuid, primary key)
├── organization_id (uuid, foreign key → organizations)
├── customer_id (uuid, foreign key → customers)
├── variant_id (uuid, foreign key → product_variants)
├── last_sale_price (numeric)
├── last_mrp (numeric)
├── last_sale_date (timestamptz)
├── last_sale_id (uuid, nullable - reference to sales)
├── last_order_id (uuid, nullable - reference to sale_orders)
├── created_at (timestamptz)
├── updated_at (timestamptz)
└── UNIQUE constraint on (organization_id, customer_id, variant_id)
```

**Why a dedicated table?**
- Faster lookups than querying sale_items each time
- Reduces database load on frequently used screens
- Allows for future expansion (e.g., manual price setting)

## Implementation Steps

### Step 1: Database Migration
Create the `customer_product_prices` table with:
- Proper indexes for fast lookups
- RLS policies for organization-scoped access
- Unique constraint to prevent duplicates

### Step 2: Database Triggers
Create triggers to automatically update `customer_product_prices` when:
- A sale is saved (from SalesInvoice)
- A sale order is saved (from SaleOrderEntry)

### Step 3: New React Hook
Create `useCustomerProductPrice` hook:
```typescript
function useCustomerProductPrice(customerId: string | null, variantId: string | null) {
  // Returns { lastPrice, lastMrp, lastSaleDate, isLoading }
}
```

### Step 4: Enhanced PriceSelectionDialog
Update the dialog to support a third option: "Last Customer Price"
- Add customer context to the dialog header
- Show when customer-specific pricing exists

### Step 5: Update SalesInvoice.tsx
Modify `addProductToInvoice`:
- Before adding product, check for customer-specific price
- If exists and differs from master, show enhanced dialog
- Include "Last Customer Price" option

### Step 6: Update SaleOrderEntry.tsx
Apply same logic to `addProductToOrder`:
- Check customer-specific pricing
- Show dialog when prices differ
- Store selected price on save

## User Experience Flow

```
1. User selects Customer "ABC Traders"
2. User scans/searches for Product "Frozen Chicken 500g"
3. System checks:
   ├── Master Price: ₹450
   ├── Last Purchase Price: ₹480 (from recent purchase)
   └── Last Customer Price: ₹420 (sold to ABC Traders on 15 Jan)
4. Dialog appears showing all available prices
5. User selects preferred price
6. Product added with selected price
```

## Technical Details

### Hook Implementation
The new hook will:
- Query `customer_product_prices` table
- Cache results for 30 seconds (like existing brand discounts)
- Only fetch when both customerId and variantId are provided

### Trigger Implementation
SQL trigger will:
- Fire AFTER INSERT on `sale_items` and `sale_order_items`
- UPSERT into `customer_product_prices`
- Update only if sale_date is more recent

### UI Changes
- Extend `PriceSelectionDialog` to show customer-specific option
- Add visual indicator when using customer-specific pricing
- Display last sale date for context

## Files to Create/Modify

| File | Action | Description |
|------|--------|-------------|
| `supabase/migrations/xxx.sql` | Create | New table + triggers |
| `src/hooks/useCustomerProductPrice.tsx` | Create | New hook for fetching customer prices |
| `src/components/PriceSelectionDialog.tsx` | Modify | Add customer price option |
| `src/pages/SalesInvoice.tsx` | Modify | Integrate customer price detection |
| `src/pages/SaleOrderEntry.tsx` | Modify | Integrate customer price detection |

## Benefits

- **Consistency**: Maintain same pricing for repeat customers
- **Speed**: Pre-calculated prices load instantly
- **Flexibility**: Users can still override with master/purchase prices
- **Audit**: Each price source is clearly labeled
