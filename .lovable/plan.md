## Goal
Shrink the Electron desktop shell's Display Scale font sizes so the app fits better on Windows monitors.

## Change (single file)
`src/components/UIScaleSelector.tsx` — update `SCALE_OPTIONS` font sizes:

| Key      | Current | New   | Label text update       |
|----------|---------|-------|-------------------------|
| compact  | 16px    | 13px  | "High density (13px)"   |
| standard | 18px    | 14px  | "Default (14px)"        |
| large    | 19px    | 15px  | "Easy reading (15px)"   |

Zoom factors (0.85 / 1.0 / 1.05) stay unchanged — only the base `font-size` values change.

## Scope guardrails
- Only `SCALE_OPTIONS` array (sizes + desc strings) modified.
- No changes to `applyScale`, `initUIScale`, zoom IPC, web PWA path, or default-scale logic.
- No changes to Tailwind config, tokens, print CSS, business logic, or any other file.
- Existing users with a saved scale keep their key; the new px value applies on next paint.

## Verification
- Open Display Scale dropdown in Electron → three options show new px labels.
- Selecting each option updates root `font-size` to 13 / 14 / 15 px.
- Print output, POS, dialogs untouched.
