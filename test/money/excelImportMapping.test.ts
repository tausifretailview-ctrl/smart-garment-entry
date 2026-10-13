import { describe, expect, it } from "vitest";
import {
  autoMapFields,
  applyMappings,
  fillEmptyImportSizes,
  validateMappedData,
  EMPTY_IMPORT_SIZE,
  type TargetField,
} from "@/utils/excelImportUtils";

const PURCHASE_LINE_FIELDS: TargetField[] = [
  { key: "product_name", label: "Product Name", required: true },
  { key: "size", label: "Size", required: false },
  { key: "barcode", label: "Barcode", required: false },
  { key: "pur_price", label: "Purchase Rate", required: false },
  { key: "sale_price", label: "Sale Rate", required: false },
  { key: "mrp", label: "MRP", required: false },
  { key: "qty", label: "Qty", required: true },
];

describe("purchase Excel import — PRate / SRate / MRP mapping", () => {
  it("maps PRate → pur_price, SRate → sale_price, MRP → mrp (exact pass)", () => {
    const headers = ["Item", "PRate", "SRate", "MRP", "Qty"];
    const mappings = autoMapFields(headers, PURCHASE_LINE_FIELDS);
    expect(mappings.PRate).toBe("pur_price");
    expect(mappings.SRate).toBe("sale_price");
    expect(mappings.MRP).toBe("mrp");
    expect(mappings.Item).toBe("product_name");
    expect(mappings.Qty).toBe("qty");
  });

  it("PRate/SRate/MRP stay distinct when all three headers present", () => {
    const headers = ["Product", "PRate", "SRate", "MRP", "Qty"];
    const mappings = autoMapFields(headers, PURCHASE_LINE_FIELDS);
    expect(mappings.PRate).toBe("pur_price");
    expect(mappings.SRate).toBe("sale_price");
    expect(mappings.MRP).toBe("mrp");
    const priceSlots = new Set(
      Object.values(mappings).filter((v) =>
        ["pur_price", "sale_price", "mrp"].includes(v as string),
      ),
    );
    expect(priceSlots.size).toBe(3);
  });

  it("applyMappings preserves MRP on imported row (PRate/SRate/MRP fix)", () => {
    const headers = ["Item", "PRate", "SRate", "MRP", "Qty"];
    const mappings = autoMapFields(headers, PURCHASE_LINE_FIELDS);
    const [mapped] = applyMappings(
      [{ Item: "SHIRT-F/S", PRate: 80.2, SRate: 150, MRP: 199, Qty: 5 }],
      mappings,
    );
    expect(mapped.pur_price).toBe(80.2);
    expect(mapped.sale_price).toBe(150);
    expect(mapped.mrp).toBe(199);
    expect(mapped.qty).toBe(5);
  });

  it("fills blank size with None for named product rows only", () => {
    const filled = fillEmptyImportSizes([
      { product_name: "REVITALIFT", size: "", qty: 2 },
      { product_name: "CREAM", size: "  ", qty: 1 },
      { product_name: "SERUM", size: "30ML", qty: 1 },
      { product_name: "", size: "", qty: "" },
    ]);
    expect(filled[0].size).toBe(EMPTY_IMPORT_SIZE);
    expect(filled[1].size).toBe(EMPTY_IMPORT_SIZE);
    expect(filled[2].size).toBe("30ML");
    expect(filled[3].size).toBe("");
  });

  it("skips blank product name rows without validation errors", () => {
    const fields: TargetField[] = [
      { key: "product_name", label: "Product Name", required: true },
      { key: "size", label: "Size", required: false },
      { key: "qty", label: "Qty", required: true },
      { key: "pur_price", label: "Purchase Price", required: true },
      { key: "sale_price", label: "Sale Price", required: true },
    ];
    const mappings = {
      Item: "product_name",
      Size: "size",
      Qty: "qty",
      Rate: "pur_price",
      MRP: "sale_price",
    };
    const rows = [
      { product_name: "CREAM", size: "None", qty: 2, pur_price: 100, sale_price: 150 },
      { product_name: "", size: "None", qty: 5, pur_price: 100, sale_price: 150 },
      { product_name: "  ", size: "None", qty: 1, pur_price: 80, sale_price: 120 },
    ];
    const result = validateMappedData(rows, fields, mappings, { headerRowIndex: 0 });
    expect(result.valid).toBe(true);
    expect(result.rowErrors).toHaveLength(0);
    expect(result.invalidRowCount).toBe(0);
    expect(result.validRowCount).toBe(1);
  });
});

describe("purchase Excel import — bill date / GST fuzzy guards", () => {
  it("does not map 'Pur Rate' to bill_date or 'Opening Stock' to GST", async () => {
    const { purchaseBillFields } = await import("@/utils/excelImportUtils");
    const mappings = autoMapFields(
      ["Item Code", "Item Name", "Pur Rate", "Sale Rate", "Opening Stock"],
      purchaseBillFields,
    );
    expect(mappings["Pur Rate"]).toBe("pur_price");
    expect(mappings["Item Code"]).toBe("barcode");
    expect(mappings["Opening Stock"]).not.toBe("gst_per");
    expect(Object.values(mappings)).not.toContain("bill_date");
  });

  it("still fuzzy-maps real date and GST headers", async () => {
    const { purchaseBillFields } = await import("@/utils/excelImportUtils");
    const mappings = autoMapFields(["Product", "Date Of Purchase", "GST Rate %", "Qty"], purchaseBillFields);
    expect(mappings["Date Of Purchase"]).toBe("bill_date");
    expect(mappings["GST Rate %"]).toBe("gst_per");
  });
});

describe("parseExcelDate", () => {
  it("rejects prices read as Excel serials (37 → 1900)", async () => {
    const { parseExcelDate } = await import("@/utils/excelImportUtils");
    expect(parseExcelDate(37)).toBeNull();
    expect(parseExcelDate("35.71")).toBeNull();
    expect(parseExcelDate("")).toBeNull();
  });

  it("parses real serials and Indian date text to the same calendar day", async () => {
    const { parseExcelDate } = await import("@/utils/excelImportUtils");
    const fromSerial = parseExcelDate(46037); // 15 Jan 2026
    expect(fromSerial?.getFullYear()).toBe(2026);
    expect(fromSerial?.getMonth()).toBe(0);
    expect(fromSerial?.getDate()).toBe(15);
    const fromText = parseExcelDate("15/01/2026");
    expect(fromText?.getDate()).toBe(15);
    expect(parseExcelDate("31/02/2026")).toBeNull();
    expect(parseExcelDate("2026-01-15")?.getMonth()).toBe(0);
  });
});
