import { todayLocalYmd } from "@/lib/localDayBounds";

export type LastCompletedPosHint = {
  invoiceNumber: string;
  amount: number;
  qty: number;
  savedDay?: string;
};

function storageKey(orgId: string): string {
  return `pos-last-bill:${orgId}`;
}

export function readPersistedLastPosHint(orgId: string): LastCompletedPosHint | null {
  if (typeof sessionStorage === "undefined") return null;
  try {
    const raw = sessionStorage.getItem(storageKey(orgId));
    if (!raw) return null;
    const parsed = JSON.parse(raw) as LastCompletedPosHint;
    if (!parsed?.invoiceNumber) return null;
    if (parsed.savedDay && parsed.savedDay !== todayLocalYmd()) return null;
    return parsed;
  } catch {
    return null;
  }
}

export function persistLastPosHint(orgId: string, hint: LastCompletedPosHint): void {
  if (typeof sessionStorage === "undefined") return;
  try {
    sessionStorage.setItem(
      storageKey(orgId),
      JSON.stringify({ ...hint, savedDay: todayLocalYmd() }),
    );
  } catch {
    /* private mode */
  }
}
