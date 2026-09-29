import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const fromMock = vi.fn();
const rpcMock = vi.fn();

vi.mock("@/integrations/supabase/client", () => ({
  supabase: {
    from: (...args: unknown[]) => fromMock(...args),
    rpc: (...args: unknown[]) => rpcMock(...args),
  },
}));

import {
  appendCustomerPageLinkLine,
  buildCustomerPageUrl,
  createCustomerPageLinkForWhatsApp,
  customerPageBaseDomain,
} from "./customerPageLink";
import { applyWhatsAppTemplatePlaceholders } from "./whatsappInvoiceCaption";

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

describe("customer page link helpers", () => {
  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it("normalises the base domain", () => {
    vi.stubEnv("VITE_CUSTOMER_PAGE_DOMAIN", " https://Ezzy.Shop/ ");
    expect(customerPageBaseDomain()).toBe("ezzy.shop");
  });

  it("builds the /t/<token> url on the shop subdomain", () => {
    expect(buildCustomerPageUrl("Demo", "abc123", "ezzy.shop")).toBe("https://demo.ezzy.shop/t/abc123");
  });

  it("appends the link once, only when present", () => {
    expect(appendCustomerPageLinkLine("Hi\n", "")).toBe("Hi\n");
    expect(appendCustomerPageLinkLine("Hi\n", "https://x/t/1")).toBe("Hi\n\nView your bill: https://x/t/1");
    expect(appendCustomerPageLinkLine("See https://x/t/1", "https://x/t/1")).toBe("See https://x/t/1");
  });

  it("fills {customer_page_link} in templates", () => {
    const out = applyWhatsAppTemplatePlaceholders(
      "Bill: {CUSTOMER_PAGE_LINK}",
      { customer_page_link: "https://x/t/1" },
      "Shop",
    );
    expect(out).toBe("Bill: https://x/t/1");
  });
});

describe("createCustomerPageLinkForWhatsApp", () => {
  beforeEach(() => {
    fromMock.mockReset();
    rpcMock.mockReset();
    vi.stubEnv("VITE_CUSTOMER_PAGE_DOMAIN", "ezzy.shop");
  });
  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it("returns the link when the shop has it on", async () => {
    tableReturning({
      customer_page_settings: { enabled: true, add_link_to_whatsapp: true },
      organizations: { public_subdomain: "demo" },
    });
    rpcMock.mockResolvedValue({ data: { ok: true, token: "tok" }, error: null });
    await expect(createCustomerPageLinkForWhatsApp("org", "sale")).resolves.toBe("https://demo.ezzy.shop/t/tok");
    expect(rpcMock).toHaveBeenCalledWith("create_customer_link", { p_sale_id: "sale" });
  });

  it("does not create a link when the WhatsApp switch is off", async () => {
    tableReturning({
      customer_page_settings: { enabled: true, add_link_to_whatsapp: false },
      organizations: { public_subdomain: "demo" },
    });
    await expect(createCustomerPageLinkForWhatsApp("org", "sale")).resolves.toBe("");
    expect(rpcMock).not.toHaveBeenCalled();
  });

  it("does not create a link when the shop has no subdomain", async () => {
    tableReturning({
      customer_page_settings: { enabled: true, add_link_to_whatsapp: true },
      organizations: { public_subdomain: null },
    });
    await expect(createCustomerPageLinkForWhatsApp("org", "sale")).resolves.toBe("");
    expect(rpcMock).not.toHaveBeenCalled();
  });

  it("does nothing when the customer domain is not configured", async () => {
    vi.stubEnv("VITE_CUSTOMER_PAGE_DOMAIN", "");
    await expect(createCustomerPageLinkForWhatsApp("org", "sale")).resolves.toBe("");
    expect(fromMock).not.toHaveBeenCalled();
  });

  it("returns empty on an RPC error (bill without a valid mobile)", async () => {
    tableReturning({
      customer_page_settings: { enabled: true, add_link_to_whatsapp: true },
      organizations: { public_subdomain: "demo" },
    });
    rpcMock.mockResolvedValue({ data: null, error: { message: "Sale has no valid mobile number" } });
    await expect(createCustomerPageLinkForWhatsApp("org", "sale")).resolves.toBe("");
  });
});
