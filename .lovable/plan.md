# Vastrakala 80mm receipt formatting update

Update only the live Vastrakala thermal receipt identified by `Tot.QTY`, `TOTAL AMT.`, and `NET AMT.`.

## Changes
- Keep the subtitle removed; add a regression guard so “Sarees & ladies wear” cannot return beneath the shop name.
- Keep the centered `BILL OF SUPPLY` heading between contact details and bill information, while preserving quotation, sale-order, credit-note, and configured-title behavior.
- Add small, consistent section spacing after the header, bill information, column headings, item list, totals, and terms without excessive paper use.
- Enlarge the 80mm logo and rebalance the header columns so it remains proportional to the larger shop name without overlap.

## Verification
- Add focused source guards for subtitle removal, heading placement, section spacing, and logo dimensions.
- Run the focused tests.
- Render a real Vastrakala one-to-two-item receipt at 80mm in the browser and inspect it at desktop and mobile widths for overlap, clipping, awkward gaps, and excessive length.
- Confirm the current build status after the changes; unrelated pre-existing errors will be reported separately.

## Technical details
- Scope: `VastrakalaThermalReceipt80mm.tsx`, its dedicated stylesheet, and a focused guard test only.
- No billing calculations, stored organization data, other receipt templates, or backend behavior will change.
