import { useState, useRef } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useOrganization } from "@/contexts/OrganizationContext";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { Checkbox } from "@/components/ui/checkbox";
import { toast } from "sonner";
import { AlertTriangle, Loader2, MessageCircle, Printer, Receipt, Search } from "lucide-react";
import { format } from "date-fns";
import { useWhatsAppSend } from "@/hooks/useWhatsAppSend";
import { useWhatsAppAPI } from "@/hooks/useWhatsAppAPI";
import { useReactToPrint } from "react-to-print";
import { SchoolFeeReceipt } from "./SchoolFeeReceipt";

interface Student {
  id: string;
  student_name: string;
  admission_number: string;
  class_id: string | null;
  parent_phone: string | null;
  parent_name: string | null;
  closing_fees_balance?: number | null;
  school_classes?: { class_name: string } | null;
  school_sections?: { section_name: string } | null;
}

interface FeeCollectionDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  student: Student | null;
}

interface FeeItem {
  fee_head_id: string;
  head_name: string;
  structure_amount: number;
  already_paid: number;
  balance: number;
  selected: boolean;
  paying: number;
  fee_structure_id: string;
}

const PAYMENT_METHODS = [
  { value: "Cash", label: "Cash" },
  { value: "UPI", label: "UPI" },
  { value: "Card", label: "Card" },
  { value: "Bank Transfer", label: "Bank Transfer" },
];

