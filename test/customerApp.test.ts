import { describe, expect, it } from "vitest";
import {
  buildCustomerTransactions,
  cleanSubdomain,
  clientIp,
  deriveSessionSecret,
  lineTax,
  maskPhone,
  phoneLast10,
  shopProfileFromSettings,
  signSessionToken,
  verifySessionToken,
} from "../supabase/functions/_shared/customerApp";

describe("customer-app helpers", () => {
  it("normalises and masks mobile numbers", () => {
    expect(phoneLast10("+91 88600 68772")).toBe("8860068772");
    expect(phoneLast10("12345")).toBe("");
    expect(maskPhone("918860068772")).toBe("******8772");
    expect(maskPhone(null)).toBe("");
  });

  it("builds the public shop header from settings", () => {
    expect(
      shopProfileFromSettings("KS", {
        business_name: " KS Footwear ",
        address: "Shop 4,\n  Main Road",
        mobile_number: "+91 98200 12345",
        bill_barcode_settings: { logo_url: "https://cdn.example.com/logo.png" },
      }),
    ).toEqual({
      name: "KS Footwear",
      address: "Shop 4, Main Road",
      phone: "+91 98200 12345",
      whatsapp: "919820012345",
      logo_url: "https://cdn.example.com/logo.png",
    });
    expect(shopProfileFromSettings("Org", { bill_barcode_settings: { logo_url: "javascript:alert(1)" } })).toEqual({
      name: "Org",
      address: null,
      phone: null,
      whatsapp: null,
      logo_url: null,
    });
    expect(shopProfileFromSettings("Org", null).name).toBe("Org");
  });

  it("accepts only plain subdomain labels", () => {
    expect(cleanSubdomain(" Gurukrupa ")).toBe("gurukrupa");
    expect(cleanSubdomain("a.b")).toBe("");
    expect(cleanSubdomain("x'--")).toBe("");
  });

  it("splits GST for inclusive and exclusive lines", () => {
    expect(lineTax(1050, 5, "inclusive")).toEqual({ taxable: 1000, tax: 50 });
    expect(lineTax(1000, 5, "exclusive")).toEqual({ taxable: 1000, tax: 50 });
    expect(lineTax(1800, 0, null)).toEqual({ taxable: 1800, tax: 0 });
  });

  it("lists bills, payments and returns newest first with each bill's due", () => {
    const rows = buildCustomerTransactions(
      [{ id: "s1", sale_number: "POS/26-27/2000", sale_date: "2026-10-02", net_amount: 1800, paid_amount: 1000 }],
      [{ voucher_number: "RCT/1", voucher_date: "2026-10-05", total_amount: 800, payment_method: "cash" }],
      [{ return_number: "SR/1", return_date: "2026-09-01", net_amount: 500, original_sale_number: "POS/1" }],
    );
    expect(rows.map((r) => r.kind)).toEqual(["payment", "bill", "return"]);
    expect(rows[1]).toMatchObject({ ref: "POS/26-27/2000", amount: 1800, due: 800, saleId: "s1" });
    expect(rows[2].note).toBe("Against POS/1");
  });

  it("picks the client IP from platform headers first", () => {
    const h = (o: Record<string, string>) => ({ get: (k: string) => o[k] ?? null });
    expect(clientIp(h({ "cf-connecting-ip": "1.1.1.1", "x-forwarded-for": "9.9.9.9" }))).toBe("1.1.1.1");
    expect(clientIp(h({ "x-forwarded-for": "2.2.2.2, 10.0.0.1" }))).toBe("2.2.2.2");
    expect(clientIp(h({}))).toBe("unknown");
  });

  it("signs and verifies customer-app sessions; rejects tampering, expiry and other shops", async () => {
    const secret = await deriveSessionSecret("service-role-key-for-test");
    const org = "11111111-1111-4111-8111-111111111111";
    const now = 1_800_000_000_000;
    const token = await signSessionToken({ organizationId: org, customerId: "c1", expiresAt: now + 1000 }, secret);
    expect(token.startsWith("ca1.")).toBe(true);
    expect(await verifySessionToken(token, secret, org, now)).toEqual({
      organizationId: org,
      customerId: "c1",
      expiresAt: now + 1000,
    });
    expect(await verifySessionToken(token, secret, org, now + 1000)).toBeNull();
    expect(await verifySessionToken(token, secret, "22222222-2222-4222-8222-222222222222", now)).toBeNull();
    expect(await verifySessionToken(token, await deriveSessionSecret("other"), org, now)).toBeNull();
    const [, payload, sig] = token.split(".");
    const forged = Buffer.from(JSON.stringify({ o: org, c: "c2", e: now + 1000 })).toString("base64url");
    expect(await verifySessionToken(`ca1.${forged}.${sig}`, secret, org, now)).toBeNull();
    expect(await verifySessionToken(`ca1.${payload}.${sig.slice(0, -2)}xx`, secret, org, now)).toBeNull();
    // A B2B portal_sessions token (uuid-uuid) is never a customer-app session.
    expect(await verifySessionToken(`${crypto.randomUUID()}-${crypto.randomUUID()}`, secret, org, now)).toBeNull();
  });
});
