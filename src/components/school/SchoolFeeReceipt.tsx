import { forwardRef } from "react";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useOrganization } from "@/contexts/OrganizationContext";
import { format } from "date-fns";

interface ReceiptItem {
  head_name: string;
  paying: number;
}

interface SchoolFeeReceiptProps {
  receiptNumber: string;
  paidDate: string;
  paymentMethod: string;
  transactionId?: string;
  academicYear?: string;
  student: {
    student_name: string;
    admission_number: string;
    parent_name?: string | null;
    class_name: string;
  };
  items: ReceiptItem[];
  totalPaying: number;
  remainingBalance: number;
}

export const SchoolFeeReceipt = forwardRef<HTMLDivElement, SchoolFeeReceiptProps>(
  ({ receiptNumber, paidDate, paymentMethod, transactionId, academicYear, student, items, totalPaying, remainingBalance }, ref) => {
    const { currentOrganization } = useOrganization();

    const { data: settings } = useQuery({
      queryKey: ["org-settings-receipt", currentOrganization?.id],
      queryFn: async () => {
        const { data } = await supabase
          .from("settings" as any)
          .select("bill_barcode_settings, business_name, address, mobile_number")
          .eq("organization_id", currentOrganization!.id)
          .maybeSingle();
        return data as any;
      },
      enabled: !!currentOrganization?.id,
      staleTime: 5 * 60 * 1000,
    });

    const logoUrl = settings?.bill_barcode_settings?.logo_url || null;
    const address = settings?.address || "";

    return (
      <div
        ref={ref}
        className="bg-white text-black relative overflow-hidden"
        style={{
          fontFamily: "Arial, sans-serif",
          width: "210mm",
          height: "148mm",
          padding: "6mm 8mm",
          boxSizing: "border-box",
        }}
      >
        {/* Print style for A5 landscape - full scale */}
        <style>{`
          @media print {
            @page { size: A5 landscape; margin: 2mm; }
            .school-receipt-watermark {
              opacity: 0.06 !important;
              -webkit-print-color-adjust: exact !important;
              print-color-adjust: exact !important;
            }
          }
        `}</style>

        {/* Watermark - uses class for print visibility */}
        {logoUrl && (
          <div
            className="school-receipt-watermark"
            style={{
              position: "absolute",
              top: "50%",
              left: "50%",
              transform: "translate(-50%, -50%) rotate(-25deg)",
              opacity: 0.06,
              pointerEvents: "none",
              zIndex: 0,
              width: "55%",
              maxWidth: "300px",
            }}
          >
            <img src={logoUrl} alt="" style={{ width: "100%", height: "auto" }} crossOrigin="anonymous" />
          </div>
        )}

        {/* Watermark text fallback when no logo */}
        {!logoUrl && currentOrganization?.name && (
          <div
            className="school-receipt-watermark"
            style={{
              position: "absolute",
              top: "50%",
              left: "50%",
              transform: "translate(-50%, -50%) rotate(-25deg)",
              opacity: 0.04,
              pointerEvents: "none",
              zIndex: 0,
              fontSize: "60px",
              fontWeight: "bold",
              whiteSpace: "nowrap",
              letterSpacing: "8px",
              color: "#000",
            }}
          >
            {currentOrganization.name}
          </div>
        )}

        {/* Content */}
        <div style={{ position: "relative", zIndex: 1, height: "100%", display: "flex", flexDirection: "column" }}>
          {/* Header: Logo left + School name center */}
          <div style={{ display: "flex", alignItems: "center", borderBottom: "2px solid #1a1a1a", paddingBottom: "6px", marginBottom: "6px" }}>
            {logoUrl && (
              <div style={{ flexShrink: 0, marginRight: "14px" }}>
                <img src={logoUrl} alt="Logo" style={{ height: "70px", objectFit: "contain" }} crossOrigin="anonymous" />
              </div>
            )}
            <div style={{ flex: 1, textAlign: "center" }}>
              <h1 style={{ fontSize: "20px", fontWeight: "bold", lineHeight: 1.2, margin: 0, letterSpacing: "0.5px" }}>
                {currentOrganization?.name}
              </h1>
              {address && (
                <p style={{ fontSize: "11px", color: "#444", margin: "2px 0 0 0", lineHeight: 1.3 }}>
                  {address}
                </p>
              )}
              <p style={{ fontSize: "13px", fontWeight: 600, color: "#333", margin: "3px 0 0 0", letterSpacing: "1px", textTransform: "uppercase" }}>
                Fee Receipt
              </p>
            </div>
            {/* Spacer to keep title centered when logo is present */}
            {logoUrl && <div style={{ width: "70px", flexShrink: 0 }} />}
          </div>

          {/* Student & Receipt Info - 3 columns */}
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: "2px 16px", fontSize: "13px", marginBottom: "8px", lineHeight: 1.6 }}>
            <div><strong>Receipt #:</strong> {receiptNumber}</div>
            <div><strong>Date:</strong> {paidDate ? format(new Date(paidDate), "dd/MM/yyyy") : "-"}</div>
            <div><strong>Payment:</strong> {paymentMethod}</div>
            <div><strong>Student Name:</strong> {student.student_name}</div>
            <div><strong>Adm. No:</strong> {student.admission_number}</div>
            <div><strong>Class:</strong> {student.class_name}</div>
            {student.parent_name && <div><strong>Parent Name:</strong> {student.parent_name}</div>}
            {academicYear && <div><strong>Academic Year:</strong> {academicYear}</div>}
            {transactionId && <div><strong>Txn ID:</strong> {transactionId}</div>}
          </div>

          {/* Fee Details Table */}
          <table style={{ width: "100%", fontSize: "13px", borderCollapse: "collapse", marginBottom: "8px", border: "1.5px solid #555" }}>
            <thead>
              <tr style={{ backgroundColor: "#f0f0f0" }}>
                <th style={{ textAlign: "left", padding: "5px 8px", border: "1.5px solid #555", fontWeight: 700, fontSize: "13px", width: "65%" }}>FEE HEAD</th>
                <th style={{ textAlign: "right", padding: "5px 8px", border: "1.5px solid #555", fontWeight: 700, fontSize: "13px", width: "35%" }}>AMOUNT</th>
              </tr>
            </thead>
            <tbody>
              {items.map((item, idx) => (
                <tr key={idx}>
                  <td style={{ padding: "4px 8px", border: "1.5px solid #555", fontSize: "13px" }}>{item.head_name}</td>
                  <td style={{ textAlign: "right", padding: "4px 8px", border: "1.5px solid #555", fontSize: "13px", fontVariantNumeric: "tabular-nums" }}>
                    ₹{item.paying.toLocaleString("en-IN", { minimumFractionDigits: 2 })}
                  </td>
                </tr>
              ))}
            </tbody>
            <tfoot>
              <tr style={{ backgroundColor: "#f5f5f5" }}>
                <td style={{ padding: "6px 8px", border: "1.5px solid #555", fontWeight: 700, fontSize: "14px" }}>Total</td>
                <td style={{ textAlign: "right", padding: "6px 8px", border: "1.5px solid #555", fontWeight: 700, fontSize: "14px", fontVariantNumeric: "tabular-nums" }}>
                  ₹{totalPaying.toLocaleString("en-IN", { minimumFractionDigits: 2 })}
                </td>
              </tr>
              <tr>
                <td style={{ padding: "4px 8px", border: "1.5px solid #555", fontWeight: 600, fontSize: "13px" }}>Balance</td>
                <td style={{ textAlign: "right", padding: "4px 8px", border: "1.5px solid #555", fontWeight: 600, fontSize: "13px", color: "#dc2626", fontVariantNumeric: "tabular-nums" }}>
                  ₹{remainingBalance.toLocaleString("en-IN", { minimumFractionDigits: 2 })}
                </td>
              </tr>
            </tfoot>
          </table>

          {/* Spacer to push signature to bottom */}
          <div style={{ flex: 1, minHeight: "20mm" }} />

          {/* Signature Section */}
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-end", fontSize: "13px", paddingTop: "4px" }}>
            <div>
              <div style={{ borderTop: "1.5px solid #333", paddingTop: "4px", width: "50mm", textAlign: "center" }}>
                <p style={{ color: "#555", fontSize: "12px", margin: 0 }}>Receiver</p>
              </div>
            </div>
            <div style={{ textAlign: "center" }}>
              <div style={{ borderTop: "1.5px solid #333", paddingTop: "4px", width: "50mm", textAlign: "center" }}>
                <p style={{ color: "#555", fontSize: "12px", margin: 0 }}>Auth. Signature</p>
              </div>
            </div>
          </div>
        </div>
      </div>
    );
  }
);

SchoolFeeReceipt.displayName = "SchoolFeeReceipt";
