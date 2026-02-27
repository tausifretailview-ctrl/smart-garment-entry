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
import { Loader2, MessageCircle, Printer, Receipt, Search } from "lucide-react";
import { format } from "date-fns";
import { useWhatsAppSend } from "@/hooks/useWhatsAppSend";
import { useWhatsAppAPI } from "@/hooks/useWhatsAppAPI";
import { useReactToPrint } from "react-to-print";

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

  // Fetch fee structures for this student's class + existing payments
  const { isLoading } = useQuery({
    queryKey: ["student-fee-details", student?.id, student?.class_id, currentYear?.id],
    queryFn: async () => {
      if (!currentYear?.id) return [];

      // Get fee structures for this class (if class assigned)
      let structures: any[] = [];
      if (student?.class_id) {
        const { data } = await supabase
          .from("fee_structures")
          .select("*, fee_heads!inner(head_name)")
          .eq("organization_id", currentOrganization!.id)
          .eq("academic_year_id", currentYear.id)
          .eq("class_id", student.class_id);
        structures = data || [];
      }

      // Get existing payments for this student
      const { data: payments } = await supabase
        .from("student_fees")
        .select("*")
        .eq("student_id", student.id)
        .eq("academic_year_id", currentYear.id)
        .eq("organization_id", currentOrganization!.id)
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

      // If no fee structures found, use closing_fees_balance as a single "Imported Balance" item
      if (items.length === 0 && student.closing_fees_balance && student.closing_fees_balance > 0) {
        const totalPaidAll = (payments || []).reduce((sum: number, p: any) => sum + (p.paid_amount || 0), 0);
        const importedBalance = student.closing_fees_balance - totalPaidAll;
        if (importedBalance > 0) {
          items.push({
            fee_head_id: "__imported_balance__",
            head_name: "Fees Balance (Imported)",
            structure_amount: student.closing_fees_balance,
            already_paid: totalPaidAll,
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
    enabled: !!student?.id && !!currentYear?.id && open,
  });

  const totalPaying = feeItems
    .filter(i => i.selected && i.balance > 0)
    .reduce((sum, i) => sum + i.paying, 0);

  const collectMutation = useMutation({
    mutationFn: async () => {
      if (!student || !currentYear || !currentOrganization) throw new Error("Missing data");

      const selectedItems = feeItems.filter(i => i.selected && i.paying > 0);
      if (selectedItems.length === 0) throw new Error("No fees selected");

      // Generate financial year based receipt number via DB function
      const { data: receiptResult, error: receiptError } = await supabase
        .rpc("generate_fee_receipt_number", { p_organization_id: currentOrganization.id });
      if (receiptError) throw receiptError;
      const receiptNumber = receiptResult as string;
      const paidDate = new Date().toISOString();

      for (const item of selectedItems) {
        const newStatus = item.paying >= item.balance ? "paid" : "partial";
        const isImported = item.fee_head_id === "__imported_balance__";
        const { error } = await supabase.from("student_fees").insert({
          organization_id: currentOrganization.id,
          student_id: student.id,
          fee_head_id: isImported ? null : item.fee_head_id,
          fee_structure_id: isImported ? null : item.fee_structure_id,
          academic_year_id: currentYear.id,
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
      } catch (voucherErr) {
        console.error("Voucher entry creation failed (non-blocking):", voucherErr);
      }

      // Calculate remaining balance after this payment
      const totalStructureBalance = feeItems
        .filter(i => i.balance > 0)
        .reduce((sum, i) => sum + i.balance, 0);
      const remainingBalance = Math.max(0, totalStructureBalance - totalPaying);

      return {
        receiptNumber,
        paidDate,
        selectedItems,
        paymentMethod,
        transactionId,
        totalPaying,
        remainingBalance,
        academicYear: currentYear.year_name,
      };
    },
    onSuccess: async (data) => {
      toast.success("Fee collected successfully!");
      setReceiptData(data);
      setShowReceipt(true);
      queryClient.invalidateQueries({ queryKey: ["students-fee-collection"] });
      queryClient.invalidateQueries({ queryKey: ["student-fee-details"] });
      queryClient.invalidateQueries({ queryKey: ["fee-collection-summary"] });

      // Auto-send WhatsApp receipt via API if configured
      const autoSend = (whatsAppSettings as any)?.auto_send_fee_receipt;
      const templateName = (whatsAppSettings as any)?.fee_receipt_template_name;
      const phone = student?.parent_phone;
      if (autoSend && templateName && phone && whatsAppSettings?.is_active) {
        try {
          const feeLines = data.selectedItems.map((item: any) => `${item.head_name}: Rs.${item.paying.toLocaleString("en-IN")}`).join(", ");
          await sendMessageAsync({
            phone,
            message: `Fee Receipt - ${currentOrganization?.name || "School"}\nReceipt: ${data.receiptNumber}\nStudent: ${student?.student_name}\nAmount: Rs.${data.totalPaying.toLocaleString("en-IN")}\nPayment: ${data.paymentMethod}`,
            templateType: "fee_receipt",
            templateName,
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
      toast.error("Collection failed: " + err.message);
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
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Receipt className="h-5 w-5" /> Fee Receipt
            </DialogTitle>
          </DialogHeader>
          <div ref={receiptRef} className="p-5 border rounded-md bg-white text-black" style={{ fontFamily: "Arial, sans-serif" }}>
            {/* Header */}
            <div className="text-center mb-3 border-b-2 border-gray-800 pb-2">
              <h2 className="text-lg font-bold">{currentOrganization?.name}</h2>
              <p className="text-xs text-gray-600">Fee Receipt</p>
            </div>

            {/* Student & Receipt Info */}
            <div className="grid grid-cols-2 gap-x-4 gap-y-1 text-xs mb-3">
              <div><strong>Receipt #:</strong> {receiptData.receiptNumber}</div>
              <div><strong>Date:</strong> {format(new Date(receiptData.paidDate), "dd/MM/yyyy")}</div>
              <div><strong>Student Name:</strong> {student.student_name}</div>
              <div><strong>Adm. No:</strong> {student.admission_number}</div>
              {student.parent_name && <div><strong>Parent Name:</strong> {student.parent_name}</div>}
              <div><strong>Class:</strong> {student.school_classes?.class_name || "-"}</div>
              {receiptData.academicYear && <div><strong>Academic Year:</strong> {receiptData.academicYear}</div>}
              <div><strong>Payment:</strong> {receiptData.paymentMethod}</div>
              {receiptData.transactionId && <div className="col-span-2"><strong>Txn ID:</strong> {receiptData.transactionId}</div>}
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
                {receiptData.selectedItems.map((item: any, idx: number) => (
                  <tr key={idx}>
                    <td className="py-1.5 px-2 border border-gray-300">{item.head_name}</td>
                    <td className="text-right py-1.5 px-2 border border-gray-300">₹{item.paying.toLocaleString("en-IN", { minimumFractionDigits: 2 })}</td>
                  </tr>
                ))}
              </tbody>
              <tfoot>
                <tr className="font-bold bg-gray-50">
                  <td className="py-2 px-2 border border-gray-300">Total</td>
                  <td className="text-right py-2 px-2 border border-gray-300">₹{receiptData.totalPaying.toLocaleString("en-IN", { minimumFractionDigits: 2 })}</td>
                </tr>
                <tr>
                  <td className="py-1.5 px-2 border border-gray-300 font-semibold">Balance</td>
                  <td className="text-right py-1.5 px-2 border border-gray-300 font-semibold text-red-600">
                    ₹{(receiptData.remainingBalance ?? 0).toLocaleString("en-IN", { minimumFractionDigits: 2 })}
                  </td>
                </tr>
              </tfoot>
            </table>

            {/* Signature */}
            <div className="flex justify-between items-end mt-6 text-xs">
              <div>
                <p className="text-gray-500">Receiver</p>
              </div>
              <div className="text-center">
                <div className="border-t border-gray-800 pt-1 w-32">
                  <p className="text-gray-600">Auth. Signature</p>
                </div>
              </div>
            </div>
          </div>
          <div className="flex justify-end gap-2 mt-2">
            <Button variant="outline" onClick={() => { setShowReceipt(false); setReceiptData(null); onOpenChange(false); }}>Close</Button>
            <Button
              variant="outline"
              className="text-green-600 border-green-600 hover:bg-green-50"
              onClick={() => {
                const phone = student.parent_phone;
                if (!phone) { toast.error("No phone number found for this student"); return; }
                const feeLines = receiptData.selectedItems.map((item: any) => `- ${item.head_name}: Rs.${item.paying.toLocaleString("en-IN", { minimumFractionDigits: 2 })}`).join("\n");
                const msg = `Dear ${student.parent_name || student.student_name},\n\nFee Receipt - ${currentOrganization?.name || "School"}\nReceipt #: ${receiptData.receiptNumber}\nDate: ${format(new Date(receiptData.paidDate), "dd/MM/yyyy")}\nStudent: ${student.student_name}\nClass: ${student.school_classes?.class_name || "-"}\nAdm No: ${student.admission_number}\n\nFee Details:\n${feeLines}\n\nTotal Paid: Rs.${receiptData.totalPaying.toLocaleString("en-IN", { minimumFractionDigits: 2 })}\nBalance: Rs.${(receiptData.remainingBalance ?? 0).toLocaleString("en-IN", { minimumFractionDigits: 2 })}\nPayment Mode: ${receiptData.paymentMethod}\n\nThank you!`;
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
                    disabled={collectMutation.isPending || totalPaying <= 0}
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
