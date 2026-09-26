import React from "react";

export interface PurchaseBillPrintItem {
  product_name?: string;
  brand?: string;
  size: string;
  color?: string;
  hsn_code?: string;
  qty: number;
  pur_price: number;
  gst_per?: number;
  line_total?: number;
}

export interface PurchaseBillPrintBill {
  software_bill_no: string;
  supplier_invoice_no: string;
  supplier_name: string;
  bill_date: string;
  gross_amount: number;
  discount_amount: number;
  gst_amount: number;
  net_amount: number;
  paid_amount?: number;
  payment_status?: string;
  total_qty?: number;
  is_dc_purchase?: boolean;
  notes?: string;
}

interface PurchaseBillPrintProps {
  businessName: string;
  address: string;
  mobile: string;
  email?: string;
  gstNumber?: string;
  bill: PurchaseBillPrintBill;
  items: PurchaseBillPrintItem[];
}

/**
 * A4 purchase-bill details document for the dashboard PDF download.
 * Inline styles only so it prints identically without screen CSS.
 */
export const PurchaseBillPrint = React.forwardRef<HTMLDivElement, PurchaseBillPrintProps>(
  ({ businessName, address, mobile, email, gstNumber, bill, items }, ref) => {
    const fmt = (n: number) =>
      `₹${Number(n || 0).toLocaleString("en-IN", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
    const fmtDate = (raw: string) => {
      if (!raw) return "—";
      const d = new Date(raw);
      if (Number.isNaN(d.getTime())) return String(raw).slice(0, 10);
      return d.toLocaleDateString("en-IN", { day: "2-digit", month: "short", year: "numeric" });
    };
    const balance = Number(bill.net_amount || 0) - Number(bill.paid_amount || 0);
    const totalQty = items.reduce((s, i) => s + Number(i.qty || 0), 0);

    const th: React.CSSProperties = {
      border: "1px solid #333",
      background: "#eee",
      padding: "5px 6px",
      fontSize: 11,
      textAlign: "left",
    };
    const td: React.CSSProperties = {
      border: "1px solid #333",
      padding: "5px 6px",
      fontSize: 11,
    };
    const num: React.CSSProperties = { ...td, textAlign: "right", whiteSpace: "nowrap" };

    return (
      <div ref={ref} style={{ fontFamily: "Arial, Helvetica, sans-serif", color: "#000", background: "#fff", padding: 16 }}>
        <div style={{ textAlign: "center", marginBottom: 4 }}>
          <div style={{ fontSize: 20, fontWeight: 700 }}>{businessName || "Purchase Bill"}</div>
          {[address, [mobile, email].filter(Boolean).join("  |  "), gstNumber ? `GSTIN: ${gstNumber}` : ""]
            .filter(Boolean)
            .map((line, i) => (
              <div key={i} style={{ fontSize: 11 }}>{line}</div>
            ))}
        </div>
        <div style={{ textAlign: "center", fontSize: 14, fontWeight: 700, margin: "8px 0", letterSpacing: 1 }}>
          PURCHASE BILL{bill.is_dc_purchase ? " (DC — No GST)" : ""}
        </div>

        <table style={{ width: "100%", borderCollapse: "collapse", marginBottom: 10 }}>
          <tbody>
            <tr>
              <td style={{ ...td, width: "18%", fontWeight: 700, background: "#f7f7f7" }}>Bill No</td>
              <td style={{ ...td, width: "32%" }}>{bill.software_bill_no || "—"}</td>
              <td style={{ ...td, width: "18%", fontWeight: 700, background: "#f7f7f7" }}>Supplier Inv No</td>
              <td style={td}>{bill.supplier_invoice_no || "—"}</td>
            </tr>
            <tr>
              <td style={{ ...td, fontWeight: 700, background: "#f7f7f7" }}>Supplier</td>
              <td style={td}>{bill.supplier_name || "—"}</td>
              <td style={{ ...td, fontWeight: 700, background: "#f7f7f7" }}>Bill Date</td>
              <td style={td}>{fmtDate(bill.bill_date)}</td>
            </tr>
            <tr>
              <td style={{ ...td, fontWeight: 700, background: "#f7f7f7" }}>Payment</td>
              <td style={td}>
                {(bill.payment_status || "—").toUpperCase()} · Paid {fmt(bill.paid_amount || 0)} · Balance {fmt(balance)}
              </td>
              <td style={{ ...td, fontWeight: 700, background: "#f7f7f7" }}>Total Qty</td>
              <td style={td}>{bill.total_qty ?? totalQty}</td>
            </tr>
          </tbody>
        </table>

        <table style={{ width: "100%", borderCollapse: "collapse" }}>
          <thead>
            <tr>
              <th style={{ ...th, width: 28 }}>#</th>
              <th style={th}>Product</th>
              <th style={th}>HSN</th>
              <th style={{ ...th, textAlign: "right" }}>Qty</th>
              <th style={{ ...th, textAlign: "right" }}>Buy Rate</th>
              <th style={{ ...th, textAlign: "right" }}>GST%</th>
              <th style={{ ...th, textAlign: "right" }}>Amount</th>
            </tr>
          </thead>
          <tbody>
            {items.map((it, i) => {
              const detail = [it.brand, it.size, it.color].filter((v) => v && v !== "-").join(" / ");
              return (
                <tr key={i} style={{ breakInside: "avoid" }}>
                  <td style={td}>{i + 1}</td>
                  <td style={td}>
                    <div style={{ fontWeight: 700 }}>{it.product_name || "—"}</div>
                    {detail ? <div style={{ fontSize: 10, color: "#333" }}>{detail}</div> : null}
                  </td>
                  <td style={td}>{it.hsn_code || "—"}</td>
                  <td style={num}>{it.qty}</td>
                  <td style={num}>{fmt(it.pur_price)}</td>
                  <td style={num}>{it.gst_per ?? "—"}</td>
                  <td style={num}>{fmt(it.line_total ?? Number(it.qty || 0) * Number(it.pur_price || 0))}</td>
                </tr>
              );
            })}
            {items.length === 0 ? (
              <tr>
                <td style={{ ...td, textAlign: "center" }} colSpan={7}>No line items</td>
              </tr>
            ) : null}
          </tbody>
        </table>

        <table style={{ width: "100%", borderCollapse: "collapse", marginTop: 10 }}>
          <tbody>
            <tr>
              <td style={{ ...td, width: "70%", fontWeight: 700, background: "#f7f7f7" }}>Gross</td>
              <td style={num}>{fmt(bill.gross_amount)}</td>
            </tr>
            <tr>
              <td style={{ ...td, fontWeight: 700, background: "#f7f7f7" }}>Discount</td>
              <td style={num}>{fmt(bill.discount_amount)}</td>
            </tr>
            <tr>
              <td style={{ ...td, fontWeight: 700, background: "#f7f7f7" }}>GST</td>
              <td style={num}>{fmt(bill.gst_amount)}</td>
            </tr>
            <tr>
              <td style={{ ...td, fontWeight: 700, background: "#f7f7f7", fontSize: 13 }}>Net Amount</td>
              <td style={{ ...num, fontWeight: 700, fontSize: 13 }}>{fmt(bill.net_amount)}</td>
            </tr>
          </tbody>
        </table>

        {bill.notes ? <div style={{ fontSize: 11, marginTop: 8 }}>Note: {bill.notes}</div> : null}
        <div style={{ fontSize: 10, color: "#444", marginTop: 12, textAlign: "right" }}>
          Generated {new Date().toLocaleString("en-IN", { day: "2-digit", month: "short", year: "numeric", hour: "2-digit", minute: "2-digit" })}
        </div>
      </div>
    );
  },
);
PurchaseBillPrint.displayName = "PurchaseBillPrint";
