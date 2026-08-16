# KS FOOTWEAR — stock column mismatch verification (read-only)

No code, data, or migrations were changed. Only the organization below was queried.

## Step 1 — organization

```
                  id                  |    name     |    slug     | organization_type |          created_at
--------------------------------------+-------------+-------------+-------------------+-------------------------------
 4bc73037-e877-4123-9261-eb6e3876698c | KS FOOTWEAR | ks-footwear | business          | 2025-12-04 17:09:31.890597+00
(1 row)
```

Single match. id `4bc73037-e877-4123-9261-eb6e3876698c`, slug `ks-footwear`.

## Step 2 — how far apart the two columns are

```
 variants | mismatched | sum_current_stock | sum_stock_qty | worst_gap
----------+------------+-------------------+---------------+-----------
    15859 |      11092 |         287026.00 |     18800.000 |   752.000
(1 row)
```

70% of active variants disagree. The accumulator column totals 287,026 units against a live figure of 18,800 — a 15.3x overstatement shop-wide.

Twenty worst offenders:

```
 product_name |  barcode   | size | color | current_stock | stock_qty |   gap
--------------+------------+------+-------+---------------+-----------+---------
 PUL204       | 40001067   | 5    | BR    |        753.00 |     1.000 | 752.000
 PUL82        | 40001672   | 7    | TAN   |        707.00 |     3.000 | 704.000
 PUL82        | 40001665   | 5    | TAN   |        694.00 |     0.000 | 694.000
 PUL204       | 40001069   | 6    | BR    |        677.00 |     0.000 | 677.000
 PUL204       | 40001066   | 7    | BR    |        642.00 |     3.000 | 639.000
 PUL82        | 40001673   | 5    | BK    |        616.00 |     2.000 | 614.000
 PUL82        | 40001680   | 6    | TAN   |        589.00 |     1.000 | 588.000
 PUG42        | 40001014   | 8    | BR    |        576.00 |     0.000 | 576.000
 PUG42        | 40002944   | 8    | BK    |        576.00 |     0.000 | 576.000
 PUL82        | 40001669   | 6    | BK    |        564.00 |     0.000 | 564.000
 PUG42        | 40002943   | 7    | BK    |        563.00 |     0.000 | 563.000
 FIT09        | 40003048   | 8    | BLUE  |        544.00 |     2.000 | 542.000
 PUG42        | 40001015   | 7    | BR    |        528.00 |     0.000 | 528.000
 PUL61        | 40001061   | 8    | BK    |        532.00 |     4.000 | 528.000
 PUL204       | 40001087   | 4    | BR    |        527.00 |     1.000 | 526.000
 PUL82        | 40001663   | 7    | BK    |        521.00 |     1.000 | 520.000
 PUG150       | 0040007259 | 5    | BK    |        510.00 |     2.000 | 508.000
 PUL82        | 40001676   | 4    | TAN   |        478.00 |     0.000 | 478.000
 PUL61        | 40001053   | 6    | NAVY  |        469.00 |     0.000 | 469.000
 PUL61        | 40001055   | 7    | BK    |        469.00 |     0.000 | 469.000
(20 rows)
```

Every gap is one-directional (current_stock high, stock_qty near zero), consistent with an inbound-only accumulator that never took sales out.

## Step 3 — is stock_qty itself trustworthy here

```
 variants_checked | drifted | total_abs_drift
------------------+---------+-----------------
            15859 |     108 |      103005.000
(1 row)
```

Sentinel check (variants parked near 1,000,000):

```
 count
-------
     0
(1 row)
```

108 of 15,859 variants (0.7%) drift from their movement sum, and all 108 do have movement rows. The 103,005 total is dominated by a single variant:

```
 product_name |  barcode   | stock_qty | movement_sum | movements | opening_qty |    drift
--------------+------------+-----------+--------------+-----------+-------------+-------------
 PUL179       | 0040008599 |     0.000 |   101606.000 |        29 |       0.000 | -101606.000
 PUL61        | 40001054   |     1.000 |      -69.000 |        90 |       0.000 |      70.000
 PUL61        | 40001041   |     0.000 |      -69.000 |       100 |       0.000 |      69.000
 PUL139       | 40001269   |     0.000 |      -54.000 |        35 |       0.000 |      54.000
 PUL61        | 40001059   |     1.000 |      -47.000 |        90 |       0.000 |      48.000
 PUL61        | 40001057   |     0.000 |      -45.000 |        81 |       0.000 |      45.000
 PUL139       | 40001274   |     2.000 |      -40.000 |       242 |       0.000 |      42.000
 PUL139       | 40001268   |     0.000 |      -42.000 |       163 |       0.000 |      42.000
 PUL139       | 40001273   |     6.000 |      -33.000 |        27 |       0.000 |      39.000
 PUL139       | 40001265   |     2.000 |      -37.000 |        31 |       0.000 |      39.000
 PUL139       | 40001270   |     0.000 |      -36.000 |       350 |       0.000 |      36.000
 PUL139       | 40001263   |     2.000 |      -34.000 |        28 |       0.000 |      36.000
 PUL61        | 40001048   |     5.000 |      -31.000 |       238 |       0.000 |      36.000
 PUL139       | 40001262   |     0.000 |      -36.000 |       172 |       0.000 |      36.000
 PUL61        | 40001058   |     2.000 |      -34.000 |       243 |       0.000 |      36.000
(15 rows)
```

