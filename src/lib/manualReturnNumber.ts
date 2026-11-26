import type { SupabaseClient } from "@supabase/supabase-js";

/**
 * Settings → Purchase → "Allow typing the return number": Sale Return and Purchase Return
 * show the next SR/ PR number first; with the switch on the user may type their own instead.
 * A number left as shown (or cleared) still takes the next number from the series at save
 * time, so two users saving at once never get the same one.
 */

export const MANUAL_RETURN_NUMBER_MAX_LENGTH = 40;

export type ReturnTable = "sale_returns" | "purchase_returns";

export function isManualReturnNumberEnabled(purchaseSettings: unknown): boolean {
  if (!purchaseSettings || typeof purchaseSettings !== "object") return false;
  return (purchaseSettings as { manual_return_number?: unknown }).manual_return_number === true;
}

/**
 * The number the user typed, when it should replace the series number; null means "use the
 * next number from the series" (switch off, box empty, or the shown number left unchanged).
 */
export function typedReturnNumberToSave(typed: string, shownNumber: string, enabled: boolean): string | null {
  if (!enabled) return null;
  const t = String(typed ?? "").trim();
  if (!t) return null;
  if (t === String(shownNumber ?? "").trim()) return null;
  return t;
}

/** A reason the typed number cannot be saved, or null when it is fine. */
export function typedReturnNumberProblem(number: string): string | null {
  const t = String(number ?? "").trim();
  if (!t) return "Type a return number, or clear the box to use the next number.";
  if (t.length > MANUAL_RETURN_NUMBER_MAX_LENGTH) {
    return `Return number can be at most ${MANUAL_RETURN_NUMBER_MAX_LENGTH} characters.`;
  }
  // eslint-disable-next-line no-control-regex
  if (/[\u0000-\u001f\u007f]/.test(t)) return "Return number has a character that cannot be saved.";
  return null;
}

export function returnNumberInUseMessage(number: string): string {
  return `Return number ${number} is already used. Type another number, or clear the box to use the next number.`;
}

/** True when a live (not deleted) return of this shop already has this number. */
export async function isReturnNumberInUse(
  client: SupabaseClient,
  table: ReturnTable,
  organizationId: string,
  number: string,
): Promise<boolean> {
  const { data, error } = await client
    .from(table)
    .select("id")
    .eq("organization_id", organizationId)
    .eq("return_number", number)
    .is("deleted_at", null)
    .limit(1);
  if (error) throw error;
  return Array.isArray(data) && data.length > 0;
}

/**
 * The one-step save keeps the typed number once its SQL update is applied. Before that, the
 * database took the next series number; put the typed one on the saved return instead.
 * Never throws: on failure the return keeps the series number and `kept` is false.
 */
export async function keepTypedReturnNumber(
  client: SupabaseClient,
  table: ReturnTable,
  returnId: string,
  typed: string,
  savedNumber: string,
): Promise<{ number: string; kept: boolean }> {
  if (savedNumber === typed) return { number: typed, kept: true };
  try {
    const { error } = await client.from(table).update({ return_number: typed } as never).eq("id", returnId);
    if (error) return { number: savedNumber, kept: false };
    return { number: typed, kept: true };
  } catch {
    return { number: savedNumber, kept: false };
  }
}
