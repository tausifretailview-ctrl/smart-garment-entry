/**
 * Insert customer_advances with race-safe advance_number allocation.
 *
 * generate_advance_number's advisory lock ends when the RPC returns; the app
 * then INSERTs in a second round-trip (same TOCTOU as Part 1 receipts).
 * Retries on uq_customer_advances_org_number / 23505.
 */

import type { SupabaseClient } from "@supabase/supabase-js";

export type CreateCustomerAdvanceParams = {
  organizationId: string;
  customerId: string;
  amount: number;
  advanceDate: string;
  paymentMethod?: string | null;
  chequeNumber?: string | null;
  transactionId?: string | null;
  description?: string | null;
  status?: string | null;
  createdBy?: string | null;
  usedAmount?: number;
};

export function isAdvanceNumberUniqueViolation(err: unknown): boolean {
  const e = err as { code?: string; message?: string } | null;
  if (!e) return false;
  const msg = String(e.message || "");
  if (e.code === "23505") {
    return (
      msg.includes("uq_customer_advances_org_number") ||
      msg.includes("advance_number") ||
      /duplicate key/i.test(msg)
    );
  }
  return /uq_customer_advances_org_number/i.test(msg);
}

const MAX_ATTEMPTS = 8;

export async function createCustomerAdvance(
  client: SupabaseClient,
  params: CreateCustomerAdvanceParams,
): Promise<{ id: string; advance_number: string; advance_date: string }> {
  if (!params.organizationId) throw new Error("organizationId is required");
  if (!params.customerId) throw new Error("customerId is required");
  if (!(Number(params.amount) > 0)) throw new Error("Advance amount must be greater than zero");

  let lastError: unknown;
  for (let attempt = 0; attempt < MAX_ATTEMPTS; attempt++) {
    const { data: advanceNumber, error: numberError } = await client.rpc(
      "generate_advance_number",
      { p_organization_id: params.organizationId },
    );
    if (numberError) throw numberError;
    if (!advanceNumber) throw new Error("generate_advance_number returned empty");

    const insertRow: Record<string, unknown> = {
      organization_id: params.organizationId,
      customer_id: params.customerId,
      advance_number: String(advanceNumber),
      amount: params.amount,
      used_amount: params.usedAmount ?? 0,
      advance_date: params.advanceDate,
      payment_method: params.paymentMethod ?? null,
      cheque_number: params.chequeNumber ?? null,
      transaction_id: params.transactionId ?? null,
      description: params.description ?? null,
      status: params.status ?? "active",
    };
    if (params.createdBy) insertRow.created_by = params.createdBy;

    const { data, error } = await client
      .from("customer_advances")
      .insert(insertRow as never)
      .select("id, advance_number, advance_date")
      .single();

    if (!error && data?.id) {
      return {
        id: data.id as string,
        advance_number: data.advance_number as string,
        advance_date: data.advance_date as string,
      };
    }
    lastError = error;
    if (!isAdvanceNumberUniqueViolation(error)) throw error;
  }

  throw lastError instanceof Error
    ? lastError
    : new Error(
        String(
          (lastError as { message?: string })?.message ||
            "Failed to allocate a unique advance number",
        ),
      );
}
