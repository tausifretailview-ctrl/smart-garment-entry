# Plan: Update Billing Series to Use Full Year Format (YYYY-YY)

## What Changes

All bill/invoice number generators currently produce numbers like `INV/26-27/1`. After April 1, 2026, the new format will be `INV/26-27/1` — using a 4-digit start year and 2-digit end year.

## Affected Functions (Single Database Migration)

All 9 number generation functions will be updated in one migration:


| Function                          | Current Format | New Format                          |
| --------------------------------- | -------------- | ----------------------------------- |
| `generate_sale_number`            | `INV/26-27/1`  | `INV/26-27/1`                       |
| `generate_pos_number`             | `POS/26-27/1`  | `POS/26-27/1`                       |
| `generate_voucher_number`         | `PAY/26-27/1`  | `PAY/26-27/1`                       |
| `generate_quotation_number`       | `QT/26-27/1`   | `QT/26-27/1`                        |
| `generate_sale_order_number`      | `SO/26-27/1`   | `SO/26-27/1`                        |
| `generate_sale_return_number`     | `SR/26-27/1`   | `SR/26-27/1`                        |
| `generate_credit_note_number`     | `CN/26-27/1`   | `CN/26-27/1`                        |
| `generate_purchase_return_number` | `PR/26-27/1`   | `PR/26-27/1`                        |
| `generate_purchase_bill_number`   | `B0126001`     | `PUR/26-27/1` (aligned with others) |


## Technical Detail

In each function, the core change is:

```text
-- OLD (2-digit year)
financial_year := SUBSTRING(fy_start_year::TEXT FROM 3 FOR 2) || '-' || SUBSTRING(fy_end_year::TEXT FROM 3 FOR 2);
-- e.g. "26-27"

-- NEW (4-digit start year + 2-digit end year)
financial_year := fy_start_year::TEXT || '-' || SUBSTRING(fy_end_year::TEXT FROM 3 FOR 2);
-- e.g. "2026-27"
```

The regex patterns for extracting sequence numbers and the LIKE match patterns will also be updated to match the new format. Old bills with the short format remain untouched — the new numbering starts fresh for the new financial year.

The `generate_purchase_bill_number` function currently uses a different format (`B{MMYY}{seq}`) and will be updated to follow the same `PUR/YYYY-YY/N` pattern for consistency.

## No Frontend Changes Needed

All bill numbers are stored and displayed as plain strings. No UI code changes are required — the functions handle everything server-side.