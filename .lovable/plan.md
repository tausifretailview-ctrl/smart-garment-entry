

# Fix: Cash Tally Post-Save Blank State and WhatsApp Field Verification

## Problem
After saving the Cash Tally snapshot, the dialog resets to blank (all denomination counts go to 0, physical cash resets) because the `useEffect` that loads snapshot data always resets `denomCounts` and `coinsBulk` to defaults -- even when a snapshot exists with valid `physical_cash`.

## Solution

### 1. Add `denomination_data` column to `daily_tally_snapshot`
Store the denomination breakdown (counts per note + coins) as a JSONB column so it persists across saves and reloads.

```sql
ALTER TABLE public.daily_tally_snapshot ADD COLUMN denomination_data jsonb;
```

### 2. Update save logic to include denomination data
In `FloatingCashTally.tsx`, add `denomination_data` to the save payload:
```js
denomination_data: { denomCounts, coinsBulk }
```

### 3. Update snapshot load logic
When a snapshot exists and has `denomination_data`, restore the denomination counts and coins instead of resetting them to 0. The `useEffect` at line ~192 will be updated:
- If `snapshot.denomination_data` exists, populate `denomCounts` and `coinsBulk` from it
- Only reset to defaults when no snapshot exists

### 4. Add "Saved" visual indicator
After a successful save, show a subtle green "Saved" badge near the Save button so users can see the data was persisted, rather than the dialog looking like it reset.

### 5. WhatsApp message field verification
Looking at the screenshot, the WhatsApp message already includes all key fields (Total Sales, Total Collection, Total Payments, Net Movement, Cash Reconciliation, Settlement). The values use the same state variables as the UI, so they will be accurate. No changes needed to the WhatsApp message format.

---

## Technical Changes

### Database Migration
- Add `denomination_data jsonb` column to `daily_tally_snapshot`

### File: `src/components/FloatingCashTally.tsx`
1. **Save mutation** (line ~298): Add `denomination_data: { denomCounts, coinsBulk }` to payload
2. **Load snapshot effect** (line ~192): Restore `denomCounts` and `coinsBulk` from `snapshot.denomination_data` when available
3. **Save button**: Show "Saved" state briefly after successful save (change button text/color for 2 seconds)

