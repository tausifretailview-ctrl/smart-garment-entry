## Goal

Make the **Barcode Printing** page open the right tab automatically based on what the user has saved as their default:

- If the user has saved a default **A4 Sheet** label design (Laser printer) in the Standard tab → open **Standard Printing** tab.
- Otherwise → open **Precision Pro** tab (used for thermal / barcode printers).

This replaces the static `barcode_default_print_tab` setting that currently always wins. Direct navigations from other pages (e.g. Purchase Dashboard's "Print Labels" button) that explicitly request a tab continue to override.

---

## Current behaviour (for reference)

In `src/pages/BarcodePrinting.tsx`:

- A setting `bill_barcode_settings.barcode_default_print_tab` (`"standard" | "precision"`) decides the tab.
- Two effects compete to set `activeBarTab`:
  1. After loading `bill_barcode_settings` (lines ~1591–1614).
  2. After loading printer presets — if a default preset exists, it auto-loads it and forces `precision` (lines ~1668–1671).
- Result: a user who has chosen an A4 sheet design as their standard default still lands on Precision Pro whenever any printer preset is marked default, or whenever `barcode_default_print_tab` was last set to `precision`.

---

## Fix

### 1. Derive the default tab from real defaults, not a separate flag

After settings + presets finish loading, compute the effective default tab:

```text
if routeRequestedTab → use it (unchanged)
else if standard tab has a usable A4 default (see rule below) → "standard"
else if any precision printer preset is marked default OR precision_pro_enabled → "precision"
else → "standard"
```

"Standard A4 default exists" = `dbDefaultFormat` is loaded **and** its `sheetType` is one of the A4 sheet types (any value starting with `a4_`, plus `custom` when its dimensions describe an A4 layout). The standard tab already keys off `dbDefaultFormat`, so we just inspect the same object.

### 2. Apply it in one place

- Remove the early `setActiveBarTab(...)` inside the settings-load effect (lines ~1610–1614).
- Remove the "force precision when a default preset auto-loads" branch (lines ~1668–1671).
- Add a single new effect that runs once `settingsFullyLoadedRef.current` flips true and `dbDefaultFormat` / `dbPresets` are known, and sets `activeBarTab` per the rule above. This effect must respect `routeRequestedTab` and must not re-fire on every render (use a `hasResolvedDefaultTabRef` guard, mirrored on org change like the existing refs).

### 3. Settings page wording

In `src/pages/Settings.tsx`, the existing dropdown that writes `barcode_default_print_tab` becomes a manual override. Either:
- Keep the field but relabel it "Default tab override (Auto = use the saved A4 sheet design when present)" and add an "Auto" option that stores `null`. Auto is the new default.

(No DB migration needed — the column already accepts the value.)

### 4. Verification

- A4 sheet default saved → opening Barcode Printing from the sidebar lands on **Standard Printing** with the A4 design ready.
- No A4 default saved (or only thermal preset is default) → opening lands on **Precision Pro**.
- Purchase Dashboard "Print Labels" still routes to whichever tab it explicitly passes via `location.state.openTab`.
- Switching organisations resets the resolution refs so the new org's defaults are honoured.

---

## Technical notes

**Files**
- `src/pages/BarcodePrinting.tsx` — single tab-resolution effect, remove competing setters.
- `src/pages/Settings.tsx` — add "Auto" option and update label/help text on the existing dropdown.

**Out of scope**
- No changes to label rendering, calibration, or printing logic.
- No DB schema changes.
- No changes to how Purchase Dashboard or other callers request a specific tab.
