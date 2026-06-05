import { createPortal } from "react-dom";
import type { CSSProperties, ReactNode, RefObject } from "react";
import { cn } from "@/lib/utils";

type PosHiddenInvoicePrintProps = {
  printRef: RefObject<HTMLDivElement | null>;
  thermalPaper: "58mm" | "80mm";
  isThermal: boolean;
  sourceStyle: CSSProperties;
  children: ReactNode;
};

/**
 * Portals the off-screen invoice DOM to document.body so react-to-print / browser
 * print sees full thermal content (POS Sales workspace uses overflow:hidden).
 */
export function PosHiddenInvoicePrint({
  printRef,
  thermalPaper,
  isThermal,
  sourceStyle,
  children,
}: PosHiddenInvoicePrintProps) {
  if (typeof document === "undefined" || !children) {
    return null;
  }

  return createPortal(
    <div
      className={cn(
        "invoice-print-source-screen",
        isThermal && thermalPaper === "58mm" && "thermal-paper-58",
      )}
      style={sourceStyle}
    >
      <div
        ref={printRef}
        className="invoice-print-source"
        style={{
          width: sourceStyle.width,
          minHeight: sourceStyle.minHeight,
          overflow: "visible",
        }}
      >
        {children}
      </div>
    </div>,
    document.body,
  );
}
