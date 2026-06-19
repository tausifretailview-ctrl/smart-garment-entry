import { useState, useMemo } from "react";
import { useDashboardFilterPersistence } from "@/hooks/useDashboardFilterPersistence";
import { useCreateFormDraftPersistence } from "@/hooks/useCreateFormDraftPersistence";
import { restoreDashboardFilters, WINDOW_FILTER_IDS } from "@/lib/dashboardFilterPersistence";
import { Switch } from "@/components/ui/switch";
import { createPortal } from "react-dom";
import { DASHBOARD_TAB_RETURN_QUERY_OPTIONS } from "@/lib/dashboardQueryOptions";
import { STALE_LIVE } from "@/lib/queryStaleTimes";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useOrganization } from "@/contexts/OrganizationContext";
import { useDashboardInvalidation } from "@/hooks/useDashboardInvalidation";
import { Button } from "@/components/ui/button";
import { useIsMobile } from "@/hooks/use-mobile";
import { MobilePageHeader } from "@/components/mobile/MobilePageHeader";
import { MobileBottomNav } from "@/components/mobile/MobileBottomNav";
import { Skeleton } from "@/components/ui/skeleton";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import {
  Plus,
  Pencil,
  Trash2,
  Search,
  FileSpreadsheet,
  History,
  Link2,
  Phone,
  Tag,
  ShoppingCart,
  Wallet,
  FileText,
  RefreshCw,
  Eye,
  ArrowUpDown,
  BookOpen,
  ChevronDown,
  Settings2,
  Users,
  Crown,
  AlertTriangle,
  UserX,
  Loader2,
} from "lucide-react";
import { Card, CardContent, CardDescription, CardHeader } from "@/components/ui/card";
import { cn } from "@/lib/utils";
import {
  fetchCustomerSegmentIndex,
  CUSTOMER_SEGMENT_HINTS,
  CUSTOMER_SEGMENT_LABELS,
  type CustomerSegment,
} from "@/utils/customerSegments";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { useToast } from "@/hooks/use-toast";
import { useSoftDelete } from "@/hooks/useSoftDelete";
import { ExcelImportDialog, ImportProgress } from "@/components/ExcelImportDialog";
import { customerMasterFields, customerMasterSampleData, normalizePhoneNumber } from "@/utils/excelImportUtils";
import { Checkbox } from "@/components/ui/checkbox";
import { LegacyInvoiceImportDialog } from "@/components/LegacyInvoiceImportDialog";
import { useOpenCustomerAccount } from "@/hooks/useOpenCustomerAccount";
import { RelinkLegacyInvoicesDialog } from "@/components/RelinkLegacyInvoicesDialog";
import { UpdateLegacyPhonesDialog } from "@/components/UpdateLegacyPhonesDialog";
import { BrandDiscountDialog } from "@/components/BrandDiscountDialog";
import { CustomerBalanceImportDialog } from "@/components/CustomerBalanceImportDialog";
import { useOrgNavigation } from "@/hooks/useOrgNavigation";
import { useContextMenu, useIsDesktop } from "@/hooks/useContextMenu";
import { DesktopContextMenu, PageContextMenu, ContextMenuItem } from "@/components/DesktopContextMenu";
import { ColumnDef } from "@tanstack/react-table";
import { ERPTable } from "@/components/erp-table";

interface Customer {
  id: string;
  customer_name: string;
  phone: string | null;
  email: string | null;
  address: string | null;
  gst_number: string | null;
  opening_balance: number | null;
  discount_percent: number | null;
  created_at: string;
}

const ITEMS_PER_PAGE = 50;

/** Hidden by default; users can enable via Columns toolbar. */
const CUSTOMER_MASTER_DEFAULT_COLUMN_VISIBILITY: Record<string, boolean> = {
  email: false,
  gst_number: false,
};

type SegmentFilter = CustomerSegment | "all";

const fmtInr = (n: number) =>
  new Intl.NumberFormat("en-IN", {
    style: "currency",
    currency: "INR",
    maximumFractionDigits: 0,
  }).format(n || 0);

const segmentBadgeClass = (seg: CustomerSegment) => {
  switch (seg) {
    case "vip":
      return "bg-amber-100 text-amber-800 border-amber-200";
    case "regular":
      return "bg-emerald-100 text-emerald-800 border-emerald-200";
    case "risk":
      return "bg-orange-100 text-orange-800 border-orange-200";
    case "lost":
      return "bg-slate-200 text-slate-700 border-slate-300";
  }
};

