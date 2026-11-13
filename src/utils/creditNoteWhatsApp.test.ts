import { describe, expect, it, vi } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import {
  buildCreditNoteWhatsAppMessage,
  canSendCreditNoteWhatsApp,
  sendCreditNoteWhatsApp,
} from "./creditNoteWhatsApp";

function fakeClient(customer: { data: unknown; error: unknown }, sendReply: { data: unknown; error: unknown } = { data: { success: true }, error: null }) {
  const invoke = vi.fn().mockResolvedValue(sendReply);
  const eqs: Array<[string, string]> = [];
  const client = {
    from: (table: string) => {
      expect(table).toBe("customers");
      return {
        select: (cols: string) => {
          expect(cols).toBe("phone");
          return { eq: (c: string, v: string) => { eqs.push([c, v]); return { maybeSingle: () => Promise.resolve(customer) }; } };
        },
      };
    },
    functions: { invoke },
  };
  return { client, invoke, eqs };
}

const args = { organizationId: "org1", customerId: "c1", message: "hi", creditNoteId: "cn1" };

describe("canSendCreditNoteWhatsApp", () => {
  it("only when WhatsApp is on with Ezzy WhatsApp or WappConnect", () => {
    expect(canSendCreditNoteWhatsApp({ is_active: true, send_provider: "builtin" })).toBe(true);
    expect(canSendCreditNoteWhatsApp({ is_active: true, send_provider: "wappconnect" })).toBe(true);
    expect(canSendCreditNoteWhatsApp({ is_active: true, send_provider: "existing" })).toBe(false);
    expect(canSendCreditNoteWhatsApp({ is_active: false, send_provider: "builtin" })).toBe(false);
    expect(canSendCreditNoteWhatsApp(null)).toBe(false);
    expect(canSendCreditNoteWhatsApp(undefined)).toBe(false);
  });
});

describe("buildCreditNoteWhatsAppMessage", () => {
  it("full message", () => {
    expect(
      buildCreditNoteWhatsAppMessage({
        shopName: "Demo Shop",
        customerName: "Ravi",
        creditNoteNumber: "CN/26-27/7",
        returnNumber: "SR/26-27/12",
        amount: 1499.5,
        returnDate: "2026-11-13",
        originalBillNumber: "POS/26-27/90",
        itemCount: 2,
      }),
    ).toBe(
      [
        "Dear Ravi,",
        "",
        "A credit note has been issued for your return at Demo Shop.",
        "",
        "Credit Note No: CN/26-27/7",
        "Return No: SR/26-27/12",
        "Date: 13/11/2026",
        "Against Bill: POS/26-27/90",
        "Items Returned: 2",
        "Credit Amount: ₹1,499.50",
        "",
        "You can use this credit on your next purchase.",
        "Thank you!",
      ].join("\n"),
    );
  });
  it("leaves out the bill and shop when unknown", () => {
    const msg = buildCreditNoteWhatsAppMessage({
      shopName: "",
      customerName: " ",
      creditNoteNumber: "CN1",
      returnNumber: "SR1",
      amount: 100,
      returnDate: "2026-11-13",
      originalBillNumber: null,
      itemCount: 0,
    });
    expect(msg).toContain("Dear Customer,");
    expect(msg).toContain("issued for your return.");
    expect(msg).not.toContain("Against Bill");
    expect(msg).not.toContain("Items Returned");
  });
});

describe("sendCreditNoteWhatsApp", () => {
  it("sends a text message to the customer's phone", async () => {
    const { client, invoke, eqs } = fakeClient({ data: { phone: "98765 43210" }, error: null });
    await expect(sendCreditNoteWhatsApp(client, args)).resolves.toEqual({ status: "sent" });
    expect(eqs).toEqual([["id", "c1"]]);
    expect(invoke).toHaveBeenCalledWith("send-whatsapp", {
      body: {
        organizationId: "org1",
        phone: "98765 43210",
        message: "hi",
        messageType: "text",
        referenceType: "credit_note",
        referenceId: "cn1",
        useWappConnect: true,
      },
    });
  });
  it("no phone: nothing sent", async () => {
    const { client, invoke } = fakeClient({ data: { phone: "" }, error: null });
    await expect(sendCreditNoteWhatsApp(client, args)).resolves.toEqual({ status: "no_phone" });
    expect(invoke).not.toHaveBeenCalled();
  });
  it("send refused or errors: failed with the reason, never throws", async () => {
    const errSpy = vi.spyOn(console, "error").mockImplementation(() => {});
    const refused = fakeClient({ data: { phone: "9876543210" }, error: null }, { data: { success: false, error: "Not connected" }, error: null });
    await expect(sendCreditNoteWhatsApp(refused.client, args)).resolves.toEqual({ status: "failed", message: "Not connected" });
    const lookup = fakeClient({ data: null, error: new Error("boom") });
    await expect(sendCreditNoteWhatsApp(lookup.client, args)).resolves.toEqual({ status: "failed", message: "boom" });
    errSpy.mockRestore();
  });
});

describe("POS Sale Return window", () => {
  const src = readFileSync(resolve(__dirname, "../components/FloatingSaleReturn.tsx"), "utf8");
  it("offers the WhatsApp tick on Credit Note and sends after the credit note is created", () => {
    expect(src).toContain('refundType === "credit_note" && canSendCnWhatsApp');
    expect(src).toContain("savedCreditNoteId = creditNote.id;");
    expect(src).toMatch(/sendCnWhatsApp &&\s*canSendCnWhatsApp/);
    expect(src).toContain("void sendCreditNoteWhatsApp(supabase,");
  });
});
