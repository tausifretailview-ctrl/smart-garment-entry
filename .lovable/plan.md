

## Add "Brand-wise Sale" Tab to Item-wise Sales Report

### What it does
Adds a second tab to the Item-wise Sales Report page. The new "Brand-wise Sale" tab shows a table grouped by customer, with each customer's brand-level sales summary (brand name, total qty sold, total sale amount) for the selected date range.

### Layout
- Two tabs at the top of the content area: **Item-wise Details** (existing) | **Brand-wise Sale** (new)
- Filters, summary cards, and charts remain shared across both tabs
- The Brand-wise Sale table columns: **Customer Name** | **Brand** | **Total Qty** | **Total Amount**
- Customer name shown only on the first row of each customer group (rowspan-style), subsequent brand rows show "-" for customer
- Grand total row at the bottom
- Excel export adapts to export whichever tab is active

### Technical Changes

**File: `src/pages/ItemWiseSalesReport.tsx`**

1. **Add tab state**: `const [activeTab, setActiveTab] = useState<"itemwise" | "brandwise">("itemwise");`

2. **Add `brandWiseData` memo**: Aggregate `saleItems` by `customer_name + brand`, producing `{ customer_name, brand, total_qty, total_amount }[]` sorted by customer name then brand. Apply the same client-side filters (selectedBrand, selectedCategory, search).

3. **Wrap charts + table section in Tabs**: Use shadcn `Tabs` component. The "Item-wise Details" tab contains existing charts + table. The "Brand-wise Sale" tab contains the new customer-brand table.

4. **Brand-wise table**: Simple Table with 4 columns. Customer name displayed on the first row of each group, blank for subsequent brands. Footer row with grand totals.

5. **Update `exportToExcel`**: When `activeTab === "brandwise"`, export the brand-wise data instead of item-wise data.

6. **Import `Tabs, TabsContent, TabsList, TabsTrigger`** from shadcn.

### No database changes needed
All data is already fetched — `saleItems` contains `customer_name` and `brand`. The new tab just aggregates differently.

