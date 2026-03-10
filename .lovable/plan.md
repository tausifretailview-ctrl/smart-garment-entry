

# Fix: QZ Tray printers not listing despite being connected

## Problem
The screenshot shows QZ Tray is "Connected" but displays "No printers found" and "Failed to get printer list". This is a timing/race condition issue introduced in the recent refactoring.

## Root Cause
1. **Stale closure in auto-connect**: The `getPrinters` function captured in the mount effect has a stale `state.isConnected = false`. Although the live `isActive` check was added, if `getPrinters()` is called immediately after `connect()` resolves, the websocket may not be fully stabilized yet.
2. **No retry on failure**: When `getPrinters` fails (e.g., websocket not fully ready), there's no retry mechanism — the user sees "Failed to get printer list" permanently.
3. **`getPrinters` still gates on React state**: The condition `if (!isActive && !state.isConnected) return []` can fail when both are briefly false during transitions.

## Solution

### 1. `src/hooks/useQZTray.ts`
- **`getPrinters`**: Only check live `window.qz.websocket.isActive()` — remove dependency on `state.isConnected` entirely. If not active, attempt a quick `ensureQZConnection()` before giving up.
- **Auto-connect effect**: Add a small delay (~300ms) after `connect()` before calling `getPrinters()` to let the websocket stabilize. Add a retry (up to 2 attempts) if printer fetch fails.
- **`connect` function**: After successful connection, immediately call `getPrinters()` internally so the printer list is always populated on connect.

### 2. `src/components/DirectPrintDialog.tsx`
- **Auto-fetch effect**: Also trigger `getPrinters()` when the dialog opens even if `printers.length > 0` but the list was previously empty (handle stale state). Add a retry with delay if the first attempt returns empty.
- Show a "Retrying..." state instead of immediately showing "Failed to get printer list".

