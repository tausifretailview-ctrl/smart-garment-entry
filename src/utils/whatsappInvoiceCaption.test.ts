import { beforeEach, describe, expect, it, vi } from "vitest";

const fromMock = vi.fn();

vi.mock("@/integrations/supabase/client", () => ({
  supabase: {
    from: (...args: unknown[]) => fromMock(...args),
  },
}));

import { applyWhatsAppTemplatePlaceholders, buildSalesInvoiceWhatsAppCaption, mergeShopSocialLinks } from "./whatsappInvoiceCaption";

function tableReturning(rows: Record<string, unknown>) {
  fromMock.mockImplementation((table: string) => {
    const chain = {
      select: () => chain,
      eq: () => chain,
      limit: () => chain,
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

describe("points and shop links on the bill message", () => {
  beforeEach(() => fromMock.mockReset());

  const pointsShop = {
    settings: {
      business_name: "Shop",
      sale_settings: { enable_points_system: true, points_ratio_amount: 100, points_per_ratio: 1 },
    },
    sales: { customer_id: "c-1", net_amount: 714 },
    customers: { points_balance: 40 },
  };

  it("adds points under Payment, counting this bill when it is not awarded yet", async () => {
    tableReturning(pointsShop);
    const text = await buildSalesInvoiceWhatsAppCaption("org-1", { ...sale, sale_id: "s-1", net_amount: 714 }, "Shop");
    expect(text).toContain("💳 *Payment:* Completed\n🎁 *Points earned:* 7\n🏆 *Total points:* 47");
  });

  it("uses the awarded points row when it exists", async () => {
    tableReturning({ ...pointsShop, customer_points_history: { points: 7 }, customers: { points_balance: 47 } });
    const text = await buildSalesInvoiceWhatsAppCaption("org-1", { ...sale, sale_id: "s-1" }, "Shop");
    expect(text).toContain("🎁 *Points earned:* 7\n🏆 *Total points:* 47");
  });

  it("leaves points out when the shop has points off or the bill has no customer", async () => {
    tableReturning({ ...pointsShop, sales: { customer_id: null, net_amount: 714 } });
    const text = await buildSalesInvoiceWhatsAppCaption("org-1", { ...sale, sale_id: "s-1" }, "Shop");
    expect(text).not.toContain("Points");
  });

  it("adds Google review and Instagram under the bill links", async () => {
    tableReturning({
      settings: { business_name: "Shop" },
      whatsapp_api_settings: { social_links: { google_review: "https://g.page/r/x/review", instagram: "HTTPS://WWW.INSTAGRAM.COM/MY_SHOP/" } },
    });
    const text = await buildSalesInvoiceWhatsAppCaption(
      "org-1",
      { ...sale, customer_page_link: "https://a.ezzy.shop/t/abc" },
      "Shop",
    );
    expect(text.endsWith(
      "⭐ Review your shopping: https://a.ezzy.shop/t/abc#rate\n📍 Review us on Google: https://g.page/r/x/review\n📷 Follow us on Instagram: https://www.instagram.com/my_shop/",
    )).toBe(true);
  });
});

describe("Instagram link saved in Settings > Bill & Barcode", () => {
  beforeEach(() => fromMock.mockReset());

  it("adds it to the bill message when Settings > WhatsApp has no Instagram link", async () => {
    tableReturning({
      settings: {
        business_name: "Shop",
        bill_barcode_settings: { instagram_link: "https://www.Instagram.com/adeebaareeba.in?stkn=NXRsZWZibGsyZnhr" },
      },
      whatsapp_api_settings: { social_links: { instagram: "", google_review: "" } },
      whatsapp_templates: { message_template: "Hello {customer_name}, bill {invoice_number} for {amount}." },
    });
    const text = await buildSalesInvoiceWhatsAppCaption("org-1", sale, "Shop");
    expect(text).toBe(
      "Hello TEST, bill POS/26-27/2302 for ₹10.\n\n📷 Follow us on Instagram: https://www.instagram.com/adeebaareeba.in?stkn=NXRsZWZibGsyZnhr",
    );
  });

  it("does not repeat it when the template already prints {instagram_link}", async () => {
    tableReturning({
      settings: { business_name: "Shop", bill_barcode_settings: { instagram_link: "https://instagram.com/shop" } },
      whatsapp_templates: { message_template: "Hi {customer_name}\nInsta: {instagram_link}" },
    });
    const text = await buildSalesInvoiceWhatsAppCaption("org-1", sale, "Shop");
    expect(text).toBe("Hi TEST\nInsta: https://instagram.com/shop");
  });

  it("prefers the WhatsApp settings link when both are filled", () => {
    expect(
      mergeShopSocialLinks({ instagram: "https://instagram.com/a" }, { instagram_link: "https://instagram.com/b" }).instagram,
    ).toBe("https://instagram.com/a");
    expect(mergeShopSocialLinks(null, { google_review_link: " https://g.page/x " }).google_review).toBe("https://g.page/x");
  });
});

describe("amounts in whole rupees", () => {
  it("rounds a bill net with paise (₹800.4 → ₹800, ₹1,154.76 → ₹1,155)", () => {
    const template = "Amount: {amount}\nPaid: {paid_amount}";
    expect(applyWhatsAppTemplatePlaceholders(template, { net_amount: 800.4, paid_amount: 800.4 }, "Shop")).toBe(
      "Amount: ₹800\nPaid: ₹800",
    );
    expect(applyWhatsAppTemplatePlaceholders("Amount: {amount}", { net_amount: 1154.76 }, "Shop")).toBe(
      "Amount: ₹1,155",
    );
  });
});
