

# Fix: PWA Install Prompt Not Captured in Edge/Chrome

## Problem
The `beforeinstallprompt` event fires once early during page load, often before the React component tree mounts. The `useInstallPrompt` hook registers its listener inside a `useEffect`, which runs after mount -- by then the event is gone. So `isInstallable` remains `false` and the button shows a generic alert instead of triggering the real install prompt.

## Solution
Capture the `beforeinstallprompt` event at the global level in `main.tsx` (before React renders), then consume it from the hook.

### File: `src/main.tsx`
- Add a small script block **before** `ReactDOM.createRoot` that listens for `beforeinstallprompt` on `window` and stores it on a global property (`window.__pwaInstallPrompt`).

### File: `src/hooks/useInstallPrompt.tsx`
- On mount, check if `window.__pwaInstallPrompt` already exists (event fired before hook mounted). If so, use it immediately.
- Still register the event listener as fallback for late-firing scenarios.
- Clear the global reference after consuming it.

### File: `src/components/Header.tsx`
- Remove the `alert()` fallback for non-iOS browsers. Instead, if `isInstallable` is false and it's not iOS, show a toast with specific Edge instructions ("Click the app icon in the address bar or go to Settings > Apps > Install this site as an app") rather than a generic browser alert.

## Technical Detail

```typescript
// src/main.tsx (add before createRoot)
declare global {
  interface Window {
    __pwaInstallPrompt?: Event;
  }
}
window.addEventListener('beforeinstallprompt', (e) => {
  e.preventDefault();
  window.__pwaInstallPrompt = e;
});
```

```typescript
// src/hooks/useInstallPrompt.tsx - in useEffect
// Check if event was already captured globally
if (window.__pwaInstallPrompt) {
  setDeferredPrompt(window.__pwaInstallPrompt as BeforeInstallPromptEvent);
  setIsInstallable(true);
  window.__pwaInstallPrompt = undefined;
}
```

## What This Fixes
- Install prompt is never missed regardless of component mount timing
- "Install App" button in Edge and Chrome will trigger the native install dialog
- Fallback instructions become browser-specific and helpful (toast instead of alert)

