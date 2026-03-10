

# Fix QZ Tray Security Callbacks

## Problem
The security callbacks pass `resolve('')` (empty string) instead of `resolve()` (no argument). QZ Tray treats an empty string certificate differently from a truly anonymous (no-argument) resolution. Additionally, the `_certSet` guard skips re-registering callbacks on subsequent attempts, which can fail if QZ Tray's internal state resets.

## Changes

### 1. `src/utils/directInvoicePrint.ts` — Fix `ensureQZConnection`
- Remove the `_certSet` guard — always set security callbacks before connecting
- Change `resolve('')` to `resolve()` for truly anonymous mode
- Change signature promise to use the standard callback pattern with `resolve()` instead of returning a Promise

### 2. `src/hooks/useQZTray.ts` — No changes needed
The hook already delegates to `ensureQZConnection` via dynamic import (line 40), so fixing the shared utility fixes both paths. No separate security setup is needed in the hook.

## Technical Detail

```text
Before:  resolve('')         → QZ sees empty-string cert → may reject
After:   resolve()           → QZ sees no cert → true anonymous mode
Before:  if (!_certSet) {...} → callbacks set once, may go stale
After:   always set before connect() → guaranteed fresh registration
```

