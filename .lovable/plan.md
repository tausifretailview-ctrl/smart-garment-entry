

## Plan: Transfer Invoice INV/25-26/866 to FY 26-27 Series

### What happened
Invoice INV/25-26/866 (dated 01/04/2026) was created before the billing functions were fixed to use IST timezone. April 1st falls in FY 26-27, so it should have gotten an INV/26-27/X number.

### What we'll do

**Step 1: Query current state**
- Find the sale record with sale_number `INV/25-26/866` for the KS Footwear organization
- Check the current max sequence in `INV/26-27/` series to determine the correct new number

**Step 2: Update the invoice number**
- Use the data insert tool (supports UPDATE) to change `sale_number` from `INV/25-26/866` to `INV/26-27/N` (where N is the next available sequence number in the 26-27 series)

### Safety
- This is a single record update — no schema change needed
- The sale date, items, payments, and all linked data remain unchanged
- Only the `sale_number` field is updated
- Audit trail is preserved since the record ID stays the same

### Technical detail
- The billing functions are already fixed (IST-based) so any new invoices created on/after April 1st will automatically get `26-27` series numbers going forward

