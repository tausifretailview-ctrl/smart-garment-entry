/** @vitest-environment jsdom */
import { describe, expect, it } from "vitest";
import type { ReportTableColumn } from "@/components/mobile/MobileReportTable";
import { buildCsvFromReportTable, buildCsvFromRows, csvField, reportCellText } from "./reportCsvExport";

type SaleRow = { bill: string; customer: string; amount: number };

const salesColumns: ReportTableColumn<SaleRow>[] = [
  { key: "bill", header: "Bill No", csvText: (r) => r.bill, render: (r) => r.bill },
  { key: "customer", header: "Customer", csvText: (r) => r.customer, render: (r) => r.customer },
  { key: "amount", header: "Amount", csvText: (r) => String(r.amount), render: () => null },
];

async function csvText(blob: Blob): Promise<string> {
  return blob.text();
}

describe("csvField", () => {
  it("leaves plain values unquoted", () => {
    expect(csvField("INV/25-26/1")).toBe("INV/25-26/1");
    expect(csvField("1200")).toBe("1200");
  });

  it("quotes comma, quote, and newline values", () => {
    expect(csvField("A, B")).toBe('"A, B"');
    expect(csvField('He said "hi"')).toBe('"He said ""hi"""');
    expect(csvField("line1\nline2")).toBe('"line1\nline2"');
  });
});

describe("buildCsvFromRows", () => {
  it("writes CRLF rows with the same columns as Table view", async () => {
    const blob = buildCsvFromRows(
      salesColumns,
      [
        { bill: "POS/25-26/9", customer: "Walk-in", amount: 450 },
        { bill: "INV/25-26/2", customer: "RETAIL, STORE", amount: 1999 },
      ],
      reportCellText,
    );
    expect(blob.type).toBe("text/csv;charset=utf-8");
    expect(await csvText(blob)).toBe(
      "Bill No,Customer,Amount\r\nPOS/25-26/9,Walk-in,450\r\nINV/25-26/2,\"RETAIL, STORE\",1999",
    );
  });

  it("uses csvText instead of JSX render", async () => {
    const blob = buildCsvFromReportTable(salesColumns, [{ bill: "A", customer: "B", amount: 10 }]);
    expect(await csvText(blob)).toBe("Bill No,Customer,Amount\r\nA,B,10");
  });

  it("falls back to string/number render when csvText is omitted", async () => {
    const cols: ReportTableColumn<{ qty: number }>[] = [
      { key: "qty", header: "Qty", render: (r) => r.qty },
    ];
    const blob = buildCsvFromReportTable(cols, [{ qty: 7 }]);
    expect(await csvText(blob)).toBe("Qty\r\n7");
  });

  it("exports only the filtered rows passed in", async () => {
    const all = [
      { bill: "KEEP", customer: "Match", amount: 1 },
      { bill: "DROP", customer: "Other", amount: 2 },
    ];
    const filtered = all.filter((r) => r.customer === "Match");
    const blob = buildCsvFromReportTable(salesColumns, filtered);
    const text = await csvText(blob);
    expect(text).toContain("KEEP");
    expect(text).not.toContain("DROP");
  });
});
