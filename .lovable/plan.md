
# Fix "Something Went Wrong" Error - Comprehensive Solution

## Problem Analysis

Based on my investigation, the "Something went wrong" error can be caused by several issues affecting mobile browsers, Android WebViews, older browsers, and PWA installations:

### Identified Issues

1. **Missing Global Unhandled Promise Rejection Handler** - Async errors in event handlers (like API calls) aren't caught by React error boundaries, causing app crashes with blank screens

2. **React Instance Deduplication Missing** - No `resolve.dedupe` configuration in Vite can cause hooks to fail on older Android WebViews when multiple React instances are bundled

3. **ErrorBoundary Doesn't Have Reset Key** - When the global ErrorBoundary catches an error and user clicks "Refresh Page", it reloads the whole page instead of trying to re-render

4. **No Service Worker Cache Busting** - PWA may serve stale cached assets that cause crashes after deployment

5. **MobileErrorBoundary Uses Tailwind** - When loaded before CSS, the error UI may not render correctly on older browsers

6. **No unhandledrejection Handler** - Promise rejections in async code are not caught, causing silent crashes

---

## Implementation Plan

### 1. Add Global Unhandled Promise Rejection Handler

**File**: `src/main.tsx`

Add a safety net for async errors that escape error boundaries:

```tsx
// Global handler for unhandled promise rejections
window.addEventListener('unhandledrejection', (event) => {
  console.error('Unhandled promise rejection:', event.reason);
  event.preventDefault(); // Prevent crash
});

// Global handler for uncaught errors
window.addEventListener('error', (event) => {
  console.error('Uncaught error:', event.error);
});
```

### 2. Configure Vite for React Deduplication

**File**: `vite.config.ts`

Add resolve.dedupe to prevent duplicate React instances:

```ts
resolve: {
  alias: {
    "@": path.resolve(__dirname, "./src"),
  },
  dedupe: ["react", "react-dom", "@tanstack/react-query"],
},
```

### 3. Enhance Global ErrorBoundary with Retry

**File**: `src/components/ErrorBoundary.tsx`

Enhance with:
- Clear cache option on error
- Service worker unregistration on retry
- Better error information
- Inline styles (no Tailwind dependency)

```tsx
class ErrorBoundary extends Component<Props, State> {
  // ... existing code ...

  handleRetry = async () => {
    // Unregister service workers to clear cached assets
    if ('serviceWorker' in navigator) {
      const registrations = await navigator.serviceWorker.getRegistrations();
      for (const registration of registrations) {
        await registration.unregister();
      }
    }
    
    // Clear cache storage
    if ('caches' in window) {
      const cacheNames = await caches.keys();
      await Promise.all(cacheNames.map(name => caches.delete(name)));
    }
    
    // Reload from server, not cache
    window.location.reload();
  };

  render() {
    if (this.state.hasError) {
      return (
        // Inline-styled error UI (no CSS dependencies)
        <div style={styles.container}>
          <h1>Something went wrong</h1>
          <button onClick={this.handleRetry}>
            Clear Cache & Retry
          </button>
          <button onClick={() => window.location.reload()}>
            Refresh Page
          </button>
        </div>
      );
    }
    return this.props.children;
  }
}
```

### 4. Update MobileErrorBoundary Fallback Styling

**File**: `src/components/mobile/MobileErrorBoundary.tsx`

Add inline styles fallback for cases where Tailwind CSS fails to load:

```tsx
// Add inline style fallback for when CSS fails
const fallbackStyles = {
  container: {
    minHeight: '100vh',
    background: '#0f172a',
    color: '#f1f5f9',
    display: 'flex',
    flexDirection: 'column' as const,
    alignItems: 'center',
    justifyContent: 'center',
    padding: '24px',
    fontFamily: 'system-ui, sans-serif',
  },
  // ... more inline styles
};
```

### 5. Add Cache Clear Utility Hook

**New File**: `src/hooks/useClearCache.tsx`

Utility to clear PWA cache programmatically:

