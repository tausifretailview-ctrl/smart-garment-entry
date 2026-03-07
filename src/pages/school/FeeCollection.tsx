import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useOrganization } from "@/contexts/OrganizationContext";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Search, Receipt, Loader2, IndianRupee, Calendar, User, MessageCircle, Pencil, CreditCard, Banknote, Smartphone, Building2, Printer, Trash2 } from "lucide-react";
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle, AlertDialogTrigger } from "@/components/ui/alert-dialog";
import { FeeCollectionDialog } from "@/components/school/FeeCollectionDialog";
import { StudentHistoryDialog } from "@/components/school/StudentHistoryDialog";
import { useWhatsAppAPI } from "@/hooks/useWhatsAppAPI";
import { useWhatsAppSend } from "@/hooks/useWhatsAppSend";
import { BalanceEditDialog } from "@/components/school/BalanceEditDialog";
import { FeeReceiptReprintDialog } from "@/components/school/FeeReceiptReprintDialog";
import { toast } from "sonner";
import { format, startOfDay, endOfDay, startOfMonth, startOfQuarter, startOfYear, subDays } from "date-fns";

const FeeCollection = () => {
  const queryClient = useQueryClient();
  const { currentOrganization, organizationRole } = useOrganization();
  const isManager = organizationRole === "manager";
  const [searchQuery, setSearchQuery] = useState("");
  const [statusFilter, setStatusFilter] = useState<string>("all");
  const [classFilter, setClassFilter] = useState<string>("all");
  const [currentPage, setCurrentPage] = useState(1);
  const pageSize = 50;
  const [selectedStudent, setSelectedStudent] = useState<any>(null);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [sendingReminder, setSendingReminder] = useState<string | null>(null);
  const [historyStudent, setHistoryStudent] = useState<any>(null);
  const [historyOpen, setHistoryOpen] = useState(false);
  const [balanceEditStudent, setBalanceEditStudent] = useState<any>(null);
  const [balanceEditOpen, setBalanceEditOpen] = useState(false);
  const [reprintReceiptId, setReprintReceiptId] = useState<string | null>(null);
  const [reprintOpen, setReprintOpen] = useState(false);
  const { settings: whatsAppSettings, sendMessageAsync } = useWhatsAppAPI();
  const { sendWhatsApp } = useWhatsAppSend();
  const [activeTab, setActiveTab] = useState("collect");
  const [deletingReceipt, setDeletingReceipt] = useState<string | null>(null);
  const [selectedYearId, setSelectedYearId] = useState<string | null>(null);

  const deleteReceiptMutation = useMutation({
    mutationFn: async (receiptId: string) => {
      setDeletingReceipt(receiptId);
      const { error } = await supabase.rpc("delete_fee_receipt", {
        p_receipt_id: receiptId,
        p_organization_id: currentOrganization!.id,
      });
      if (error) throw error;
    },
    onSuccess: () => {
      toast.success("Receipt deleted and fees reversed successfully");
      queryClient.invalidateQueries({ queryKey: ["fees-collected"] });
      queryClient.invalidateQueries({ queryKey: ["fee-collection-summary"] });
      queryClient.invalidateQueries({ queryKey: ["students-fee-collection"] });
      queryClient.invalidateQueries({ queryKey: ["student-fee-details"] });
      setDeletingReceipt(null);
    },
    onError: (err: any) => {
      toast.error("Delete failed: " + err.message);
      setDeletingReceipt(null);
    },
  });

  // Fees Collected tab state
  const [collectedPeriod, setCollectedPeriod] = useState("today");
  const [collectedSearch, setCollectedSearch] = useState("");
  const [customDateFrom, setCustomDateFrom] = useState("");
  const [customDateTo, setCustomDateTo] = useState("");
  const [collectedPage, setCollectedPage] = useState(1);

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

  // Summary: today's collection, month collection, pending dues
  const { data: summary } = useQuery({
    queryKey: ["fee-collection-summary", currentOrganization?.id, currentYear?.id],
    queryFn: async () => {
      if (!currentYear) return { today: 0, month: 0, pending: 0 };

      const today = new Date().toISOString().split("T")[0];
      const monthStart = new Date(new Date().getFullYear(), new Date().getMonth(), 1).toISOString().split("T")[0];

      const { data: todayData } = await supabase
        .from("student_fees")
        .select("paid_amount")
        .eq("organization_id", currentOrganization!.id)
        .eq("academic_year_id", currentYear.id)
        .gte("paid_date", today + "T00:00:00")
        .lte("paid_date", today + "T23:59:59");

      const todayTotal = (todayData || []).reduce((s: number, r: any) => s + (r.paid_amount || 0), 0);

      const { data: monthData } = await supabase
        .from("student_fees")
        .select("paid_amount")
        .eq("organization_id", currentOrganization!.id)
        .eq("academic_year_id", currentYear.id)
        .gte("paid_date", monthStart + "T00:00:00");

      const monthTotal = (monthData || []).reduce((s: number, r: any) => s + (r.paid_amount || 0), 0);

      const { data: allStructures } = await supabase
        .from("fee_structures")
        .select("amount, frequency")
        .eq("organization_id", currentOrganization!.id)
        .eq("academic_year_id", currentYear.id);

      const { data: allStudents } = await supabase
        .from("students")
        .select("id, class_id, closing_fees_balance")
        .eq("organization_id", currentOrganization!.id)
        .is("deleted_at", null);

      const { data: allPayments } = await supabase
        .from("student_fees")
        .select("paid_amount")
        .eq("organization_id", currentOrganization!.id)
        .eq("academic_year_id", currentYear.id);

      const totalPaid = (allPayments || []).reduce((s: number, r: any) => s + (r.paid_amount || 0), 0);

      const totalExpected = (allStructures || []).reduce((s: number, r: any) => {
        const mult = r.frequency === "monthly" ? 12 : r.frequency === "quarterly" ? 4 : 1;
        return s + r.amount * mult;
      }, 0);

      const totalImportedBalance = (allStudents || []).reduce((s: number, st: any) => s + (st.closing_fees_balance || 0), 0);
      const pending = Math.max(0, (totalExpected > 0 ? totalExpected : totalImportedBalance) - totalPaid);

      return { today: todayTotal, month: monthTotal, pending };
    },
    enabled: !!currentOrganization?.id && !!currentYear?.id,
  });

  // Fetch students with fee due calculations
  const { data: students, isLoading } = useQuery({
    queryKey: ["students-fee-collection", currentOrganization?.id, searchQuery, currentYear?.id],
    queryFn: async () => {
      if (!currentOrganization?.id) return [];

      let query = supabase
        .from("students")
        .select(`*, school_classes:class_id (class_name)`, { count: "exact" })
        .eq("organization_id", currentOrganization.id)
        .is("deleted_at", null)
        .order("student_name", { ascending: true });

      if (searchQuery) {
        query = query.or(`student_name.ilike.%${searchQuery}%,admission_number.ilike.%${searchQuery}%,parent_phone.ilike.%${searchQuery}%`);
      }

      const { data, error, count } = await query;
      if (error) throw error;

      if (!data?.length) return data || [];

      if (!currentYear) {
        return data.map((student: any) => ({
          ...student,
          totalExpected: 0,
          totalPaid: 0,
          totalDue: 0,
          feeStatus: "no-structure",
        }));
      }

      const classIds = [...new Set(data.map((s: any) => s.class_id).filter(Boolean))];
      const studentIds = data.map((s: any) => s.id);

      const [structuresRes, paymentsRes] = await Promise.all([
        classIds.length > 0
          ? supabase.from("fee_structures").select("*").eq("organization_id", currentOrganization.id).eq("academic_year_id", currentYear.id).in("class_id", classIds)
          : { data: [] },
        supabase.from("student_fees").select("student_id, paid_amount, fee_head_id").eq("organization_id", currentOrganization.id).eq("academic_year_id", currentYear.id).in("student_id", studentIds),
      ]);

      const structures = structuresRes.data || [];
      const payments = paymentsRes.data || [];

      return data.map((student: any) => {
        const classStructures = structures.filter((s: any) => s.class_id === student.class_id);
        const totalExpected = classStructures.reduce((sum: number, s: any) => {
          const mult = s.frequency === "monthly" ? 12 : s.frequency === "quarterly" ? 4 : 1;
          return sum + s.amount * mult;
        }, 0);

        const totalPaid = payments
          .filter((p: any) => p.student_id === student.id)
          .reduce((sum: number, p: any) => sum + (p.paid_amount || 0), 0);

        const importedBalance = student.closing_fees_balance || 0;
        const hasStructures = totalExpected > 0;
        const totalDue = hasStructures ? Math.max(0, totalExpected - totalPaid) : Math.max(0, importedBalance - totalPaid);
        const effectiveExpected = hasStructures ? totalExpected : importedBalance;
        const effectiveStatus = totalDue === 0 ? "paid" : totalPaid > 0 ? "partial" : effectiveExpected === 0 ? "no-structure" : "pending";

        return { ...student, totalExpected: effectiveExpected, totalPaid, totalDue, feeStatus: effectiveStatus };
      });
    },
    enabled: !!currentOrganization?.id,
  });

  // Fetch classes for filter
  const { data: classes } = useQuery({
    queryKey: ["school-classes-filter", currentOrganization?.id],
    queryFn: async () => {
      const { data } = await supabase
        .from("school_classes")
        .select("id, class_name")
        .eq("organization_id", currentOrganization!.id)
        .order("display_order", { ascending: true });
      return data;
    },
    enabled: !!currentOrganization?.id,
  });

  // === Fees Collected Tab: date range calculation ===
  const getDateRange = () => {
    const now = new Date();
    switch (collectedPeriod) {
      case "today":
        return { from: startOfDay(now).toISOString(), to: endOfDay(now).toISOString() };
      case "monthly":
        return { from: startOfMonth(now).toISOString(), to: endOfDay(now).toISOString() };
      case "quarterly":
        return { from: startOfQuarter(now).toISOString(), to: endOfDay(now).toISOString() };
      case "yearly":
        return { from: startOfYear(now).toISOString(), to: endOfDay(now).toISOString() };
      case "custom":
        return {
          from: customDateFrom ? new Date(customDateFrom + "T00:00:00").toISOString() : subDays(now, 30).toISOString(),
          to: customDateTo ? new Date(customDateTo + "T23:59:59").toISOString() : endOfDay(now).toISOString(),
        };
      default:
        return { from: startOfDay(now).toISOString(), to: endOfDay(now).toISOString() };
    }
  };

  const dateRange = getDateRange();

  // Fetch collected fees data
  const { data: collectedFees, isLoading: collectedLoading } = useQuery({
    queryKey: ["fees-collected", currentOrganization?.id, currentYear?.id, collectedPeriod, customDateFrom, customDateTo, collectedSearch],
    queryFn: async () => {
      if (!currentYear) return [];

      let query = supabase
        .from("student_fees")
        .select("*, students!inner(student_name, admission_number, parent_phone, class_id, school_classes:class_id(class_name)), fee_heads(head_name)")
        .eq("organization_id", currentOrganization!.id)
        .eq("academic_year_id", currentYear.id)
        .gte("paid_date", dateRange.from)
        .lte("paid_date", dateRange.to)
        .order("paid_date", { ascending: false });

      if (collectedSearch) {
        query = query.or(`students.student_name.ilike.%${collectedSearch}%,students.admission_number.ilike.%${collectedSearch}%`, { referencedTable: "students" });
      }

      const { data, error } = await query;
      if (error) throw error;
      return data || [];
    },
    enabled: !!currentOrganization?.id && !!currentYear?.id && activeTab === "collected",
  });

  // Collected fees summary cards
  const collectedSummary = (() => {
    const fees = collectedFees || [];
    const total = fees.reduce((s: number, f: any) => s + (f.paid_amount || 0), 0);
    const cash = fees.filter((f: any) => f.payment_method === "Cash").reduce((s: number, f: any) => s + (f.paid_amount || 0), 0);
    const upi = fees.filter((f: any) => f.payment_method === "UPI").reduce((s: number, f: any) => s + (f.paid_amount || 0), 0);
    const card = fees.filter((f: any) => f.payment_method === "Card").reduce((s: number, f: any) => s + (f.paid_amount || 0), 0);
    const bank = fees.filter((f: any) => f.payment_method === "Bank Transfer").reduce((s: number, f: any) => s + (f.paid_amount || 0), 0);
    const count = fees.length;
    return { total, cash, upi, card, bank, count };
  })();

  // Collected fees filtered by search (client-side for student name in results)
  const paginatedCollected = (collectedFees || []).slice((collectedPage - 1) * pageSize, collectedPage * pageSize);
  const collectedTotalPages = Math.max(1, Math.ceil((collectedFees || []).length / pageSize));

  const handleCollect = (student: any) => {
    setSelectedStudent(student);
    setDialogOpen(true);
  };

  // Fetch UPI ID from payment gateway settings
  const { data: gatewaySettings } = useQuery({
    queryKey: ["payment-gateway-settings", currentOrganization?.id],
    queryFn: async () => {
      const { data } = await supabase
        .from("payment_gateway_settings")
        .select("upi_id, upi_business_name")
        .eq("organization_id", currentOrganization!.id)
        .maybeSingle();
      return data;
    },
    enabled: !!currentOrganization?.id,
  });

  const handleSendReminder = async (student: any) => {
    const phone = student.parent_phone;
    if (!phone) {
      toast.error("No phone number found for this student");
      return;
    }
    if (student.totalDue <= 0) {
      toast.info("No pending dues for this student");
      return;
    }

    const templateName = (whatsAppSettings as any)?.fee_reminder_template_name;
    const upiId = gatewaySettings?.upi_id || "";
    const upiBusinessName = gatewaySettings?.upi_business_name || currentOrganization?.name || "School";

    let paymentLink = "";
    if (upiId) {
      const upiParams = new URLSearchParams({
        pa: upiId,
        pn: upiBusinessName.replace(/[^a-zA-Z0-9 ]/g, "").substring(0, 50),
        am: student.totalDue.toFixed(2),
        cu: "INR",
        tn: `Fee payment - ${student.student_name} (${student.admission_number})`,
      });
      paymentLink = `upi://pay?${upiParams.toString()}`;
    }

    if (whatsAppSettings?.is_active && templateName) {
      setSendingReminder(student.id);
      try {
        await sendMessageAsync({
          phone,
          message: `Fee Reminder - ${currentOrganization?.name}\nStudent: ${student.student_name} (${student.admission_number})\nClass: ${student.school_classes?.class_name || "-"}\nPending Amount: Rs.${student.totalDue.toLocaleString("en-IN")}\n${upiId ? `UPI ID: ${upiId}` : ""}`,
          templateType: "fee_reminder",
          templateName,
          saleData: {
            student_name: student.student_name,
            admission_number: student.admission_number,
            class_name: student.school_classes?.class_name || "",
            amount: student.totalDue,
            organization_name: currentOrganization?.name || "",
            payment_link: paymentLink,
            upi_id: upiId,
          },
        });
        toast.success("Fee reminder sent via WhatsApp!");
      } catch (err: any) {
        toast.error("Failed: " + (err.message || "Unknown error"));
      } finally {
        setSendingReminder(null);
      }
    } else {
      const amountStr = `Rs.${student.totalDue.toLocaleString("en-IN", { minimumFractionDigits: 2 })}`;
      const msg = `Dear Parent,\n\nFee Reminder - ${currentOrganization?.name || "School"}\nStudent: ${student.student_name} (${student.admission_number})\nClass: ${student.school_classes?.class_name || "-"}\nPending Amount: ${amountStr}\n${upiId ? `\n💳 *Pay Online*\nUPI ID: ${upiId}\nAmount: ${amountStr}\n\n👉 Click to pay: ${paymentLink}` : ""}\n\nPlease pay at the earliest.\nThank you!`;
      sendWhatsApp(phone, msg);
    }
  };

  const getStatusBadge = (status: string) => {
    switch (status) {
      case "paid": return <Badge variant="success">Paid</Badge>;
      case "partial": return <Badge variant="warning">Partial</Badge>;
      case "pending": return <Badge variant="destructive">Pending</Badge>;
      default: return <Badge variant="secondary">No Structure</Badge>;
    }
  };

  const filteredStudents = (students || []).filter((s: any) => {
    if (classFilter !== "all" && s.class_id !== classFilter) return false;
    if (statusFilter === "all") return true;
    if (statusFilter === "paid") return s.feeStatus === "paid" || (s.totalDue === 0 && s.feeStatus === "no-structure");
    if (statusFilter === "pending") return s.feeStatus === "pending" || s.feeStatus === "partial";
    if (statusFilter === "partial") return s.feeStatus === "partial";
    return true;
  });

  const statusCounts = {
    total: filteredStudents.length,
    paid: filteredStudents.filter((s: any) => s.feeStatus === "paid" || (s.totalDue === 0 && s.feeStatus === "no-structure")).length,
    pending: filteredStudents.filter((s: any) => s.feeStatus === "pending").length,
    partial: filteredStudents.filter((s: any) => s.feeStatus === "partial").length,
  };

  const totalPages = Math.max(1, Math.ceil(filteredStudents.length / pageSize));
  const paginatedStudents = filteredStudents.slice((currentPage - 1) * pageSize, currentPage * pageSize);

  const handleFilterChange = (setter: (v: string) => void, value: string) => {
    setter(value);
    setCurrentPage(1);
  };

  const getPeriodLabel = (period: string) => {
    switch (period) {
      case "today": return "Today";
      case "monthly": return "This Month";
      case "quarterly": return "This Quarter";
      case "yearly": return "This Year";
      case "custom": return "Custom Range";
      default: return "Today";
    }
  };

  if (!currentOrganization) {
    return (
      <div className="flex items-center justify-center h-64">
        <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
      </div>
    );
  }

  return (
    <div className="p-6 space-y-6">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <Receipt className="h-8 w-8 text-primary" />
          <div>
            <h1 className="text-2xl font-bold">Fee Collection</h1>
            <p className="text-muted-foreground">Collect and manage student fee payments</p>
          </div>
        </div>
        <Button onClick={() => { setSelectedStudent(null); setDialogOpen(true); }}>
          <Receipt className="h-4 w-4 mr-2" /> Add Fee Collection
        </Button>
      </div>

      <Tabs value={activeTab} onValueChange={setActiveTab}>
        <TabsList>
          <TabsTrigger value="collect">Collect Fees</TabsTrigger>
          <TabsTrigger value="collected">Fees Collected</TabsTrigger>
        </TabsList>

        {/* ========== TAB 1: Collect Fees (existing) ========== */}
        <TabsContent value="collect" className="space-y-6">
          {/* Summary Cards - hidden for manager */}
          {!isManager && <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            <Card>
              <CardContent className="pt-6">
                <div className="flex items-center gap-4">
                  <div className="p-3 bg-primary/10 rounded-lg">
                    <IndianRupee className="h-6 w-6 text-primary" />
                  </div>
                  <div>
                    <p className="text-sm text-muted-foreground">Today's Collection</p>
                    <p className="text-2xl font-bold">₹{(summary?.today || 0).toLocaleString("en-IN", { minimumFractionDigits: 2 })}</p>
                  </div>
                </div>
              </CardContent>
            </Card>
            <Card>
              <CardContent className="pt-6">
                <div className="flex items-center gap-4">
                  <div className="p-3 bg-yellow-500/10 rounded-lg">
                    <Calendar className="h-6 w-6 text-yellow-600" />
                  </div>
                  <div>
                    <p className="text-sm text-muted-foreground">This Month</p>
                    <p className="text-2xl font-bold">₹{(summary?.month || 0).toLocaleString("en-IN", { minimumFractionDigits: 2 })}</p>
                  </div>
                </div>
              </CardContent>
            </Card>
            <Card>
              <CardContent className="pt-6">
                <div className="flex items-center gap-4">
                  <div className="p-3 bg-destructive/10 rounded-lg">
                    <User className="h-6 w-6 text-destructive" />
                  </div>
                  <div>
                    <p className="text-sm text-muted-foreground">Pending Dues</p>
                    <p className="text-2xl font-bold">₹{(summary?.pending || 0).toLocaleString("en-IN", { minimumFractionDigits: 2 })}</p>
                  </div>
                </div>
              </CardContent>
            </Card>
          </div>}

          <Card>
            <CardHeader>
              <div className="flex items-center justify-between">
                <CardTitle>Student Fee Status</CardTitle>
                <div className="relative w-64">
                  <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                  <Input
                    placeholder="Search by name or admission no..."
                    value={searchQuery}
                    onChange={(e) => setSearchQuery(e.target.value)}
                    className="pl-9"
                  />
                </div>
              </div>
              <div className="flex items-center gap-3 pt-2">
                <Select value={classFilter} onValueChange={(v) => handleFilterChange(setClassFilter, v)}>
                  <SelectTrigger className="w-40">
                    <SelectValue placeholder="All Classes" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">All Classes</SelectItem>
                    {(classes || []).map((c: any) => (
                      <SelectItem key={c.id} value={c.id}>{c.class_name}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                <Select value={statusFilter} onValueChange={(v) => handleFilterChange(setStatusFilter, v)}>
                  <SelectTrigger className="w-36">
                    <SelectValue placeholder="All Status" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">All Status</SelectItem>
                    <SelectItem value="paid">Paid</SelectItem>
                    <SelectItem value="pending">Pending</SelectItem>
                    <SelectItem value="partial">Partial</SelectItem>
                  </SelectContent>
                </Select>
                <div className="flex items-center gap-2 ml-auto text-sm">
                  <Badge variant="success">{statusCounts.paid} Paid</Badge>
                  <Badge variant="destructive">{statusCounts.pending} Pending</Badge>
                  <Badge variant="warning">{statusCounts.partial} Partial</Badge>
                  <Badge variant="secondary">Total: {statusCounts.total}</Badge>
                </div>
              </div>
            </CardHeader>
            <CardContent>
              {isLoading ? (
                <div className="flex items-center justify-center h-32">
                  <Loader2 className="h-6 w-6 animate-spin" />
                </div>
              ) : filteredStudents.length === 0 ? (
                <div className="text-center py-8 text-muted-foreground">
                  <User className="h-12 w-12 mx-auto mb-4 opacity-50" />
                  <p>No students found.</p>
                  <p className="text-sm">Add students first to collect fees.</p>
                </div>
              ) : (
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead className="w-14">Sr.No</TableHead>
                      <TableHead>Admission No</TableHead>
                      <TableHead>Student Name</TableHead>
                      <TableHead>Class</TableHead>
                      <TableHead>Phone</TableHead>
                      <TableHead className="text-right">Total Due</TableHead>
                      <TableHead className="text-center">Status</TableHead>
                      <TableHead className="w-44">Action</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {paginatedStudents.map((student: any, index: number) => (
                      <TableRow key={student.id}>
                        <TableCell className="text-muted-foreground">{(currentPage - 1) * pageSize + index + 1}</TableCell>
                        <TableCell className="font-medium">{student.admission_number}</TableCell>
                        <TableCell>
                          <button
                            className="text-primary hover:underline font-medium text-left cursor-pointer bg-transparent border-none p-0"
                            onClick={() => { setHistoryStudent(student); setHistoryOpen(true); }}
                          >
                            {student.student_name}
                          </button>
                        </TableCell>
                        <TableCell>{student.school_classes?.class_name || "-"}</TableCell>
                        <TableCell>{student.parent_phone || "-"}</TableCell>
                        <TableCell className="text-right font-medium">
                          <div className="flex items-center justify-end gap-1">
                            <span>₹{(student.totalDue || 0).toLocaleString("en-IN", { minimumFractionDigits: 2 })}</span>
                            <Button
                              size="sm"
                              variant="ghost"
                              className="h-6 w-6 p-0 text-muted-foreground hover:text-primary"
                              onClick={() => { setBalanceEditStudent(student); setBalanceEditOpen(true); }}
                              title="Edit closing fees balance"
                            >
                              <Pencil className="h-3 w-3" />
                            </Button>
                          </div>
                        </TableCell>
                        <TableCell className="text-center">
                          {getStatusBadge(student.feeStatus || "no-structure")}
                        </TableCell>
                        <TableCell>
                          <div className="flex items-center gap-1 justify-end">
                            {student.totalDue > 0 && student.parent_phone && (
                              <Button
                                size="sm"
                                variant="outline"
                                className="text-green-600 border-green-600 hover:bg-green-50 h-8 w-8 p-0"
                                onClick={() => handleSendReminder(student)}
                                disabled={sendingReminder === student.id}
                                title="Send WhatsApp Reminder"
                              >
                                {sendingReminder === student.id ? (
                                  <Loader2 className="h-4 w-4 animate-spin" />
                                ) : (
                                  <MessageCircle className="h-4 w-4" />
                                )}
                              </Button>
                            )}
                            <Button size="sm" onClick={() => handleCollect(student)} className="h-8">
                              <Receipt className="h-4 w-4 mr-1" />
                              Collect
                            </Button>
                          </div>
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              )}
              {totalPages > 1 && (
                <div className="flex items-center justify-between pt-4">
                  <p className="text-sm text-muted-foreground">
                    Showing {(currentPage - 1) * pageSize + 1}-{Math.min(currentPage * pageSize, filteredStudents.length)} of {filteredStudents.length}
                  </p>
                  <div className="flex items-center gap-2">
                    <Button variant="outline" size="sm" onClick={() => setCurrentPage((p) => Math.max(1, p - 1))} disabled={currentPage === 1}>Previous</Button>
                    <span className="text-sm">Page {currentPage} of {totalPages}</span>
                    <Button variant="outline" size="sm" onClick={() => setCurrentPage((p) => Math.min(totalPages, p + 1))} disabled={currentPage === totalPages}>Next</Button>
                  </div>
                </div>
              )}
            </CardContent>
          </Card>
        </TabsContent>

        {/* ========== TAB 2: Fees Collected ========== */}
        <TabsContent value="collected" className="space-y-6">
          {/* Period Filter Chips */}
          <div className="flex flex-wrap items-center gap-2">
            {["today", "monthly", "quarterly", "yearly", "custom"].map((period) => (
              <Button
                key={period}
                size="sm"
                variant={collectedPeriod === period ? "default" : "outline"}
                onClick={() => { setCollectedPeriod(period); setCollectedPage(1); }}
                className="capitalize"
              >
                {getPeriodLabel(period)}
              </Button>
            ))}
            {collectedPeriod === "custom" && (
              <div className="flex items-center gap-2 ml-2">
                <Input
                  type="date"
                  value={customDateFrom}
                  onChange={(e) => setCustomDateFrom(e.target.value)}
                  className="w-40 h-9"
                />
                <span className="text-muted-foreground text-sm">to</span>
                <Input
                  type="date"
                  value={customDateTo}
                  onChange={(e) => setCustomDateTo(e.target.value)}
                  className="w-40 h-9"
                />
              </div>
            )}
          </div>

          {/* Summary Cards - hidden for manager */}
          {!isManager && <div className="grid grid-cols-2 md:grid-cols-5 gap-4">
            <Card>
              <CardContent className="pt-5 pb-4">
                <div className="flex items-center gap-3">
                  <div className="p-2.5 bg-primary/10 rounded-lg">
                    <IndianRupee className="h-5 w-5 text-primary" />
                  </div>
                  <div>
                    <p className="text-xs text-muted-foreground">Total Collection</p>
                    <p className="text-lg font-bold">₹{collectedSummary.total.toLocaleString("en-IN", { minimumFractionDigits: 2 })}</p>
                    <p className="text-xs text-muted-foreground">{collectedSummary.count} receipts</p>
                  </div>
                </div>
              </CardContent>
            </Card>
            <Card>
              <CardContent className="pt-5 pb-4">
                <div className="flex items-center gap-3">
                  <div className="p-2.5 bg-green-500/10 rounded-lg">
                    <Banknote className="h-5 w-5 text-green-600" />
                  </div>
                  <div>
                    <p className="text-xs text-muted-foreground">Cash</p>
                    <p className="text-lg font-bold">₹{collectedSummary.cash.toLocaleString("en-IN", { minimumFractionDigits: 2 })}</p>
                  </div>
                </div>
              </CardContent>
            </Card>
            <Card>
              <CardContent className="pt-5 pb-4">
                <div className="flex items-center gap-3">
                  <div className="p-2.5 bg-blue-500/10 rounded-lg">
                    <Smartphone className="h-5 w-5 text-blue-600" />
                  </div>
                  <div>
                    <p className="text-xs text-muted-foreground">UPI</p>
                    <p className="text-lg font-bold">₹{collectedSummary.upi.toLocaleString("en-IN", { minimumFractionDigits: 2 })}</p>
                  </div>
                </div>
              </CardContent>
            </Card>
            <Card>
              <CardContent className="pt-5 pb-4">
                <div className="flex items-center gap-3">
                  <div className="p-2.5 bg-purple-500/10 rounded-lg">
                    <CreditCard className="h-5 w-5 text-purple-600" />
                  </div>
                  <div>
                    <p className="text-xs text-muted-foreground">Card</p>
                    <p className="text-lg font-bold">₹{collectedSummary.card.toLocaleString("en-IN", { minimumFractionDigits: 2 })}</p>
                  </div>
                </div>
              </CardContent>
            </Card>
            <Card>
              <CardContent className="pt-5 pb-4">
                <div className="flex items-center gap-3">
                  <div className="p-2.5 bg-orange-500/10 rounded-lg">
                    <Building2 className="h-5 w-5 text-orange-600" />
                  </div>
                  <div>
                    <p className="text-xs text-muted-foreground">Bank Transfer</p>
                    <p className="text-lg font-bold">₹{collectedSummary.bank.toLocaleString("en-IN", { minimumFractionDigits: 2 })}</p>
                  </div>
                </div>
              </CardContent>
            </Card>
          </div>}

          {/* Search + Table */}
          <Card>
            <CardHeader>
              <div className="flex items-center justify-between">
                <CardTitle>Collection Details — {getPeriodLabel(collectedPeriod)}</CardTitle>
                <div className="relative w-64">
                  <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                  <Input
                    placeholder="Search student name or adm no..."
                    value={collectedSearch}
                    onChange={(e) => { setCollectedSearch(e.target.value); setCollectedPage(1); }}
                    className="pl-9"
                  />
                </div>
              </div>
            </CardHeader>
            <CardContent>
              {collectedLoading ? (
                <div className="flex items-center justify-center h-32">
                  <Loader2 className="h-6 w-6 animate-spin" />
                </div>
              ) : (collectedFees || []).length === 0 ? (
                <div className="text-center py-8 text-muted-foreground">
                  <Receipt className="h-12 w-12 mx-auto mb-4 opacity-50" />
                  <p>No fee collections found for this period.</p>
                </div>
              ) : (
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead className="w-14">Sr.No</TableHead>
                      <TableHead>Date</TableHead>
                      <TableHead>Receipt #</TableHead>
                      <TableHead>Student Name</TableHead>
                      <TableHead>Adm. No</TableHead>
                      <TableHead>Class</TableHead>
                      <TableHead>Fee Head</TableHead>
                      <TableHead>Payment</TableHead>
                      <TableHead className="text-right">Amount</TableHead>
                      <TableHead className="w-14 text-center">Print</TableHead>
                      <TableHead className="w-14 text-center">Delete</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {paginatedCollected.map((fee: any, index: number) => (
                      <TableRow key={fee.id}>
                        <TableCell className="text-muted-foreground">{(collectedPage - 1) * pageSize + index + 1}</TableCell>
                        <TableCell>{fee.paid_date ? format(new Date(fee.paid_date), "dd/MM/yyyy") : "-"}</TableCell>
                        <TableCell className="font-medium">{fee.payment_receipt_id || "-"}</TableCell>
                        <TableCell>
                          <button
                            className="text-primary hover:underline font-medium text-left cursor-pointer bg-transparent border-none p-0"
                            onClick={() => {
                              if (fee.students) {
                                setHistoryStudent({
                                  id: fee.student_id,
                                  student_name: fee.students.student_name,
                                  admission_number: fee.students.admission_number,
                                  class_id: fee.students.class_id,
                                  parent_phone: fee.students.parent_phone,
                                  school_classes: fee.students.school_classes,
                                });
                                setHistoryOpen(true);
                              }
                            }}
                          >
                            {fee.students?.student_name || "-"}
                          </button>
                        </TableCell>
                        <TableCell>{fee.students?.admission_number || "-"}</TableCell>
                        <TableCell>{fee.students?.school_classes?.class_name || "-"}</TableCell>
                        <TableCell>{fee.fee_heads?.head_name || "Yearly Fees 2025-26"}</TableCell>
                        <TableCell>
                          <Badge variant="secondary">{fee.payment_method || "Cash"}</Badge>
                        </TableCell>
                        <TableCell className="text-right font-medium">₹{(fee.paid_amount || 0).toLocaleString("en-IN", { minimumFractionDigits: 2 })}</TableCell>
                        <TableCell className="text-center">
                          {fee.payment_receipt_id && (
                            <Button
                              variant="ghost"
                              size="icon"
                              className="h-8 w-8"
                              title="View & Reprint Receipt"
                              onClick={() => { setReprintReceiptId(fee.payment_receipt_id); setReprintOpen(true); }}
                            >
                              <Printer className="h-4 w-4" />
                            </Button>
                          )}
                        </TableCell>
                        <TableCell className="text-center">
                          {fee.payment_receipt_id && (
                            <AlertDialog>
                              <AlertDialogTrigger asChild>
                                <Button
                                  variant="ghost"
                                  size="icon"
                                  className="h-8 w-8 text-destructive hover:text-destructive"
                                  title="Delete Receipt"
                                  disabled={deletingReceipt === fee.payment_receipt_id}
                                >
                                  {deletingReceipt === fee.payment_receipt_id ? (
                                    <Loader2 className="h-4 w-4 animate-spin" />
                                  ) : (
                                    <Trash2 className="h-4 w-4" />
                                  )}
                                </Button>
                              </AlertDialogTrigger>
                              <AlertDialogContent>
                                <AlertDialogHeader>
                                  <AlertDialogTitle>Delete Fee Receipt?</AlertDialogTitle>
                                  <AlertDialogDescription>
                                    This will permanently delete receipt <strong>{fee.payment_receipt_id}</strong> for student <strong>{fee.students?.student_name}</strong> (₹{(fee.paid_amount || 0).toLocaleString("en-IN")}). The fees will be reversed in the student's account. This action cannot be undone.
                                  </AlertDialogDescription>
                                </AlertDialogHeader>
                                <AlertDialogFooter>
                                  <AlertDialogCancel>Cancel</AlertDialogCancel>
                                  <AlertDialogAction
                                    className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
                                    onClick={() => deleteReceiptMutation.mutate(fee.payment_receipt_id)}
                                  >
                                    Delete & Reverse
                                  </AlertDialogAction>
                                </AlertDialogFooter>
                              </AlertDialogContent>
                            </AlertDialog>
                          )}
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              )}
              {collectedTotalPages > 1 && (
                <div className="flex items-center justify-between pt-4">
                  <p className="text-sm text-muted-foreground">
                    Showing {(collectedPage - 1) * pageSize + 1}-{Math.min(collectedPage * pageSize, (collectedFees || []).length)} of {(collectedFees || []).length}
                  </p>
                  <div className="flex items-center gap-2">
                    <Button variant="outline" size="sm" onClick={() => setCollectedPage((p) => Math.max(1, p - 1))} disabled={collectedPage === 1}>Previous</Button>
                    <span className="text-sm">Page {collectedPage} of {collectedTotalPages}</span>
                    <Button variant="outline" size="sm" onClick={() => setCollectedPage((p) => Math.min(collectedTotalPages, p + 1))} disabled={collectedPage === collectedTotalPages}>Next</Button>
                  </div>
                </div>
              )}
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>

      <FeeCollectionDialog
        open={dialogOpen}
        onOpenChange={setDialogOpen}
        student={selectedStudent}
      />

      <StudentHistoryDialog
        open={historyOpen}
        onOpenChange={setHistoryOpen}
        student={historyStudent}
      />

      <BalanceEditDialog
        open={balanceEditOpen}
        onOpenChange={setBalanceEditOpen}
        student={balanceEditStudent}
      />

      <FeeReceiptReprintDialog
        open={reprintOpen}
        onOpenChange={setReprintOpen}
        receiptId={reprintReceiptId}
      />
    </div>
  );
};


export default FeeCollection;
