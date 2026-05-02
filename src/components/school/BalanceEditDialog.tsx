import { useState, useRef, useEffect } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useOrganization } from "@/contexts/OrganizationContext";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { Loader2, Save, Printer, AlertTriangle, TrendingUp, TrendingDown, Edit3, CheckCircle } from "lucide-react";
import { toast } from "sonner";
import { format } from "date-fns";
import { useReactToPrint } from "react-to-print";

interface BalanceEditDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  student: any;
}

const REASON_CODES = {
  credit: [
    { value: "prev_year_dues", label: "Previous Year Dues Carry Forward" },
    { value: "late_fee", label: "Late Fee Added" },
    { value: "additional_fee", label: "Additional Fee Charged" },
    { value: "correction_credit", label: "Correction / Data Entry Error" },
    { value: "other_credit", label: "Other (specify below)" },
  ],
  debit: [
    { value: "fee_waiver", label: "Fee Waiver / Scholarship" },
    { value: "overpayment", label: "Overpayment Correction" },
    { value: "discount", label: "Management Discount" },
    { value: "correction_debit", label: "Correction / Data Entry Error" },
    { value: "other_debit", label: "Other (specify below)" },
  ],
  set: [
    { value: "opening_balance", label: "Opening Balance (Year Start)" },
    { value: "migration", label: "Data Migration / Import" },
    { value: "annual_reset", label: "Annual Fee Reset" },
    { value: "other_set", label: "Other (specify below)" },
  ],
};

const fmtINR = (n: number) => n.toLocaleString("en-IN", { minimumFractionDigits: 2 });

// Printable adjustment voucher
const AdjustmentVoucher = ({ data, student, orgName }: any) => (
  <div style={{ fontFamily: "Arial, sans-serif", padding: "24px", maxWidth: "500px", margin: "0 auto", fontSize: "13px", color: "#000" }}>
    <div style={{ textAlign: "center", borderBottom: "2px solid #000", paddingBottom: "8px", marginBottom: "12px" }}>
      <div style={{ fontSize: "16px", fontWeight: "bold" }}>{orgName}</div>
      <div style={{ fontSize: "12px", color: "#555", marginTop: "2px" }}>FEES BALANCE ADJUSTMENT VOUCHER</div>
    </div>
    <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "4px 16px", marginBottom: "12px", fontSize: "12px" }}>
      <div><strong>Voucher No:</strong> {data.voucher_number}</div>
      <div><strong>Date:</strong> {format(new Date(data.created_at), "dd/MM/yyyy hh:mm a")}</div>
      <div><strong>Student:</strong> {student.student_name}</div>
      <div><strong>Adm No:</strong> {student.admission_number}</div>
      <div><strong>Class:</strong> {student.school_classes?.class_name || "—"}</div>
      <div><strong>Adjusted By:</strong> {data.adjusted_by_name || "—"}</div>
    </div>
    <table style={{ width: "100%", borderCollapse: "collapse", marginBottom: "12px" }}>
      <thead>
        <tr style={{ borderBottom: "2px solid #000" }}>
          <th style={{ textAlign: "left", padding: "6px 4px" }}>Description</th>
          <th style={{ textAlign: "right", padding: "6px 4px" }}>Amount (₹)</th>
        </tr>
      </thead>
      <tbody>
        <tr style={{ borderBottom: "1px solid #ddd" }}>
          <td style={{ padding: "6px 4px" }}>Previous Pending Due</td>
          <td style={{ textAlign: "right", padding: "6px 4px" }}>{fmtINR(data.old_balance)}</td>
        </tr>
        <tr style={{ borderBottom: "1px solid #ddd" }}>
          <td style={{ padding: "6px 4px" }}>
            {data.adjustment_type === "credit" ? "Amount Added (+)" : data.adjustment_type === "debit" ? "Amount Reduced (−)" : "Balance Set To"}
          </td>
          <td style={{ textAlign: "right", padding: "6px 4px", fontWeight: "bold", color: data.adjustment_type === "debit" ? "green" : data.adjustment_type === "credit" ? "red" : "#333" }}>
            {data.adjustment_type === "debit" ? "−" : data.adjustment_type === "credit" ? "+" : ""}
            {fmtINR(data.change_amount)}
          </td>
        </tr>
        <tr style={{ borderTop: "2px solid #000" }}>
          <td style={{ padding: "6px 4px", fontWeight: "bold" }}>Revised Pending Due</td>
          <td style={{ textAlign: "right", padding: "6px 4px", fontWeight: "bold", fontSize: "14px" }}>{fmtINR(data.new_balance)}</td>
        </tr>
      </tbody>
    </table>
    <div style={{ fontSize: "11px", marginBottom: "16px" }}>
      <strong>Reason:</strong> {data.reason_code_label} {data.reason_detail ? `— ${data.reason_detail}` : ""}
    </div>
    <div style={{ display: "flex", justifyContent: "space-between", marginTop: "40px", fontSize: "11px" }}>
      <div style={{ borderTop: "1px solid #000", paddingTop: "4px", width: "40%" }}>Authorized Signatory</div>
      <div style={{ borderTop: "1px solid #000", paddingTop: "4px", width: "40%", textAlign: "right" }}>Parent / Guardian</div>
    </div>
    <div style={{ textAlign: "center", fontSize: "9px", color: "#888", marginTop: "16px" }}>
      Computer-generated voucher • {data.voucher_number}
    </div>
  </div>
);

