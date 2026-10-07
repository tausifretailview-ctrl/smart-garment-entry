import type { QueryClient } from "@tanstack/react-query";

/** Keep POS balance, Customer Master grid, and Points Report in sync after CRM point changes. */
export function invalidateCustomerPointsRelatedQueries(
  queryClient: QueryClient,
  opts: { organizationId?: string | null; customerId?: string | null } = {},
): void {
  const { organizationId, customerId } = opts;
  if (customerId) {
    queryClient.invalidateQueries({ queryKey: ["customer-points", customerId] });
  }
  if (organizationId) {
    queryClient.invalidateQueries({ queryKey: ["customers-for-points-report", organizationId] });
    queryClient.invalidateQueries({ queryKey: ["customer-points-report", organizationId] });
    queryClient.invalidateQueries({ queryKey: ["customer-points-drill", organizationId] });
    queryClient.invalidateQueries({ queryKey: ["customers"] });
  }
}
