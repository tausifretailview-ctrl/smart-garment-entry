/** Same idle window as Stock Health → Dead / Slow Moving (default 60 days). */
export const DASHBOARD_SLOW_MOVING_IDLE_DAYS = 60;

export const INSIGHTS_DEAD_SLOW_MOVING_STATE = {
  insightsTab: "stock-health",
  stockHealthSubTab: "slow-moving",
} as const;

export function isDeadSlowMovingInsightsState(state: unknown): boolean {
  if (!state || typeof state !== "object") return false;
  const nav = state as { insightsTab?: unknown; stockHealthSubTab?: unknown };
  return (
    nav.insightsTab === INSIGHTS_DEAD_SLOW_MOVING_STATE.insightsTab &&
    nav.stockHealthSubTab === INSIGHTS_DEAD_SLOW_MOVING_STATE.stockHealthSubTab
  );
}
