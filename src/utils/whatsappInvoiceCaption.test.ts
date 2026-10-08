import { beforeEach, describe, expect, it, vi } from "vitest";

const fromMock = vi.fn();

vi.mock("@/integrations/supabase/client", () => ({
  supabase: {
    from: (...args: unknown[]) => fromMock(...args),
  },
}));

import { applyWhatsAppTemplatePlaceholders, buildSalesInvoiceWhatsAppCaption } from "./whatsappInvoiceCaption";

function tableReturning(rows: Record<string, unknown>) {
  fromMock.mockImplementation((table: string) => {
    const chain = {
      select: () => chain,
      eq: () => chain,
      maybeSingle: () => Promise.resolve({ data: rows[table] ?? null, error: null }),
    };
    return chain;
  });
}

const sale = {
  customer_name: "TEST",
  sale_number: "POS/26-27/2302",
  sale_date: "2026-10-02",
  net_amount: 10,
  payment_status: "completed",
};

describe("sales invoice WhatsApp caption", () => {
  beforeEach(() => fromMock.mockReset());

  it("puts the shop name, address and phone above the invoice details", async () => {
    tableReturning({
      settings: { business_name: "Albeli Print Name", address: "Shop 4, Main Road,\nAndheri West", mobile_number: "9876543210" },
    });
    const text = await buildSalesInvoiceWhatsAppCaption("org-1", sale, "ALBELI FASHION");
    const lines = text.split("\n");
    expect(lines[0]).toBe("🏬 *ALBELI FASHION*");
    expect(lines[1]).toBe("📍 Shop 4, Main Road, Andheri West");
    expect(lines[2]).toBe("📞 9876543210");
    expect(text).toContain("Hello *TEST* 👋");
    expect(text).toContain("🧾 *Invoice No:* POS/26-27/2302");
    expect(text).toContain("💰 *Amount:* ₹10");
    expect(text).toContain("💳 *Payment:* Completed");
    expect(text.indexOf("📍")).toBeLessThan(text.indexOf("🧾"));
    expect(text.endsWith("👉 Reply *OK* to save our number and get your bill updates.")).toBe(true);
  });

  it("drops the address and phone lines when the shop has not set them", async () => {
    tableReturning({ settings: { business_name: "", address: null, mobile_number: "" } });
    const text = await buildSalesInvoiceWhatsAppCaption("org-1", sale, "ALBELI FASHION");
    expect(text).not.toContain("📍");
    expect(text).not.toContain("📞");
    expect(text).not.toContain("{organization_");
    expect(text.startsWith("🏬 *ALBELI FASHION*\n\nHello *TEST* 👋")).toBe(true);
  });

  it("keeps a shop's own saved template", async () => {
    tableReturning({
      whatsapp_templates: { message_template: "Hi {customer_name} from {organization_name}" },
      settings: { address: "X" },
    });
    const text = await buildSalesInvoiceWhatsAppCaption("org-1", sale, "ALBELI FASHION");
    expect(text).toBe("Hi TEST from ALBELI FASHION");
  });

  it("fills the new shop placeholders in custom templates", () => {
    expect(
      applyWhatsAppTemplatePlaceholders(
        "{ORGANIZATION_ADDRESS} | {organization_phone}",
        { organization_address: "A", organization_phone: "1" },
        "Shop",
      ),
    ).toBe("A | 1");
  });
});

describe("credit note redeemed on the bill", () => {
  const cnSale = { customer_name: "SHAHEENA KHAN", net_amount: 4300, paid_amount: 700, sale_return_adjust: 3600 };

  it("adds a CN Adjusted line under Amount and nets it out of pending", () => {
    const text = applyWhatsAppTemplatePlaceholders(
      "Amount: {amount}\nPending: {pending_amount}",
      cnSale,
      "Shop",
    );
    expect(text).toBe("Amount: ₹4,300\n🔁 *CN Adjusted:* ₹3,600\nPending: ₹0");
  });

  it("fills {cn_adjusted} where the shop put it, and drops that line when there is no CN", () => {
    const template = "Hi\nCN: {cn_adjusted}\nAmount: {amount}";
    expect(applyWhatsAppTemplatePlaceholders(template, cnSale, "Shop")).toBe("Hi\nCN: ₹3,600\nAmount: ₹4,300");
    expect(applyWhatsAppTemplatePlaceholders(template, { net_amount: 500 }, "Shop")).toBe("Hi\nAmount: ₹500");
  });
});
