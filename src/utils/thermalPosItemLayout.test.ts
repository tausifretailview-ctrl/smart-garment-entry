import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import {
  THERMAL_POS_BC_FONT_SIZE,
  THERMAL_POS_BC_FONT_WEIGHT,
  THERMAL_POS_ITEM_COLUMNS,
  formatThermalPosAmount,
} from "./thermalPosItemLayout";
import { ThermalPosItemRows } from "../components/thermal/ThermalPosItemRows";

const here = dirname(fileURLToPath(import.meta.url));

describe("thermal POS item layout", () => {
  it("formats Indian-grouped amounts without dropping digits", () => {
    expect(formatThermalPosAmount(16980)).toBe("16,980");
    expect(formatThermalPosAmount(8650)).toBe("8,650");
    expect(formatThermalPosAmount(219400)).toBe("2,19,400");
    expect(formatThermalPosAmount(Number.NaN)).toBe("0");
  });

  it("keeps a medium barcode face and a reserved amount column", () => {
    expect(THERMAL_POS_BC_FONT_SIZE).toBe("10px");
    expect(THERMAL_POS_BC_FONT_WEIGHT).toBe(500);
    expect(THERMAL_POS_ITEM_COLUMNS).toContain("20mm");
    expect(THERMAL_POS_ITEM_COLUMNS).toContain("minmax(0,1fr)");
  });

  it("renders name, medium BC, qty, rate and full amount on one grid row", () => {
    const html = renderToStaticMarkup(
      createElement(ThermalPosItemRows, {
        items: [
          { particulars: "IQA-A10-2PCS", barcode: "90006717", qty: 1, rate: 16980, total: 16980 },
          { particulars: "TM-A01-2PCS", barcode: "90006778", qty: 1, rate: 8650, total: 8650 },
        ],
      }),
    );
    expect(html).toContain("IQA-A10-2PCS");
    expect(html).toContain("BC:90006717");
    expect(html).toContain("16,980");
    expect(html).toContain("8,650");
    expect(html).toContain("font-size:10px");
    expect(html).toContain("font-weight:500");
    expect(html).toContain(THERMAL_POS_ITEM_COLUMNS);
    expect(html).toContain("white-space:nowrap");
    expect(html).not.toContain("word-break");
    expect(html).not.toContain(" × ");
  });

  it("wires the shared item row into modern, classic, and Retail POS thermals", () => {
    const modern = readFileSync(resolve(here, "../components/ModernThermalReceipt80mm.tsx"), "utf8");
    expect(modern).toContain("ThermalPosItemRows");
    expect(modern).not.toContain("overflow: 'hidden'");
    expect(modern).not.toContain("{item.qty} × ₹");

    const classic = readFileSync(resolve(here, "../components/ThermalPrint80mm.tsx"), "utf8");
    expect(classic).toContain("ThermalPosItemRows");

    const retailPos = readFileSync(resolve(here, "../components/RetailPosThermalReceipt80mm.tsx"), "utf8");
    expect(retailPos).toContain("BC:{item.barcode}");
    expect(retailPos).toContain('fontSize: "10px"');
    expect(retailPos).toContain("fontWeight: 500");
  });
});