```tsx
export const useClearCache = () => {
  const clearAllCaches = async () => {
    // Unregister all service workers
    if ('serviceWorker' in navigator) {
      const registrations = await navigator.serviceWorker.getRegistrations();
      for (const registration of registrations) {
        await registration.unregister();
      }
    }
    
    // Clear cache storage
    if ('caches' in window) {
      const cacheNames = await caches.keys();
      await Promise.all(cacheNames.map(name => caches.delete(name)));
    }
    
    // Clear localStorage except essential keys
    const essentialKeys = ['selectedOrgSlug'];
    const keysToRemove: string[] = [];
    for (let i = 0; i < localStorage.length; i++) {
      const key = localStorage.key(i);
      if (key && !essentialKeys.some(ek => key.includes(ek))) {
        keysToRemove.push(key);
      }
    }
    keysToRemove.forEach(key => localStorage.removeItem(key));
    
    return true;
  };

  return { clearAllCaches };
};
```

### 6. Wrap App with Additional Error Handling

**File**: `src/App.tsx`

Add try-catch wrappers and error recovery:

```tsx
const App = () => {
  useEffect(() => {
    // Global unhandled rejection handler
    const handleRejection = (event: PromiseRejectionEvent) => {
      console.error("Unhandled promise rejection:", event.reason);
      event.preventDefault();
    };
    
    window.addEventListener("unhandledrejection", handleRejection);
    return () => window.removeEventListener("unhandledrejection", handleRejection);
  }, []);

  // ... rest of App
};
```

### 7. Update Index.tsx for Safe Mobile Rendering

**File**: `src/pages/Index.tsx`

Add try-catch in mobile detection:

```tsx
const DashboardContent = () => {
  // Safe mobile detection with fallback
  let isMobile = false;
  try {
    isMobile = useIsMobile();
  } catch (error) {
    console.error("Error detecting mobile:", error);
    isMobile = window.innerWidth < 768;
  }
  
  // ... rest of component
};
```

---

## Files to Modify

| File | Changes |
|------|---------|
| `src/main.tsx` | Add global error handlers for unhandledrejection and error events |
| `vite.config.ts` | Add React deduplication and browser targeting |
| `src/components/ErrorBoundary.tsx` | Enhance with cache clear, retry, and inline styles |
| `src/components/mobile/MobileErrorBoundary.tsx` | Add inline style fallbacks |
| `src/App.tsx` | Add unhandledrejection handler in useEffect |

## Files to Create

| File | Purpose |
|------|---------|
| `src/hooks/useClearCache.tsx` | Utility to clear PWA caches |

---

## Technical Details

