import { describe, expect, it } from "vitest";
import { sizeMatrixKey } from "./sizeSort";
import { buildAvailableStockMatrix } from "./availableStockPrintMatrix";

describe("sizeMatrixKey", () => {
  it("collapses leading zeros so 06 and 6 share a column", () => {
    expect(sizeMatrixKey("06")).toBe("6");
    expect(sizeMatrixKey("6")).toBe("6");
    expect(sizeMatrixKey(" 37 ")).toBe("37");
  });

  it("maps XXXL to 3XL", () => {
    expect(sizeMatrixKey("xxxl")).toBe("3XL");
  });
});

describe("buildAvailableStockMatrix", () => {
  it("shows Size-wise on-hand against ordered per size", () => {
    const matrix = buildAvailableStockMatrix([
      {
        particulars: "JT18-IN",
        color: "BLACK",
        size: "6",
        orderQty: 10,
        pendingQty: 10,
        sizeStock: [
          { size: "6", qty: 10 },
          { size: "7", qty: 12 },
          { size: "35", qty: 4 },
        ],
      },
      {
        particulars: "RR57-IN",
        color: "TAN",
        size: "07",
        orderQty: 9,
        pendingQty: 9,
        sizeStock: [
          { size: "7", qty: 9 },
          { size: "8", qty: 20 },
        ],
      },
      {
        particulars: "PUG165",
        color: "NAVY",
        size: "37",
        orderQty: 9,
        pendingQty: 9,
        sizeStock: [{ size: "37", qty: 7 }],
      },
      {
        particulars: "PUG165",
        color: "NAVY",
        size: "38",
        orderQty: 9,
        pendingQty: 9,
        sizeStock: [{ size: "37", qty: 7 }, { size: "38", qty: 9 }],
      },
      {
        particulars: "JT20",
        color: "RED",
        size: "37",
        orderQty: 8,
        pendingQty: 8,
        sizeStock: [{ size: "37", qty: 1 }],
      },
      {
        particulars: "JT21",
        color: "BLUE",
        size: "8",
        orderQty: 8,
        pendingQty: 8,
        sizeStock: [{ size: "8", qty: 11 }],
      },
    ]);

    expect(matrix.grandOrdered).toBe(53);
    // Columns are only sizes that appear on the order — not extra warehouse sizes (35).
    expect(matrix.sizes).toEqual(["6", "7", "8", "37", "38"]);
    // On-hand is still filled for those order-size columns (JT18 size 7 stock counts
    // because size 7 is ordered on another article).
    expect(matrix.grandAvailable).toBe(79);

    const jt18 = matrix.rows.find((r) => r.productName === "JT18-IN")!;
    expect(jt18.cells.get("6")?.available).toBe(10);
    expect(jt18.cells.get("6")?.ordered).toBe(10);
    expect(jt18.cells.get("7")?.available).toBe(12);
    expect(jt18.cells.get("7")?.ordered).toBe(0);
    expect(jt18.totalAvailable).toBe(22);
    expect(jt18.totalOrdered).toBe(10);

    const rr57 = matrix.rows.find((r) => r.productName === "RR57-IN")!;
    expect(rr57.cells.get("7")?.ordered).toBe(9);
    expect(rr57.cells.get("7")?.available).toBe(9);

    const pug = matrix.rows.find((r) => r.productName === "PUG165")!;
    expect(pug.totalOrdered).toBe(18);
    expect(pug.totalAvailable).toBe(16);
    expect(pug.cells.get("37")?.available).toBe(7);
    expect(pug.cells.get("37")?.ordered).toBe(9);

    const short = matrix.rows.find((r) => r.productName === "JT20")!;
    expect(short.cells.get("37")?.available).toBe(1);
    expect(short.cells.get("37")?.ordered).toBe(8);
  });

  it("omits warehouse-only sizes from columns and uses line on-hand as fallback", () => {
    const matrix = buildAvailableStockMatrix([
      {
        particulars: "PUL225",
        color: "BK",
        size: "6",
        orderQty: 4,
        pendingQty: 4,
        sizeStock: [
          { size: "5", qty: 99 },
          { size: "6", qty: 10 },
        ],
      },
      {
        particulars: "PUL82",
        color: "TAN",
        size: "7",
        orderQty: 1,
        pendingQty: 1,
        onHandQty: 7,
      },
    ]);

    expect(matrix.sizes).toEqual(["6", "7"]);
    expect(matrix.rows.find((r) => r.productName === "PUL225")!.totalAvailable).toBe(10);
    expect(matrix.rows.find((r) => r.productName === "PUL225")!.totalOrdered).toBe(4);
    expect(matrix.rows.find((r) => r.productName === "PUL82")!.cells.get("7")?.available).toBe(7);
    expect(matrix.grandOrdered).toBe(5);
    expect(matrix.grandAvailable).toBe(17);
  });
});
