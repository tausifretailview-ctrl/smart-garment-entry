/**
 * GL posting is on unless settings explicitly set `accounting_engine_enabled` to false.
 * Missing settings row or null/undefined flag → treat as enabled (matches DB default true).
 */
export function isAccountingEngineEnabled(
  row: { accounting_engine_enabled?: boolean | null } | null | undefined
): boolean {
  return row?.accounting_engine_enabled !== false;
}
