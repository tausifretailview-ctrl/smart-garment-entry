# Dashboard animation slowdown — audit and fix

## What I found (verified in code)

The slowdown lines up with the KPI count-up + chart animation work (commits "Extract dashboard KPI card into DashboardMetricCard", "Add fromPrevious option to useCountUp", "Keep dashboard KPI values visible while refreshing").

1. **19 independent animation loops.** `src/pages/Index.tsx` renders 19 `DashboardMetricCard`s. Each runs its own `requestAnimationFrame` loop in `useCountUp` and calls `setState` every frame — roughly 19 React state updates per frame for 450 ms, restarted for every card on each data refresh.
2. **Every animated frame re-renders a Radix Tooltip.** Each card wraps its value in `Tooltip`/`TooltipTrigger`, and no dashboard component is memoized, so the whole tooltip subtree re-renders on each of those frames.
3. **Charts mount even when there is no data.** `StatsChartsSection` always renders 4 `AnimatedChart`s (recharts + `ResponsiveContainer` + `ResizeObserver`) even when `loadEnabled` is false and the data arrays are empty — full recharts mount cost on every dashboard open, then 700 ms staggered animations once data lands.
4. **`AnimatedChart` rebuilds its internals each render.** `CustomTooltip` is declared inside the component body (new component identity → tooltip subtree remounts) and the axis/grid/legend fragment is recreated on every render.
5. **23+ matchMedia listeners.** `usePrefersReducedMotion` is called once per card and per chart; each instance registers its own listener and fires an extra `setState` on mount.

Net effect: opening or refreshing the dashboard produces a burst of hundreds of React renders plus a recharts mount, which is what users feel as "slow" — and it also makes concurrent chunk/data loading feel stalled.

## Fix plan (frontend only, no data or query changes)

1. **Single shared animation driver.** Replace the per-card rAF in `useCountUp` with one module-level ticker that advances all active counters and flushes them in a single batched update per frame.
2. **Memoize the KPI card.** Wrap `DashboardMetricCard` in `React.memo` and extract the animated number into a small child, so the tooltip/card shell stays stable during animation.
3. **Skip pointless animation.** No animation when the target equals the displayed value, when the card is a placeholder, or when the page is hidden (`document.hidden`).
4. **Defer chart mounting.** In `StatsChartsSection`, render lightweight placeholders until `loadEnabled` is true and the dataset is non-empty, so recharts is not mounted or animated on a cold dashboard open.
5. **Stabilise `AnimatedChart`.** Hoist `CustomTooltip` to module scope, memoize the shared axis/grid/legend elements, and shorten the stagger so all charts settle quickly.
6. **Share the reduced-motion state.** Convert `usePrefersReducedMotion` to a single shared `matchMedia` subscription (`useSyncExternalStore`) instead of one listener per consumer.

## Verification

- Measure dashboard mount and refresh in a Playwright run: long-task count and total render time before/after.
- Confirm KPI values still count up smoothly, still show previous values while refreshing, and charts render identically once data arrives.

## Files

- `src/hooks/useCountUp.ts`
- `src/hooks/usePrefersReducedMotion.ts`
- `src/components/dashboard/DashboardMetricCard.tsx`
- `src/components/dashboard/AnimatedChart.tsx`
- `src/components/dashboard/StatsChartsSection.tsx`