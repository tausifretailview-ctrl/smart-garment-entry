
# Data Fix: Soft-Delete 7 Problematic Multi-Invoice Vouchers

## Summary
Delete 7 vouchers in **KS FOOTWEAR** organization where a single payment covering multiple invoices was incorrectly linked only to the first invoice, causing double-counting and false "Advance" balances.

## Affected Records

| Customer | Voucher # | Voucher Amount | First Invoice | Overpayment |
|----------|-----------|----------------|---------------|-------------|
| VANDANA FOOT WEAR JOGESWARI | RCP/25-26/147 | ₹31,660 | ₹552 | ₹31,109 |
| SAGAR SHOES -4 COP | RCP/25-26/146 | ₹9,811 | ₹3,137 | ₹6,674 |
| SHINDHE SHOES-DAMUNAGAR | RCP/25-26/149 | ₹4,863 | ₹2,320 | ₹2,543 |
| SHREE SAI ENTERPRISE-KANDIVALI W | RCP/25-26/125 | ₹9,070 | ₹7,155 | ₹1,915 |
| BLUE FOX SHOES PVT-JOGESHWARI E | RCP/25-26/88 | ₹3,377 | ₹1,536 | ₹1,841 |
| NIDHI FOOTWAR-POISAR | RCP/25-26/153 | ₹4,355 | ₹2,918 | ₹1,437 |
| MAULI FOOTWEAR-BORIVALI E | RCP/25-26/100 | ₹3,533 | ₹2,228 | ₹1,305 |

## Action
Soft-delete these vouchers by setting `deleted_at = NOW()`. The payment information is already correctly stored in each invoice's `paid_amount` field, so deleting these vouchers removes the double-counting.

## SQL to Execute
```sql
UPDATE voucher_entries 
SET deleted_at = NOW()
WHERE id IN (
  'fc812709-8706-4ceb-b058-250f9613d325',
  '57886403-1e85-4d5e-b1c3-a4dec4b18205',
  '00521aa6-f195-40d3-8ad8-dca2dee89c6e',
  '0c494329-bdd4-43b0-a3d0-96096f9e6914',
  'f14eed6b-053d-427a-91e0-a496b5c1830c',
  'f4c26ad8-a223-447a-9a17-be348ac0ce22',
  '5605af05-0ec7-4a29-b681-16b2c286cccd'
);
```

## Expected Result
After this fix:
- All 7 customers will show correct **Outstanding** balance instead of incorrect "Advance"
- Future multi-invoice payments will create proper separate vouchers (code fix already deployed)
