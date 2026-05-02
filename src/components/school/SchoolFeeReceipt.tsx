import { forwardRef } from "react";
import { format } from "date-fns";
import { useOrganization } from "@/contexts/OrganizationContext";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";

export interface YearWiseBalanceLine {
  year_name: string;
  balance: number;
}

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
  /** When set, printed receipt shows pending per academic session (matches WhatsApp). */
  yearWiseBalances?: YearWiseBalanceLine[];
}

export const SchoolFeeReceipt = forwardRef<HTMLDivElement, SchoolFeeReceiptProps>(
  ({ receiptNumber, paidDate, paymentMethod, transactionId, academicYear, student, items, totalPaying, remainingBalance, yearWiseBalances }, ref) => {
    const { currentOrganization } = useOrganization();
    const orgName = currentOrganization?.name || "School";
    const orgAddress = (currentOrganization as any)?.address || "";
    const orgPhone = (currentOrganization as any)?.phone || "";

    // Auto-append student surname to parent name if missing
    const parentFullName = (() => {
      const parent = (student.parent_name || "").trim();
      if (!parent) return "";
      // Extract surname: last word from student name (strip prefixes like MST., MS., MR.)
      const cleanName = student.student_name.replace(/^(MST\.?|MS\.?|MR\.?)\s*/i, "").trim();
      const nameParts = cleanName.split(/\s+/);
      if (nameParts.length < 2) return parent;
      const surname = nameParts[nameParts.length - 1].replace(/\.$/, "");
      // If parent name already contains surname, skip
      if (parent.toUpperCase().includes(surname.toUpperCase())) return parent;
      return `${parent} ${surname}`.toUpperCase();
    })();

    const { data: logoUrl } = useQuery({
      queryKey: ["org-logo", currentOrganization?.id],
      queryFn: async () => {
        if (!currentOrganization?.id) return null;
        const { data } = await supabase
          .from("settings")
          .select("bill_barcode_settings")
          .eq("organization_id", currentOrganization.id)
          .single();
        return (data?.bill_barcode_settings as any)?.logo_url || null;
      },
      enabled: !!currentOrganization?.id,
      staleTime: 60000,
    });

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
            .receipt-watermark {
              print-color-adjust: exact !important;
              -webkit-print-color-adjust: exact !important;
            }
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
            position: "relative",
            overflow: "hidden",
          }}
        >
          {/* Watermark */}
          {logoUrl && (
            <div
              className="receipt-watermark"
              style={{
                position: "absolute",
                top: "50%",
                left: "50%",
                transform: "translate(-50%, -50%)",
                width: "120mm",
                height: "120mm",
                opacity: 0.06,
                pointerEvents: "none",
                zIndex: 0,
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
              }}
            >
              <img
                src={logoUrl}
                alt=""
                style={{ width: "100%", height: "100%", objectFit: "contain" }}
              />
            </div>
          )}

          {/* Header */}
          <div style={{ display: "flex", alignItems: "center", borderBottom: "2px solid #1a1a1a", paddingBottom: "4mm", marginBottom: "5mm", position: "relative", zIndex: 1 }}>
            {logoUrl && (
              <div style={{ marginRight: "5mm", flexShrink: 0 }}>
                <img
                  src={logoUrl}
                  alt="Logo"
                  style={{ height: "18mm", width: "auto", objectFit: "contain" }}
                />
              </div>
            )}
            <div style={{ textAlign: "center", flex: 1 }}>
              <h1 style={{ margin: 0, fontSize: "18pt", fontWeight: 700, textTransform: "uppercase", letterSpacing: "1px" }}>
                {orgName}
              </h1>
              {orgAddress && <p style={{ margin: "2px 0 0", fontSize: "9pt", color: "#555" }}>{orgAddress}</p>}
              {orgPhone && <p style={{ margin: "2px 0 0", fontSize: "9pt", color: "#555" }}>Phone: {orgPhone}</p>}
            </div>
          </div>

          {/* Student Info Row */}
          <div style={{ display: "flex", justifyContent: "space-between", marginBottom: "5mm", fontSize: "10pt", position: "relative", zIndex: 1 }}>
            <div>
              <p style={{ margin: "2px 0" }}><strong>Receipt No:</strong> {receiptNumber}</p>
              <p style={{ margin: "2px 0" }}><strong>Student:</strong> {student.student_name}</p>
              <p style={{ margin: "2px 0" }}><strong>Admission No:</strong> {student.admission_number}</p>
            </div>
            <div style={{ textAlign: "right" }}>
              <p style={{ margin: "2px 0" }}><strong>Date:</strong> {format(new Date(paidDate), "dd/MM/yyyy")}</p>
              <p style={{ margin: "2px 0" }}><strong>Class:</strong> {student.class_name}</p>
              {parentFullName && <p style={{ margin: "2px 0" }}><strong>Parent:</strong> {parentFullName}</p>}
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
              position: "relative",
              zIndex: 1,
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
          <div style={{ fontSize: "10pt", marginBottom: "5mm", position: "relative", zIndex: 1 }}>
            <div style={{ display: "flex", justifyContent: "space-between" }}>
              <div>
                <p style={{ margin: "2px 0" }}><strong>Payment Mode:</strong> {paymentMethod}</p>
                {transactionId && <p style={{ margin: "2px 0" }}><strong>Transaction ID:</strong> {transactionId}</p>}
              </div>
              {!yearWiseBalances?.length && (
                <div style={{ textAlign: "right" }}>
                  <p style={{ margin: "2px 0", fontSize: "11pt", fontWeight: 700 }}>
                    Balance Due: ₹{remainingBalance.toLocaleString("en-IN", { minimumFractionDigits: 2 })}
                  </p>
                </div>
              )}
            </div>
            {yearWiseBalances && yearWiseBalances.length > 0 && (
              <div style={{ marginTop: "3mm", padding: "3mm", border: "1px solid #ccc", borderRadius: "2mm", background: "#fafafa" }}>
                <p style={{ margin: "0 0 2mm", fontWeight: 700 }}>Pending by academic session</p>
                {yearWiseBalances.map((row, idx) => (
                  <p key={idx} style={{ margin: "2px 0", display: "flex", justifyContent: "space-between", gap: "8mm" }}>
                    <span>{row.year_name} fees balance</span>
                    <span style={{ fontWeight: 600 }}>
                      ₹{row.balance.toLocaleString("en-IN", { minimumFractionDigits: 2 })}
                    </span>
                  </p>
                ))}
              </div>
            )}
          </div>

          {/* Signature */}
          <div style={{ display: "flex", justifyContent: "flex-end", marginTop: "12mm", fontSize: "10pt", position: "relative", zIndex: 1 }}>
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