Excluding PUL179, residual drift across the other 107 variants is roughly 1,400 units. Two distinct signals:

- One corrupt variant (PUL179 / 0040008599) whose 29 movement rows sum to +101,606 while stock_qty is 0. Something wrote an absurd movement quantity. This is exactly the case where recomputing stock_qty from movements would bake in a bogus number.
- A tail of 107 variants whose movement sums go negative (-30 to -69) while stock_qty sits at 0-6. Negative movement totals mean outbound movements exist without matching inbound rows — most likely stock sold that was created by opening/import rather than a logged purchase movement. Here stock_qty is the more plausible figure and the movement log is incomplete.

Plainly: stock_qty is broadly sound for this shop (99.3% of variants reconcile), but it is not clean. KS FOOTWEAR does need the separate stock-drift investigation for PUL179 and the negative-sum tail. Neither reconcile_variant_stock_qty nor fix_stock_discrepancies should be run here — both would rewrite PUL179 to 101,606.

## Step 4 — which screen shows which number

| Screen (as the owner names it) | File | Source | UI label | Reachable in normal use |
| --- | --- | --- | --- | --- |
| Mobile Owner - Stock, product list | src/components/mobile/OwnerStockOverview.tsx:71 | raw `current_stock` from product_variants; also multiplied by pur_price/sale_price for stock valuation | "Total Stock" per product plus purchase/sale value | Yes - main Stock tab of the owner mobile dashboard |
| Mobile Owner - Stock, product detail | src/components/mobile/OwnerStockProductDetail.tsx:40 | raw `current_stock` | "Total Stock" header and the per-variant qty badge | Yes - tapping any product in the list above |
| Mobile Owner - Reports, Stock Summary | src/components/mobile/OwnerReportDetail.tsx:341 | raw `current_stock` (and note: no `deleted_at is null` filter either) | stock qty plus purchase/sale valuation totals | Yes - Reports hub, Stock Summary card |
| Daily Sale Analysis | src/pages/DailySaleAnalysis.tsx:263 | raw `current_stock` | current stock next to sale velocity | Yes, but only for variants sold that day, so exposure is narrower |

Everything else - Business Insights RPCs (`pv.stock_qty::numeric AS current_stock`), Item-Wise Stock Report, POS, and conversion checks - reads the live `stock_qty`. So the four screens above are the only ones showing the accumulator, and three of them are exactly the screens the owner uses on the phone.

Consequence today: the mobile owner Stock tab reports about 287,000 units and its rupee valuation is inflated by the same 15x, while the desktop reports the owner might cross-check against show 18,800.

## Step 5 — ground truth (needs a human count)

Suggested SKUs from the worst-offenders list, all single-size single-colour and easy to find:

| SKU (barcode) | Product / size / colour | Physical count | stock_qty | current_stock |
| --- | --- | --- | --- | --- |
| 40001067 | PUL204, size 5, BR | | 1 | 753 |
| 40001672 | PUL82, size 7, TAN | | 3 | 707 |
| 40001066 | PUL204, size 7, BR | | 3 | 642 |
| 40003048 | FIT09, size 8, BLUE | | 2 | 544 |
| 0040007259 | PUG150, size 5, BK | | 2 | 510 |

Count these five on the shelf and fill the middle column. Nothing above can settle which column is right; this can.

## Conclusion

The mobile owner stock screens are wrong. They read an accumulator column that no trigger has maintained since March 2026, and for KS FOOTWEAR it reads 287,026 units against a live 18,800 - a 15x overstatement that also inflates the stock valuation on the same screens. `stock_qty` is the substantially correct column here: 99.3% of active variants match their movement history exactly. But it is not perfectly clean either - one variant (PUL179 / 0040008599) has movements summing to +101,606, and 107 variants have negative movement sums indicating unlogged inbound stock. So: the mobile screen is definitely wrong, and stock_qty is mostly right with a small localised problem of its own. Two separate follow-ups, both out of scope here - point the four files at `stock_qty`, and investigate PUL179 plus the negative-sum tail before anyone runs a recompute.
