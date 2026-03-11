

## Plan: Update useQZTray hook

The user has provided a cleaned-up version of the `useQZTray` hook. The changes are minor refactors:

1. Rename `isQZConnected` to `isQZLive` (a plain function, not wrapped in `useCallback`)
2. Remove the periodic sync interval that polled connection status every 3 seconds
3. Simplify `getPrinters` to return `state.printers` when already fetching (instead of empty array)
4. Minor code cleanup and formatting

### File to update
- **`src/hooks/useQZTray.ts`** — Replace entire file with the provided code

