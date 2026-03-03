

# Precision Pro: Database-Backed Printer Presets

## Overview
Move calibration presets from the `bill_barcode_settings` JSON blob to a dedicated `printer_presets` table. This gives each organization persistent, shareable presets that survive across sessions and devices.

## What Changes

### 1. New Database Table: `printer_presets`
Create a dedicated table to store calibration presets per organization:

```text
printer_presets
  id              uuid (PK, default gen_random_uuid())
  organization_id uuid (FK -> organizations, NOT NULL)
  name            text NOT NULL
  label_width     numeric NOT NULL (default 50)
  label_height    numeric NOT NULL (default 25)
  x_offset        numeric NOT NULL (default 0)
  y_offset        numeric NOT NULL (default 0)
  v_gap           numeric NOT NULL (default 2)
  a4_cols         integer (default 4)
  a4_rows         integer (default 12)
  label_config    jsonb (stores the full field design: positions, fonts, visibility)
  is_default      boolean (default false)
  created_at      timestamptz (default now())
  updated_at      timestamptz (default now())
  UNIQUE(organization_id, name)
```

RLS policies: authenticated users can SELECT/INSERT/UPDATE/DELETE rows matching their organization.

### 2. Barcode Printing Page Updates
- Fetch presets from `printer_presets` table instead of `bill_barcode_settings.precision_presets`
- Add a **"Save Current Preset"** button that upserts to the database (name + all calibration values + label design config)
- When a preset is loaded, apply its `label_config` (field positions/fonts) alongside calibration values
- "Delete Preset" removes from the database

### 3. Settings Page Updates
- Update the `LabelCalibrationUI` integration in Settings to also read/write presets from `printer_presets` table
- Keep the label designer's Save button writing to `bill_barcode_settings` for the active working config, but presets go to the new table

### 4. LabelCalibrationUI Component Updates
- Update preset loading to include `label_config` (field design) alongside calibration offsets
- The "Save Preset" action now includes the current label design config in the saved preset
- "Load Preset" restores both calibration values AND label design config
- Update preset also saves the full config

### 5. Print Output (no changes needed)
The existing print system already produces clean output -- `PrecisionPrintCSS` hides everything except `.precision-print-area`, sets `@page { margin: 0 }`, and the document title is cleared to suppress browser headers. No changes required here.

## Files to Create
None (component already exists)

## Database Migration
1. Create `printer_presets` table with RLS policies

## Files to Modify
1. **`src/components/precision-barcode/LabelCalibrationUI.tsx`** -- Update preset types to include `label_config`, change save/load/update/delete to call parent handlers that talk to DB
2. **`src/pages/BarcodePrinting.tsx`** -- Fetch presets from `printer_presets` table, wire save/delete handlers, apply loaded preset's `label_config`
3. **`src/pages/Settings.tsx`** -- Same DB integration for presets in the Settings calibration UI

## Technical Notes
- Presets include the full `LabelDesignConfig` so loading a preset restores the exact label layout
- The `is_default` flag allows one preset per org to be auto-loaded on page open
- Existing JSON-based presets will be migrated: on first load, if `precision_presets` exist in `bill_barcode_settings` but no rows in `printer_presets`, they get inserted automatically
