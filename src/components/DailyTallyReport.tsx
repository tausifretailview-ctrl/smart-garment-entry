import React from "react";
import { format } from "date-fns";

interface PaymentBreakdown {
  cash: number; upi: number; card: number; bank: number; credit: number; total: number;
}

interface DailyTallyReportProps {
  date: Date;
  businessName: string;
  aggregated: {
    posSales: PaymentBreakdown;
    invoiceSales: PaymentBreakdown;
    receipts: PaymentBreakdown;
    advances: PaymentBreakdown;
    supplierPayments: PaymentBreakdown;
    expenses: PaymentBreakdown;
    employeeSalary: PaymentBreakdown;
    saleReturnRefunds: PaymentBreakdown;
  };
  totalIn: PaymentBreakdown;
  totalOut: PaymentBreakdown;
  openingCash: number;
  expectedCash: number;
  physicalCash: number;
  difference: number;
  leaveInDrawer: number;
  depositToBank: number;
  handoverToOwner: number;
  notes: string;
}

const fmt = (n: number) =>
  new Intl.NumberFormat("en-IN", { style: "currency", currency: "INR", minimumFractionDigits: 2 }).format(n);

const DailyTallyReport = React.forwardRef<HTMLDivElement, DailyTallyReportProps>(
  (props, ref) => {
    const {
      date, businessName, aggregated, totalIn, totalOut,
      openingCash, expectedCash, physicalCash, difference,
      leaveInDrawer, depositToBank, handoverToOwner, notes,
    } = props;

    const TableRow = ({ label, data, bold }: { label: string; data: PaymentBreakdown; bold?: boolean }) => (
      <tr style={{ fontWeight: bold ? 700 : 400, borderTop: bold ? "2px solid #333" : undefined }}>
        <td style={{ padding: "4px 8px" }}>{label}</td>
        <td style={{ padding: "4px 8px", textAlign: "right" }}>{fmt(data.cash)}</td>
        <td style={{ padding: "4px 8px", textAlign: "right" }}>{fmt(data.upi)}</td>
        <td style={{ padding: "4px 8px", textAlign: "right" }}>{fmt(data.card)}</td>
        <td style={{ padding: "4px 8px", textAlign: "right" }}>{fmt(data.bank)}</td>
        <td style={{ padding: "4px 8px", textAlign: "right" }}>{fmt(data.credit)}</td>
        <td style={{ padding: "4px 8px", textAlign: "right", fontWeight: 700 }}>{fmt(data.total)}</td>
      </tr>
    );

    return (
      <div ref={ref} style={{ fontFamily: "Arial, sans-serif", fontSize: 12, color: "#000", padding: 24, background: "#fff" }}>
        {/* Header */}
        <div style={{ textAlign: "center", marginBottom: 16 }}>
          <h2 style={{ fontSize: 18, margin: 0 }}>{businessName}</h2>
          <h3 style={{ fontSize: 14, margin: "4px 0", fontWeight: 600 }}>Daily Tally & Settlement Report</h3>
          <p style={{ margin: 0, fontSize: 12 }}>Date: {format(date, "dd/MM/yyyy")} | Generated: {format(new Date(), "dd/MM/yyyy hh:mm a")}</p>
        </div>

        {/* Summary */}
        <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 16, gap: 16 }}>
          <div><strong>Total Sales:</strong> {fmt(aggregated.posSales.total + aggregated.invoiceSales.total)}</div>
          <div><strong>Total Inward:</strong> {fmt(totalIn.total)}</div>
          <div><strong>Total Outward:</strong> {fmt(totalOut.total)}</div>
          <div><strong>Net Movement:</strong> {fmt(totalIn.total - totalOut.total)}</div>
        </div>

        {/* Money In */}
        <h4 style={{ fontSize: 13, margin: "12px 0 4px", borderBottom: "1px solid #999" }}>💰 Money In</h4>
        <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 11 }}>
          <thead>
            <tr style={{ borderBottom: "1px solid #999" }}>
              <th style={{ textAlign: "left", padding: "4px 8px" }}>Source</th>
              <th style={{ textAlign: "right", padding: "4px 8px" }}>Cash</th>
              <th style={{ textAlign: "right", padding: "4px 8px" }}>UPI</th>
              <th style={{ textAlign: "right", padding: "4px 8px" }}>Card</th>
              <th style={{ textAlign: "right", padding: "4px 8px" }}>Bank</th>
              <th style={{ textAlign: "right", padding: "4px 8px" }}>Credit</th>
              <th style={{ textAlign: "right", padding: "4px 8px" }}>Total</th>
            </tr>
          </thead>
          <tbody>
            <TableRow label="POS Sales" data={aggregated.posSales} />
            <TableRow label="Sales Invoice" data={aggregated.invoiceSales} />
            <TableRow label="Old Balance Received" data={aggregated.receipts} />
            <TableRow label="Advance Received" data={aggregated.advances} />
            <TableRow label="Total Inward" data={totalIn} bold />
          </tbody>
        </table>

        {/* Money Out */}
        <h4 style={{ fontSize: 13, margin: "12px 0 4px", borderBottom: "1px solid #999" }}>📤 Money Out</h4>
        <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 11 }}>
          <thead>
            <tr style={{ borderBottom: "1px solid #999" }}>
              <th style={{ textAlign: "left", padding: "4px 8px" }}>Source</th>
              <th style={{ textAlign: "right", padding: "4px 8px" }}>Cash</th>
              <th style={{ textAlign: "right", padding: "4px 8px" }}>UPI</th>
              <th style={{ textAlign: "right", padding: "4px 8px" }}>Card</th>
              <th style={{ textAlign: "right", padding: "4px 8px" }}>Bank</th>
              <th style={{ textAlign: "right", padding: "4px 8px" }}>Credit</th>
              <th style={{ textAlign: "right", padding: "4px 8px" }}>Total</th>
            </tr>
          </thead>
          <tbody>
            <TableRow label="Supplier Payment" data={aggregated.supplierPayments} />
            <TableRow label="Shop Expense" data={aggregated.expenses} />
            <TableRow label="Employee Salary" data={aggregated.employeeSalary} />
            <TableRow label="Sale Return Refund" data={aggregated.saleReturnRefunds} />
            <TableRow label="Total Outward" data={totalOut} bold />
          </tbody>
        </table>

        {/* Cash Reconciliation */}
        <h4 style={{ fontSize: 13, margin: "12px 0 4px", borderBottom: "1px solid #999" }}>🏦 Cash Reconciliation</h4>
        <table style={{ width: "50%", borderCollapse: "collapse", fontSize: 11 }}>
          <tbody>
            <tr><td style={{ padding: "3px 8px" }}>Opening Cash</td><td style={{ textAlign: "right", padding: "3px 8px" }}>{fmt(openingCash)}</td></tr>
            <tr><td style={{ padding: "3px 8px" }}>+ Cash In</td><td style={{ textAlign: "right", padding: "3px 8px" }}>{fmt(totalIn.cash)}</td></tr>
            <tr><td style={{ padding: "3px 8px" }}>− Cash Out</td><td style={{ textAlign: "right", padding: "3px 8px" }}>{fmt(totalOut.cash)}</td></tr>
            <tr style={{ fontWeight: 700, borderTop: "1px solid #333" }}><td style={{ padding: "3px 8px" }}>Expected Cash</td><td style={{ textAlign: "right", padding: "3px 8px" }}>{fmt(expectedCash)}</td></tr>
            <tr><td style={{ padding: "3px 8px" }}>Physical Cash</td><td style={{ textAlign: "right", padding: "3px 8px" }}>{fmt(physicalCash)}</td></tr>
            <tr style={{ fontWeight: 700 }}><td style={{ padding: "3px 8px" }}>Difference</td><td style={{ textAlign: "right", padding: "3px 8px" }}>{difference >= 0 ? "+" : ""}{fmt(difference)}</td></tr>
          </tbody>
        </table>

        {/* Settlement */}
        <h4 style={{ fontSize: 13, margin: "12px 0 4px", borderBottom: "1px solid #999" }}>📋 Settlement</h4>
        <table style={{ width: "50%", borderCollapse: "collapse", fontSize: 11 }}>
          <tbody>
            <tr><td style={{ padding: "3px 8px" }}>Leave in Drawer</td><td style={{ textAlign: "right", padding: "3px 8px" }}>{fmt(leaveInDrawer)}</td></tr>
            <tr><td style={{ padding: "3px 8px" }}>Deposit to Bank</td><td style={{ textAlign: "right", padding: "3px 8px" }}>{fmt(depositToBank)}</td></tr>
            <tr style={{ fontWeight: 700, borderTop: "1px solid #333" }}><td style={{ padding: "3px 8px" }}>Handover to Owner</td><td style={{ textAlign: "right", padding: "3px 8px" }}>{fmt(handoverToOwner)}</td></tr>
          </tbody>
        </table>

        {notes && (
          <div style={{ marginTop: 12, fontSize: 11 }}>
            <strong>Notes:</strong> {notes}
          </div>
        )}

        {/* Signature lines */}
        <div style={{ marginTop: 40, display: "flex", justifyContent: "space-between", fontSize: 11 }}>
          <div style={{ borderTop: "1px solid #333", paddingTop: 4, width: 160, textAlign: "center" }}>Cashier</div>
          <div style={{ borderTop: "1px solid #333", paddingTop: 4, width: 160, textAlign: "center" }}>Manager</div>
          <div style={{ borderTop: "1px solid #333", paddingTop: 4, width: 160, textAlign: "center" }}>Owner</div>
        </div>
      </div>
    );
  }
);

DailyTallyReport.displayName = "DailyTallyReport";
export default DailyTallyReport;
