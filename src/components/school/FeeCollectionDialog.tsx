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
import { Loader2, MessageCircle, Printer, Receipt } from "lucide-react";
import { format } from "date-fns";
import { useWhatsAppSend } from "@/hooks/useWhatsAppSend";
import { useReactToPrint } from "react-to-print";

interface Student {
  id: string;
  student_name: string;
  admission_number: string;
  class_id: string | null;
  phone: string | null;
  guardian_phone: string | null;
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

export function FeeCollectionDialog({ open, onOpenChange, student }: FeeCollectionDialogProps) {
  const { currentOrganization } = useOrganization();
  const queryClient = useQueryClient();
  const [paymentMethod, setPaymentMethod] = useState("Cash");
  const [transactionId, setTransactionId] = useState("");
  const [feeItems, setFeeItems] = useState<FeeItem[]>([]);
  const [showReceipt, setShowReceipt] = useState(false);
  const [receiptData, setReceiptData] = useState<any>(null);
  const receiptRef = useRef<HTMLDivElement>(null);
  const { sendWhatsApp } = useWhatsAppSend();

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
      if (!student?.class_id || !currentYear?.id) return [];

      // Get fee structures for this class
      const { data: structures } = await supabase
        .from("fee_structures")
        .select("*, fee_heads!inner(head_name)")
        .eq("organization_id", currentOrganization!.id)
        .eq("academic_year_id", currentYear.id)
        .eq("class_id", student.class_id);

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

      setFeeItems(items);
      return items;
    },
    enabled: !!student?.id && !!student?.class_id && !!currentYear?.id && open,
  });

  const totalPaying = feeItems
    .filter(i => i.selected && i.balance > 0)
    .reduce((sum, i) => sum + i.paying, 0);

  const collectMutation = useMutation({
    mutationFn: async () => {
      if (!student || !currentYear || !currentOrganization) throw new Error("Missing data");

      const selectedItems = feeItems.filter(i => i.selected && i.paying > 0);
      if (selectedItems.length === 0) throw new Error("No fees selected");

      const receiptNumber = `RCP-${Date.now().toString(36).toUpperCase()}`;
      const paidDate = new Date().toISOString();

      for (const item of selectedItems) {
        const newStatus = item.paying >= item.balance ? "paid" : "partial";
        const { error } = await supabase.from("student_fees").insert({
          organization_id: currentOrganization.id,
          student_id: student.id,
          fee_head_id: item.fee_head_id,
          fee_structure_id: item.fee_structure_id,
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

      return {
        receiptNumber,
        paidDate,
        selectedItems,
        paymentMethod,
        transactionId,
        totalPaying,
      };
    },
    onSuccess: (data) => {
      toast.success("Fee collected successfully!");
      setReceiptData(data);
      setShowReceipt(true);
      queryClient.invalidateQueries({ queryKey: ["students-fee-collection"] });
      queryClient.invalidateQueries({ queryKey: ["student-fee-details"] });
      queryClient.invalidateQueries({ queryKey: ["fee-collection-summary"] });
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
          <div ref={receiptRef} className="p-4 border rounded-md bg-white text-black">
            <div className="text-center mb-4">
              <h2 className="text-lg font-bold">{currentOrganization?.name}</h2>
              <p className="text-sm text-gray-600">Fee Receipt</p>
            </div>
            <div className="grid grid-cols-2 gap-2 text-sm mb-4">
              <div><strong>Receipt #:</strong> {receiptData.receiptNumber}</div>
              <div><strong>Date:</strong> {format(new Date(receiptData.paidDate), "dd/MM/yyyy")}</div>
              <div><strong>Student:</strong> {student.student_name}</div>
              <div><strong>Adm. No:</strong> {student.admission_number}</div>
              <div><strong>Class:</strong> {student.school_classes?.class_name || "-"}</div>
              <div><strong>Payment:</strong> {receiptData.paymentMethod}</div>
              {receiptData.transactionId && <div className="col-span-2"><strong>Txn ID:</strong> {receiptData.transactionId}</div>}
            </div>
            <table className="w-full text-sm border-collapse mb-4">
              <thead>
                <tr className="border-b">
                  <th className="text-left py-1">Fee Head</th>
                  <th className="text-right py-1">Amount</th>
                </tr>
              </thead>
              <tbody>
                {receiptData.selectedItems.map((item: any, idx: number) => (
                  <tr key={idx} className="border-b">
                    <td className="py-1">{item.head_name}</td>
                    <td className="text-right py-1">₹{item.paying.toLocaleString("en-IN", { minimumFractionDigits: 2 })}</td>
                  </tr>
                ))}
              </tbody>
              <tfoot>
                <tr className="font-bold">
                  <td className="py-2">Total</td>
                  <td className="text-right py-2">₹{receiptData.totalPaying.toLocaleString("en-IN", { minimumFractionDigits: 2 })}</td>
                </tr>
              </tfoot>
            </table>
          </div>
          <div className="flex justify-end gap-2 mt-2">
            <Button variant="outline" onClick={() => { setShowReceipt(false); setReceiptData(null); onOpenChange(false); }}>Close</Button>
            <Button
              variant="outline"
              className="text-green-600 border-green-600 hover:bg-green-50"
              onClick={() => {
                const phone = student.phone || student.guardian_phone;
                if (!phone) { toast.error("No phone number found for this student"); return; }
                const feeLines = receiptData.selectedItems.map((item: any) => `- ${item.head_name}: Rs.${item.paying.toLocaleString("en-IN", { minimumFractionDigits: 2 })}`).join("\n");
                const msg = `Dear ${student.student_name},\n\nFee Receipt - ${currentOrganization?.name || "School"}\nReceipt #: ${receiptData.receiptNumber}\nDate: ${format(new Date(receiptData.paidDate), "dd/MM/yyyy")}\n\nFee Details:\n${feeLines}\n\nTotal Paid: Rs.${receiptData.totalPaying.toLocaleString("en-IN", { minimumFractionDigits: 2 })}\nPayment Mode: ${receiptData.paymentMethod}\n\nThank you!`;
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
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>
            Collect Fee — {student?.student_name} ({student?.admission_number})
          </DialogTitle>
        </DialogHeader>

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
      </DialogContent>
    </Dialog>
  );
}
