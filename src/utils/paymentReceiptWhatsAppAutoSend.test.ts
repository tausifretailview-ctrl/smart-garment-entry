import { afterEach, describe, expect, it, vi } from "vitest";
import { autoSendPaymentReceiptWhatsApp, canAutoSendPaymentReceipt } from "./paymentReceiptWhatsApp";

function fakeClient(settingsReplies: Array<{ data: unknown; error: unknown }>, sendReply = { data: { success: true }, error: null }) {
  const selects: string[] = [];
  const invoke = vi.fn().mockResolvedValue(sendReply);
  const client = {
    from: () => ({
      select: (cols: string) => {
        selects.push(cols);
        const reply = settingsReplies.shift() ?? { data: null, error: null };
        return { eq: () => ({ maybeSingle: () => Promise.resolve(reply) }) };
      },
    }),
    functions: { invoke },
  };
  return { client, invoke, selects };
}

const on = { is_active: true, send_provider: "builtin", auto_send_payment_receipt: true };

describe("canAutoSendPaymentReceipt", () => {
  it("needs WhatsApp on, the switch not off, and Ezzy WhatsApp or WappConnect", () => {
    expect(canAutoSendPaymentReceipt(on)).toBe(true);
    expect(canAutoSendPaymentReceipt({ ...on, send_provider: "wappconnect" })).toBe(true);
    expect(canAutoSendPaymentReceipt({ is_active: true, send_provider: "builtin" })).toBe(true); // SQL not run yet
    expect(canAutoSendPaymentReceipt({ ...on, auto_send_payment_receipt: false })).toBe(false);
    expect(canAutoSendPaymentReceipt({ ...on, is_active: false })).toBe(false);
    expect(canAutoSendPaymentReceipt({ ...on, send_provider: "existing" })).toBe(false);
    expect(canAutoSendPaymentReceipt(null)).toBe(false);
  });
});

describe("autoSendPaymentReceiptWhatsApp", () => {
  afterEach(() => vi.restoreAllMocks());

  it("sends the receipt text, not tied to the invoice duplicate guard", async () => {
    const { client, invoke } = fakeClient([{ data: on, error: null }]);
    await expect(
      autoSendPaymentReceiptWhatsApp(client, { organizationId: "org", phone: "9852631478", message: "*PAYMENT RECEIPT*", saleId: "s1" }),
    ).resolves.toBe("sent");
    expect(invoke).toHaveBeenCalledWith("send-whatsapp", {
      body: expect.objectContaining({
        organizationId: "org",
        phone: "9852631478",
        message: "*PAYMENT RECEIPT*",
        messageType: "text",
        referenceType: "payment_receipt",
        referenceId: "s1",
      }),
    });
  });

  it("skips without a phone, or when the shop turned it off", async () => {
    const noPhone = fakeClient([{ data: on, error: null }]);
    expect(await autoSendPaymentReceiptWhatsApp(noPhone.client, { organizationId: "org", phone: "", message: "x" })).toBe("skipped");
    const off = fakeClient([{ data: { ...on, auto_send_payment_receipt: false }, error: null }]);
    expect(await autoSendPaymentReceiptWhatsApp(off.client, { organizationId: "org", phone: "98", message: "x" })).toBe("skipped");
    expect(off.invoke).not.toHaveBeenCalled();
  });

  it("works before the SQL is run (column missing = on)", async () => {
    const { client, invoke, selects } = fakeClient([
      { data: null, error: { code: "42703", message: "column does not exist" } },
      { data: { is_active: true, send_provider: "wappconnect" }, error: null },
    ]);
    expect(await autoSendPaymentReceiptWhatsApp(client, { organizationId: "org", phone: "98", message: "x" })).toBe("sent");
    expect(selects).toEqual(["is_active, send_provider, auto_send_payment_receipt", "is_active, send_provider"]);
    expect(invoke).toHaveBeenCalledOnce();
  });

  it("never throws when the send fails", async () => {
    vi.spyOn(console, "error").mockImplementation(() => undefined);
    const { client } = fakeClient([{ data: on, error: null }], { data: { success: false, error: "not connected" }, error: null });
    expect(await autoSendPaymentReceiptWhatsApp(client, { organizationId: "org", phone: "98", message: "x" })).toBe("failed");
  });
});
