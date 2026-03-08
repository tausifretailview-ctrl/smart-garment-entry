

## Plan: Update PurchaseEntry.tsx Layout & Header

### Changes (single file: `src/pages/PurchaseEntry.tsx`)

**1. Add `ChevronLeft` to lucide-react imports** (line 22)
- Add `ChevronLeft` to the existing import list

**2. Outermost div** (line 2270)
- Change className from `"min-h-screen bg-[hsl(210_20%_97%)] dark:bg-background px-6 py-6"` to `"h-screen flex flex-col overflow-hidden bg-slate-100"`

**3. Replace wrapper div + BackToDashboard + header card** (lines 2271-2301)
- Replace `<div className="w-full space-y-4">` with `<main className="flex-1 overflow-y-auto overflow-x-hidden">`
- Replace `<BackToDashboard>` and the header card block with the new dark gradient `<header>` element containing:
  - Back button using `navigate('/purchase-bills')`
  - Title (edit mode aware)
  - Auto bill number badge
  - Last bill info pill
  - InlineTotalQty on the right

**4. Closing tag** (line 3179)
- Change the matching `</div>` to `</main>` (the one that was `w-full space-y-4`)

All logic, state, handlers, queries, and other JSX remain untouched.

