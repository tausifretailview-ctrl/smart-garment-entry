

# Plan: Update Invoice POS/26-27/10 for Mulund Mobility

## What needs to happen

A single data update on one specific invoice record in the database:

- **Record ID**: `ebd478fe-7c0e-48d4-83e2-b3975441fc42`
- **Change date**: from 2026-04-08 → **2026-03-31**
- **Change invoice number**: from `POS/26-27/10` → **975623**

## Steps

### Step 1: Update the sale record
Run a database update (via insert tool) to change both fields:

```sql
UPDATE sales 
SET sale_date = '2026-03-31 14:31:27.625598+00',
    sale_number = '975623'
WHERE id = 'ebd478fe-7c0e-48d4-83e2-b3975441fc42';
```

### Step 2: Verify the update
Query the record to confirm both fields were updated correctly.

## What will NOT change
- No code changes needed
- No other invoices affected
- No triggers or functions modified

