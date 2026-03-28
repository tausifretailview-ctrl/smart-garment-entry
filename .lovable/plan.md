

# Plan: Display Customer Names in Uppercase

## What Changes

Customer names in the Customer Master table and mobile list currently display as entered (mixed case). They should always display in **UPPERCASE**.

## Approach

Apply `.toUpperCase()` at the **display level** in `src/pages/CustomerMaster.tsx` — plus convert to uppercase on **save** so new/edited customers are stored uppercase.

### File: `src/pages/CustomerMaster.tsx`

**A — Display uppercase in ERPTable column (line ~562):**
Change `{row.original.customer_name}` → `{row.original.customer_name?.toUpperCase()}`

**B — Display uppercase in mobile card (line ~713):**
Change `{c.customer_name}` → `{c.customer_name?.toUpperCase()}`

**C — Save as uppercase on Add (line ~299):**
Change `customer_name: data.customer_name.trim()` → `customer_name: data.customer_name.trim().toUpperCase()`

**D — Save as uppercase on Edit (line ~343):**
Change `customer_name: data.customer_name.trim()` → `customer_name: data.customer_name.trim().toUpperCase()`

**E — Excel import uppercase (line ~489):**
Change `customer_name: row.customer_name?.toString().trim()` → `customer_name: row.customer_name?.toString().trim().toUpperCase()`

**F — Input field uppercase styling:**
Add `style={{ textTransform: 'uppercase' }}` to the customer name `<Input>` field so the user sees uppercase while typing.

No other files need changes. Existing lowercase names in the database will display uppercase via the display-level `.toUpperCase()`.

