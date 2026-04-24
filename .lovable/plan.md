## Problem (from screenshots)

1. **Image 1**: A vertical scrollbar appears on the right edge of the browser window on the Sale Bill page, even though the layout is supposed to be full-screen with internal table scroll only.
2. **Image 2**: When the Notes / Remarks panel is opened, the dark sticky footer (Flat Disc / Gross / Net Payable / Save Invoice) gets pushed and partially overlaps with the bottom blue StatusBar — the footer is no longer truly fixed.

## Root cause

There are two stacked height bugs:

**A. Page-level scrollbar (Image 1)**
- `src/components/FullScreenLayout.tsx` wraps every page in `<div className="flex min-h-screen w-full ...">` and the inner `<main>` for the Sales Invoice route uses `pb-14` (to clear the StatusBar).
- `src/pages/SalesInvoice.tsx` line 2999 already declares `h-screen w-full ... overflow-hidden`.
- Result: inside a `min-h-screen` parent, a `h-screen` child + `pb-14` padding = `100vh + 56px`, which overflows the viewport and forces the browser to show a page scrollbar. This is exactly the thin scrollbar visible in Image 1.

**B. Footer not actually sticky (Image 2)**
- Line 3148: `<main className="flex-1 flex flex-col overflow-hidden">` contains the table `<section>` *and* the footer.
- Line 3848: `<footer className="sticky bottom-0 shrink-0 ...">`.
- `sticky` inside a parent with `overflow-hidden` and `flex-col` does not behave as expected — the footer just becomes the last flex child. When the Notes panel renders inside the table section (lines 3820–3831), the section grows, the table area shrinks, and the footer is shoved down to the very bottom of `<main>`, where it visually sits on top of the StatusBar instead of above it.
- Also, the table section uses `max-h-[min(calc(7*42px+56px),100%)]` which caps the *table* but the surrounding `<section>` is still `flex-1`, so the empty white area (`bg-slate-100`) below the cap can swallow the Notes block and push everything down.

## Fix plan (UI / layout only — no behavior change)

### 1. Remove the conflicting page scrollbar — `src/components/FullScreenLayout.tsx`
- For the Sales Invoice route specifically, switch the outer wrapper from `min-h-screen` to `h-screen overflow-hidden`, and drop the `pb-14` on the inner `<main>` (the StatusBar will be stacked above the footer via z-index instead — see step 3).
- Concretely: when `isSalesInvoicePage` is true, render
  - outer: `flex h-screen w-full overflow-hidden bg-background`
  - inner main: `flex-1 animate-fade-in relative z-[1] min-h-0 overflow-hidden` (no `pb-14`).
- Non-sales-invoice routes keep the current `min-h-screen` + `pb-20 lg:pb-10` behavior — no regression elsewhere.

### 2. Lift the footer out of the scroll container — `src/pages/SalesInvoice.tsx`
- Restructure the desktop tree so the footer is a **sibling** of `<main>`, not a child:
  ```
  <div className="h-screen w-full flex flex-col overflow-hidden ...">
    <header ... shrink-0>...</header>
    <main className="flex-1 flex flex-col min-h-0 overflow-hidden">
      ...invoice & customer details...
      <section className="flex-1 min-h-0 overflow-hidden ...">  ← table only
        <div ref={tableContainerRef} className="h-full overflow-y-auto ...">
          <table>...</table>
        </div>
      </section>
      {showNotesSection && <div className="shrink-0 ...">Notes textarea</div>}
      {mobileERP.enabled && mobileERP.financer_billing && <div className="shrink-0 ...">FinancerDetailsForm</div>}
    </main>
    <footer className="shrink-0 z-30 shadow-[0_-10px_30px_rgba(0,0,0,0.4)]">...</footer>
  </div>
  ```
- Key changes vs current code (around lines 3148, 3608–3845, 3847–3848):
  - Move the closing `</main>` to **before** the Notes / Financer blocks → no, instead keep them inside `<main>` but mark them `shrink-0` so they take their natural height and the table `<section>` (which is `flex-1 min-h-0`) absorbs the remaining space.
  - Move the `<footer>` outside `</main>` so it is a direct child of the outer `h-screen` flex column. Drop `sticky bottom-0` (no longer needed) and keep `shrink-0 relative z-30`.
  - Remove the `max-h-[min(calc(7*42px+56px),100%)]` cap on the inner table div and replace with `h-full` so the table fills whatever space `<section>` gives it. The 7-row "feel" is preserved naturally because the section now shrinks/grows based on what else is in `<main>` (Notes, Financer).

### 3. Keep the StatusBar visible without overlapping the footer
- `src/components/StatusBar.tsx` is rendered globally by `FullScreenLayout` and is `fixed` at the bottom of the viewport with its own z-index.
- After step 2, the footer sits directly above the bottom of the viewport. To prevent the StatusBar from covering the Save Invoice button (the bug in Image 2), give the outer Sales Invoice container a `pb-[var(--statusbar-height,28px)]` (or a hard `pb-7`) so the flex column reserves space for the StatusBar. The footer then ends exactly above the StatusBar — no overlap, no scrollbar.
- Confirm `StatusBar` height (the thin blue bar showing `Connected · KS FOOTWEAR · FY 2026–27 · …`) is ~28 px; if it differs we read the component once and use the matching padding value.

### 4. Notes panel behavior
- Today the Notes block is rendered *inside* the table `<section>` (lines 3820–3831), so opening it shrinks the white area but also competes with the table for height.
- Move it to a sibling block right after `</section>` and inside `<main>` with `shrink-0 max-h-[30vh] overflow-y-auto`. That way:
  - The footer never moves (it is outside `<main>`).
  - The table area shrinks gracefully when Notes opens.
  - Notes itself can scroll internally for long text instead of pushing layout.
- Same treatment for the optional `FinancerDetailsForm` block (lines 3833–3841).

### 5. No changes to mobile branch
- The mobile render path (lines 2786–2996, gated by `min-h-screen` + `MobilePageHeader`) is untouched — this fix only applies to the desktop SalesInvoice branch starting at line 2998.

## Files to edit
- `src/components/FullScreenLayout.tsx` — switch wrapper to `h-screen overflow-hidden` and drop `pb-14` for the Sales Invoice route only.
- `src/pages/SalesInvoice.tsx` — restructure the desktop layout so `<footer>` is a sibling of `<main>`, move Notes and Financer blocks out of the table `<section>`, remove the `max-h-[min(...)]` cap, and add bottom padding equal to the StatusBar height on the outer container.

## Expected result
- No vertical scrollbar on the right edge of the browser when on `/sales-invoice` (Image 1 fixed).
- Footer (Flat Disc / Gross / Discount / Net Payable / Save Invoice) stays glued just above the blue StatusBar at all times — even when Notes / Remarks is open or many line items are added (Image 2 fixed).
- Table still scrolls internally; header, customer details, footer, and StatusBar all stay fixed.
- No changes to keyboard shortcuts, business logic, save flow, or mobile layout.