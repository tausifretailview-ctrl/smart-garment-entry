# ELLA NOOR — Customer Balances: verify Dr/Cr and the three cards

## What the screenshot shows

On the live site, rows like AAISHA (₹3,650 Outstanding, ₹0 Advance, Net ₹3,650 **Cr**) and
Anjuman Memon (₹3,750 + ₹16,200 advance = Net ₹19,950 **Cr**) look self-contradictory, and
the list is filtered to **Dr** yet shows **Cr** badges.

Two separate things are behind that:

1. **The screenshot is from an older build.** A fix landed in the code earlier the same
   evening (Outstanding column now shows only what a party actually owes, and the Dr/Cr
   filter is re-applied after the accurate recalculation). The live site was still serving
   the previous build when the screenshot was taken. Nothing to re-fix there — it needs to
   go live and be re-checked.
2. **Two figures on the page still come from different sources.** The rows on screen are
   re-computed with the accurate customer-by-customer logic, but the three cards at the top
   and the "119 matching" count are still taken straight from the raw database summary.
   When the two disagree, the cards and the row list can tell different stories.

## Plan

1. **Publish and re-verify.** Get the current code live, then reload Customer Balances for
   ELLA NOOR and confirm: no Cr badge under the Dr filter, and no credit amount sitting in
   the Outstanding column.
2. **Audit the numbers themselves (read-only).** Compare, for every ELLA NOOR party, the
   database balance against the accurate recalculation. Produce a report listing any party
   where the two differ by more than ₹1, grouped by cause (unused advance, part-used credit
   note, manual adjustment). This tells us whether the remaining complaint is a display
   issue or real data drift.
3. **Make the cards agree with the list.** Total Outstanding (Dr), Total Credit (Cr) and
   Net Receivable should be summed from the same corrected figures the rows use. Where the
   full-org recalculation is too heavy to run live, keep the database totals but label the
   card as the database figure and show the drift found in step 2 instead of silently
   mixing the two.
4. **Fix the "matching" count and paging.** Count and page after the correction is applied,
   so "119 matching" always equals the rows a person can actually page through.
5. **Lock it with tests.** Extend the existing balance tests with the ELLA NOOR cases from
   the screenshot (AAISHA, AARISH, Anjuman Memon, AMJAD settled) so the Cr/Dr direction and
   the card totals can't drift apart again.

## Technical notes

- Page: `src/pages/CustomerPartyBalancesPage.tsx`; helpers `customerPartyBalanceDisplay.ts`,
  `customerPartyBalanceSnapshot.ts`, `customerAccountFacets.ts`.
- Cards use `summarizeAccountFacets(rows)` over raw `get_customer_party_balances` rows;
  displayed rows use `enrichPartyRowsWithCanonicalBalance` (audit bundle +
  `getCustomerAccountState`). That asymmetry is the card/list divergence.
- `matchingCount` is derived from `filteredRows` (pre-enrich) while `tableRows` re-filters
  post-enrich — hence count vs visible-rows mismatch.
- Step 2 runs through the existing parity scripts
  (`scripts/audit-balance-formula-parity.sql`, `docs/customer-balance-verification-recipe.md`).
  Note the party RPCs are no longer executable from the SQL tool after the recent security
  revokes, so the audit runs from an authenticated app-side script.
- No money-write logic, no RLS changes, no migration edits in steps 1, 3, 4, 5.