const CustomerMaster = () => {
  const [searchQuery, setSearchQuery] = useState("");
  const [segmentFilter, setSegmentFilter] = useState<SegmentFilter>("all");
  const [isDialogOpen, setIsDialogOpen] = useState(false);
  const [editingCustomer, setEditingCustomer] = useState<Customer | null>(null);
  const [formData, setFormData] = useState({
    customer_name: "",
    phone: "",
    email: "",
    address: "",
    gst_number: "",
    opening_balance: "",
    discount_percent: "",
    transport_details: "",
    portal_enabled: false,
  });
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const { currentOrganization } = useOrganization();
  const { invalidateCustomers } = useDashboardInvalidation();
  const [showExcelImport, setShowExcelImport] = useState(false);
  const [showLegacyImport, setShowLegacyImport] = useState(false);
  const [showBalanceImport, setShowBalanceImport] = useState(false);
  const [selectedCustomers, setSelectedCustomers] = useState<Set<string>>(new Set());
  const [currentPage, setCurrentPage] = useState(1);
  const openCustomerAccount = useOpenCustomerAccount();
  const [showRelinkDialog, setShowRelinkDialog] = useState(false);
  const [showBrandDiscountDialog, setShowBrandDiscountDialog] = useState(false);
  const [selectedCustomerForBrandDiscount, setSelectedCustomerForBrandDiscount] = useState<{ id: string; name: string } | null>(null);
  const [showUpdatePhonesDialog, setShowUpdatePhonesDialog] = useState(false);
  const { orgNavigate: navigate } = useOrgNavigation();

  const isDesktop = useIsDesktop();
  const rowContextMenu = useContextMenu<Customer>();
  const pageContextMenu = useContextMenu<void>();

  const getCustomerContextMenuItems = (customer: Customer): ContextMenuItem[] => {
    return [
      {
        label: "View Ledger",
        icon: Eye,
        onClick: () => {
          openCustomerAccount(customer.id, customer.customer_name);
        },
      },
      {
        label: "Edit Customer",
        icon: Pencil,
        onClick: () => handleEdit(customer),
      },
      { label: "", separator: true, onClick: () => {} },
      {
        label: "POS Sale",
        icon: ShoppingCart,
        onClick: () => navigate(`/pos-sales?customerId=${customer.id}`),
      },
      {
        label: "Add Invoice",
        icon: FileText,
        onClick: () => navigate(`/sales-invoice/new?customerId=${customer.id}`),
      },
      {
        label: "Add Payment",
        icon: Wallet,
        onClick: () => navigate(`/payments-dashboard?customerId=${customer.id}`),
      },
      { label: "", separator: true, onClick: () => {} },
      {
        label: "Brand Discounts",
        icon: Tag,
        onClick: () => {
          setSelectedCustomerForBrandDiscount({ id: customer.id, name: customer.customer_name });
          setShowBrandDiscountDialog(true);
        },
      },
      { label: "", separator: true, onClick: () => {} },
      {
        label: "Delete Customer",
        icon: Trash2,
        onClick: () => handleDelete(customer.id),
        destructive: true,
      },
    ];
  };

  const getPageContextMenuItems = (): ContextMenuItem[] => [
    {
      label: "POS Billing",
      icon: ShoppingCart,
      onClick: () => navigate("/pos-sales"),
    },
    {
      label: "Stock Report",
      icon: History,
      onClick: () => navigate("/stock-report"),
    },
    { label: "", separator: true, onClick: () => {} },
    {
      label: "Add New Customer",
      icon: Plus,
      onClick: () => { resetForm(); setIsDialogOpen(true); },
    },
    {
      label: "Add Invoice",
      icon: FileText,
      onClick: () => navigate("/sales-invoice/new"),
    },
    {
      label: "Refresh List",
      icon: RefreshCw,
      onClick: () => queryClient.invalidateQueries({ queryKey: ["customers"] }),
    },
  ];

  const handleRowContextMenu = (e: React.MouseEvent, customer: Customer) => {
    if (!isDesktop) return;
    rowContextMenu.openMenu(e, customer);
  };

  const handlePageContextMenu = (e: React.MouseEvent) => {
    if (!isDesktop) return;
    const target = e.target as HTMLElement;
    if (target.closest('tr') || target.closest('button') || target.closest('a')) return;
    pageContextMenu.openMenu(e, undefined);
  };

  const [debouncedSearch, setDebouncedSearch] = useState("");
  const searchTimerRef = useState<ReturnType<typeof setTimeout> | null>(null);

  useCreateFormDraftPersistence(
    `${WINDOW_FILTER_IDS.customers}:create`,
    currentOrganization?.id,
    isDialogOpen,
    formData,
    setIsDialogOpen,
    setFormData,
    { enabled: !editingCustomer },
  );

  useDashboardFilterPersistence(
    WINDOW_FILTER_IDS.customers,
    currentOrganization?.id,
    useMemo(
      () => ({ searchQuery, segmentFilter, currentPage }),
      [searchQuery, segmentFilter, currentPage],
    ),
    (saved) => {
      restoreDashboardFilters(saved, {
        strings: [
          ["searchQuery", (v) => {
            setSearchQuery(v);
            setDebouncedSearch(v);
          }],
          ["segmentFilter", (v) => setSegmentFilter(v as SegmentFilter)],
        ],
        numbers: [["currentPage", setCurrentPage]],
      });
    },
  );
  
  const handleSearchChange = (value: string) => {
    setSearchQuery(value);
    setCurrentPage(1);
    if (searchTimerRef[0]) clearTimeout(searchTimerRef[0]);
    searchTimerRef[0] = setTimeout(() => setDebouncedSearch(value), 300);
  };

  const { data: totalCount = 0 } = useQuery({
    queryKey: ["customers-count", currentOrganization?.id],
    queryFn: async () => {
      if (!currentOrganization?.id) return 0;
      const { count, error } = await supabase
        .from("customers")
        .select("id", { count: "exact", head: true })
        .eq("organization_id", currentOrganization.id)
        .is("deleted_at", null);
      if (error) throw error;
      return count || 0;
    },
    enabled: !!currentOrganization?.id,
    ...DASHBOARD_TAB_RETURN_QUERY_OPTIONS,
    staleTime: 60000,
  });

  const {
    data: segmentIndex,
    isLoading: segmentsLoading,
    isError: segmentsError,
    refetch: refetchSegments,
  } = useQuery({
    queryKey: ["customer-segments", currentOrganization?.id],
    queryFn: () => fetchCustomerSegmentIndex(currentOrganization!.id),
    enabled: !!currentOrganization?.id,
    ...DASHBOARD_TAB_RETURN_QUERY_OPTIONS,
    staleTime: 5 * 60 * 1000,
    retry: 2,
  });

  const { data: customersPage, isLoading } = useQuery({
    queryKey: ["customers", currentOrganization?.id, debouncedSearch, currentPage, segmentFilter],
    queryFn: async () => {
      if (!currentOrganization?.id) return { customers: [] as Customer[], filteredCount: 0 };

      const offset = (currentPage - 1) * ITEMS_PER_PAGE;
      const term = debouncedSearch.trim();
      const orgId = currentOrganization.id;

      const fetchByIds = async (ids: string[]) => {
        if (ids.length === 0) return [] as Customer[];
        const { data, error } = await supabase
          .from("customers")
          .select("*")
          .eq("organization_id", orgId)
          .is("deleted_at", null)
          .in("id", ids)
          .order("customer_name", { ascending: true });
        if (error) throw error;
        const orderMap = new Map(ids.map((id, i) => [id, i]));
        return ((data || []) as Customer[]).sort(
          (a, b) => (orderMap.get(a.id) ?? 0) - (orderMap.get(b.id) ?? 0),
        );
      };

      if (segmentFilter !== "all" && segmentIndex) {
        const segmentIds = Object.entries(segmentIndex.segments)
          .filter(([, seg]) => seg === segmentFilter)
          .map(([id]) => id)
          .sort((a, b) => {
            const sa = segmentIndex.stats[a]?.lastSaleDate ?? "";
            const sb = segmentIndex.stats[b]?.lastSaleDate ?? "";
            if (sa !== sb) return sb.localeCompare(sa);
            return (
              (segmentIndex.stats[b]?.revenue ?? 0) -
              (segmentIndex.stats[a]?.revenue ?? 0)
            );
          });

        if (segmentIds.length === 0) {
          return { customers: [], filteredCount: 0 };
        }

        if (term) {
          const { data: searchRows, error: searchErr } = await supabase
            .from("customers")
            .select("id")
            .eq("organization_id", orgId)
            .is("deleted_at", null)
            .or(
              `customer_name.ilike.%${term}%,phone.ilike.%${term}%,email.ilike.%${term}%`,
            );
          if (searchErr) throw searchErr;
          const idSet = new Set(segmentIds);
          const intersection = (searchRows || [])
            .map((r: { id: string }) => r.id)
            .filter((id) => idSet.has(id));
          const filteredCount = intersection.length;
          const pageIds = intersection.slice(offset, offset + ITEMS_PER_PAGE);
          const customers = await fetchByIds(pageIds);
          return { customers, filteredCount };
        }

        const filteredCount = segmentIds.length;
        const pageIds = segmentIds.slice(offset, offset + ITEMS_PER_PAGE);
        const customers = await fetchByIds(pageIds);
        return { customers, filteredCount };
      }

      let query = supabase
        .from("customers")
        .select("*", { count: "exact" })
        .eq("organization_id", orgId)
        .is("deleted_at", null);

      if (term) {
        query = query.or(
          `customer_name.ilike.%${term}%,phone.ilike.%${term}%,email.ilike.%${term}%`,
        );
      }

      const { data, error, count } = await query
        .order("created_at", { ascending: false })
        .order("id")
        .range(offset, offset + ITEMS_PER_PAGE - 1);

      if (error) throw error;
      return { customers: (data || []) as Customer[], filteredCount: count || 0 };
    },
    enabled: !!currentOrganization?.id && (segmentFilter === "all" || !!segmentIndex),
    ...DASHBOARD_TAB_RETURN_QUERY_OPTIONS,
    staleTime: STALE_LIVE,
  });

  const customers = customersPage?.customers || [];
  const filteredCount = customersPage?.filteredCount || 0;

  const visibleCustomerIds = customers.map(c => c.id);
  const { data: advanceBalances = {} } = useQuery({
    queryKey: ["customer-advances-summary", visibleCustomerIds],
    queryFn: async () => {
      if (!currentOrganization?.id || visibleCustomerIds.length === 0) return {};
      
      const { data, error } = await supabase
        .from("customer_advances")
        .select("customer_id, amount, used_amount")
        .eq("organization_id", currentOrganization.id)
        .in("status", ["active", "partially_used"])
        .in("customer_id", visibleCustomerIds);
      
      if (error) throw error;
      
      const balanceMap: Record<string, number> = {};
      data?.forEach(adv => {
        const available = (adv.amount || 0) - (adv.used_amount || 0);
        if (available > 0) {
          balanceMap[adv.customer_id] = (balanceMap[adv.customer_id] || 0) + available;
        }
      });
      return balanceMap;
    },
    enabled: !!currentOrganization?.id && visibleCustomerIds.length > 0,
    staleTime: 5 * 60 * 1000,
  });

  const createCustomer = useMutation({
    mutationFn: async (data: typeof formData) => {
      if (!currentOrganization?.id) throw new Error("No organization selected");
      if (!data.customer_name.trim() && !data.phone.trim()) throw new Error("Either customer name or phone number is required");
      const normalizedPhone = data.phone.trim() ? normalizePhoneNumber(data.phone) : null;
      
      if (normalizedPhone) {
        const { data: existingCustomers, error: checkError } = await supabase
          .from("customers")
          .select("id, customer_name, phone")
          .eq("organization_id", currentOrganization.id)
          .is("deleted_at", null);
        if (checkError) throw checkError;
        
        const duplicate = existingCustomers?.find(c => normalizePhoneNumber(c.phone) === normalizedPhone);
        if (duplicate) throw new Error(`Customer with this phone already exists: ${duplicate.customer_name || duplicate.phone}`);
      }
      
      const customerData: any = {
        customer_name: (data.customer_name.trim() || normalizedPhone || "WALK-IN").toUpperCase(),
        phone: normalizedPhone || null,
        email: data.email,
        address: data.address,
        gst_number: data.gst_number,
        opening_balance: data.opening_balance ? parseFloat(data.opening_balance) : 0,
        discount_percent: data.discount_percent ? parseFloat(data.discount_percent) : 0,
        transport_details: data.transport_details || null,
        portal_enabled: data.portal_enabled || false,
        organization_id: currentOrganization.id
      };
      const { error } = await supabase.from("customers").insert([customerData]);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["customers"] });
      queryClient.invalidateQueries({ queryKey: ["customer-segments"] });
      invalidateCustomers(currentOrganization?.id);
      toast({ title: "Customer created successfully" });
      resetForm();
      setIsDialogOpen(false);
    },
    onError: (error) => {
      toast({ title: "Error creating customer", description: error.message, variant: "destructive" });
    },
  });

  const updateCustomer = useMutation({
    mutationFn: async ({ id, data }: { id: string; data: typeof formData }) => {
      if (!currentOrganization?.id) throw new Error("No organization selected");
      if (!data.customer_name.trim() && !data.phone.trim()) throw new Error("Either customer name or phone number is required");
      const normalizedPhone = data.phone.trim() ? normalizePhoneNumber(data.phone) : null;
      
      if (normalizedPhone) {
        const { data: existingCustomers, error: checkError } = await supabase
          .from("customers")
          .select("id, customer_name, phone")
          .eq("organization_id", currentOrganization.id)
          .is("deleted_at", null)
          .neq("id", id);
        if (checkError) throw checkError;
        
        const duplicate = existingCustomers?.find(c => normalizePhoneNumber(c.phone) === normalizedPhone);
        if (duplicate) throw new Error(`Customer with this phone already exists: ${duplicate.customer_name || duplicate.phone}`);
      }
      
      const customerData: any = {
        customer_name: (data.customer_name.trim() || normalizedPhone || "WALK-IN").toUpperCase(),
        phone: normalizedPhone || null,
        email: data.email,
        address: data.address,
        gst_number: data.gst_number,
        opening_balance: data.opening_balance ? parseFloat(data.opening_balance) : 0,
        discount_percent: data.discount_percent ? parseFloat(data.discount_percent) : 0,
        transport_details: data.transport_details || null,
        portal_enabled: data.portal_enabled || false,
      };
      const { error } = await supabase.from("customers").update(customerData).eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["customers"] });
      queryClient.invalidateQueries({ queryKey: ["customer-segments"] });
      toast({ title: "Customer updated successfully" });
      resetForm();
      setIsDialogOpen(false);
    },
    onError: (error) => {
      toast({ title: "Error updating customer", description: error.message, variant: "destructive" });
    },
  });

  const { softDelete, bulkSoftDelete } = useSoftDelete();

  const deleteCustomer = useMutation({
    mutationFn: async (id: string) => {
      const success = await softDelete("customers", id);
      if (!success) throw new Error("Failed to delete customer");
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["customers"] });
      queryClient.invalidateQueries({ queryKey: ["customer-segments"] });
      toast({ title: "Customer moved to recycle bin" });
    },
    onError: (error: any) => {
      toast({ title: "Error deleting customer", description: error.message, variant: "destructive" });
    },
  });

  const bulkDeleteCustomers = useMutation({
    mutationFn: async (ids: string[]) => {
      const count = await bulkSoftDelete("customers", ids);
      if (count === 0) throw new Error("Failed to delete customers");
      return count;
    },
    onSuccess: (count) => {
      queryClient.invalidateQueries({ queryKey: ["customers"] });
      queryClient.invalidateQueries({ queryKey: ["customer-segments"] });
      toast({ title: `${count} customers moved to recycle bin` });
      setSelectedCustomers(new Set());
    },
    onError: (error: any) => {
      toast({ title: "Error deleting customers", description: error.message, variant: "destructive" });
    },
  });

  const resetForm = () => {
    setFormData({ customer_name: "", phone: "", email: "", address: "", gst_number: "", opening_balance: "", discount_percent: "", transport_details: "", portal_enabled: false });
    setEditingCustomer(null);
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (editingCustomer) {
      updateCustomer.mutate({ id: editingCustomer.id, data: formData });
    } else {
      createCustomer.mutate(formData);
    }
  };

  const handleEdit = (customer: Customer) => {
    setEditingCustomer(customer);
    setFormData({
      customer_name: customer.customer_name,
      phone: customer.phone || "",
      email: customer.email || "",
      address: customer.address || "",
      gst_number: customer.gst_number || "",
      opening_balance: customer.opening_balance?.toString() || "",
      discount_percent: customer.discount_percent?.toString() || "",
      transport_details: (customer as any).transport_details || "",
      portal_enabled: (customer as any).portal_enabled || false,
    });
    setIsDialogOpen(true);
  };

  const handleDelete = (id: string) => {
    if (confirm("Are you sure you want to delete this customer?")) {
      deleteCustomer.mutate(id);
    }
  };

  const totalPages = Math.max(1, Math.ceil(filteredCount / ITEMS_PER_PAGE));
  const startIndex = (currentPage - 1) * ITEMS_PER_PAGE;

  const handleSegmentFilter = (filter: SegmentFilter) => {
    setSegmentFilter(filter);
    setCurrentPage(1);
    setSelectedCustomers(new Set());
  };

  const handleSelectCustomer = (customerId: string, checked: boolean) => {
    const newSelected = new Set(selectedCustomers);
    if (checked) { newSelected.add(customerId); } else { newSelected.delete(customerId); }
    setSelectedCustomers(newSelected);
  };

  const handleBulkDelete = () => {
    if (selectedCustomers.size === 0) return;
    if (confirm(`Are you sure you want to delete ${selectedCustomers.size} customer(s)?`)) {
      bulkDeleteCustomers.mutate(Array.from(selectedCustomers));
    }
  };

  const isSomeSelected = selectedCustomers.size > 0;

  const segmentCounts = segmentIndex?.counts ?? {
    total: totalCount,
    vip: 0,
    regular: 0,
    risk: 0,
    lost: 0,
  };

  const segmentCards: {
    key: SegmentFilter;
    label: string;
    count: number;
    gradient: string;
    icon: React.ReactNode;
  }[] = [
    {
      key: "all",
      label: "Total Customers",
      count: segmentCounts.total || totalCount,
      gradient: "from-blue-500 to-blue-600",
      icon: <Users className="h-4 w-4 text-white" />,
    },
    {
      key: "regular",
      label: "Regular",
      count: segmentCounts.regular,
      gradient: "from-emerald-500 to-emerald-600",
      icon: <Users className="h-4 w-4 text-white" />,
    },
    {
      key: "vip",
      label: "VIP",
      count: segmentCounts.vip,
      gradient: "from-amber-500 to-amber-600",
      icon: <Crown className="h-4 w-4 text-white" />,
    },
    {
      key: "risk",
      label: "At Risk",
      count: segmentCounts.risk,
      gradient: "from-orange-500 to-orange-600",
      icon: <AlertTriangle className="h-4 w-4 text-white" />,
    },
    {
      key: "lost",
      label: "Lost",
      count: segmentCounts.lost,
      gradient: "from-slate-500 to-slate-600",
      icon: <UserX className="h-4 w-4 text-white" />,
    },
  ];

  const handleExcelImport = async (
    mappedData: Record<string, any>[],
    onProgress?: (progress: ImportProgress) => void
  ) => {
    if (!currentOrganization?.id) {
      toast({ title: "No organization selected", variant: "destructive" });
      return;
    }
    const BATCH_SIZE = 50;
    let successCount = 0;
    let errorCount = 0;
    let skippedCount = 0;

    const validRows = mappedData.filter(row => {
      const phone = normalizePhoneNumber(row.phone);
      return phone && phone.length > 0;
    });

    const { data: existingCustomers } = await supabase
      .from("customers")
      .select("phone")
      .eq("organization_id", currentOrganization.id)
      .is("deleted_at", null);
    
    const existingPhones = new Set(
      (existingCustomers || []).map(c => normalizePhoneNumber(c.phone)).filter(Boolean)
    );

    for (let i = 0; i < validRows.length; i += BATCH_SIZE) {
      const batch = validRows.slice(i, i + BATCH_SIZE);
      const customersToInsert: any[] = [];

      for (const row of batch) {
        const phone = normalizePhoneNumber(row.phone);
        if (existingPhones.has(phone)) { skippedCount++; continue; }
        customersToInsert.push({
          customer_name: (row.customer_name?.toString().trim() || phone).toUpperCase(),
          phone, email: row.email?.toString().trim() || '', address: row.address?.toString().trim() || '',
          gst_number: row.gst_number?.toString().trim() || '',
          opening_balance: row.opening_balance ? parseFloat(row.opening_balance) : 0,
          organization_id: currentOrganization.id,
        });
        existingPhones.add(phone);
      }

      if (customersToInsert.length > 0) {
        const { error } = await supabase.from("customers").insert(customersToInsert);
        if (error) { errorCount += customersToInsert.length; } else { successCount += customersToInsert.length; }
      }

      if (onProgress) {
        onProgress({ current: Math.min(i + BATCH_SIZE, validRows.length), total: validRows.length, successCount, errorCount, skippedCount, isImporting: true });
      }
    }

    queryClient.invalidateQueries({ queryKey: ["customers"] });
    queryClient.invalidateQueries({ queryKey: ["customer-segments"] });
    const skippedEmptyRows = mappedData.length - validRows.length;
    let description = `${successCount} customers imported`;
    if (skippedCount > 0) description += `, ${skippedCount} duplicates skipped`;
    if (skippedEmptyRows > 0) description += `, ${skippedEmptyRows} empty rows skipped`;
    if (errorCount > 0) description += `, ${errorCount} failed`;
    toast({ title: "Import completed", description });
    setShowExcelImport(false);
  };

  // ERPTable columns for Customer Master
  const tableColumns = useMemo<ColumnDef<Customer, any>[]>(() => [
    {
      id: "select",
      header: () => (
        <Checkbox
          checked={customers.length > 0 && customers.every(c => selectedCustomers.has(c.id))}
          onCheckedChange={(checked) => {
            if (checked) { setSelectedCustomers(new Set(customers.map(c => c.id))); }
            else { setSelectedCustomers(new Set()); }
          }}
          aria-label="Select all"
        />
      ),
      cell: ({ row }) => (
        <Checkbox
          checked={selectedCustomers.has(row.original.id)}
          onCheckedChange={(checked) => handleSelectCustomer(row.original.id, !!checked)}
          aria-label={`Select ${row.original.customer_name}`}
        />
      ),
      size: 48,
      enableResizing: false,
    },
    {
      id: "srNo",
      header: "Sr No",
      cell: ({ row }) => (
        <span className="tabular-nums text-muted-foreground text-[15px]">
          {startIndex + row.index + 1}
        </span>
      ),
      size: 64,
    },
    {
      id: "customer_name",
      accessorKey: "customer_name",
      header: "Customer Name",
      size: 200,
      cell: ({ row }) => (
        <span
          className="font-semibold text-primary cursor-pointer hover:underline"
          onClick={(e) => {
            e.stopPropagation();
            openCustomerAccount(row.original.id, row.original.customer_name);
          }}
        >
          {row.original.customer_name?.toUpperCase()}
        </span>
      ),
    },
    {
      id: "phone",
      accessorKey: "phone",
      header: "Mobile",
      size: 130,
      cell: ({ getValue }) => (
        <span className="tabular-nums text-[15px]">{getValue() || "-"}</span>
      ),
    },
    {
      id: "email",
      accessorKey: "email",
      header: "Email",
      size: 180,
      cell: ({ getValue }) => <span className="text-muted-foreground">{getValue() || "-"}</span>,
    },
    {
      id: "gst_number",
      accessorKey: "gst_number",
      header: "GST",
      size: 160,
      cell: ({ getValue }) => <span className="tabular-nums">{getValue() || "-"}</span>,
    },
    {
      id: "opening_balance",
      accessorKey: "opening_balance",
      header: "Opening Bal.",
      size: 130,
      cell: ({ getValue }) => {
        const val = getValue() as number | null;
        return <span className="text-right font-medium tabular-nums block">{val ? `₹${val.toLocaleString('en-IN')}` : "-"}</span>;
      },
    },
    {
      id: "advance",
      accessorFn: (row) => advanceBalances[row.id] || 0,
      header: "Advance",
      size: 120,
      cell: ({ row }) => {
        const adv = advanceBalances[row.original.id];
        return <span className="text-right font-medium tabular-nums block">{adv ? <span className="text-purple-600">₹{Math.round(adv).toLocaleString('en-IN')}</span> : "-"}</span>;
      },
    },
    {
      id: "discount_percent",
      accessorKey: "discount_percent",
      header: "Discount %",
      size: 100,
      cell: ({ getValue }) => {
        const val = getValue() as number | null;
        return <span className="text-right font-medium tabular-nums block">{val ? `${val}%` : "-"}</span>;
      },
    },
    {
      id: "segment",
      header: "Segment",
      size: 100,
      cell: ({ row }) => {
        if (segmentsLoading && !segmentIndex) {
          return <span className="text-muted-foreground text-sm">…</span>;
        }
        const seg = segmentIndex?.segments[row.original.id] ?? "regular";
        return (
          <span
            className={`px-2.5 py-0.5 rounded-full text-xs font-semibold border ${segmentBadgeClass(seg)}`}
          >
            {CUSTOMER_SEGMENT_LABELS[seg]}
          </span>
        );
      },
    },
    {
      id: "lifetime_sales",
      header: "Lifetime Sales",
      size: 130,
      cell: ({ row }) => {
        if (segmentsLoading && !segmentIndex) {
          return <span className="text-right text-muted-foreground text-sm">…</span>;
        }
        if (segmentsError) return <span className="text-right text-destructive text-sm">—</span>;
        const st = segmentIndex?.stats[row.original.id];
        return (
          <span className="text-right font-medium tabular-nums block text-[15px]">
            {st ? fmtInr(st.revenue) : "-"}
          </span>
        );
      },
    },
    {
      id: "orders",
      header: "Orders",
      size: 80,
      cell: ({ row }) => {
        if (segmentsLoading && !segmentIndex) {
          return <span className="text-right text-muted-foreground text-sm">…</span>;
        }
        if (segmentsError) return <span className="text-right text-destructive text-sm">—</span>;
        const st = segmentIndex?.stats[row.original.id];
        return (
          <span className="text-right tabular-nums block text-[15px]">
            {st ? st.orders : "-"}
          </span>
        );
      },
    },
    {
      id: "last_sale",
      header: "Last Sale",
      size: 110,
      cell: ({ row }) => {
        if (segmentsLoading && !segmentIndex) {
          return <span className="text-muted-foreground text-sm">…</span>;
        }
        if (segmentsError) return <span className="text-destructive text-sm">—</span>;
        const sd = segmentIndex?.stats[row.original.id]?.lastSaleDate;
        return <span className="tabular-nums text-muted-foreground text-[15px]">{sd || "-"}</span>;
      },
    },
    {
      id: "actions",
      header: "Actions",
      size: 160,
      cell: ({ row }) => {
        const customer = row.original;
        return (
          <div className="flex items-center justify-end gap-0.5">
            <button className="h-8 w-8 rounded-md hover:bg-muted flex items-center justify-center transition" onClick={() => navigate("/accounts?tab=customer-ledger&customer=" + customer.id)} title="Account Ledger">
              <BookOpen className="h-4 w-4 text-primary" />
            </button>
            <button className="h-8 w-8 rounded-md hover:bg-muted flex items-center justify-center transition" onClick={() => navigate(`/customer-ledger-report?customer=${customer.id}`)} title="Customer Ledger Report">
              <FileText className="h-4 w-4 text-primary" />
            </button>
            <button className="h-8 w-8 rounded-md hover:bg-muted flex items-center justify-center transition" onClick={() => { setSelectedCustomerForBrandDiscount({ id: customer.id, name: customer.customer_name }); setShowBrandDiscountDialog(true); }} title="Brand-wise Discount">
              <Tag className="h-4 w-4 text-muted-foreground" />
            </button>
            <button className="h-8 w-8 rounded-md hover:bg-muted flex items-center justify-center transition" onClick={() => handleEdit(customer)} title="Edit">
              <Pencil className="h-4 w-4 text-muted-foreground" />
            </button>
            <button className="h-8 w-8 rounded-md hover:bg-destructive/10 flex items-center justify-center transition" onClick={() => handleDelete(customer.id)} title="Delete">
              <Trash2 className="h-4 w-4 text-destructive/70" />
            </button>
          </div>
        );
      },
    },
  ], [
    customers,
    selectedCustomers,
    advanceBalances,
    startIndex,
    navigate,
    segmentIndex,
    segmentsLoading,
    segmentsError,
  ]);

  const isMobile = useIsMobile();

  if (isMobile) {
    return (
      <div className="flex flex-col min-h-screen bg-muted/30 pb-24">
        <MobilePageHeader
          title="Customers"
          subtitle={`${totalCount.toLocaleString()} records`}
          backTo="/"
          rightContent={
            <button
              onClick={() => { resetForm(); setIsDialogOpen(true); }}
              className="w-9 h-9 bg-primary rounded-xl flex items-center justify-center shadow-sm active:scale-90 touch-manipulation"
            >
              <Plus className="h-5 w-5 text-primary-foreground" />
            </button>
          }
        />

        {/* Search */}
        <div className="px-4 py-3 space-y-2">
          <div className="relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
            <Input
              placeholder="Search name, phone, email…"
              value={searchQuery}
              onChange={(e) => handleSearchChange(e.target.value)}
              className="pl-9 h-10 bg-background border-border/60 rounded-xl text-sm"
            />
          </div>
          <div className="flex gap-2 overflow-x-auto pb-1 -mx-1 px-1">
            {segmentCards.map((card) => (
              <button
                key={card.key}
                type="button"
                onClick={() => handleSegmentFilter(card.key)}
                className={cn(
                  "shrink-0 px-3 py-1.5 rounded-full text-xs font-semibold border transition-colors",
                  segmentFilter === card.key
                    ? "bg-primary text-primary-foreground border-primary"
                    : "bg-background text-muted-foreground border-border",
                )}
              >
                {card.label} ({segmentsLoading ? "…" : card.count})
              </button>
            ))}
          </div>
        </div>

        {/* Customer list */}
        <div className="flex-1 overflow-y-auto px-4 space-y-2">
          {isLoading ? (
            Array.from({ length: 6 }).map((_, i) => (
              <Skeleton key={i} className="h-20 w-full rounded-2xl" />
            ))
          ) : customers.length === 0 ? (
            <div className="text-center py-16">
              <Search className="h-10 w-10 text-muted-foreground/40 mx-auto mb-3" />
              <p className="text-sm text-muted-foreground">No customers found</p>
              <button
                onClick={() => { resetForm(); setIsDialogOpen(true); }}
                className="mt-3 px-5 py-2 bg-primary text-primary-foreground rounded-xl text-sm font-semibold"
              >
                Add Customer
              </button>
            </div>
          ) : (
            customers.map((c) => (
              <div
                key={c.id}
                className="bg-background rounded-2xl p-3.5 border border-border/40 shadow-sm"
              >
                <div className="flex items-start justify-between">
                  <div className="min-w-0 flex-1">
                    <p className="font-semibold text-sm text-foreground truncate">{c.customer_name?.toUpperCase()}</p>
                    {segmentIndex && (
                      <span
                        className={cn(
                          "inline-block mt-0.5 px-2 py-0.5 rounded-full text-[10px] font-semibold border",
                          segmentBadgeClass(segmentIndex.segments[c.id] ?? "regular"),
                        )}
                      >
                        {CUSTOMER_SEGMENT_LABELS[segmentIndex.segments[c.id] ?? "regular"]}
                        {segmentIndex.stats[c.id]?.revenue
                          ? ` · ${fmtInr(segmentIndex.stats[c.id].revenue)}`
                          : ""}
                      </span>
                    )}
                    {c.phone && (
                      <a href={`tel:${c.phone}`} className="text-xs text-primary font-medium" onClick={(e) => e.stopPropagation()}>
                        {c.phone}
                      </a>
                    )}
                    {c.address && <p className="text-[11px] text-muted-foreground truncate mt-0.5">{c.address}</p>}
                  </div>
                  <div className="flex items-center gap-1.5 shrink-0 ml-2">
                    {(c.opening_balance || 0) !== 0 && (
                      <span className={`text-[10px] font-semibold px-2 py-0.5 rounded-full border ${
                        (c.opening_balance || 0) > 0 ? "bg-amber-50 text-amber-700 border-amber-200" : "bg-emerald-50 text-emerald-700 border-emerald-200"
                      }`}>
                        ₹{Math.abs(c.opening_balance || 0).toLocaleString("en-IN")}
                      </span>
                    )}
                    {advanceBalances[c.id] > 0 && (
                      <span className="text-[10px] font-semibold px-2 py-0.5 rounded-full border bg-purple-50 text-purple-700 border-purple-200">
                        Adv ₹{Math.round(advanceBalances[c.id]).toLocaleString("en-IN")}
                      </span>
                    )}
                    <button
                      onClick={() => handleEdit(c)}
                      className="w-8 h-8 bg-muted rounded-lg flex items-center justify-center active:scale-90 touch-manipulation"
                    >
                      <Pencil className="h-3.5 w-3.5 text-muted-foreground" />
                    </button>
                    <button
                      onClick={() => {
                        openCustomerAccount(c.id, c.customer_name);
                      }}
                      className="w-8 h-8 bg-primary/10 rounded-lg flex items-center justify-center active:scale-90 touch-manipulation"
                    >
                      <Eye className="h-3.5 w-3.5 text-primary" />
                    </button>
                  </div>
                </div>
              </div>
            ))
          )}
        </div>

        {/* Pagination */}
        {totalPages > 1 && (
          <div className="flex items-center justify-between px-4 py-3 border-t border-border bg-background">
            <button onClick={() => setCurrentPage(p => Math.max(1, p - 1))} disabled={currentPage === 1}
              className="px-4 py-2 rounded-xl bg-muted text-sm font-medium disabled:opacity-40">← Prev</button>
            <span className="text-xs text-muted-foreground">Page {currentPage} of {totalPages}</span>
            <button onClick={() => setCurrentPage(p => Math.min(totalPages, p + 1))} disabled={currentPage === totalPages}
              className="px-4 py-2 rounded-xl bg-muted text-sm font-medium disabled:opacity-40">Next →</button>
          </div>
        )}

        <MobileBottomNav />

        {/* All existing dialogs */}
        <Dialog open={isDialogOpen} onOpenChange={(open) => { setIsDialogOpen(open); if (!open) resetForm(); }}>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>{editingCustomer ? "Edit Customer" : "Add New Customer"}</DialogTitle>
            </DialogHeader>
            <form onSubmit={handleSubmit} className="space-y-4">
              <div><Label htmlFor="m-phone">Mobile Number</Label><Input id="m-phone" value={formData.phone} onChange={(e) => setFormData({ ...formData, phone: e.target.value })} autoFocus placeholder="Enter mobile number (optional)" /></div>
              <div><Label htmlFor="m-name">Customer Name</Label><Input id="m-name" value={formData.customer_name} onChange={(e) => setFormData({ ...formData, customer_name: e.target.value })} placeholder="Enter customer name" /></div>
              <div><Label htmlFor="m-address">Address</Label><Textarea id="m-address" value={formData.address} onChange={(e) => setFormData({ ...formData, address: e.target.value })} /></div>
              <div><Label htmlFor="m-gst">GST Number</Label><Input id="m-gst" value={formData.gst_number} onChange={(e) => setFormData({ ...formData, gst_number: e.target.value })} /></div>
              <div><Label htmlFor="m-bal">Opening Balance (₹)</Label><Input id="m-bal" type="number" step="0.01" value={formData.opening_balance} onChange={(e) => setFormData({ ...formData, opening_balance: e.target.value })} /></div>
              <div className="flex items-center justify-between rounded-lg border p-3">
                <div>
                  <Label className="text-sm font-medium">Buyer Portal Access</Label>
                  <p className="text-xs text-muted-foreground">Customer can login and place orders</p>
                </div>
                <Switch checked={formData.portal_enabled} onCheckedChange={(checked) => setFormData({ ...formData, portal_enabled: !!checked })} />
              </div>
              <Button type="submit" className="w-full">{editingCustomer ? "Update" : "Create"} Customer</Button>
            </form>
          </DialogContent>
        </Dialog>

        <ExcelImportDialog open={showExcelImport} onClose={() => setShowExcelImport(false)} targetFields={customerMasterFields} onImport={handleExcelImport} sampleData={customerMasterSampleData} sampleFileName="Customer_Master_Sample.xlsx" title="Import Customers" />
        {currentOrganization?.id && <LegacyInvoiceImportDialog open={showLegacyImport} onOpenChange={setShowLegacyImport} organizationId={currentOrganization.id} />}
        <RelinkLegacyInvoicesDialog open={showRelinkDialog} onOpenChange={setShowRelinkDialog} />
        <UpdateLegacyPhonesDialog open={showUpdatePhonesDialog} onOpenChange={setShowUpdatePhonesDialog} />
        <BrandDiscountDialog open={showBrandDiscountDialog} onOpenChange={setShowBrandDiscountDialog} customer={selectedCustomerForBrandDiscount} />
        <CustomerBalanceImportDialog open={showBalanceImport} onOpenChange={setShowBalanceImport} />
      </div>
    );
  }

  return (
    <div className="bg-slate-50/50 min-h-screen pb-24 lg:pb-0" onContextMenu={handlePageContextMenu}>
      <div className="space-y-4 p-4">
        <div>
          <h1 className="text-2xl font-bold text-blue-700">Customer Master</h1>
          <p className="text-sm text-muted-foreground mt-0.5">
            Segments use lifetime sales: VIP = recent + (5+ orders or ₹50k+), Risk = 91–365 days, Lost = 365+ days.
          </p>
        </div>

        <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-4 w-full">
          {segmentCards.map((card) => (
            <Card
              key={card.key}
              className={cn(
                "cursor-pointer hover:shadow-xl transition-all duration-200 hover:scale-[1.02] bg-gradient-to-br border-0 shadow-md rounded-xl min-w-0",
                card.gradient,
                segmentFilter === card.key && "ring-4 ring-white ring-offset-2 ring-offset-slate-100 scale-[1.02]",
              )}
              onClick={() => handleSegmentFilter(card.key)}
              title={CUSTOMER_SEGMENT_HINTS[card.key]}
            >
              <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-1 pt-3 px-3">
                <CardDescription className="text-base font-medium text-white/80">
                  {card.label}
                </CardDescription>
                <div className="w-8 h-8 bg-white/20 rounded-lg flex items-center justify-center">
                  {card.icon}
                </div>
              </CardHeader>
              <CardContent className="px-3 pb-3 pt-0">
                <div className="text-2xl font-black text-white tabular-nums leading-tight truncate">
                  {segmentsLoading ? "…" : card.count.toLocaleString("en-IN")}
                </div>
                <p className="text-sm text-white/65 mt-0.5 line-clamp-2">
                  {CUSTOMER_SEGMENT_HINTS[card.key]}
                </p>
              </CardContent>
            </Card>
          ))}
        </div>

        {segmentsError && (
          <div className="flex flex-wrap items-center gap-3 rounded-lg border border-destructive/30 bg-destructive/5 px-4 py-2.5 text-sm">
            <span className="text-destructive font-medium">
              Could not load lifetime sales / segment data for this organization.
            </span>
            <Button variant="outline" size="sm" className="h-8" onClick={() => refetchSegments()}>
              <RefreshCw className="h-3.5 w-3.5 mr-1.5" />
              Retry
            </Button>
          </div>
        )}

        {segmentFilter !== "all" && (
          <p className="text-sm text-muted-foreground">
            Showing{" "}
            <span className="font-semibold text-foreground">
              {filteredCount.toLocaleString("en-IN")}
            </span>{" "}
            {CUSTOMER_SEGMENT_LABELS[segmentFilter]} customers
            {" · "}
            <button
              type="button"
              className="text-primary hover:underline font-medium"
              onClick={() => handleSegmentFilter("all")}
            >
              Clear filter
            </button>
          </p>
        )}

        <Card className="rounded-xl border border-slate-200 shadow-sm overflow-hidden p-0">
          <div className="flex flex-wrap items-center gap-2 px-4 py-2.5 border-b border-slate-100 bg-white">
            <span className="text-sm text-slate-500 bg-slate-100 px-2.5 py-1 rounded-full font-medium shrink-0">
              {segmentFilter === "all"
                ? `${filteredCount.toLocaleString("en-IN")} of ${totalCount.toLocaleString("en-IN")} records`
                : `${filteredCount.toLocaleString("en-IN")} in ${CUSTOMER_SEGMENT_LABELS[segmentFilter]}`}
            </span>

            <div className="relative flex-1 min-w-[200px] max-w-full sm:max-w-md md:max-w-lg">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-5 w-5 text-muted-foreground" />
              <Input
                placeholder="Search by name, phone, email..."
                value={searchQuery}
                onChange={(e) => handleSearchChange(e.target.value)}
                className="pl-11 h-10 text-base border-slate-200 bg-slate-50 focus:bg-white"
              />
            </div>

            <div id="erp-toolbar-portal-customer" className="flex items-center gap-1.5 ml-auto flex-shrink-0" />

            {isSomeSelected && (
              <Button
                variant="destructive"
                size="sm"
                className="h-10 text-sm px-4 shrink-0"
                onClick={handleBulkDelete}
                disabled={bulkDeleteCustomers.isPending}
              >
                <Trash2 className="h-4 w-4 mr-2" />
                Delete Selected ({selectedCustomers.size})
              </Button>
            )}

            <div className="flex gap-2 items-center shrink-0">
              <DropdownMenu>
                <DropdownMenuTrigger asChild>
                  <Button variant="outline" className="h-9 text-sm px-4 rounded-md">
                    <Settings2 className="h-4 w-4 mr-2" />
                    Tools
                    <ChevronDown className="h-3.5 w-3.5 ml-1.5" />
                  </Button>
                </DropdownMenuTrigger>
                <DropdownMenuContent align="end" className="w-56 bg-popover z-50">
                  <DropdownMenuItem onClick={() => setShowLegacyImport(true)}>
                    <History className="h-4 w-4 mr-2" />
                    Import Legacy Invoices
                  </DropdownMenuItem>
                  <DropdownMenuItem onClick={() => setShowUpdatePhonesDialog(true)}>
                    <Phone className="h-4 w-4 mr-2" />
                    Update Legacy Phones
                  </DropdownMenuItem>
                  <DropdownMenuItem onClick={() => setShowRelinkDialog(true)}>
                    <Link2 className="h-4 w-4 mr-2" />
                    Re-link Legacy
                  </DropdownMenuItem>
                  <DropdownMenuItem onClick={() => setShowBalanceImport(true)}>
                    <ArrowUpDown className="h-4 w-4 mr-2" />
                    Import Balances
                  </DropdownMenuItem>
                  <DropdownMenuItem onClick={() => setShowExcelImport(true)}>
                    <FileSpreadsheet className="h-4 w-4 mr-2" />
                    Import Customers
                  </DropdownMenuItem>
                </DropdownMenuContent>
              </DropdownMenu>
              <Dialog open={isDialogOpen} onOpenChange={(open) => { setIsDialogOpen(open); if (!open) resetForm(); }}>
                <DialogTrigger asChild>
                  <Button className="h-9 text-sm px-4 rounded-md">
                    <Plus className="h-4 w-4 mr-2" />
                    Add Customer
                  </Button>
                </DialogTrigger>
                <DialogContent className="sm:max-w-lg">
                  <DialogHeader>
                    <DialogTitle>{editingCustomer ? "Edit Customer" : "Add New Customer"}</DialogTitle>
                  </DialogHeader>
                  <form onSubmit={handleSubmit} className="space-y-3">
                    <div className="grid grid-cols-2 gap-3">
                      <div>
                        <Label htmlFor="phone" className="text-xs">Mobile Number</Label>
                        <Input id="phone" value={formData.phone} onChange={(e) => setFormData({ ...formData, phone: e.target.value })} autoFocus placeholder="Optional" className="h-9" />
                      </div>
                      <div>
                        <Label htmlFor="customer_name" className="text-xs">Customer Name</Label>
                        <Input id="customer_name" value={formData.customer_name} onChange={(e) => setFormData({ ...formData, customer_name: e.target.value })} placeholder="Optional" className="h-9" />
                      </div>
                    </div>
                    <div className="grid grid-cols-2 gap-3">
                      <div>
                        <Label htmlFor="email" className="text-xs">Email</Label>
                        <Input id="email" type="email" value={formData.email} onChange={(e) => setFormData({ ...formData, email: e.target.value })} className="h-9" />
                      </div>
                      <div>
                        <Label htmlFor="gst_number" className="text-xs">GST Number</Label>
                        <Input id="gst_number" value={formData.gst_number} onChange={(e) => setFormData({ ...formData, gst_number: e.target.value })} className="h-9" />
                      </div>
                    </div>
                    <div>
                      <Label htmlFor="address" className="text-xs">Address</Label>
                      <Textarea id="address" value={formData.address} onChange={(e) => setFormData({ ...formData, address: e.target.value })} className="min-h-[60px]" />
                    </div>
                    <div className="grid grid-cols-3 gap-3">
                      <div>
                        <Label htmlFor="opening_balance" className="text-xs">Opening Balance (₹)</Label>
                        <Input id="opening_balance" type="number" step="0.01" value={formData.opening_balance} onChange={(e) => setFormData({ ...formData, opening_balance: e.target.value })} placeholder="Receivable" className="h-9" />
                        <p className="text-[10px] text-muted-foreground mt-0.5">Positive = Receivable</p>
                      </div>
                      <div>
                        <Label htmlFor="discount_percent" className="text-xs">Discount %</Label>
                        <Input id="discount_percent" type="number" step="0.01" min="0" max="100" value={formData.discount_percent} onChange={(e) => setFormData({ ...formData, discount_percent: e.target.value })} placeholder="Fixed" className="h-9" />
                        <p className="text-[10px] text-muted-foreground mt-0.5">Auto-applied on POS</p>
                      </div>
                      <div>
                        <Label htmlFor="transport_details" className="text-xs">Transport</Label>
                        <Input id="transport_details" value={formData.transport_details} onChange={(e) => setFormData({ ...formData, transport_details: e.target.value })} placeholder="e.g., VRL" className="h-9" />
                      </div>
                    </div>
                    <div className="flex items-center justify-between rounded-lg border p-2.5">
                      <div>
                        <Label className="text-xs font-medium">Buyer Portal Access</Label>
                        <p className="text-[10px] text-muted-foreground">Customer can login to portal and place orders</p>
                      </div>
                      <Switch checked={formData.portal_enabled} onCheckedChange={(checked) => setFormData({ ...formData, portal_enabled: !!checked })} />
                    </div>
                    <Button type="submit" className="w-full h-9">{editingCustomer ? "Update" : "Create"} Customer</Button>
                  </form>
                </DialogContent>
              </Dialog>
            </div>
          </div>

          <ERPTable
            tableId="customer_master"
            columns={tableColumns}
            data={customers}
            stickyFirstColumn={false}
            isLoading={isLoading || (segmentFilter !== "all" && segmentsLoading)}
            emptyMessage={
              segmentFilter !== "all"
                ? `No ${CUSTOMER_SEGMENT_LABELS[segmentFilter].toLowerCase()} customers match your search`
                : "No customers found"
            }
            defaultColumnVisibility={CUSTOMER_MASTER_DEFAULT_COLUMN_VISIBILITY}
            defaultDensity="comfortable"
            className="[&_td]:!text-[15px] [&_th]:!text-[13px]"
            onRowContextMenu={handleRowContextMenu}
            showToolbar={false}
            renderToolbar={(toolbar) => {
              const el = document.getElementById("erp-toolbar-portal-customer");
              return el ? createPortal(toolbar, el) : toolbar;
            }}
          />

          {totalPages > 1 && (
            <div className="flex flex-wrap items-center justify-between gap-3 px-4 py-3 border-t border-slate-100 bg-white">
              <p className="text-sm text-slate-500 tabular-nums">
                Showing {startIndex + 1}–{Math.min(startIndex + ITEMS_PER_PAGE, filteredCount)} of{" "}
                {filteredCount.toLocaleString("en-IN")} customers
              </p>
              <div className="flex items-center gap-2">
                <Button
                  variant="outline"
                  size="sm"
                  className="h-9 text-sm border-slate-200"
                  onClick={() => setCurrentPage((p) => Math.max(1, p - 1))}
                  disabled={currentPage === 1}
                >
                  Previous
                </Button>
                <span className="text-sm text-slate-600 font-medium tabular-nums px-1">
                  Page {currentPage} of {totalPages}
                </span>
                <Button
                  variant="outline"
                  size="sm"
                  className="h-9 text-sm border-slate-200"
                  onClick={() => setCurrentPage((p) => Math.min(totalPages, p + 1))}
                  disabled={currentPage === totalPages}
                >
                  Next
                </Button>
              </div>
            </div>
          )}
        </Card>
      </div>

      <ExcelImportDialog
        open={showExcelImport}
        onClose={() => setShowExcelImport(false)}
        targetFields={customerMasterFields}
        onImport={handleExcelImport}
        sampleData={customerMasterSampleData}
        sampleFileName="Customer_Master_Sample.xlsx"
        title="Import Customers"
      />

      {currentOrganization?.id && (
        <LegacyInvoiceImportDialog open={showLegacyImport} onOpenChange={setShowLegacyImport} organizationId={currentOrganization.id} />
      )}

      <RelinkLegacyInvoicesDialog open={showRelinkDialog} onOpenChange={setShowRelinkDialog} />
      <UpdateLegacyPhonesDialog open={showUpdatePhonesDialog} onOpenChange={setShowUpdatePhonesDialog} />
      <BrandDiscountDialog open={showBrandDiscountDialog} onOpenChange={setShowBrandDiscountDialog} customer={selectedCustomerForBrandDiscount} />
      <CustomerBalanceImportDialog open={showBalanceImport} onOpenChange={setShowBalanceImport} />

      {isDesktop && (
        <>
          <DesktopContextMenu
            isOpen={rowContextMenu.isOpen}
            position={rowContextMenu.position}
            items={rowContextMenu.contextData ? getCustomerContextMenuItems(rowContextMenu.contextData) : []}
            onClose={rowContextMenu.closeMenu}
          />
          <PageContextMenu
            isOpen={pageContextMenu.isOpen}
            position={pageContextMenu.position}
            items={getPageContextMenuItems()}
            onClose={pageContextMenu.closeMenu}
            title="Quick Actions"
          />
        </>
      )}
    </div>
  );
};

export default CustomerMaster;
