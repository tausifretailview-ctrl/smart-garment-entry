import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { WholesaleSizeA4Template } from "./WholesaleSizeA4Template";
import { groupWholesaleSizeRows, wholesaleSizeColumns } from "@/utils/wholesaleSizeInvoice";

const line = (sr: number, particulars: string, color: string, size: string, qty: number, rate: number, extra: Record<string, unknown> = {}) => ({
  sr, particulars, color, size, qty, rate, total: rate * qty, mrp: 495, hsn: "62121000", gstPercent: 5, brand: "SONARI", barcode: "", sp: rate, ...extra,
});

// Like the ARIHA bill: KIRTIKA white 34/36/38/40, KIRTIKA skin, a second brand.
const items = [
  line(1, "KIRTIKA (D)", "WHITE", "34", 2, 322),
  line(2, "KIRTIKA (D)", "WHITE", "36", 2, 322),
  line(3, "KIRTIKA (D)", "WHITE", "38", 5, 322),
  line(4, "KIRTIKA (D)", "WHITE", "40", 2, 322),
  line(5, "KIRTIKA (D)", "SKIN", "34", 2, 322),
  line(6, "KIRTIKA (D)", "SKIN", "38", 1, 322),
  line(7, "NIGHT SUIT", "BLUE", "XL", 3, 650, { brand: "KYANDO", hsn: "62082100", mrp: 999 }),
];

