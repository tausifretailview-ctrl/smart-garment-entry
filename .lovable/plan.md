

## UI Scaling Feature

Add a "Display Scale" control to the Header's top navigation bar that lets users switch between Compact (14px), Standard (16px), and Large (18px) root font sizes. All Tailwind rem-based classes automatically respond to this change.

## Changes

### 1. New Component: `src/components/UIScaleSelector.tsx`
- Dropdown triggered by a `Monitor` icon button in the header's right-side icons area
- Three options: Compact (14px), Standard (16px), Large (18px) — each with a label and description
- On selection: sets `document.documentElement.style.fontSize` and saves to `localStorage` key `ui-scale`
- Reads from `localStorage` on mount to restore preference
- Active option shows a checkmark

### 2. Update `src/components/Header.tsx`
- Import and place `<UIScaleSelector />` in the right icons section (line ~333, before the Bell icon)
- Desktop only (`hidden md:flex`)

### 3. Update `src/components/Layout.tsx`
- On mount, read `localStorage` `ui-scale` and apply to `document.documentElement.style.fontSize` so it's set before Header renders
- This ensures the scale persists across page reloads

### 4. Compact Mode Full-Width
- When "Compact" is selected, add a CSS class `scale-compact` to `<html>`
- In `src/index.css`, add a rule: `.scale-compact main { max-width: 100% !important; }` to ensure dashboard/table views use full screen width

### Technical Details
- **localStorage key**: `ui-scale` with values `compact`, `standard`, `large`
- **Font sizes**: compact=14px, standard=16px, large=18px
- **No context/provider needed** — direct DOM manipulation of root font-size is sufficient since Tailwind rem units cascade automatically
- **Mobile excluded** — the selector is hidden on mobile (mobile has its own optimized sizing)

