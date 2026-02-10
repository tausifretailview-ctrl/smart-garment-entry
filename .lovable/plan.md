

# Fix: Remove Animated Counter "Stopwatch" Effect from Dashboard Cards

## Problem

Each of the 18 dashboard metric cards uses a `useAnimatedCounter` hook with a 2000ms `requestAnimationFrame` animation. This means every time a value updates, the card runs ~120 frames of animation (60fps x 2 seconds), calling `setState` on every frame. With 18 cards, that is potentially **2,160 state updates** per data refresh cycle. While this does not directly cause extra database reads, the constant re-rendering can cascade into child component re-renders and contributes to poor performance on lower-end devices.

## Solution

Remove the animated counter from dashboard cards entirely. Display values instantly -- this eliminates the "stopwatch counting" effect, reduces CPU usage, and keeps the dashboard lightweight.

## Technical Changes

### 1. `src/pages/Index.tsx` -- DashboardCard component (~line 90)

- Remove the `useAnimatedCounter` import
- Remove the `useAnimatedCounter` call inside `DashboardCard`
- Format the value directly using the existing `formatCurrency` or `toLocaleString` functions
- Display the formatted value immediately without animation

Before:
```tsx
const { displayValue } = useAnimatedCounter(value, {
  duration: 2000,
  formatter: isCurrency ? formatCurrency : (v) => v.toLocaleString("en-IN"),
});
// ... renders displayValue
```

After:
```tsx
const displayValue = isCurrency ? formatCurrency(value) : value.toLocaleString("en-IN");
// ... renders displayValue directly
```

### 2. `src/hooks/useAnimatedCounter.tsx`

No deletion needed -- the hook may be used elsewhere in the future. But the dashboard will no longer import it.

### Result

- Zero `requestAnimationFrame` loops on the dashboard
- Instant value display instead of 2-second counting animation
- Significantly reduced CPU and rendering overhead
- No visual regression -- values appear immediately which is actually better UX for a business dashboard

