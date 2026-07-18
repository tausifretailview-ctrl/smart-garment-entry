## Fix Settings back button

**File:** `src/pages/Settings.tsx`

Replace the `navigate(-1)` call on the back button with a safe fallback:

```tsx
onClick={() => {
  if (window.history.length > 1) window.history.back();
  else navigate("/");
}}
```

## Verification

After applying:
1. Open Settings via in-app navigation → back button returns to the previous page (uses `window.history.back()`).
2. Open Settings via a fresh deep link (no prior history) → back button falls through to `/` instead of erroring.

## Next up (not part of this plan)

Resume the Multi-Org / Multi-User Scale Readiness Audit as the following task.