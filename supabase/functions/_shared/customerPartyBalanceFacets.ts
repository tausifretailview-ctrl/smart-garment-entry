/** Edge-function mirror of src/utils/customerAccountFacets party helpers. */

export function partyNetPositionFromRpcRow(
  row: { signed_balance?: number | null },
): number {
  return Math.round(Number(row.signed_balance) || 0);
}

export function partyDebtorNetFromRpcRow(
  row: { signed_balance?: number | null },
): number {
  return Math.max(0, partyNetPositionFromRpcRow(row));
}
