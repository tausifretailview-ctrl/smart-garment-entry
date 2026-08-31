import React from "react";
import {
  THERMAL_POS_BC_FONT_SIZE,
  THERMAL_POS_BC_FONT_WEIGHT,
  THERMAL_POS_ITEM_COLUMNS,
  formatThermalPosAmount,
} from "@/utils/thermalPosItemLayout";

export type ThermalPosLineItem = {
  particulars: string;
  barcode?: string;
  itemNotes?: string;
  qty: number;
  rate: number;
  total: number;
};

const itemGrid: React.CSSProperties = {
  display: "grid",
  gridTemplateColumns: THERMAL_POS_ITEM_COLUMNS,
  columnGap: "1.5mm",
  alignItems: "baseline",
  width: "100%",
};

function amountStyle(monoFont: string, fontSize: string, fontWeight: number): React.CSSProperties {
  return {
    textAlign: "right",
    fontFamily: monoFont,
    fontVariantNumeric: "tabular-nums",
    fontSize,
    fontWeight,
    whiteSpace: "nowrap",
    overflow: "visible",
  };
}

interface ThermalPosItemRowsProps {
  items: ThermalPosLineItem[];
  /** Monospace stack for qty / rate / amount. */
  monoFont?: string;
  nameWeight?: number;
  headerSize?: string;
  bodySize?: string;
  amountSize?: string;
}

/**
 * 80mm POS thermal item table: product + medium BC on one row, reserved amount column.
 */
export function ThermalPosItemRows({
  items,
  monoFont = "ui-monospace, 'Courier New', monospace",
  nameWeight = 700,
  headerSize = "10px",
  bodySize = "11px",
  amountSize = "12px",
}: ThermalPosItemRowsProps) {
  const amt = amountStyle(monoFont, amountSize, 700);
  const hdrAmt = amountStyle(monoFont, headerSize, 800);

  return (
    <>
      <div
        style={{
          ...itemGrid,
          fontWeight: 800,
          fontSize: headerSize,
          textTransform: "uppercase",
          letterSpacing: "0.3px",
          padding: "2px 0",
          borderBottom: "1.5px solid #000",
          marginBottom: "2px",
        }}
      >
        <span>ITEM</span>
        <span style={hdrAmt}>QTY</span>
        <span style={hdrAmt}>RATE</span>
        <span style={hdrAmt}>AMT</span>
      </div>
      {items.map((item, i) => (
        <div key={i} style={{ ...itemGrid, padding: "1px 0", fontSize: bodySize }}>
          <div style={{ minWidth: 0, display: "flex", flexWrap: "wrap", columnGap: 4, alignItems: "baseline" }}>
            <span
              style={{
                fontWeight: nameWeight,
                fontSize: bodySize,
                whiteSpace: "nowrap",
                overflow: "hidden",
                textOverflow: "ellipsis",
                flex: "0 0 auto",
                maxWidth: "100%",
              }}
            >
              {item.particulars}
            </span>
            {item.barcode ? (
              <span
                style={{
                  fontSize: THERMAL_POS_BC_FONT_SIZE,
                  fontWeight: THERMAL_POS_BC_FONT_WEIGHT,
                  whiteSpace: "nowrap",
                  color: "#000",
                  flex: "0 0 auto",
                }}
              >
                BC:{item.barcode}
              </span>
            ) : null}
            {item.itemNotes ? (
              <div style={{ flexBasis: "100%", fontSize: "9px", fontWeight: 600, color: "#444", fontStyle: "italic", lineHeight: 1.2 }}>
                {item.itemNotes}
              </div>
            ) : null}
          </div>
          <span style={{ ...amt, fontSize: bodySize }}>{item.qty}</span>
          <span style={amt}>{formatThermalPosAmount(item.rate)}</span>
          <span style={amt}>{formatThermalPosAmount(item.total)}</span>
        </div>
      ))}
    </>
  );
}
