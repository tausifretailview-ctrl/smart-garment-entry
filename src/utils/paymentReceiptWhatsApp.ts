/**
 * Extra WhatsApp line(s) when a receipt includes settlement discount.
 * Place after the paid-amount line and before balance / payment mode in standard receipts.
 */
export function whatsappPaymentReceiptDiscountLines(
  discountAmount: number | undefined,
  discountReason: string | undefined,
  formatInrBody: (n: number) => string
): string {
  const d = Number(discountAmount);
  if (!Number.isFinite(d) || d <= 0) return "";
  const reason = (discountReason ?? "").trim();
  const reasonPart = reason ? ` (${reason})` : "";
  return `\nDiscount: ₹${formatInrBody(d)}${reasonPart}`;
}

/** WhatsApp settings fields that decide the automatic payment receipt. */
export type PaymentReceiptAutoSendSettings = {
  is_active?: boolean | null;
  send_provider?: string | null;
  /** Settings → WhatsApp "Auto-send Payment Receipt". Missing (SQL not run yet) = on. */
  auto_send_payment_receipt?: boolean | null;
};

/**
 * Send the receipt by itself only through Ezzy WhatsApp (built-in) or WappConnect, which take
 * a plain text message. The Meta Business API needs an approved template for this, so those
 * shops keep the "Send via WhatsApp" button.
 */
export function canAutoSendPaymentReceipt(settings: PaymentReceiptAutoSendSettings | null | undefined): boolean {
  if (!settings?.is_active) return false;
  if (settings.auto_send_payment_receipt === false) return false;
  return settings.send_provider === "builtin" || settings.send_provider === "wappconnect";
}

type DbError = { code?: string; message?: string } | null;
type SettingsQuery = {
  select: (cols: string) => {
    eq: (col: string, value: string) => { maybeSingle: () => Promise<{ data: unknown; error: DbError }> };
  };
};
type InvokeClient = {
  from: (table: string) => SettingsQuery;
  functions: {
    invoke: (
      name: string,
      opts: { body: unknown },
    ) => Promise<{ data: { success?: boolean; error?: string; reason?: string } | null; error: unknown }>;
  };
};

export type PaymentReceiptAutoSendResult = "sent" | "skipped" | "failed";

/**
 * After a payment is collected on the POS / Sales dashboard: send the receipt text to the
 * customer on WhatsApp when the shop's WhatsApp is on and "Auto-send Payment Receipt" is on.
 * Never throws; the cashier can still use the "Send via WhatsApp" button.
 */
export async function autoSendPaymentReceiptWhatsApp(
  client: unknown,
  args: { organizationId: string; phone: string | null | undefined; message: string; saleId?: string | null },
): Promise<PaymentReceiptAutoSendResult> {
  const sb = client as InvokeClient;
  const phone = String(args.phone || "").trim();
  if (!args.organizationId || !phone || !args.message) return "skipped";
  try {
    const read = (cols: string) =>
      sb.from("whatsapp_api_settings").select(cols).eq("organization_id", args.organizationId).maybeSingle();
    let { data, error } = await read("is_active, send_provider, auto_send_payment_receipt");
    if (error && String(error.code) === "42703") {
      // Column not added yet (SQL pending): the switch counts as on.
      ({ data, error } = await read("is_active, send_provider"));
    }
    if (error) throw error;
    if (!canAutoSendPaymentReceipt(data as PaymentReceiptAutoSendSettings | null)) return "skipped";

    const { data: res, error: sendError } = await sb.functions.invoke("send-whatsapp", {
      body: {
        organizationId: args.organizationId,
        phone,
        message: args.message,
        messageType: "text",
        // Not "sale": the invoice's 60-minute duplicate guard must not block a receipt.
        referenceType: "payment_receipt",
        referenceId: args.saleId || undefined,
        useWappConnect: true,
      },
    });
    if (sendError) throw sendError;
    if (res && res.success === false) throw new Error(String(res.error || res.reason || "WhatsApp send failed"));
    return "sent";
  } catch (err) {
    console.error("[paymentReceiptWhatsApp] auto-send failed:", err);
    return "failed";
  }
}
