## Goal
Revert ONLY the Kids Zone 80mm thermal receipt layout to the previous "perfect" version. Every other change made after that point stays intact.

## Scope (single file)
- `src/components/KidsThermalReceipt80mm.tsx`

No edits to:
- Thermal print CSS / wrappers (`thermalReceiptPrintDocument.ts`)
- `InvoiceWrapper.tsx` routing
- Print hooks, QZ, WebUSB, settings, or any other module

## Available previous versions (from git history of this file)
| Commit | Date | Note |
|---|---|---|
| fe5f5565 | 15-Jun 10:50 | Current (bordered table redesign — the one you don't like) |
| 4f825211 | 13-Jun 10:41 | "kids" — last version before the redesign |
| 34e30f06 | 11-Jun 19:27 | earlier tweak |
| 4d4ad22d | 11-Jun 16:36 | earlier tweak |
| 867b94e6 | 11-Jun 15:46 | earlier tweak |
| 08baa0fa | 11-Jun 15:07 | base thermal |

Default target: **`4f825211` (13-Jun)** — the most recent version before today's redesign. If that one still isn't right, I'll roll back to an earlier commit from the table above.

## Steps
1. In build mode, check out the contents of `src/components/KidsThermalReceipt80mm.tsx` from commit `4f825211`.
2. Overwrite the current file with that exact content (single file change, no other edits anywhere).
3. Open the preview and print a Kids Zone bill at 80mm to confirm it matches your old design.
4. If it looks right but you want one or two small label/value tweaks on top, tell me and I'll patch only those lines.

## Rollback safety
- Only one file changes, so undoing is trivial — revert that single message if needed.
- No DB, no settings, no print plumbing touched.

## Confirm before I proceed
- Target commit `4f825211` (13-Jun) sound right, or pick another from the table?
