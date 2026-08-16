/**
 * Item-wise Sales Report — User filter values.
 * - created:{userId} → sales.created_by (login user: admin / manager / …)
 * - salesman:{name} → sales.salesman
 * - plain name → legacy persisted salesman filter
 */

export function parseItemWiseUserFilter(selectedUser: string): {
  createdById: string | null;
  salesmanName: string | null;
} {
  if (!selectedUser || selectedUser === "all") {
    return { createdById: null, salesmanName: null };
  }
  if (selectedUser.startsWith("created:")) {
    return { createdById: selectedUser.slice("created:".length), salesmanName: null };
  }
  if (selectedUser.startsWith("salesman:")) {
    return { createdById: null, salesmanName: selectedUser.slice("salesman:".length) };
  }
  return { createdById: null, salesmanName: selectedUser };
}
