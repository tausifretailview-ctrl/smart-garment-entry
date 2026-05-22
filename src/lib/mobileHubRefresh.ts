import type { QueryClient } from "@tanstack/react-query";

/** Invalidate queries used by the owner mobile home dashboard */
export async function invalidateOwnerDashboardQueries(qc: QueryClient) {
  await Promise.all([
    qc.invalidateQueries({ queryKey: ["owner-dashboard"] }),
    qc.invalidateQueries({ queryKey: ["owner-sales-trend"] }),
    qc.invalidateQueries({ queryKey: ["owner-recent-activity"] }),
    qc.invalidateQueries({ queryKey: ["owner-low-stock"] }),
    qc.invalidateQueries({ queryKey: ["owner-top-selling"] }),
    qc.invalidateQueries({ queryKey: ["owner-purchase-today"] }),
    qc.invalidateQueries({ queryKey: ["owner-payments-today"] }),
    qc.invalidateQueries({ queryKey: ["owner-outstanding"] }),
  ]);
}

export async function invalidateMobileSalesHubQueries(qc: QueryClient) {
  await qc.invalidateQueries({ queryKey: ["mobile-sales-list"] });
}

export async function invalidateMobileAccountsHubQueries(qc: QueryClient) {
  await Promise.all([
    qc.invalidateQueries({ queryKey: ["todays-collection"] }),
    qc.invalidateQueries({ queryKey: ["total-receivables"] }),
    qc.invalidateQueries({ queryKey: ["total-payables"] }),
  ]);
}

export async function invalidateOwnerReportQueries(qc: QueryClient) {
  await qc.invalidateQueries({
    predicate: (q) => {
      const key = q.queryKey[0];
      return typeof key === "string" && key.startsWith("rpt-");
    },
  });
}

/** Light refresh for navigation hubs (More menu, report index) */
export async function invalidateActiveHubQueries(qc: QueryClient) {
  await qc.refetchQueries({ type: "active" });
}
