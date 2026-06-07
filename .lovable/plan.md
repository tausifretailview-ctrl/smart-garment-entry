## Goal
In the POS toolbar, the **Stock / Quick Stock Check** dialog (the "barcode scan window" opened from the POS header) currently relies on `autoFocus` on the search input. With Radix Dialog focus management, the cursor sometimes lands on the dialog container or the close button instead of the search box, so users have to click into the field before scanning.

Make the text cursor land **inside the barcode/search input by default** every time the dialog opens, so a connected barcode scanner can fire immediately without an extra click.

## Change
Edit only `src/components/FloatingPOSReports.tsx` (the `FloatingStockReport` dialog used by POS).

1. Add an `inputRef = useRef<HTMLInputElement>(null)`.
2. Attach it to the existing search `<Input>` (replacing reliance on `autoFocus`).
3. Add a `useEffect` that runs when `open` becomes `true` and focuses + selects the input (small `setTimeout` so it runs after Radix's own focus trap settles).
4. Keep all other behavior (search query, clear button, results) unchanged.

```text
useEffect(() => {
  if (!open) return;
  const t = setTimeout(() => {
    inputRef.current?.focus();
    inputRef.current?.select();
  }, 50);
  return () => clearTimeout(t);
}, [open]);
```

## Out of scope
- POS cart's main barcode input (already has robust auto-focus logic).
- Tablet/mobile POS layouts.
- Any business logic, search, or stock query changes.