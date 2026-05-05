import { useState, useRef, useEffect } from "react";
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
import {
  buildFeeReceiptWhatsAppMessage,
  computeYearWiseFeeBalances,
  formatWhatsAppPendingSummary,
  type YearFeeBalanceRow,
} from "@/lib/schoolFeeYearBalances";
import { resolveImportedOpeningBalance } from "@/lib/schoolFeeOpening";
import { isAccountingEngineEnabled } from "@/utils/accounting/isAccountingEngineEnabled";
import { computeEffectivePendingDue, resolveLiability } from "@/lib/schoolFeeLiability";
import { postSchoolFeeReceiptAccounting } from "@/lib/schoolFeeAccounting";

const OPENING_CARRY_HEAD_ID = "__opening_carry__";

interface Student {
  id: string;
  student_name: string;
  admission_number: string;
  class_id: string | null;
  academic_year_id?: string | null;
  parent_phone: string | null;
  parent_name: string | null;
  closing_fees_balance?: number | null;
  is_new_admission?: boolean | null;
  fees_opening_is_net?: boolean | null;
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

/** April–March FY in Asia/Kolkata (matches receipt RPC fallback). */
function getIndianCalendarFYYears(date = new Date()): { start: number; end: number } {
  const parts = new Intl.DateTimeFormat("en-IN", {
    timeZone: "Asia/Kolkata",
    month: "numeric",
    year: "numeric",
  }).formatToParts(date);
  const month = Number(parts.find((p) => p.type === "month")?.value ?? 1);
  const year = Number(parts.find((p) => p.type === "year")?.value ?? date.getFullYear());
  if (month >= 4) return { start: year, end: year + 1 };
  return { start: year - 1, end: year };
}

/** Parse academic year label to FY bounds for receipt numbering (RPC params). */
function parseAcademicYearNameToFYYears(yearName?: string | null): { start: number | null; end: number | null } {
  if (!yearName?.trim()) return { start: null, end: null };
  const s = yearName.trim();
  const m4 = s.match(/(\d{4})\s*[-–]\s*(\d{2,4})/);
  if (m4) {
    const startYear = parseInt(m4[1], 10);
    const endPart = m4[2];
    const endYear =
      endPart.length === 2 ? parseInt(String(startYear).slice(0, 2) + endPart, 10) : parseInt(endPart, 10);
    return { start: startYear, end: endYear };
  }
  const m2 = s.match(/\b(\d{2})\s*[-–]\s*(\d{2})\b/);
  if (m2) {
    return {
      start: 2000 + parseInt(m2[1], 10),
      end: 2000 + parseInt(m2[2], 10),
    };
  }
  return { start: null, end: null };
}

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
  const [manualFeeEnabled, setManualFeeEnabled] = useState(false);
  const [manualFeeName, setManualFeeName] = useState("Other Fees");
  const [manualFeeAmount, setManualFeeAmount] = useState<number>(0);

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

  const { data: orgAccountingSettings } = useQuery({
    queryKey: ["settings-accounting-engine", currentOrganization?.id],
    queryFn: async () => {
      const { data } = await supabase
        .from("settings")
        .select("accounting_engine_enabled")
        .eq("organization_id", currentOrganization!.id)
        .maybeSingle();
      return data;
    },
    enabled: !!currentOrganization?.id && open,
    staleTime: 60_000,
  });
  const postChartJournal = isAccountingEngineEnabled(
    orgAccountingSettings as { accounting_engine_enabled?: boolean } | null
  );

  const student = initialStudent || selectedStudent;

  useEffect(() => {
    if (!open) return;
    setSelectedStudent(initialStudent || null);
  }, [open, initialStudent]);

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

  // Current session only — receipts and student_fees post here (prior-year dues via carry-forward opening).
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

  // Reset manual fee toggle when student or session changes
  useEffect(() => {
    setManualFeeEnabled(false);
    setManualFeeAmount(0);
    setManualFeeName("Other Fees");
  }, [student?.id, currentYear?.id]);

