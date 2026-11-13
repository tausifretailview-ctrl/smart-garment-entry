/** @vitest-environment jsdom */
import React, { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { previewNextPurchaseBillNo } from "@/utils/purchaseBillNoPreview";
import { PurchaseDcWarning, PurchaseSerialHint } from "./PurchaseSerialHint";

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

let host: HTMLDivElement;
let root: Root;
beforeEach(() => {
  host = document.createElement("div");
  document.body.appendChild(host);
  root = createRoot(host);
});
afterEach(() => {
  act(() => root.unmount());
  host.remove();
});

describe("previewNextPurchaseBillNo", () => {
  it("adds one to the last PUR/yy-yy/n number", () => {
    expect(previewNextPurchaseBillNo("PUR/26-27/41", new Date(2026, 10, 13))).toBe("PUR/26-27/42");
    expect(previewNextPurchaseBillNo("PUR/26-27/999", null)).toBe("PUR/26-27/1000");
  });
  it("starts the bill date's financial year at 1 (April starts the year)", () => {
    expect(previewNextPurchaseBillNo(null, new Date(2026, 10, 13))).toBe("PUR/26-27/1");
    expect(previewNextPurchaseBillNo(undefined, new Date(2027, 2, 31))).toBe("PUR/26-27/1");
    expect(previewNextPurchaseBillNo("", new Date(2027, 3, 1))).toBe("PUR/27-28/1");
  });
  it("a last number in another form starts again at 1", () => {
    expect(previewNextPurchaseBillNo("PB-41", new Date(2026, 10, 13))).toBe("PUR/26-27/1");
  });
});

const text = () => (host.textContent || "").replace(/\s+/g, " ").trim();

describe("PurchaseSerialHint", () => {
  const base = { supplierPaperInvoiceNo: null, nextSerial: "128", autoSerialSource: null, lastBillSupplierInvoiceNo: null };
  it("supplier's paper invoice number", () => {
    act(() => root.render(<PurchaseSerialHint {...base} supplierPaperInvoiceNo="A-77" />));
    expect(text()).toBe("Supplier's bill: A-77 · our serial 128 is assigned when you save");
  });
  it("previous auto serial with its bill and date", () => {
    act(() =>
      root.render(
        <PurchaseSerialHint {...base} autoSerialSource={{ serial: 127n, software_bill_no: "PUR/26-27/41", bill_date: "2026-11-10" }} />,
      ),
    );
    expect(text()).toBe("Previous auto serial 127 on PUR/26-27/41 (10 Nov 2026) · next serial 128");
  });
  it("previous bill's invoice number", () => {
    act(() => root.render(<PurchaseSerialHint {...base} lastBillSupplierInvoiceNo="INV-9" />));
    expect(text()).toBe("Previous bill used INV-9 · next serial 128");
  });
  it("only the next auto serial; nothing at all", () => {
    act(() => root.render(<PurchaseSerialHint {...base} />));
    expect(text()).toBe("Auto serial 128 on save");
    act(() => root.render(<PurchaseSerialHint {...base} nextSerial={null} />));
    expect(text()).toBe("");
  });
  it("DC warning", () => {
    act(() => root.render(<PurchaseDcWarning />));
    expect(text()).toContain("This bill will NOT appear in GST Purchase Register.");
  });
});
