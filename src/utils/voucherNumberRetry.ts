/**
 * Insert a voucher (receipt, payment, expense, refund…) with a number from
 * generate_voucher_number, and take a new number if another cashier got the same one.
 *
 * Voucher numbers are one series shared by all shops. generate_voucher_number hands out the
 * next number under a lock, but the lock ends when that request returns; the insert is a
 * second request. Two cashiers, even in different shops, could be given the same number, and
 * the second insert then failed on uq_voucher_entries_number_active with a "duplicate key"
 * error (review item D2). Only invoice receipts (createReceiptVoucher) retried.
 */
type DbError = { code?: string; message?: string; details?: string | null } | null;

type RpcClient = {
  rpc: (fn: string, args: Record<string, unknown>) => PromiseLike<{ data: unknown; error: DbError }>;
};

export const VOUCHER_NUMBER_MAX_ATTEMPTS = 8;

/** The unique index on voucher_entries.voucher_number refused the row. */
export function isVoucherNumberClash(err: unknown): boolean {
  const e = err as { code?: string; message?: string; details?: string | null } | null;
  if (!e || e.code !== "23505") return false;
  return `${e.message || ""} ${e.details || ""}`.includes("uq_voucher_entries_number_active");
}

export async function generateVoucherNumber(client: unknown, type: string, date: string): Promise<string> {
  const { data, error } = await (client as RpcClient).rpc("generate_voucher_number", { p_type: type, p_date: date });
  if (error) throw error;
  if (!data) throw new Error("Could not get a voucher number. Please try again.");
  return String(data);
}

/**
 * Runs `write(number)`; when the number was taken in the meantime, gets a fresh one and runs it
 * again. `write` must do one insert and build the stored number from the number it is given
 * (add its own suffix for multi-row payments). Returns what the last `write` returned, plus
 * the number used: pass it as `baseNumber` for the next row of the same payment.
 *
 * Any other error (including the retry-of-the-same-submit index
 * uq_voucher_entries_client_request_active) is returned as is, never retried.
 */
export async function insertVoucherRetryingNumber<R extends { error: unknown }>(
  client: unknown,
  opts: {
    type: string;
    /** yyyy-MM-dd */
    date: string;
    /** Number already taken for this payment (rows after the first). */
    baseNumber?: string | null;
    write: (voucherNumber: string) => PromiseLike<R>;
    maxAttempts?: number;
  },
): Promise<R & { voucherNumber: string }> {
  const attempts = Math.max(1, opts.maxAttempts ?? VOUCHER_NUMBER_MAX_ATTEMPTS);
  let voucherNumber = opts.baseNumber ? String(opts.baseNumber) : await generateVoucherNumber(client, opts.type, opts.date);
  let result = await opts.write(voucherNumber);
  for (let attempt = 1; attempt < attempts && isVoucherNumberClash(result.error); attempt++) {
    voucherNumber = await generateVoucherNumber(client, opts.type, opts.date);
    result = await opts.write(voucherNumber);
  }
  return { ...result, voucherNumber };
}