  const usedYearForReceipt = currentYear;
  const fyYears = parseAcademicYearNameToFYYears(usedYearForReceipt?.year_name);
  const calendarFY = getIndianCalendarFYYears();
  const receiptFyLooksStale =
    fyYears.start != null &&
    fyYears.end != null &&
    fyYears.start < calendarFY.start;

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

  const usedYear = currentYear;

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
        .in("status", ["paid", "partial"])
        .gt("paid_amount", 0);

      const paidTotalYear = (payments || []).reduce((sum: number, p: any) => sum + Number(p.paid_amount || 0), 0);

      // New admissions: liability is opening balance only (same as Fee Collection grid), not class fee structure.
      if (student.is_new_admission === true) {
        const structureRows = structures || [];
        const totalStructureAmount = structureRows.reduce((sum: number, s: any) => {
          const mult = s.frequency === "monthly" ? 12 : s.frequency === "quarterly" ? 4 : 1;
          return sum + (s.amount || 0) * mult;
        }, 0);

        const { data: allYears } = await supabase
          .from("academic_years")
          .select("id, start_date, end_date")
          .eq("organization_id", currentOrganization!.id)
          .order("start_date", { ascending: true });

        const prevYear =
          usedYear.start_date && allYears?.length
            ? [...allYears]
                .filter((y: any) => y.end_date && new Date(y.end_date) < new Date(usedYear.start_date as string))
                .sort(
                  (a: any, b: any) =>
                    new Date(b.end_date).getTime() - new Date(a.end_date).getTime()
                )[0]
            : null;

        let latePrevPaid = 0;
        if (prevYear?.id) {
          const { data: lateFees } = await supabase
            .from("student_fees")
            .select("paid_amount")
            .eq("organization_id", currentOrganization!.id)
            .eq("student_id", student.id)
            .eq("academic_year_id", prevYear.id)
            .in("status", ["paid", "partial"])
            .gt("paid_amount", 0);
          latePrevPaid = (lateFees || []).reduce((s: number, f: any) => s + Number(f.paid_amount || 0), 0);
        }

        const importedEff = resolveImportedOpeningBalance(
          Number(student.closing_fees_balance || 0),
          latePrevPaid,
          student.fees_opening_is_net === true
        );

        const { data: adjRowsNew } = await (supabase.from("student_balance_audit" as any) as any)
          .select("adjustment_type, change_amount, old_balance, new_balance")
          .eq("organization_id", currentOrganization!.id)
          .eq("student_id", student.id)
          .eq("academic_year_id", usedYear.id)
          .not("reason_code", "in", "(receipt_deleted,receipt_modified)");

        // No active structures: BalanceEditDialog mutated closing_fees_balance directly,
        // so the audit row's delta is already baked into importedEff. Re-applying it
        // would double-count (e.g. set 34716→6720 would push due to 0).
        const adjustmentNet = 0;
        void adjRowsNew;

        const liability = resolveLiability(
          { ...student, closing_fees_balance: importedEff },
          totalStructureAmount,
          usedYear.year_name
        );
        const totalDueGross = Math.round((Number(liability) + adjustmentNet) * 100) / 100;
        const totalDue = Math.max(0, Math.round((totalDueGross - paidTotalYear) * 100) / 100);

        const itemsNew: FeeItem[] = [];
        if (totalDueGross > 0.005 || paidTotalYear > 0.005) {
          itemsNew.push({
            fee_head_id: "__imported_balance__",
            head_name: "Opening Fees Balance",
            structure_amount: totalDueGross,
            already_paid: paidTotalYear,
            balance: totalDue,
            selected: totalDue > 0.005,
            paying: 0,
            fee_structure_id: "__imported__",
          });
        }
        setFeeItems(itemsNew);
        return itemsNew;
      }

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
          // Default to 0 — user MUST type the amount they're collecting.
          // Prevents accidental full-amount collection when typing into wrong field.
          paying: 0,
          fee_structure_id: s.id,
        };
      });

      // If no fee structures found OR all structure amounts are 0, use imported opening
      // (same resolveImportedOpeningBalance + adjustments as Fee Collection grid).
      const totalStructureAmount = items.reduce((sum, i) => sum + i.structure_amount, 0);
      if ((items.length === 0 || totalStructureAmount === 0) && student.closing_fees_balance && student.closing_fees_balance > 0) {
        if (totalStructureAmount === 0) items.length = 0;
        const { data: allYearsImp } = await supabase
          .from("academic_years")
          .select("id, start_date, end_date")
          .eq("organization_id", currentOrganization!.id)
          .order("start_date", { ascending: true });

        const prevYearImp =
          usedYear.start_date && allYearsImp?.length
            ? [...allYearsImp]
                .filter((y: any) => y.end_date && new Date(y.end_date) < new Date(usedYear.start_date as string))
                .sort(
                  (a: any, b: any) =>
                    new Date(b.end_date).getTime() - new Date(a.end_date).getTime()
                )[0]
            : null;

        let latePrevPaidImp = 0;
        if (prevYearImp?.id) {
          const { data: lateFeesImp } = await supabase
            .from("student_fees")
            .select("paid_amount")
            .eq("organization_id", currentOrganization!.id)
            .eq("student_id", student.id)
            .eq("academic_year_id", prevYearImp.id)
            .in("status", ["paid", "partial"])
            .gt("paid_amount", 0);
          latePrevPaidImp = (lateFeesImp || []).reduce((s: number, f: any) => s + Number(f.paid_amount || 0), 0);
        }

        const importedEff = resolveImportedOpeningBalance(
          Number(student.closing_fees_balance || 0),
          latePrevPaidImp,
          student.fees_opening_is_net === true
        );

        const { data: adjRowsImp } = await (supabase.from("student_balance_audit" as any) as any)
          .select("adjustment_type, change_amount, old_balance, new_balance")
          .eq("organization_id", currentOrganization!.id)
          .eq("student_id", student.id)
          .eq("academic_year_id", usedYear.id)
          .not("reason_code", "in", "(receipt_deleted,receipt_modified)");

        // Same reason as above — no-structure path: skip audit deltas to avoid double-count.
        const adjustmentNetImp = 0;
        void adjRowsImp;

        const totalPaidInYear = (payments || []).reduce((sum: number, p: any) => sum + (p.paid_amount || 0), 0);
        const liabilityImp = resolveLiability(
          { ...student, closing_fees_balance: importedEff },
          0,
          usedYear.year_name
        );
        const totalDueGrossImp =
          Math.round((Number(liabilityImp) + adjustmentNetImp) * 100) / 100;
        const importedBalance = Math.max(
          0,
          Math.round((totalDueGrossImp - totalPaidInYear) * 100) / 100
        );
        if (importedBalance > 0) {
          items.push({
            fee_head_id: "__imported_balance__",
            head_name: "Fees Balance (Imported)",
            structure_amount: totalDueGrossImp,
            already_paid: totalPaidInYear,
            balance: importedBalance,
            selected: true,
            paying: 0,
            fee_structure_id: "__imported__",
          });
        }
      }

      // When fee structures exist, carried opening is still part of liability (Fee Collection grid).
      // Add one row so the modal total matches Total Due (structure balances + opening remainder).
      if (totalStructureAmount > 0 && (student as { is_new_admission?: boolean }).is_new_admission !== true) {
        const { data: allYears } = await supabase
          .from("academic_years")
          .select("id, start_date, end_date")
          .eq("organization_id", currentOrganization!.id)
          .order("start_date", { ascending: true });

        const prevYear =
          usedYear.start_date && allYears?.length
            ? [...allYears]
                .filter((y: any) => y.end_date && new Date(y.end_date) < new Date(usedYear.start_date as string))
                .sort(
                  (a: any, b: any) =>
                    new Date(b.end_date).getTime() - new Date(a.end_date).getTime()
                )[0]
            : null;

        let latePrevPaid = 0;
        if (prevYear?.id) {
          const { data: lateFees } = await supabase
            .from("student_fees")
            .select("paid_amount")
            .eq("organization_id", currentOrganization!.id)
            .eq("student_id", student.id)
            .eq("academic_year_id", prevYear.id)
            .in("status", ["paid", "partial"])
            .gt("paid_amount", 0);
          latePrevPaid = (lateFees || []).reduce((s: number, f: any) => s + Number(f.paid_amount || 0), 0);
        }

        const importedEff = resolveImportedOpeningBalance(
          Number(student.closing_fees_balance || 0),
          latePrevPaid,
          student.fees_opening_is_net === true
        );

        const { data: adjRows } = await (supabase.from("student_balance_audit" as any) as any)
          .select("adjustment_type, change_amount, old_balance, new_balance, created_at, reason_code")
          .eq("organization_id", currentOrganization!.id)
          .eq("student_id", student.id)
          .eq("academic_year_id", usedYear.id)
          .not("reason_code", "in", "(receipt_deleted,receipt_modified)");

        const liability = resolveLiability(
          { ...student, closing_fees_balance: importedEff },
          totalStructureAmount,
          usedYear.year_name
        );
        const dueGross = (adjRows || []).length > 0
          ? computeEffectivePendingDue(Number(liability), adjRows as any[])
          : Number(liability);
        const totalDue = Math.max(
          0,
          Math.round((dueGross - paidTotalYear) * 100) / 100
        );
        const sumStructureBalances = items.reduce((sum, i) => sum + i.balance, 0);
        // If "set balance" lowered due below structure balances, cap modal rows
        // so the collect dialog matches Fee Collection grid pending due.
        if (totalDue + 0.005 < sumStructureBalances) {
          let remaining = totalDue;
          for (const item of items) {
            const effective = Math.max(0, Math.min(item.balance, remaining));
            const rounded = Math.round(effective * 100) / 100;
            item.balance = rounded;
            item.selected = rounded > 0.005;
            item.paying = 0;
            remaining = Math.max(0, Math.round((remaining - rounded) * 100) / 100);
          }
        }
        const effectiveStructureBalances = items.reduce((sum, i) => sum + i.balance, 0);
        const openingDue = Math.max(
          0,
          Math.round((totalDue - effectiveStructureBalances) * 100) / 100
        );

        if (openingDue > 0.005) {
          const openingBasis = importedEff > 0 ? importedEff : openingDue;
          const alreadyOpening = Math.max(0, Math.round((openingBasis - openingDue) * 100) / 100);
          items.push({
            fee_head_id: OPENING_CARRY_HEAD_ID,
            head_name: "Opening balance (carried forward)",
            structure_amount: openingBasis,
            already_paid: alreadyOpening,
            balance: openingDue,
            selected: true,
            paying: 0,
            fee_structure_id: OPENING_CARRY_HEAD_ID,
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

  const grandTotalPaying = totalPaying + (manualFeeEnabled ? Number(manualFeeAmount) || 0 : 0);

  /**
   * Total balance across all selected fee heads (what "Pay full" everywhere would charge).
   * Used to detect when user is collecting the entire outstanding amount.
   */
  const grandTotalBalance = feeItems
    .filter(i => i.selected && i.balance > 0)
    .reduce((sum, i) => sum + i.balance, 0);

  /**
   * Confirmation guard: if user is collecting the FULL outstanding balance,
   * show a confirm() prompt before submitting. Prevents accidental full-amount
   * collection (e.g. when user typed amount into Transaction ID by mistake).
   */
  const handleCollectClick = () => {
    const isFullCollection =
      grandTotalBalance > 0 &&
      Math.abs(grandTotalPaying - grandTotalBalance) < 0.01 &&
      !manualFeeEnabled;
    if (isFullCollection) {
      const ok = window.confirm(
        `You are about to collect the FULL outstanding balance of ₹${grandTotalBalance.toLocaleString("en-IN", { minimumFractionDigits: 2 })} for ${student?.student_name || "this student"}.\n\nIs this correct?\n\nPress OK to collect the full amount, or Cancel to enter a partial amount.`
      );
      if (!ok) return;
    }
    collectMutation.mutate();
  };

  const collectMutation = useMutation({
    mutationFn: async () => {
      if (!student || !currentOrganization) throw new Error("Student data missing");
      if (!usedYear) throw new Error(
        "No active academic year found. Please go to School Settings → Academic Year Setup and mark the current year as active."
      );

      const selectedItems = feeItems.filter(i => i.selected && i.paying > 0);
      const manualAmt = manualFeeEnabled ? Number(manualFeeAmount) || 0 : 0;
      if (selectedItems.length === 0 && manualAmt <= 0) {
        throw new Error("No fees selected");
      }

      // Generate financial year based receipt number via DB function (with fallback)
      let receiptNumber: string;
      const saveFY = parseAcademicYearNameToFYYears(usedYear?.year_name);
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
        const isImported =
          item.fee_head_id === "__imported_balance__" || item.fee_head_id === OPENING_CARRY_HEAD_ID;
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

      // Insert manual / ad-hoc fee row if enabled
      const manualRowItems: { head_name: string; paying: number }[] = [];
      if (manualAmt > 0) {
        const { error: manualErr } = await supabase.from("student_fees").insert({
          organization_id: currentOrganization.id,
          student_id: student.id,
          fee_head_id: null,
          fee_structure_id: null,
          academic_year_id: usedYear!.id,
          amount: manualAmt,
          paid_amount: manualAmt,
          paid_date: paidDate,
          payment_method: paymentMethod,
          transaction_id: transactionId || null,
          payment_receipt_id: receiptNumber,
          status: "paid",
          notes: manualFeeName || "Other Fees",
        } as any);
        if (manualErr) throw manualErr;
        manualRowItems.push({ head_name: manualFeeName || "Other Fees", paying: manualAmt });
      }

      // Voucher header + double-entry lines (account_ledgers) + student sub-ledger credits
      try {
        const allItemsForVoucher = [...selectedItems, ...manualRowItems];
        await postSchoolFeeReceiptAccounting(supabase, {
          organizationId: currentOrganization.id,
          studentId: student.id,
          studentName: student.student_name,
          admissionNumber: student.admission_number,
          receiptNumber,
          voucherDate: format(new Date(), "yyyy-MM-dd"),
          paymentMethodRaw: paymentMethod,
          grandTotal: grandTotalPaying,
          transactionId: transactionId || null,
          postChartJournal,
          lines: allItemsForVoucher.map((i: any) => ({
            head_name: i.head_name,
            paying: i.paying,
            fee_head_id: typeof i.fee_head_id === "string" ? i.fee_head_id : null,
          })),
        });
      } catch (voucherErr: any) {
        console.error("Fee accounting (voucher / ledger) failed:", voucherErr);
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

      let yearWiseBalances: YearFeeBalanceRow[] = [];
      try {
        const { data: freshSt } = await supabase
          .from("students")
          .select("id, class_id, academic_year_id, closing_fees_balance, is_new_admission, fees_opening_is_net")
          .eq("id", student.id)
          .single();
        if (freshSt) {
          yearWiseBalances = await computeYearWiseFeeBalances(supabase, currentOrganization.id, {
            id: freshSt.id,
            class_id: freshSt.class_id,
            academic_year_id: freshSt.academic_year_id,
            closing_fees_balance: freshSt.closing_fees_balance,
            is_new_admission: freshSt.is_new_admission,
            fees_opening_is_net: freshSt.fees_opening_is_net,
          });
        }
      } catch (e) {
        console.warn("Year-wise fee balances for receipt:", e);
      }

      return {
        receiptNumber,
        paidDate,
        selectedItems: [...selectedItems, ...manualRowItems],
        paymentMethod,
        transactionId,
        totalPaying: grandTotalPaying,
        remainingBalance,
        academicYear: usedYear?.year_name || "",
        yearWiseBalances,
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
          const waMessage = buildFeeReceiptWhatsAppMessage({
            orgName: currentOrganization?.name || "School",
            receiptNumber: data.receiptNumber,
            paidDateLabel: format(new Date(data.paidDate), "dd/MM/yyyy"),
            studentName: student?.student_name || "-",
            admissionNo: student?.admission_number || "",
            className: student?.school_classes?.class_name || "-",
            totalPaying: data.totalPaying,
            paymentMethod: data.paymentMethod,
            feeLines,
            remainingBalance: data.remainingBalance ?? 0,
            yearWiseBalances: data.yearWiseBalances,
          });
          await sendMessageAsync({
            phone,
            message: waMessage,
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
              year_wise_balances: formatWhatsAppPendingSummary(data.yearWiseBalances ?? []),
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
            yearWiseBalances={receiptData.yearWiseBalances}
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
                const msg = buildFeeReceiptWhatsAppMessage({
                  orgName: currentOrganization?.name || "School",
                  receiptNumber: receiptData.receiptNumber,
                  paidDateLabel: format(new Date(receiptData.paidDate), "dd/MM/yyyy"),
                  studentName: student.student_name || "-",
                  admissionNo: student.admission_number || "",
                  className: student.school_classes?.class_name || "-",
                  totalPaying: receiptData.totalPaying,
                  paymentMethod: receiptData.paymentMethod,
                  feeLines,
                  remainingBalance: receiptData.remainingBalance ?? 0,
                  yearWiseBalances: receiptData.yearWiseBalances,
                });
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
            <div className="flex items-center gap-2 ml-auto flex-wrap justify-end">
              <span className="text-sm font-medium text-muted-foreground">Session:</span>
              <Badge variant="secondary" className="font-normal text-sm">
                {currentYear?.year_name ? `${currentYear.year_name} (Current)` : "—"}
              </Badge>
            </div>
          </div>
        )}

        {student && receiptFyLooksStale && usedYearForReceipt?.year_name && (
          <div className="flex items-start gap-3 p-3 bg-amber-50 dark:bg-amber-950/30 border border-amber-200 dark:border-amber-800 rounded-lg text-sm text-amber-900 dark:text-amber-200">
            <AlertTriangle className="h-4 w-4 mt-0.5 shrink-0" />
            <div>
              <p className="font-semibold">Receipt numbering is for an older financial year</p>
              <p className="text-xs mt-1">
                The year marked <strong>current</strong> in School Settings is <strong>{usedYearForReceipt.year_name}</strong>, so receipt numbers use FY{" "}
                <strong className="font-mono">
                  {fyYears.start}-{String(fyYears.end).slice(-2)}
                </strong>
                . Today&apos;s calendar FY is{" "}
                <strong className="font-mono">
                  {calendarFY.start}-{String(calendarFY.end).slice(-2)}
                </strong>
                . Update <strong>Academic Year Setup</strong> so the active session matches the FY you want on receipts (e.g.{" "}
                <strong className="font-mono">RCT/{calendarFY.start}-{String(calendarFY.end).slice(-2)}/…</strong>
                ).
              </p>
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
              <div className="space-y-4 py-4">
                <div className="text-center text-sm text-muted-foreground">
                  No fee structure defined for this student's class in <span className="font-semibold">{usedYear?.year_name || "selected year"}</span>.
                  <br />You can still collect an ad-hoc fee below, or set up a fee structure first.
                </div>
                <div className="border rounded-md p-3 bg-muted/30 space-y-3">
                  <div className="flex items-center gap-2">
                    <Checkbox
                      checked={manualFeeEnabled}
                      onCheckedChange={(v) => setManualFeeEnabled(!!v)}
                      id="manual-fee-toggle-empty"
                    />
                    <label htmlFor="manual-fee-toggle-empty" className="text-sm font-medium cursor-pointer">
                      Collect ad-hoc / manual fee
                    </label>
                  </div>
                  {manualFeeEnabled && (
                    <div className="grid grid-cols-2 gap-3">
                      <div>
                        <label className="text-xs font-semibold mb-1 block">Fee Description</label>
                        <Input
                          value={manualFeeName}
                          onChange={(e) => setManualFeeName(e.target.value)}
                          placeholder="e.g. Tuition Fee"
                        />
                      </div>
                      <div>
                        <label className="text-xs font-semibold mb-1 block">Amount</label>
                        <Input
                          type="number"
                          min="0"
                          value={manualFeeAmount || ""}
                          onChange={(e) => setManualFeeAmount(parseFloat(e.target.value) || 0)}
                          placeholder="0.00"
                        />
                      </div>
                    </div>
                  )}
                </div>

                {manualFeeEnabled && manualFeeAmount > 0 && (
                  <>
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
                        Total: ₹{grandTotalPaying.toLocaleString("en-IN", { minimumFractionDigits: 2 })}
                      </div>
                      <Button
                        onClick={() => collectMutation.mutate()}
                        disabled={collectMutation.isPending || grandTotalPaying <= 0 || !usedYear}
                      >
                        {collectMutation.isPending ? <Loader2 className="h-4 w-4 mr-2 animate-spin" /> : <Receipt className="h-4 w-4 mr-2" />}
                        Collect ₹{grandTotalPaying.toLocaleString("en-IN")}
                      </Button>
                    </div>
                  </>
                )}
              </div>
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
                      <TableHead className="text-right w-56">Paying ⚠ Type amount</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {feeItems.map((item, idx) => (
                      <TableRow key={`${item.fee_head_id}-${item.fee_structure_id}-${idx}`} className={item.balance === 0 ? "opacity-50" : ""}>
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
                            <div className="flex items-center justify-end gap-1">
                              <Input
                                type="number"
                                min="0"
                                max={item.balance}
                                value={item.paying || ""}
                                onChange={e => updatePaying(idx, parseFloat(e.target.value) || 0)}
                                className="w-32 text-right h-10 text-base font-semibold tabular-nums font-mono border-2 border-primary/40 focus-visible:border-primary"
                                disabled={!item.selected}
                                placeholder="0"
                                autoFocus={idx === feeItems.findIndex(i => i.selected && i.balance > 0)}
                              />
                              <Button
                                type="button"
                                size="sm"
                                variant="outline"
                                className="h-10 px-2 text-xs whitespace-nowrap"
                                disabled={!item.selected}
                                onClick={() => updatePaying(idx, item.balance)}
                                title="Pay full balance for this fee head"
                              >
                                Full
                              </Button>
                            </div>
                          )}
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>

                {/* Ad-hoc / manual fee toggle (always available) */}
                <div className="border rounded-md p-3 bg-muted/30 space-y-3">
                  <div className="flex items-center gap-2">
                    <Checkbox
                      checked={manualFeeEnabled}
                      onCheckedChange={(v) => setManualFeeEnabled(!!v)}
                      id="manual-fee-toggle"
                    />
                    <label htmlFor="manual-fee-toggle" className="text-sm font-medium cursor-pointer">
                      Add ad-hoc / extra fee
                    </label>
                  </div>
                  {manualFeeEnabled && (
                    <div className="grid grid-cols-2 gap-3">
                      <div>
                        <label className="text-xs font-semibold mb-1 block">Fee Description</label>
                        <Input
                          value={manualFeeName}
                          onChange={(e) => setManualFeeName(e.target.value)}
                          placeholder="e.g. Late Fee, Books"
                        />
                      </div>
                      <div>
                        <label className="text-xs font-semibold mb-1 block">Amount</label>
                        <Input
                          type="number"
                          min="0"
                          value={manualFeeAmount || ""}
                          onChange={(e) => setManualFeeAmount(parseFloat(e.target.value) || 0)}
                          placeholder="0.00"
                        />
                      </div>
                    </div>
                  )}
                </div>

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

                <div className="flex items-center justify-between pt-4 border-t">
                  <div className="text-lg font-bold">
                    Total: ₹{grandTotalPaying.toLocaleString("en-IN", { minimumFractionDigits: 2 })}
                  </div>
                  <Button
                    onClick={() => handleCollectClick()}
                    disabled={collectMutation.isPending || grandTotalPaying <= 0 || !usedYear}
                  >
                    {collectMutation.isPending ? <Loader2 className="h-4 w-4 mr-2 animate-spin" /> : <Receipt className="h-4 w-4 mr-2" />}
                    Collect ₹{grandTotalPaying.toLocaleString("en-IN")}
                  </Button>
                </div>

                {/* Transaction ID moved BELOW Collect button to avoid accidental focus
                    confusion with the per-row "Paying" amount fields. */}
                <div className="pt-2">
                  <label className="text-xs font-semibold mb-1 block text-muted-foreground">Transaction ID (optional — UPI / cheque ref)</label>
                  <Input
                    value={transactionId}
                    onChange={e => setTransactionId(e.target.value)}
                    placeholder="e.g. UPI ref number"
                    className="text-sm"
                  />
                </div>
              </div>
            )}
          </>
        )}
      </DialogContent>
    </Dialog>
  );
}
