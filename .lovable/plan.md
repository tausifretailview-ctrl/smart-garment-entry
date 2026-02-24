

## Fix: Barcode Direct Print Compatibility for Multiple TSC Printer Models

### Problem
The QZ Tray direct print (TSPL mode) works perfectly on TSC TE244 but produces improper output on TSC DA240, TSC D310, and other models. This happens because:

1. **DPI is hardcoded by label size format** -- custom sizes always use 300 DPI, standard presets always use 203 DPI, regardless of the actual printer
2. **No SPEED or DENSITY commands** -- different printer models need different print speed and darkness settings for clean output
3. **GAP sensing issues** -- some rolls use gap mode, others use continuous or black-mark mode, but the code assumes based on label format
4. **No CODEPAGE command** -- some models need explicit character encoding

### What Will Change

A new "Printer Settings" section will be added to the Direct Print Dialog, allowing users to configure:
- **Printer DPI** (203 or 300) -- auto-detected from common model names but user-overridable
- **Print Speed** (1-6, default 4)
- **Print Density** (1-15, default 8)
- **Print Direction** (0 or 1)
- **Gap Mode** (Gap / Continuous / Black Mark)

These settings will be saved per-printer in localStorage so they only need to be configured once.

### Technical Details

**1. Update `src/utils/tsplGenerator.ts`**
- Add `speed` and `density` fields to `TSPLLabelConfig`
- Add `SPEED`, `DENSITY`, and `CODEPAGE` commands to generated TSPL output
- Support `BLINE` (black mark) and `GAP 0 mm, 0 mm` (continuous) modes alongside standard gap

**2. Update `src/components/DirectPrintDialog.tsx`**
- Add printer configuration UI (DPI dropdown, speed/density sliders, gap mode selector)
- Auto-detect DPI from printer name (e.g., "D310" -> 300 DPI, "DA240" -> 203 DPI)
- Save/load per-printer settings from localStorage key `qz_printer_config_{printerName}`
- Pass user-configured DPI/speed/density to TSPL generator instead of hardcoded values

**3. Updated TSPL command output will look like:**
```text
SIZE 50 mm, 25 mm
GAP 2 mm, 0 mm
DIRECTION 1
SPEED 4
DENSITY 8
CODEPAGE UTF-8
CLS
... (text and barcode commands)
PRINT 1,1
END
```

### Files to Modify
- `src/utils/tsplGenerator.ts` -- Add speed, density, codepage to config and generated commands
- `src/components/DirectPrintDialog.tsx` -- Add printer settings UI, auto-detect model DPI, persist settings

### Notes
- This is NOT a QZ Tray compatibility issue -- it is a TSPL command compatibility issue between printer models
- The TSC TE244 works because 203 DPI + default speed/density happens to match
- TSC D310 is 300 DPI and needs explicit density/speed tuning
- TSC DA240 may need different DIRECTION or DENSITY values
- Settings persist per printer name, so users with multiple printers can configure each one independently

