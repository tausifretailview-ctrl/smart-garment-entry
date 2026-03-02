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

    // Fetch logo from settings
    const { data: logoUrl } = useQuery({
      queryKey: ["org-logo", currentOrganization?.id],
      queryFn: async () => {
        const { data } = await supabase
          .from("settings" as any)
          .select("bill_barcode_settings")
          .eq("organization_id", currentOrganization!.id)
          .maybeSingle();
        return (data as any)?.bill_barcode_settings?.logo_url || null;
      },
      enabled: !!currentOrganization?.id,
      staleTime: 5 * 60 * 1000,
    });

    return (
      <div
        ref={ref}
        className="bg-white text-black relative overflow-hidden"
        style={{
          fontFamily: "Arial, sans-serif",
          width: "210mm",
          minHeight: "148mm",
          padding: "8mm 10mm",
          boxSizing: "border-box",
        }}
      >
        {/* Print style for A5 landscape */}
        <style>{`@media print { @page { size: A5 landscape; margin: 5mm; } }`}</style>

        {/* Watermark */}
        {logoUrl && (
          <div
            style={{
              position: "absolute",
              top: "50%",
              left: "50%",
              transform: "translate(-50%, -50%)",
              opacity: 0.05,
              pointerEvents: "none",
              zIndex: 0,
              width: "50%",
              maxWidth: "240px",
            }}
          >
            <img src={logoUrl} alt="" style={{ width: "100%", height: "auto" }} />
          </div>
        )}

        {/* Content */}
        <div style={{ position: "relative", zIndex: 1 }}>
          {/* Header: Logo left + School name center */}
          <div className="flex items-center mb-2 border-b-2 border-gray-800 pb-2">
            {logoUrl && (
              <div style={{ flexShrink: 0, marginRight: "12px" }}>
                <img src={logoUrl} alt="Logo" style={{ height: "52px", objectFit: "contain" }} />
              </div>
            )}
            <div className="flex-1 text-center">
              <h2 className="text-base font-bold leading-tight">{currentOrganization?.name}</h2>
              <p className="text-[10px] text-gray-500">Fee Receipt</p>
            </div>
            {/* Spacer to keep title centered when logo is present */}
            {logoUrl && <div style={{ width: "52px", flexShrink: 0 }} />}
          </div>

          {/* Student & Receipt Info - 3 columns for landscape */}
          <div className="grid grid-cols-3 gap-x-4 gap-y-0.5 text-[11px] mb-2">
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
          <table className="w-full text-[11px] border-collapse mb-2 border border-gray-400">
            <thead>
              <tr className="bg-gray-100">
                <th className="text-left py-1 px-2 border border-gray-400 font-semibold" style={{ width: "65%" }}>Fee Head</th>
                <th className="text-right py-1 px-2 border border-gray-400 font-semibold" style={{ width: "35%" }}>Amount</th>
              </tr>
            </thead>
            <tbody>
              {items.map((item, idx) => (
                <tr key={idx}>
                  <td className="py-1 px-2 border border-gray-400">{item.head_name}</td>
                  <td className="text-right py-1 px-2 border border-gray-400">₹{item.paying.toLocaleString("en-IN", { minimumFractionDigits: 2 })}</td>
                </tr>
              ))}
            </tbody>
            <tfoot>
              <tr className="font-bold bg-gray-50">
                <td className="py-1.5 px-2 border border-gray-400">Total</td>
                <td className="text-right py-1.5 px-2 border border-gray-400">₹{totalPaying.toLocaleString("en-IN", { minimumFractionDigits: 2 })}</td>
              </tr>
              <tr>
                <td className="py-1 px-2 border border-gray-400 font-semibold">Balance</td>
                <td className="text-right py-1 px-2 border border-gray-400 font-semibold text-red-600">
                  ₹{remainingBalance.toLocaleString("en-IN", { minimumFractionDigits: 2 })}
                </td>
              </tr>
            </tfoot>
          </table>

          {/* Signature */}
          <div className="flex justify-between items-end mt-4 text-[11px]">
            <div><p className="text-gray-500">Receiver</p></div>
            <div className="text-center">
              <div className="border-t border-gray-800 pt-1 w-32">
                <p className="text-gray-600">Auth. Signature</p>
              </div>
            </div>
          </div>
        </div>
      </div>
    );
  }
);

SchoolFeeReceipt.displayName = "SchoolFeeReceipt";
