

## Add Tally-Style Esc Key for Back Navigation

### What It Does
Pressing **Esc** on any page navigates back to the previous page, mimicking Tally's behavior. Works globally across all pages.

### Safety Guards (to avoid conflicts)
The Esc handler will **not fire** when:
- A dialog, modal, popover, or dropdown is open (detected by checking for `[data-state="open"]` overlays or `[role="dialog"]`)
- Focus is inside an input, textarea, or select element
- POS Sales page already handles Esc (clear cart) — the existing handler uses `e.preventDefault()`, so the global one will check if default was prevented

### Implementation

**New hook: `src/hooks/useEscapeBack.ts`**
- Listens for `keydown` Escape on `window`
- Checks guards (no open dialogs, no focused inputs)
- Calls `navigate(-1)` from react-router to go back
- On the root dashboard page, Esc does nothing (nowhere to go back to)

**Wire it up in `src/components/Layout.tsx`**
- Call `useEscapeBack()` inside the Layout component so it's active on all pages

### Files
- **Create** `src/hooks/useEscapeBack.ts` — the hook with all guard logic
- **Edit** `src/components/Layout.tsx` — add one line to call the hook

