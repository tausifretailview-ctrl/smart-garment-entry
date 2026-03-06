

## Plan

Two changes to `src/components/school/SchoolFeeReceipt.tsx`:

1. **Remove Parent/Guardian signature** (lines 214-223): Remove the left signature block ("Parent / Guardian"), keep only "Authorized Signatory" on the right side.

2. **Straighten watermark**: Change the watermark `transform` on line 105 from `rotate(-30deg)` to no rotation — just centered on page: `transform: "translate(-50%, -50%)"`.

