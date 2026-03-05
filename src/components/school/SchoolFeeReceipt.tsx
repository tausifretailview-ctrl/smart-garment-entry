import { forwardRef } from "react";
import { format } from "date-fns";
import { useOrganization } from "@/contexts/OrganizationContext";

interface SchoolFeeReceiptProps {
  receiptNumber: string;
  paidDate: string;
  paymentMethod: string;
  transactionId?: string;
  academicYear: string;
  student: {
    student_name: string;
    admission_number: string;
    parent_name?: string | null;
    class_name: string;
  };
  items: { head_name: string; paying: number }[];
  totalPaying: number;
  remainingBalance: number;
}

export const SchoolFeeReceipt = forwardRef<HTMLDivElement, SchoolFeeReceiptProps>(
  ({ receiptNumber, paidDate, paymentMethod, transactionId, academicYear, student, items, totalPaying, remainingBalance }, ref) => {
    const { currentOrganization } = useOrganization();
    const orgName = currentOrganization?.name || "School";
    const orgAddress = (currentOrganization as any)?.address || "";
    const orgPhone = (currentOrganization as any)?.phone || "";

    return (
      <>
        <style>{`
          @media print {
            @page { size: A5 landscape; margin: 0mm; }
            html, body {
              width: 210mm !important;
              height: 148mm !important;
              margin: 0 !important;
              padding: 0 !important;
              overflow: hidden !important;
            }
            body > * { display: none !important; }
            #school-fee-receipt-root { display: block !important; }
            [role="dialog"], [data-radix-dialog-overlay], [data-radix-dialog-content] {
              position: static !important;
              transform: none !important;
              width: 100% !important;
              max-width: 100% !important;
              height: auto !important;
              max-height: none !important;
              padding: 0 !important;
              margin: 0 !important;
              border: none !important;
              box-shadow: none !important;
              background: white !important;
              overflow: visible !important;
            }
            .no-print { display: none !important; }
          }
        `}</style>
        <div
          ref={ref}
          id="school-fee-receipt-root"
          style={{
            width: "210mm",
            minHeight: "148mm",
            padding: "8mm 10mm",
            fontFamily: "'Inter', 'Segoe UI', Arial, sans-serif",
            fontSize: "11pt",
            color: "#1a1a1a",
            background: "#fff",
            boxSizing: "border-box",
          }}
        >
          {/* Header */}
          <div style={{ textAlign: "center", borderBottom: "2px solid #1a1a1a", paddingBottom: "4mm", marginBottom: "5mm" }}>
            <h1 style={{ margin: 0, fontSize: "18pt", fontWeight: 700, textTransform: "uppercase", letterSpacing: "1px" }}>
              {orgName}
            </h1>
            {orgAddress && <p style={{ margin: "2px 0 0", fontSize: "9pt", color: "#555" }}>{orgAddress}</p>}
            {orgPhone && <p style={{ margin: "2px 0 0", fontSize: "9pt", color: "#555" }}>Phone: {orgPhone}</p>}
            <p style={{ margin: "4px 0 0", fontSize: "13pt", fontWeight: 600, letterSpacing: "2px" }}>FEE RECEIPT</p>
          </div>

          {/* Student Info Row */}
          <div style={{ display: "flex", justifyContent: "space-between", marginBottom: "5mm", fontSize: "10pt" }}>
            <div>
              <p style={{ margin: "2px 0" }}><strong>Receipt No:</strong> {receiptNumber}</p>
              <p style={{ margin: "2px 0" }}><strong>Student:</strong> {student.student_name}</p>
              <p style={{ margin: "2px 0" }}><strong>Admission No:</strong> {student.admission_number}</p>
            </div>
            <div style={{ textAlign: "right" }}>
              <p style={{ margin: "2px 0" }}><strong>Date:</strong> {format(new Date(paidDate), "dd/MM/yyyy")}</p>
              <p style={{ margin: "2px 0" }}><strong>Class:</strong> {student.class_name}</p>
              {student.parent_name && <p style={{ margin: "2px 0" }}><strong>Parent:</strong> {student.parent_name}</p>}
              <p style={{ margin: "2px 0" }}><strong>Academic Year:</strong> {academicYear}</p>
            </div>
          </div>

          {/* Fee Table */}
          <table
            style={{
              width: "100%",
              borderCollapse: "collapse",
              marginBottom: "5mm",
              fontSize: "10pt",
            }}
          >
            <thead>
              <tr style={{ background: "#f0f0f0" }}>
                <th style={{ border: "1px solid #333", padding: "3mm 4mm", textAlign: "left", width: "10%" }}>#</th>
                <th style={{ border: "1px solid #333", padding: "3mm 4mm", textAlign: "left", width: "60%" }}>Fee Head</th>
                <th style={{ border: "1px solid #333", padding: "3mm 4mm", textAlign: "right", width: "30%" }}>Amount (₹)</th>
              </tr>
            </thead>
            <tbody>
              {items.map((item, idx) => (
                <tr key={idx}>
                  <td style={{ border: "1px solid #333", padding: "2.5mm 4mm" }}>{idx + 1}</td>
                  <td style={{ border: "1px solid #333", padding: "2.5mm 4mm" }}>{item.head_name}</td>
                  <td style={{ border: "1px solid #333", padding: "2.5mm 4mm", textAlign: "right" }}>
                    {item.paying.toLocaleString("en-IN", { minimumFractionDigits: 2 })}
                  </td>
                </tr>
              ))}
            </tbody>
            <tfoot>
              <tr style={{ fontWeight: 700, background: "#f0f0f0" }}>
                <td colSpan={2} style={{ border: "1px solid #333", padding: "3mm 4mm", textAlign: "right" }}>
                  Total Paid
                </td>
                <td style={{ border: "1px solid #333", padding: "3mm 4mm", textAlign: "right" }}>
                  ₹{totalPaying.toLocaleString("en-IN", { minimumFractionDigits: 2 })}
                </td>
              </tr>
            </tfoot>
          </table>

          {/* Payment Info & Balance */}
          <div style={{ display: "flex", justifyContent: "space-between", fontSize: "10pt", marginBottom: "5mm" }}>
            <div>
              <p style={{ margin: "2px 0" }}><strong>Payment Mode:</strong> {paymentMethod}</p>
              {transactionId && <p style={{ margin: "2px 0" }}><strong>Transaction ID:</strong> {transactionId}</p>}
            </div>
            <div style={{ textAlign: "right" }}>
              <p style={{ margin: "2px 0", fontSize: "11pt", fontWeight: 700 }}>
                Balance Due: ₹{remainingBalance.toLocaleString("en-IN", { minimumFractionDigits: 2 })}
              </p>
            </div>
          </div>

          {/* Signature */}
          <div style={{ display: "flex", justifyContent: "space-between", marginTop: "12mm", fontSize: "10pt" }}>
            <div style={{ textAlign: "center" }}>
              <div style={{ borderTop: "1px solid #333", width: "50mm", marginBottom: "2mm" }} />
              <span>Parent / Guardian</span>
            </div>
            <div style={{ textAlign: "center" }}>
              <div style={{ borderTop: "1px solid #333", width: "50mm", marginBottom: "2mm" }} />
              <span>Authorized Signatory</span>
            </div>
          </div>
        </div>
      </>
    );
  }
);

SchoolFeeReceipt.displayName = "SchoolFeeReceipt";