export function FeeCollectionDialog({ open, onOpenChange, student: initialStudent }: FeeCollectionDialogProps) {
  const { currentOrganization } = useOrganization();
  const queryClient = useQueryClient();
  const [paymentMethod, setPaymentMethod] = useState("Cash");
  const [transactionId, setTransactionId] = useState("");
  const [feeItems, setFeeItems] = useState<FeeItem[]>([]);
  const [showReceipt, setShowReceipt] = useState(false);
  const [receiptData, setReceiptData] = useState<any>(null);
  const receiptRef = useRef<HTMLDivElement>(null);
  const { sendWhatsApp } = useWhatsAppSend();
  const { settings: whatsAppSettings, sendMessageAsync } = useWhatsAppAPI();
  const [studentSearch, setStudentSearch] = useState("");
  const [selectedStudent, setSelectedStudent] = useState<Student | null>(initialStudent);
  const [selectedYearId, setSelectedYearId] = useState<string>("");

  // Fetch organization logo URL for WhatsApp messages
  const { data: orgLogoSettings } = useQuery({
    queryKey: ["org-logo-url", currentOrganization?.id],
    queryFn: async () => {
      const { data } = await supabase
        .from("settings")
        .select("bill_barcode_settings")
        .eq("organization_id", currentOrganization!.id)
        .maybeSingle();
      return data;
    },
    enabled: !!currentOrganization?.id,
  });
  const logoUrl = (orgLogoSettings?.bill_barcode_settings as any)?.logo_url || "";

  const student = initialStudent || selectedStudent;

  // Search students when no initial student provided
  const { data: searchResults } = useQuery({
    queryKey: ["student-search-fee", currentOrganization?.id, studentSearch],
    queryFn: async () => {
      if (!studentSearch || studentSearch.length < 2) return [];
      const searchTerm = studentSearch.trim();
      const { data } = await supabase
        .from("students")
        .select("*, school_classes:class_id (class_name)")
        .eq("organization_id", currentOrganization!.id)
        .is("deleted_at", null)
        .or(`student_name.ilike.%${searchTerm}%,admission_number.ilike.%${searchTerm}%,parent_phone.ilike.%${searchTerm}%,parent_name.ilike.%${searchTerm}%`)
        .limit(10);
      return data || [];
    },
    enabled: !!currentOrganization?.id && !initialStudent && open && studentSearch.length >= 2,
  });

  const handlePrint = useReactToPrint({
    contentRef: receiptRef,
  });

  // Get all academic years for selection
  const { data: allAcademicYears = [] } = useQuery({
    queryKey: ["all-academic-years", currentOrganization?.id],
    queryFn: async () => {
      const { data } = await supabase
        .from("academic_years")
        .select("*")
        .eq("organization_id", currentOrganization!.id)
        .order("start_date", { ascending: false });
      return data || [];
    },
    enabled: !!currentOrganization?.id,
  });

  // Get current academic year
  const { data: currentYear } = useQuery({
    queryKey: ["current-academic-year", currentOrganization?.id],
    queryFn: async () => {
      const { data } = await supabase
        .from("academic_years")
        .select("*")
        .eq("organization_id", currentOrganization!.id)
        .eq("is_current", true)
        .single();
      return data;
    },
    enabled: !!currentOrganization?.id,
  });

  // Set default selected year to current year
  const activeYear = allAcademicYears.find((y: any) => y.id === selectedYearId) || currentYear;
  if (currentYear && !selectedYearId) {
    // Use effect-free default
  }

  // Helper: extract FY start/end full years from academic year name like "2025-26" or "2025-2026"
  const getFYYears = (yearName?: string) => {
    if (!yearName) return { start: null, end: null };
    const match = yearName.match(/(\d{4})\s*[-–]\s*(\d{2,4})/);
    if (!match) return { start: null, end: null };
    const startYear = parseInt(match[1]);
    const endPart = match[2];
    const endYear = endPart.length === 2 ? parseInt(match[1].substring(0, 2) + endPart) : parseInt(endPart);
    return { start: startYear, end: endYear };
  };

  const usedYearForReceipt = activeYear || currentYear;
  const fyYears = getFYYears(usedYearForReceipt?.year_name);

  // Preview next receipt number — read-only, does NOT consume a sequence
  const { data: nextReceiptNo } = useQuery({
    queryKey: ["peek-receipt-number", currentOrganization?.id, fyYears.start, fyYears.end],
    queryFn: async () => {
      const params: any = { p_organization_id: currentOrganization!.id };
      if (fyYears.start && fyYears.end) {
        params.p_fy_start_year = fyYears.start;
        params.p_fy_end_year = fyYears.end;
      }
      const { data } = await supabase.rpc("peek_fee_receipt_number" as any, params);
      return data as string;
    },
    enabled: !!currentOrganization?.id && open,
  });

  const usedYear = activeYear || currentYear;

  // Fetch fee structures for this student's class + existing payments
  const { isLoading } = useQuery({
    queryKey: ["student-fee-details", student?.id, student?.class_id, usedYear?.id],
    queryFn: async () => {
      if (!usedYear?.id) return [];

      // Get fee structures for this class (if class assigned)
      let structures: any[] = [];
      if (student?.class_id) {
        const { data } = await supabase
          .from("fee_structures")
          .select("*, fee_heads!inner(head_name)")
          .eq("organization_id", currentOrganization!.id)
        .eq("academic_year_id", usedYear!.id)
          .eq("class_id", student.class_id);
        structures = data || [];
      }

      // Get existing payments for this student
      const { data: payments } = await supabase
        .from("student_fees")
        .select("*")
        .eq("student_id", student.id)
        .eq("organization_id", currentOrganization!.id)
        .eq("academic_year_id", usedYear.id)
        .in("status", ["paid", "partial"]);

      const items: FeeItem[] = (structures || []).map((s: any) => {
        const paidForHead = (payments || [])
          .filter((p: any) => p.fee_head_id === s.fee_head_id)
          .reduce((sum: number, p: any) => sum + (p.paid_amount || 0), 0);
        
        const multiplier = s.frequency === "monthly" ? 12 : s.frequency === "quarterly" ? 4 : 1;
        const totalAmount = s.amount * multiplier;
        const balance = totalAmount - paidForHead;

        return {
          fee_head_id: s.fee_head_id,
          head_name: s.fee_heads?.head_name || "Unknown",
          structure_amount: totalAmount,
          already_paid: paidForHead,
          balance: Math.max(0, balance),
          selected: balance > 0,
          paying: Math.max(0, balance),
          fee_structure_id: s.id,
        };
      });

      // If no fee structures found OR all structure amounts are 0, use closing_fees_balance
      const totalStructureAmount = items.reduce((sum, i) => sum + i.structure_amount, 0);
      if ((items.length === 0 || totalStructureAmount === 0) && student.closing_fees_balance && student.closing_fees_balance > 0) {
        // Clear zero-amount structure items so we use imported balance instead
        if (totalStructureAmount === 0) items.length = 0;
        const totalPaidInYear = (payments || []).reduce((sum: number, p: any) => sum + (p.paid_amount || 0), 0);
        const importedBalance = student.closing_fees_balance - totalPaidInYear;
        if (importedBalance > 0) {
          items.push({
            fee_head_id: "__imported_balance__",
            head_name: "Fees Balance (Imported)",
            structure_amount: student.closing_fees_balance,
            already_paid: totalPaidInYear,
            balance: importedBalance,
            selected: true,
            paying: importedBalance,
            fee_structure_id: "__imported__",
          });
        }
      }

      setFeeItems(items);
      return items;
    },
    enabled: !!student?.id && !!usedYear?.id && open,
  });

  const totalPaying = feeItems
    .filter(i => i.selected && i.balance > 0)
    .reduce((sum, i) => sum + i.paying, 0);

  const collectMutation = useMutation({
    mutationFn: async () => {
      if (!student || !currentOrganization) throw new Error("Student data missing");
      if (!usedYear) throw new Error(
        "No active academic year found. Please go to School Settings → Academic Year Setup and mark the current year as active."
      );

      const selectedItems = feeItems.filter(i => i.selected && i.paying > 0);
      if (selectedItems.length === 0) throw new Error("No fees selected");

      // Generate financial year based receipt number via DB function (with fallback)
      let receiptNumber: string;
      const saveFY = getFYYears(usedYear?.year_name);
      const rpcParams: any = { p_organization_id: currentOrganization.id };
      if (saveFY.start && saveFY.end) {
        rpcParams.p_fy_start_year = saveFY.start;
        rpcParams.p_fy_end_year = saveFY.end;
      }
      try {
        const { data: receiptResult, error: receiptError } = await supabase
          .rpc("generate_fee_receipt_number", rpcParams);
        if (receiptError) {
          console.warn("Receipt RPC failed, using fallback:", receiptError.message);
          // Fallback: use selected academic year FY, not current date
          const fbFY = saveFY.start && saveFY.end
            ? `${saveFY.start}-${String(saveFY.end).slice(2)}`
            : (() => { const now = new Date(); return now.getMonth() >= 3 ? `${now.getFullYear()}-${String(now.getFullYear() + 1).slice(2)}` : `${now.getFullYear() - 1}-${String(now.getFullYear()).slice(2)}`; })();
          const prefix = `RCT/${fbFY}/`;
          const { data: maxReceipts } = await supabase
            .from("student_fees")
            .select("payment_receipt_id")
            .eq("organization_id", currentOrganization.id)
            .like("payment_receipt_id", `${prefix}%`);
          let maxSeq = 0;
          (maxReceipts || []).forEach((r: any) => {
            const num = parseInt(r.payment_receipt_id?.replace(prefix, "") || "0");
            if (!isNaN(num) && num > maxSeq) maxSeq = num;
          });
          receiptNumber = `${prefix}${maxSeq + 1}`;
        } else {
          receiptNumber = receiptResult as string;
        }
      } catch (rpcErr: any) {
        const fbFY2 = saveFY.start && saveFY.end
          ? `${saveFY.start}-${String(saveFY.end).slice(2)}`
          : (() => { const now = new Date(); return now.getMonth() >= 3 ? `${now.getFullYear()}-${String(now.getFullYear() + 1).slice(2)}` : `${now.getFullYear() - 1}-${String(now.getFullYear()).slice(2)}`; })();
        const prefix = `RCT/${fbFY2}/`;
        const { data: maxReceipts } = await supabase
          .from("student_fees")
          .select("payment_receipt_id")
          .eq("organization_id", currentOrganization.id)
          .like("payment_receipt_id", `${prefix}%`);
        let maxSeq = 0;
        (maxReceipts || []).forEach((r: any) => {
          const num = parseInt(r.payment_receipt_id?.replace(prefix, "") || "0");
          if (!isNaN(num) && num > maxSeq) maxSeq = num;
        });
        receiptNumber = `${prefix}${maxSeq + 1}`;
      }
      const paidDate = new Date().toISOString();

      // Duplicate prevention: check if same student already has a fee record on the same date with same amount
      const fiveMinAgo = new Date(Date.now() - 5 * 60 * 1000).toISOString();
      const { data: recentDuplicates } = await supabase
        .from("student_fees")
        .select("id, paid_amount, payment_receipt_id")
        .eq("organization_id", currentOrganization.id)
        .eq("student_id", student.id)
        .gte("created_at", fiveMinAgo)
        .neq("status", "deleted");
      
      if (recentDuplicates && recentDuplicates.length > 0) {
        const dupAmounts = recentDuplicates.map((d: any) => d.paid_amount);
        const matchingDup = selectedItems.some(item => dupAmounts.includes(item.paying));
        if (matchingDup) {
          const confirmed = window.confirm(
            `Warning: A fee receipt was already created for ${student.student_name} in the last 5 minutes (${recentDuplicates[0]?.payment_receipt_id}). This may be a duplicate. Continue anyway?`
          );
          if (!confirmed) {
            throw new Error("Duplicate fee collection cancelled by user");
          }
        }
      }

      for (const item of selectedItems) {
        const newStatus = item.paying >= item.balance ? "paid" : "partial";
        const isImported = item.fee_head_id === "__imported_balance__";
        const { error } = await supabase.from("student_fees").insert({
          organization_id: currentOrganization.id,
          student_id: student.id,
          fee_head_id: isImported ? null : item.fee_head_id,
          fee_structure_id: isImported ? null : item.fee_structure_id,
          academic_year_id: usedYear!.id,
          amount: item.structure_amount,
          paid_amount: item.paying,
          paid_date: paidDate,
          payment_method: paymentMethod,
          transaction_id: transactionId || null,
          payment_receipt_id: receiptNumber,
          status: newStatus,
        });
        if (error) throw error;
      }

      // Create voucher entry in accounts ledger for this fee collection
      try {
        const voucherNumber = receiptNumber; // Use same receipt number as voucher
        const paymentMethodLower = paymentMethod.toLowerCase();
        const mappedMethod = paymentMethodLower === 'upi' ? 'upi' 
          : paymentMethodLower === 'card' ? 'card'
          : paymentMethodLower === 'bank transfer' ? 'bank_transfer'
          : 'cash';
        
        const feeHeadNames = selectedItems.map(i => i.head_name).join(', ');
        const description = `Fee Collection - ${student.student_name} (${student.admission_number}) | ${feeHeadNames} | ${paymentMethod}${transactionId ? ` | Txn: ${transactionId}` : ''}`;

        await supabase.from("voucher_entries").insert({
          organization_id: currentOrganization.id,
          voucher_type: "receipt",
          voucher_number: voucherNumber,
          voucher_date: format(new Date(), 'yyyy-MM-dd'),
          total_amount: totalPaying,
          description,
          reference_type: "student_fee",
          reference_id: student.id,
          payment_method: mappedMethod,
        });
      } catch (voucherErr: any) {
        console.error("Voucher entry creation failed:", voucherErr);
        toast.error("Warning: Fee collected but accounting entry failed. Please contact admin.");
      }

      // Calculate remaining balance after this payment
      const remainingBalance = feeItems.reduce((sum, i) => {
        if (i.balance <= 0) return sum;
        if (i.selected && i.paying > 0) {
          return sum + Math.max(0, i.balance - i.paying);
        }
        return sum + i.balance;
      }, 0);

      return {
        receiptNumber,
        paidDate,
        selectedItems,
        paymentMethod,
        transactionId,
        totalPaying,
        remainingBalance,
        academicYear: usedYear?.year_name || "",
      };
    },
    onSuccess: async (data) => {
      toast.success("Fee collected successfully!");
      setReceiptData(data);
      setShowReceipt(true);
      queryClient.invalidateQueries({ queryKey: ["students-fee-collection"] });
      queryClient.invalidateQueries({ queryKey: ["student-fee-details"] });
      queryClient.invalidateQueries({ queryKey: ["fee-collection-summary"] });
      queryClient.invalidateQueries({ queryKey: ["next-receipt-number"] });
      queryClient.invalidateQueries({ queryKey: ["peek-receipt-number"] });

      // Auto-send WhatsApp receipt via API if configured
      const autoSend = (whatsAppSettings as any)?.auto_send_fee_receipt;
      const templateName = (whatsAppSettings as any)?.fee_receipt_template_name;
      const phone = student?.parent_phone;
      if (autoSend && templateName && phone && whatsAppSettings?.is_active) {
        try {
          const feeLines = data.selectedItems.map((item: any) => `• ${item.head_name}: Rs.${item.paying.toLocaleString("en-IN")}`).join("\n");
          await sendMessageAsync({
            phone,
            message: `Fee Receipt\n\nRespected Sir/Madam,\n\n${currentOrganization?.name || "School"}\n\nReceipt No: ${data.receiptNumber}\nDate: ${format(new Date(data.paidDate), "dd/MM/yyyy")}\nStudent: ${student?.student_name || "-"}\nAdmission No: ${student?.admission_number}\nClass: ${student?.school_classes?.class_name || "-"}\n\nAmount Paid: Rs.${data.totalPaying.toLocaleString("en-IN")}\nPayment Mode: ${data.paymentMethod}\n\n${feeLines}\n\nThank you for your payment.\n\n${currentOrganization?.name || "School"}`,
            templateType: "fee_receipt",
            templateName,
            imageUrl: logoUrl || undefined,
            imageCaption: currentOrganization?.name || "",
            saleData: {
              student_name: student?.student_name,
              admission_number: student?.admission_number,
              class_name: student?.school_classes?.class_name || "",
              receipt_number: data.receiptNumber,
              amount: data.totalPaying,
              fee_heads: feeLines,
              payment_method: data.paymentMethod,
              organization_name: currentOrganization?.name || "",
              date: format(new Date(data.paidDate), "dd/MM/yyyy"),
              balance: data.remainingBalance ?? 0,
            },
          });
          toast.success("WhatsApp receipt sent!");
        } catch (err: any) {
          console.error("WhatsApp auto-send failed:", err);
          toast.error("WhatsApp send failed: " + (err.message || "Unknown error"));
        }
      }
    },
    onError: (err: any) => {
      const msg = err.message || "Unknown error";
      if (msg.includes("academic year") || msg.includes("Student data")) {
        toast.error(msg);
      } else if (msg.includes("invalid input syntax") || msg.includes("CAST")) {
        toast.error("Receipt number generation failed. Please contact support or try again.");
      } else {
        toast.error("Collection failed: " + msg);
      }
    },
  });

  const toggleItem = (idx: number) => {
    setFeeItems(prev => {
      const updated = [...prev];
      updated[idx] = { ...updated[idx], selected: !updated[idx].selected };
      return updated;
    });
  };

  const updatePaying = (idx: number, value: number) => {
    setFeeItems(prev => {
      const updated = [...prev];
      updated[idx] = { ...updated[idx], paying: Math.min(value, updated[idx].balance) };
      return updated;
    });
  };

  if (showReceipt && receiptData && student) {
    return (
      <Dialog open={open} onOpenChange={(v) => { if (!v) { setShowReceipt(false); setReceiptData(null); } onOpenChange(v); }}>
        <DialogContent className="max-w-[230mm] w-[230mm] p-4">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Receipt className="h-5 w-5" /> Fee Receipt
            </DialogTitle>
          </DialogHeader>
          <SchoolFeeReceipt
            ref={receiptRef}
            receiptNumber={receiptData.receiptNumber}
            paidDate={receiptData.paidDate}
            paymentMethod={receiptData.paymentMethod}
            transactionId={receiptData.transactionId}
            academicYear={receiptData.academicYear}
            student={{
              student_name: student.student_name,
              admission_number: student.admission_number,
              parent_name: student.parent_name,
              class_name: student.school_classes?.class_name || "-",
            }}
            items={receiptData.selectedItems.map((item: any) => ({
              head_name: item.head_name,
              paying: item.paying,
            }))}
            totalPaying={receiptData.totalPaying}
            remainingBalance={receiptData.remainingBalance ?? 0}
          />
          <div className="flex justify-end gap-2 mt-2">
            <Button variant="outline" onClick={() => { setShowReceipt(false); setReceiptData(null); onOpenChange(false); }}>Close</Button>
            <Button
              variant="outline"
              className="text-green-600 border-green-600 hover:bg-green-50"
              onClick={() => {
                const phone = student.parent_phone;
                if (!phone) { toast.error("No phone number found for this student"); return; }
                const feeLines = receiptData.selectedItems.map((item: any) => `• ${item.head_name}: Rs.${item.paying.toLocaleString("en-IN", { minimumFractionDigits: 2 })}`).join("\n");
                const msg = `Fee Receipt\n\nRespected Sir/Madam,\n\n${currentOrganization?.name || "School"}\n\nReceipt No: ${receiptData.receiptNumber}\nDate: ${format(new Date(receiptData.paidDate), "dd/MM/yyyy")}\nStudent: ${student.student_name || "-"}\nAdmission No: ${student.admission_number}\nClass: ${student.school_classes?.class_name || "-"}\n\nAmount Paid: Rs.${receiptData.totalPaying.toLocaleString("en-IN", { minimumFractionDigits: 2 })}\nPayment Mode: ${receiptData.paymentMethod}\nBalance: Rs.${(receiptData.remainingBalance ?? 0).toLocaleString("en-IN", { minimumFractionDigits: 2 })}\n\n${feeLines}\n\nThank you for your payment.\n\n${currentOrganization?.name || "School"}`;
                sendWhatsApp(phone, msg);
              }}
            >
              <MessageCircle className="h-4 w-4 mr-2" /> WhatsApp
            </Button>
            <Button onClick={() => handlePrint()}>
              <Printer className="h-4 w-4 mr-2" /> Print Receipt
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    );
  }

  return (
    <Dialog open={open} onOpenChange={(v) => { if (!v) { setSelectedStudent(null); setStudentSearch(""); } onOpenChange(v); }}>
      <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>
            {student ? `Collect Fee — ${student.student_name} (${student.admission_number})` : "Add Fee Collection"}
          </DialogTitle>
        </DialogHeader>

        {/* Receipt preview & Academic Year selector */}
        {student && (
          <div className="flex flex-wrap items-center gap-4 pb-2 border-b">
            <div className="flex items-center gap-2">
              <Receipt className="h-4 w-4 text-muted-foreground" />
              <span className="text-sm font-medium">Next Receipt:</span>
              <Badge variant="outline" className="font-mono text-sm">
                {nextReceiptNo || "Loading..."}
              </Badge>
            </div>
            <div className="flex items-center gap-2 ml-auto">
              <span className="text-sm font-medium">Academic Year:</span>
              <Select
                value={selectedYearId || currentYear?.id || ""}
                onValueChange={(v) => setSelectedYearId(v)}
              >
                <SelectTrigger className="w-[150px] h-8 text-sm">
                  <SelectValue placeholder="Select Year" />
                </SelectTrigger>
                <SelectContent>
                  {allAcademicYears.map((y: any) => (
                    <SelectItem key={y.id} value={y.id}>
                      {y.year_name} {y.is_current ? "(Current)" : ""}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>
        )}

        {/* Student search when no student pre-selected */}
        {!student && (
          <div className="space-y-3">
            <div className="relative">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
              <Input
                placeholder="Search student by name, admission no, or phone..."
                value={studentSearch}
                onChange={(e) => setStudentSearch(e.target.value)}
                className="pl-9"
                autoFocus
              />
            </div>
            {searchResults && searchResults.length > 0 && (
              <div className="border rounded-md max-h-60 overflow-y-auto">
                {searchResults.map((s: any) => (
                  <div
                    key={s.id}
                    className="flex items-center justify-between px-3 py-2 hover:bg-accent/10 cursor-pointer border-b last:border-b-0"
                    onClick={() => { setSelectedStudent(s); setStudentSearch(""); }}
                  >
                    <div>
                      <p className="font-medium text-sm">{s.student_name}</p>
                      <p className="text-xs text-muted-foreground">{s.admission_number} • {s.school_classes?.class_name || "-"}</p>
                    </div>
                    <Button size="sm" variant="outline">Select</Button>
                  </div>
                ))}
              </div>
            )}
            {studentSearch.length >= 2 && searchResults?.length === 0 && (
              <p className="text-sm text-muted-foreground text-center py-4">No students found</p>
            )}
          </div>
        )}

        {student && (
          <>
            {!currentYear && !isLoading && (
              <div className="flex items-start gap-3 p-3 bg-amber-50 dark:bg-amber-950/30 border border-amber-200 dark:border-amber-800 rounded-lg text-sm text-amber-800 dark:text-amber-300">
                <AlertTriangle className="h-4 w-4 mt-0.5 shrink-0" />
                <div>
                  <p className="font-semibold">No active academic year</p>
                  <p className="text-xs mt-0.5">Go to School Settings → Academic Year Setup and mark the current year as active before collecting fees.</p>
                </div>
              </div>
            )}
            {isLoading ? (
              <div className="flex items-center justify-center h-32">
                <Loader2 className="h-6 w-6 animate-spin" />
              </div>
            ) : feeItems.length === 0 ? (
              <p className="text-center text-muted-foreground py-8">No fee structure defined for this student's class. Set up fee structures first.</p>
            ) : (
              <div className="space-y-4">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead className="w-10"></TableHead>
                      <TableHead>Fee Head</TableHead>
                      <TableHead className="text-right">Total</TableHead>
                      <TableHead className="text-right">Paid</TableHead>
                      <TableHead className="text-right">Balance</TableHead>
                      <TableHead className="text-right w-32">Paying</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {feeItems.map((item, idx) => (
                      <TableRow key={item.fee_head_id} className={item.balance === 0 ? "opacity-50" : ""}>
                        <TableCell>
                          <Checkbox
                            checked={item.selected}
                            disabled={item.balance === 0}
                            onCheckedChange={() => toggleItem(idx)}
                          />
                        </TableCell>
                        <TableCell className="font-medium">{item.head_name}</TableCell>
                        <TableCell className="text-right">₹{item.structure_amount.toLocaleString("en-IN")}</TableCell>
                        <TableCell className="text-right text-green-600">₹{item.already_paid.toLocaleString("en-IN")}</TableCell>
                        <TableCell className="text-right font-semibold">
                          {item.balance > 0 ? (
                            <span className="text-destructive">₹{item.balance.toLocaleString("en-IN")}</span>
                          ) : (
                            <Badge variant="secondary" className="text-xs">Paid</Badge>
                          )}
                        </TableCell>
                        <TableCell className="text-right">
                          {item.balance > 0 && (
                            <Input
                              type="number"
                              min="0"
                              max={item.balance}
                              value={item.paying || ""}
                              onChange={e => updatePaying(idx, parseFloat(e.target.value) || 0)}
                              className="w-28 text-right"
                              disabled={!item.selected}
                            />
                          )}
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>

                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <label className="text-xs font-semibold mb-1 block">Payment Method</label>
                    <Select value={paymentMethod} onValueChange={setPaymentMethod}>
                      <SelectTrigger>
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        {PAYMENT_METHODS.map(m => (
                          <SelectItem key={m.value} value={m.value}>{m.label}</SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                  <div>
                    <label className="text-xs font-semibold mb-1 block">Transaction ID (optional)</label>
                    <Input
                      value={transactionId}
                      onChange={e => setTransactionId(e.target.value)}
                      placeholder="e.g. UPI ref number"
                    />
                  </div>
                </div>

                <div className="flex items-center justify-between pt-4 border-t">
                  <div className="text-lg font-bold">
                    Total: ₹{totalPaying.toLocaleString("en-IN", { minimumFractionDigits: 2 })}
                  </div>
                  <Button
                    onClick={() => collectMutation.mutate()}
                    disabled={collectMutation.isPending || totalPaying <= 0 || !usedYear}
                  >
                    {collectMutation.isPending ? <Loader2 className="h-4 w-4 mr-2 animate-spin" /> : <Receipt className="h-4 w-4 mr-2" />}
                    Collect ₹{totalPaying.toLocaleString("en-IN")}
                  </Button>
                </div>
              </div>
            )}
          </>
        )}
      </DialogContent>
    </Dialog>
  );
}