describe("WholesaleSizeA4Template", () => {
  it("groups product × colour rows under brand / HSN and totals each size", () => {
    const g = groupWholesaleSizeRows(items, ["34", "36", "38", "40", "XL"]);
    expect(g.groups.map((x) => [x.brand, x.hsn, x.rows.length])).toEqual([
      ["SONARI", "62121000", 2],
      ["KYANDO", "62082100", 1],
    ]);
    expect(g.groups[0].rows[0]).toMatchObject({ productName: "KIRTIKA (D)", color: "WHITE", totalPairs: 11, amount: 3542 });
    expect(g.columnQtyTotals).toEqual({ "34": 4, "36": 2, "38": 6, "40": 2, XL: 3 });
    expect(g.totalPcs).toBe(17);
    expect(g.totalAmount).toBe(322 * 14 + 650 * 3);
  });

  it("prints logo, buyer / ship-to, transport, size columns, HSN summary, bank, QR and bill amount", () => {
    const html = renderToStaticMarkup(
      createElement(WholesaleSizeA4Template, {
        businessName: "M/S SHELL MODERN WEAR",
        address: "NARAYANGUDA, HYDERABAD-500029",
        mobile: "7702910143",
        gstNumber: "36ANZPP5354Q1ZP",
        logoUrl: "https://example.com/logo.png",
        invoiceNumber: "TI/26-27/859",
        invoiceDate: new Date(2026, 10, 20),
        customerName: "ARIHA (LINGERIE & NIGHT WEAR)",
        customerAddress: "2-4-43 MAHATMA GANDHI ROAD, SECUNDERABAD",
        shippingAddress: "GODOWN 7, BEGUM BAZAR, HYDERABAD",
        customerGSTIN: "36ADDPM3428Q1Z4",
        b2bDetails: { transporter_name: "LOCAL DELIVERY", vehicle_no: "TS09AB1234", lr_no: "LR-55", lr_date: "2026-11-20", customer_po_no: "00790" },
        taxType: "exclusive",
        items,
        subtotal: 6458,
        taxableAmount: 6458,
        cgstAmount: 161.45,
        sgstAmount: 161.45,
        roundOff: -0.9,
        otherCharges: 1,
        grandTotal: 6781,
        bankDetails: { bank_name: "ICICI BANK", account_number: "194105500522", ifsc_code: "ICIC0001941" },
        qrCodeUrl: "data:image/png;base64,AAAA",
        upiId: "shell@icici",
        sizeColumnHints: ["28", "30", "32", "34", "36", "38", "40", "42", "XL"],
      }),
    );
    expect(html).toContain('data-testid="wsa4-logo"');
    expect(html).toContain("M/S SHELL MODERN WEAR");
    expect(html).toContain("GODOWN 7, BEGUM BAZAR, HYDERABAD");
    expect(html).not.toContain("Same as buyer");
    for (const v of ["LOCAL DELIVERY", "TS09AB1234", "LR-55", "20/11/2026", "00790"]) expect(html).toContain(v);
    // Size-group order, first to last size sold: 34 … 42, XL (not 28–32).
    for (const sz of ["34", "36", "38", "40", "42", "XL"]) expect(html).toContain(`>${sz}</th>`);
    expect(html).not.toContain(">28</th>");
    // HSN in its own column (no "HSN …" group rows); brand rows stay; colour sits in the description.
    expect(html).toContain(">HSN</th>");
    expect(html).not.toContain(">Color</th>");
    expect(html).not.toContain("HSN 62121000");
    expect((html.match(/data-testid="wsa4-hsn-cell">62121000</g) || []).length).toBe(2);
    expect(html).toContain('data-testid="wsa4-hsn-cell">62082100<');
    expect(html).toMatch(/data-testid="wsa4-group"[^>]*>SONARI</);
    expect(html).toMatch(/data-testid="wsa4-group"[^>]*>KYANDO</);
    expect(html).toContain("KIRTIKA (D)<span");
    expect(html).toContain('data-testid="wsa4-color" style="font-weight:600;color:#374151"> – WHITE</span>');
    expect((html.match(/data-testid="wsa4-row"/g) || []).length).toBe(3);
    expect(html).toContain('data-testid="wsa4-hsn"');
    expect(html).toContain("ICICI BANK");
    expect(html).toContain("shell@icici");
    expect(html).toContain("6,781.00");
    expect(html).toContain("BILL AMOUNT");
    // Sale Bill "Charges" print as transport charges, before Round Off and the bill amount.
    const totals = html.slice(html.indexOf('data-testid="wsa4-totals"'));
    expect(totals).toContain("Add: Transport Charges");
    expect(totals.indexOf("Add: Transport Charges")).toBeLessThan(totals.indexOf("Round Off"));
    expect(totals.indexOf("Round Off")).toBeLessThan(totals.indexOf("BILL AMOUNT"));
  });

  it("no charges → no transport charges row; no brand → no group rows", () => {
    const html = renderToStaticMarkup(
      createElement(WholesaleSizeA4Template, {
        businessName: "KLEAR TRADING CO",
        address: "BHIWANDI",
        mobile: "7387426529",
        invoiceNumber: "INV/26-27/6",
        invoiceDate: new Date(2026, 10, 21),
        customerName: "SHOE WORLD (DOMBIVALI)",
        taxType: "inclusive",
        items: [
          line(1, "FWR MEN SLPPR GP 6081023", "OGREEN", "40", 1, 1712.74, { brand: "", hsn: "64039990", mrp: 2595 }),
          line(2, "FWR MEN SHOE GC 6245124", "CAMEL", "41", 1, 2500, { brand: "", hsn: "64051000", gstPercent: 18, mrp: 3995 }),
        ],
        grandTotal: 4212.74,
      }),
    );
    expect(html).not.toContain("Transport Charges");
    expect(html).not.toContain('data-testid="wsa4-group"');
    expect(html).toContain('data-testid="wsa4-hsn-cell">64039990<');
    expect(html).toContain('data-testid="wsa4-hsn-cell">64051000<');
    expect(html).toContain("> – OGREEN</span>");
  });

  it("size columns follow the shop's size group, first to last size sold", () => {
    const group = ["28", "30", "32", "34", "36", "M", "L", "XL", "2XL"];
    const sold = (sizes: string[]) => sizes.map((size, i) => line(i, "A", "B", size, 1, 10));
    expect(wholesaleSizeColumns(sold(["XL", "32", "34"]), group)).toEqual(["32", "34", "36", "M", "L", "XL"]);
    expect(wholesaleSizeColumns(sold(["L", "M"]), group)).toEqual(["M", "L"]);
    // A size outside the group: sizes on the bill only.
    expect(wholesaleSizeColumns(sold(["M", "FREE"]), group)).toEqual(expect.arrayContaining(["M", "FREE"]));
    expect(wholesaleSizeColumns(sold(["S", "M"]), null)).toEqual(["S", "M"]);
  });

  it("no ship-to → buyer's address, marked same as buyer; no transport → dashes", () => {
    const html = renderToStaticMarkup(
      createElement(WholesaleSizeA4Template, {
        businessName: "SHOP",
        address: "",
        mobile: "",
        invoiceNumber: "1",
        invoiceDate: new Date(2026, 10, 20),
        customerName: "BUYER",
        customerAddress: "MAIN ROAD",
        items: [line(1, "TEE", "RED", "M", 2, 100, { brand: "", hsn: "" })],
        grandTotal: 200,
        taxType: "no_gst",
      }),
    );
    expect(html).toContain("Same as buyer");
    expect(html).toContain("Bill of Supply");
    expect(html).not.toContain('data-testid="wsa4-hsn"');
    expect(html).not.toContain('data-testid="wsa4-group"');
  });
});