export const BalanceEditDialog = ({ open, onOpenChange, student }: BalanceEditDialogProps) => {
  const { currentOrganization } = useOrganization();
  const queryClient = useQueryClient();
  const printRef = useRef<HTMLDivElement>(null);

  const [adjustmentType, setAdjustmentType] = useState<"credit" | "debit" | "set">("credit");
  const [amount, setAmount] = useState("");
  const [reasonCode, setReasonCode] = useState("");
  const [reasonDetail, setReasonDetail] = useState("");
  const [confirming, setConfirming] = useState(false);
  const [savedVoucher, setSavedVoucher] = useState<any>(null);
  const [showVoucher, setShowVoucher] = useState(false);

  // oldDue = what student currently owes (net of payments)
  const oldDue = student?.totalDue != null ? student.totalDue : (student?.closing_fees_balance || 0);
  // alreadyPaid = total collected so far (needed to reverse-calculate closing_fees_balance)
  const alreadyPaid = student?.totalPaid || 0;
  const amountNum = parseFloat(amount) || 0;
  // newDue = the new remaining balance the user intends
  const newDue =
    adjustmentType === "credit" ? oldDue + amountNum :        // add to what's owed
    adjustmentType === "debit"  ? Math.max(0, oldDue - amountNum) :  // reduce what's owed
    amountNum;                                                  // set exact remaining
  // closing_fees_balance = newDue + alreadyPaid
  // (because ledger shows: closing_fees_balance - paid = remaining)
  const newBalance = newDue + alreadyPaid;
  const changeAmount = amountNum;
  const isIncrease = newDue > oldDue;
  // For UI display — always show the DUE amounts (not the gross closing_fees_balance)
  const displayOldBalance = oldDue;
  const displayNewBalance = newDue;

  const { data: currentYear } = useQuery({
    queryKey: ["current-academic-year", currentOrganization?.id],
    queryFn: async () => {
      const { data } = await supabase.from("academic_years").select("id, year_name").eq("organization_id", currentOrganization!.id).eq("is_current", true).single();
      return data;
    },
    enabled: !!currentOrganization?.id && open,
  });

  useEffect(() => {
    if (open) {
      setAdjustmentType("credit");
      setAmount("");
      setReasonCode("");
      setReasonDetail("");
      setConfirming(false);
      setSavedVoucher(null);
      setShowVoucher(false);
    }
  }, [open, student?.id]);

  const handlePrint = useReactToPrint({ contentRef: printRef });

  const mutation = useMutation({
    mutationFn: async () => {
      if (!student || !currentOrganization?.id) throw new Error("Missing data");
      if (amountNum <= 0) throw new Error("Amount must be greater than 0");
      if (!reasonCode) throw new Error("Please select a reason");

      const { data: { user } } = await supabase.auth.getUser();
      const userId = user?.id || null;
      const userEmail = user?.email || "Unknown";
      const voucherNumber = `BAL-ADJ-${Date.now()}`;
      const reasonLabel = REASON_CODES[adjustmentType].find(r => r.value === reasonCode)?.label || reasonCode;

      // Check if student has fee structures (structure-based vs imported balance)
      let hasActiveStructures = false;
      if (student.class_id && currentYear?.id) {
        const { count } = await supabase
          .from("fee_structures")
          .select("id", { count: "exact", head: true })
          .eq("organization_id", currentOrganization.id)
          .eq("class_id", student.class_id)
          .eq("academic_year_id", currentYear.id);
        hasActiveStructures = (count || 0) > 0;
      }

      if (!hasActiveStructures) {
        // Imported balance mode: update closing_fees_balance
        const { error } = await supabase
          .from("students")
          .update({ closing_fees_balance: newBalance, fees_opening_is_net: false })
          .eq("id", student.id);
        if (error) throw error;
      }
      // For structure-based students, adjustment is tracked ONLY via student_balance_audit

      const auditRecord = {
        organization_id: currentOrganization.id,
        student_id: student.id,
        adjusted_by: userId,
        adjusted_by_name: userEmail,
        adjustment_type: adjustmentType,
        old_balance: displayOldBalance,
        new_balance: displayNewBalance,
        change_amount: changeAmount,
        reason_code: reasonCode,
        reason_code_label: reasonLabel,
        reason_detail: reasonDetail || null,
        voucher_number: voucherNumber,
        academic_year_id: currentYear?.id || null,
        created_at: new Date().toISOString(),
      };

      const { error: auditErr } = await (supabase.from("student_balance_audit" as any) as any).insert(auditRecord);
      if (auditErr) console.error("Audit log failed (non-blocking):", auditErr);

      return { ...auditRecord, reason_code_label: reasonLabel };
    },
    onSuccess: (data) => {
      queryClient.invalidateQueries({ queryKey: ["students-fee-collection"] });
      queryClient.invalidateQueries({ queryKey: ["fee-collection-summary"] });
      queryClient.invalidateQueries({ queryKey: ["student-fee-payments-history"] });
      toast.success("Balance adjusted successfully");
      setSavedVoucher(data);
      setConfirming(false);
      setShowVoucher(true);
    },
    onError: (err: any) => {
      toast.error(err.message || "Failed to update balance");
      setConfirming(false);
    },
  });

  if (!student) return null;
  const orgName = currentOrganization?.name || "School";
  const reasonOptions = REASON_CODES[adjustmentType];

  return (
    <Dialog open={open} onOpenChange={(v) => { if (!v) onOpenChange(false); }}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <AlertTriangle className="h-5 w-5 text-amber-500" />
            Balance Adjustment — {student.student_name}
            <Badge variant="outline" className="ml-auto text-xs">{student.admission_number}</Badge>
          </DialogTitle>
        </DialogHeader>

        {showVoucher && savedVoucher ? (
          <div className="space-y-3">
            <div className="flex items-center gap-2 text-green-600 text-sm font-medium">
              <CheckCircle className="h-4 w-4" /> Balance adjusted. Voucher ready to print.
            </div>
            <div className="border rounded-lg overflow-hidden bg-background" ref={printRef}>
              <AdjustmentVoucher data={savedVoucher} student={student} orgName={orgName} />
            </div>
            <DialogFooter>
              <Button variant="outline" onClick={() => onOpenChange(false)}>Close</Button>
              <Button onClick={() => handlePrint()} className="gap-1.5">
                <Printer className="h-4 w-4" /> Print Voucher
              </Button>
            </DialogFooter>
          </div>
        ) : confirming ? (
          <div className="space-y-4">
            <div className="rounded-lg border-2 border-amber-300 bg-amber-50/50 dark:bg-amber-950/20 p-4 space-y-2">
              <div className="flex items-center gap-2 font-semibold text-amber-700 dark:text-amber-400">
                <AlertTriangle className="h-4 w-4" />
                Confirm Balance Adjustment
              </div>
              <div className="space-y-1 text-sm">
                <p><span className="text-muted-foreground">Student:</span> {student.student_name} ({student.admission_number})</p>
                <p><span className="text-muted-foreground">Current Pending Due:</span> ₹{fmtINR(displayOldBalance)}</p>
                <p>
                  <span className="text-muted-foreground">Adjustment:</span>{" "}
                  <span className={isIncrease ? "text-red-600 font-semibold" : "text-green-600 font-semibold"}>
                    {adjustmentType === "credit" ? "+" : adjustmentType === "debit" ? "−" : "= "}
                    ₹{fmtINR(changeAmount)}
                    {adjustmentType === "credit" ? " (Increase)" : adjustmentType === "debit" ? " (Reduction)" : " (Set To)"}
                  </span>
                </p>
                <p>
                  <span className="text-muted-foreground">New Pending Due:</span>{" "}
                  <span className="font-bold text-base">₹{fmtINR(displayNewBalance)}</span>
                </p>
                <p className="text-xs text-muted-foreground">Already collected: ₹{fmtINR(alreadyPaid)}</p>
                <p><span className="text-muted-foreground">Reason:</span> {reasonOptions.find(r => r.value === reasonCode)?.label}{reasonDetail ? ` — ${reasonDetail}` : ""}</p>
              </div>
            </div>
            <p className="text-xs text-muted-foreground">This action will be recorded in the audit log with your name and timestamp. A printable voucher will be generated.</p>
            <DialogFooter>
              <Button variant="outline" onClick={() => setConfirming(false)}>Back</Button>
              <Button
                onClick={() => mutation.mutate()}
                disabled={mutation.isPending}
                className="bg-amber-600 hover:bg-amber-700 text-white gap-1.5"
              >
                {mutation.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />}
                Confirm & Adjust
              </Button>
            </DialogFooter>
          </div>
        ) : (
          <div className="space-y-4">
            <div className="rounded-lg border bg-muted/30 p-3 text-center">
              <span className="text-xs text-muted-foreground">Current Balance</span>
              <div className="text-2xl font-bold text-foreground">₹{fmtINR(displayOldBalance)}</div>
              <div className="text-xs text-muted-foreground mt-1">
                Already paid: ₹{fmtINR(alreadyPaid)} • Opening balance: ₹{fmtINR(student?.closing_fees_balance || 0)}
              </div>
            </div>

            <div className="space-y-2">
              <Label>Adjustment Type *</Label>
              <div className="grid grid-cols-3 gap-2">
                {([
                  { value: "credit" as const, label: "Add Amount", Icon: TrendingUp, activeClass: "border-red-400 bg-red-50 text-red-700 dark:bg-red-950/30 dark:text-red-400", desc: "Increase due" },
                  { value: "debit" as const, label: "Reduce Amount", Icon: TrendingDown, activeClass: "border-green-400 bg-green-50 text-green-700 dark:bg-green-950/30 dark:text-green-400", desc: "Decrease due" },
                  { value: "set" as const, label: "Set Balance", Icon: Edit3, activeClass: "border-blue-400 bg-blue-50 text-blue-700 dark:bg-blue-950/30 dark:text-blue-400", desc: "Set exact" },
                ]).map(opt => (
                  <button
                    key={opt.value}
                    type="button"
                    onClick={() => { setAdjustmentType(opt.value); setReasonCode(""); }}
                    className={`p-2.5 rounded-lg border-2 text-left transition-all ${adjustmentType === opt.value ? opt.activeClass : "border-border bg-background text-muted-foreground hover:bg-muted/40"}`}
                  >
                    <div className="flex items-center gap-1.5 text-sm font-medium">
                      <opt.Icon className="h-3.5 w-3.5" />
                      {opt.label}
                    </div>
                    <div className="text-[10px] mt-0.5 opacity-70">{opt.desc}</div>
                  </button>
                ))}
              </div>
            </div>

            <div className="space-y-1">
              <Label>{adjustmentType === "set" ? "New Balance Amount (₹) *" : "Amount (₹) *"}</Label>
              <Input
                type="number" min="0" step="0.01"
                value={amount} onChange={(e) => setAmount(e.target.value)}
                placeholder="0.00" className="text-lg font-semibold" autoFocus
              />
              {amountNum > 0 && (
                <p className={`text-xs font-medium ${isIncrease ? "text-red-600" : "text-green-600"}`}>
                  Pending due will become: ₹{fmtINR(displayNewBalance)}
                  {adjustmentType !== "set" && ` (${isIncrease ? "+" : "−"}₹${fmtINR(changeAmount)})`}
                </p>
              )}
            </div>

            <div className="space-y-1">
              <Label>Reason *</Label>
              <Select value={reasonCode} onValueChange={setReasonCode}>
                <SelectTrigger><SelectValue placeholder="Select reason..." /></SelectTrigger>
                <SelectContent>
                  {reasonOptions.map(r => (
                    <SelectItem key={r.value} value={r.value}>{r.label}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-1">
              <Label>
                Additional Notes
                {reasonCode?.includes("other") && <span className="text-red-500 ml-1">*</span>}
              </Label>
              <Textarea
                value={reasonDetail} onChange={(e) => setReasonDetail(e.target.value)}
                placeholder="e.g. Approved by Principal, Ref: Letter No. 123..."
                rows={2} className="text-sm resize-none"
              />
            </div>

            <DialogFooter>
              <Button variant="outline" onClick={() => onOpenChange(false)}>Cancel</Button>
              <Button
                onClick={() => setConfirming(true)}
                disabled={amountNum <= 0 || !reasonCode || (reasonCode?.includes("other") && !reasonDetail.trim())}
                className="bg-amber-600 hover:bg-amber-700 text-white gap-1.5"
              >
                <Save className="h-4 w-4" />
                Review & Confirm
              </Button>
            </DialogFooter>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
};
