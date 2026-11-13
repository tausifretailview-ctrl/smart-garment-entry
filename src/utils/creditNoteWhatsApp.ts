/**
 * WhatsApp message for a credit note made in the POS Sale Return window. Sent as plain text
 * through the shop's own WhatsApp (Settings → WhatsApp: Ezzy WhatsApp built-in or WappConnect),
 * the same way the payment receipt is sent. The Meta Business API needs an approved template for
 * a message like this, so those shops do not get the option.
 */

/** WhatsApp settings fields that decide whether the credit note can be sent. */
export type CreditNoteWhatsAppSettings = {
  is_active?: boolean | null;
  send_provider?: string | null;
};

export function canSendCreditNoteWhatsApp(settings: CreditNoteWhatsAppSettings | null | undefined): boolean {
  if (!settings?.is_active) return false;
  return settings.send_provider === "builtin" || settings.send_provider === "wappconnect";
}

export type CreditNoteWhatsAppDetails = {
  shopName: string;
  customerName: string;
  creditNoteNumber: string;
  returnNumber: string;
  /** Credit note value (₹). */
  amount: number;
  /** Return date as yyyy-mm-dd. */
  returnDate: string;
  /** Bill the goods were returned against, when known. */
  originalBillNumber?: string | null;
  itemCount: number;
};

function formatInr(n: number): string {
  const v = Number.isFinite(n) ? n : 0;
  return v.toLocaleString("en-IN", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

function formatYmd(ymd: string): string {
  const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(ymd || "");
  return m ? `${m[3]}/${m[2]}/${m[1]}` : ymd;
}

export function buildCreditNoteWhatsAppMessage(d: CreditNoteWhatsAppDetails): string {
  const name = d.customerName.trim() || "Customer";
  const lines = [
    `Dear ${name},`,
    "",
    `A credit note has been issued for your return${d.shopName.trim() ? ` at ${d.shopName.trim()}` : ""}.`,
    "",
    `Credit Note No: ${d.creditNoteNumber}`,
    `Return No: ${d.returnNumber}`,
    `Date: ${formatYmd(d.returnDate)}`,
  ];
  if (d.originalBillNumber?.trim()) lines.push(`Against Bill: ${d.originalBillNumber.trim()}`);
  if (d.itemCount > 0) lines.push(`Items Returned: ${d.itemCount}`);
  lines.push(`Credit Amount: ₹${formatInr(d.amount)}`, "", "You can use this credit on your next purchase.", "Thank you!");
  return lines.join("\n");
}

type DbError = { code?: string; message?: string } | null;
type InvokeClient = {
  from: (table: string) => {
    select: (cols: string) => {
      eq: (col: string, value: string) => { maybeSingle: () => Promise<{ data: unknown; error: DbError }> };
    };
  };
  functions: {
    invoke: (
      name: string,
      opts: { body: unknown },
    ) => Promise<{ data: { success?: boolean; error?: string; reason?: string } | null; error: unknown }>;
  };
};

export type CreditNoteWhatsAppResult = { status: "sent" } | { status: "no_phone" } | { status: "failed"; message: string };

/**
 * Looks up the customer's phone and sends the message. Never throws: the return is already saved.
 */
export async function sendCreditNoteWhatsApp(
  client: unknown,
  args: { organizationId: string; customerId: string; message: string; creditNoteId?: string | null },
): Promise<CreditNoteWhatsAppResult> {
  const sb = client as InvokeClient;
  try {
    const { data: customer, error } = await sb
      .from("customers")
      .select("phone")
      .eq("id", args.customerId)
      .maybeSingle();
    if (error) throw error;
    const phone = String((customer as { phone?: string | null } | null)?.phone || "").trim();
    if (!phone) return { status: "no_phone" };

    const { data: res, error: sendError } = await sb.functions.invoke("send-whatsapp", {
      body: {
        organizationId: args.organizationId,
        phone,
        message: args.message,
        messageType: "text",
        // Not "sale": the invoice's 60-minute duplicate guard must not block this.
        referenceType: "credit_note",
        referenceId: args.creditNoteId || undefined,
        useWappConnect: true,
      },
    });
    if (sendError) throw sendError;
    if (res && res.success === false) throw new Error(String(res.error || res.reason || "WhatsApp send failed"));
    return { status: "sent" };
  } catch (err) {
    console.error("[creditNoteWhatsApp] send failed:", err);
    return { status: "failed", message: err instanceof Error ? err.message : String(err) };
  }
}
