# Sale Order "Available Stock" print shows 0 for PUL228 — cause and fix

## What the data shows (KS FOOTWEAR, verified)

`PUL228` exists as **three separate product rows**, all brand RLX:

| Product row | Name | Style | Stock |
|---|---|---|---|
| bca7d558… | PUL228 | PUG | ~2 pcs total (BEIJE: 0) |
| ee219f2f… | PUL228 | PUL | the real stock — BEIJE 19/32/33/21/6 = 111, BK 143, etc. |
| 91073d0e… | PUL228-PUL-RLX-LD | PUL | 0 |

Sale orders SO/26-27/1096 and /1131 booked PUL228 BEIJE against **bca7d558 (style PUG)**, which holds zero BEIJE stock. So the pick list correctly prints `0 / 1` for that product row, while the Size-wise Stock Report — which lists every PUL228 row — shows the 111 pcs sitting on the other row.

The pick list already tries to pull in sibling product rows, but its family match requires **the same product name AND brand AND style**. Style `PUG` ≠ `PUL`, and the third row's name has a `-PUL-RLX-LD` suffix, so both stock-holding rows are excluded.

## The fix

In the Sale Order pick-list stock lookup only (`src/pages/SaleOrderDashboard.tsx` + `src/utils/sizeWiseStockLookup.ts`):

1. **Match siblings on article code + brand, ignoring style.** Drop `style` from the family key so `PUL228 / RLX / PUG` and `PUL228 / RLX / PUL` are treated as the same article.
2. **Normalise the article code** before matching: uppercase, trim, and take the segment before the first `-` (`PUL228-PUL-RLX-LD` → `PUL228`). Fetch candidate products with a prefix match on the code instead of an exact `IN (names)` list.
3. **Group on-hand stock by code + brand + colour** (style removed) when summing `stock_qty`, so the printed cell for PUL228 BEIJE size 5 becomes 32 and the row total 111.
4. Leave conversion behaviour alone: `stock_qty` used for the convert-to-invoice quantity cap stays bound to the actual variant. Only the printed Avl figure widens to the article-level on-hand total (it is explicitly a snapshot, not a reservation).

## Notes

- Nothing in the database changes; this is a read/aggregation fix.
- The Size-wise Stock Report keeps its current per-row grouping — only the pick list aggregates across styles.
- Side effect of step 2: any two products whose names share a prefix before the first `-` and have the same brand will merge in the pick list. For this catalogue (article codes like PUL228, FL709, BHG215) that is the intended behaviour.