### Enhanced ErrorBoundary
```tsx
import { Component, ErrorInfo, ReactNode } from 'react';

interface Props {
  children: ReactNode;
}

interface State {
  hasError: boolean;
  error?: Error;
}

class ErrorBoundary extends Component<Props, State> {
  public state: State = { hasError: false };

  public static getDerivedStateFromError(error: Error): State {
    return { hasError: true, error };
  }

  public componentDidCatch(error: Error, errorInfo: ErrorInfo) {
    console.error('Application Error:', error, errorInfo);
  }

  private handleClearCacheAndRetry = async () => {
    try {
      // Unregister service workers
      if ('serviceWorker' in navigator) {
        const registrations = await navigator.serviceWorker.getRegistrations();
        for (const registration of registrations) {
          await registration.unregister();
        }
      }
      
      // Clear cache storage
      if ('caches' in window) {
        const cacheNames = await caches.keys();
        await Promise.all(cacheNames.map(name => caches.delete(name)));
      }
    } catch (e) {
      console.error('Error clearing cache:', e);
    }
    
    // Force reload from server
    window.location.reload();
  };

  private handleRetry = () => {
    this.setState({ hasError: false, error: undefined });
  };

  public render() {
    if (this.state.hasError) {
      return (
        <div style={{ 
          minHeight: '100vh',
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'center',
          justifyContent: 'center',
          padding: '40px',
          textAlign: 'center',
          fontFamily: 'system-ui, -apple-system, sans-serif',
          background: '#0f172a',
          color: '#f1f5f9'
        }}>
          <div style={{ maxWidth: '400px' }}>
            <div style={{ 
              fontSize: '48px', 
              marginBottom: '16px' 
            }}>
              ⚠️
            </div>
            <h1 style={{ fontSize: '24px', marginBottom: '16px' }}>
              Something went wrong
            </h1>
            <p style={{ marginBottom: '24px', color: '#94a3b8', fontSize: '14px' }}>
              The application encountered an unexpected error. 
              Please try again or clear the cache.
            </p>
            
            <button 
              onClick={this.handleRetry}
              style={{
                padding: '12px 24px',
                fontSize: '14px',
                fontWeight: 600,
                background: '#6366f1',
                color: 'white',
                border: 'none',
                borderRadius: '8px',
                cursor: 'pointer',
                marginBottom: '12px',
                width: '100%'
              }}
            >
              Try Again
            </button>
            
            <button 
              onClick={this.handleClearCacheAndRetry}
              style={{
                padding: '12px 24px',
                fontSize: '14px',
                fontWeight: 600,
                background: 'transparent',
                color: '#94a3b8',
                border: '1px solid #334155',
                borderRadius: '8px',
                cursor: 'pointer',
                marginBottom: '12px',
                width: '100%'
              }}
            >
              Clear Cache & Reload
            </button>
            
            <button 
              onClick={() => window.location.href = '/'}
              style={{
                padding: '12px 24px',
                fontSize: '14px',
                fontWeight: 600,
                background: 'transparent',
                color: '#64748b',
                border: 'none',
                cursor: 'pointer',
                width: '100%'
              }}
            >
              Go to Home
            </button>
            
            {this.state.error && (
              <p style={{ 
                marginTop: '24px', 
                fontSize: '11px', 
                color: '#475569',
                wordBreak: 'break-word'
              }}>
                Error: {this.state.error.message}
              </p>
            )}
            
            <p style={{ marginTop: '16px', fontSize: '12px', color: '#64748b' }}>
              Recommended: Chrome 80+, Firefox 75+, Edge 80+, Safari 13+
            </p>
          </div>
        </div>
      );
    }
    return this.props.children;
  }
}

export default ErrorBoundary;
```

### Enhanced main.tsx
```tsx
import { createRoot } from "react-dom/client";
import App from "./App.tsx";
import ErrorBoundary from "./components/ErrorBoundary";
import "./index.css";

// Global error handlers for async errors (not caught by React error boundaries)
window.addEventListener('unhandledrejection', (event) => {
  console.error('Unhandled promise rejection:', event.reason);
  // Don't prevent default - let ErrorBoundary handle if possible
});

window.addEventListener('error', (event) => {
  console.error('Uncaught error:', event.error);
});

createRoot(document.getElementById("root")!).render(
  <ErrorBoundary>
    <App />
  </ErrorBoundary>
);
```

### Enhanced vite.config.ts
```ts
export default defineConfig(({ mode }) => ({
  // ... existing config
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "./src"),
    },
    // Deduplicate React to prevent hook issues
    dedupe: ["react", "react-dom", "@tanstack/react-query"],
  },
  build: {
    // Target modern browsers while maintaining compatibility
    target: 'es2020',
    // Generate sourcemaps for debugging
    sourcemap: mode === 'development',
  },
}));
```

---

## Expected Results

After implementing these changes:

1. **Unhandled Promise Rejections** - Caught globally, preventing blank screens
2. **React Hook Issues** - Fixed via deduplication
3. **PWA Cache Problems** - Users can clear cache from error screen
4. **Error Recovery** - Try Again button attempts re-render before full reload
5. **Better Diagnostics** - Error messages displayed for debugging
6. **CSS Independence** - Error UI works even if CSS fails to load
7. **Android WebView Compatibility** - ES2020 target with deduplication

---

## Deployment Notes

After implementing:

1. **Clear existing caches** - The new error UI will help users do this
2. **Force service worker update** - VitePWA autoUpdate handles this
3. **Monitor console logs** - Global handlers will log async errors for debugging
