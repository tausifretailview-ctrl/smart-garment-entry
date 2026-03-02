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
      <div ref={ref} className="p-5 border rounded-md bg-white text-black relative overflow-hidden" style={{ fontFamily: "Arial, sans-serif" }}>
        {/* Watermark */}
        {logoUrl && (
          <div
            style={{
              position: "absolute",
              top: "50%",
              left: "50%",
              transform: "translate(-50%, -50%)",
              opacity: 0.06,
              pointerEvents: "none",
              zIndex: 0,
              width: "60%",
              maxWidth: "280px",
            }}
          >
            <img src={logoUrl} alt="" style={{ width: "100%", height: "auto" }} />
          </div>
        )}

        {/* Content */}
        <div style={{ position: "relative", zIndex: 1 }}>
          {/* Header with Logo */}
          <div className="text-center mb-3 border-b-2 border-gray-800 pb-2">
            {logoUrl && (
              <div className="flex justify-center mb-1">
                <img src={logoUrl} alt="Logo" style={{ height: "48px", objectFit: "contain" }} />
              </div>
            )}
            <h2 className="text-lg font-bold">{currentOrganization?.name}</h2>
            <p className="text-xs text-gray-600">Fee Receipt</p>
          </div>

          {/* Student & Receipt Info */}
          <div className="grid grid-cols-2 gap-x-4 gap-y-1 text-xs mb-3">
            <div><strong>Receipt #:</strong> {receiptNumber}</div>
            <div><strong>Date:</strong> {paidDate ? format(new Date(paidDate), "dd/MM/yyyy") : "-"}</div>
            <div><strong>Student Name:</strong> {student.student_name}</div>
            <div><strong>Adm. No:</strong> {student.admission_number}</div>
            {student.parent_name && <div><strong>Parent Name:</strong> {student.parent_name}</div>}
            <div><strong>Class:</strong> {student.class_name}</div>
            {academicYear && <div><strong>Academic Year:</strong> {academicYear}</div>}
            <div><strong>Payment:</strong> {paymentMethod}</div>
            {transactionId && <div className="col-span-2"><strong>Txn ID:</strong> {transactionId}</div>}
          </div>

          {/* Fee Details Table */}
          <table className="w-full text-xs border-collapse mb-3 border border-gray-300">
            <thead>
              <tr className="bg-gray-100">
                <th className="text-left py-1.5 px-2 border border-gray-300 font-semibold">Fee Head</th>
                <th className="text-right py-1.5 px-2 border border-gray-300 font-semibold">Amount</th>
              </tr>
            </thead>
            <tbody>
              {items.map((item, idx) => (
                <tr key={idx}>
                  <td className="py-1.5 px-2 border border-gray-300">{item.head_name}</td>
                  <td className="text-right py-1.5 px-2 border border-gray-300">₹{item.paying.toLocaleString("en-IN", { minimumFractionDigits: 2 })}</td>
                </tr>
              ))}
            </tbody>
            <tfoot>
              <tr className="font-bold bg-gray-50">
                <td className="py-2 px-2 border border-gray-300">Total</td>
                <td className="text-right py-2 px-2 border border-gray-300">₹{totalPaying.toLocaleString("en-IN", { minimumFractionDigits: 2 })}</td>
              </tr>
              <tr>
                <td className="py-1.5 px-2 border border-gray-300 font-semibold">Balance</td>
                <td className="text-right py-1.5 px-2 border border-gray-300 font-semibold text-red-600">
                  ₹{remainingBalance.toLocaleString("en-IN", { minimumFractionDigits: 2 })}
                </td>
              </tr>
            </tfoot>
          </table>

          {/* Signature */}
          <div className="flex justify-between items-end mt-6 text-xs">
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
