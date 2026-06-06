import { useState, useMemo, type ReactNode } from "react";
import { useDashboardFilterPersistence } from "@/hooks/useDashboardFilterPersistence";
import { restoreDashboardFilters, WINDOW_FILTER_IDS } from "@/lib/dashboardFilterPersistence";
import { createPortal } from "react-dom";
import { useNavigate, useLocation } from "react-router-dom";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { STALE_LIVE } from "@/lib/queryStaleTimes";
import { supabase } from "@/integrations/supabase/client";
import { useOrganization } from "@/contexts/OrganizationContext";
import { useDashboardInvalidation } from "@/hooks/useDashboardInvalidation";
import { BackToDashboard } from "@/components/BackToDashboard";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
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
  BookOpen,
  Merge,
  Users,
  Crown,
  AlertTriangle,
  UserX,
  RefreshCw,
  Package,
} from "lucide-react";
import { Card, CardContent, CardDescription, CardHeader } from "@/components/ui/card";
import { cn } from "@/lib/utils";
import {
  fetchSupplierSegmentIndex,
  SUPPLIER_SEGMENT_HINTS,
  SUPPLIER_SEGMENT_LABELS,
  type SupplierSegment,
} from "@/utils/supplierSegments";
import { Checkbox } from "@/components/ui/checkbox";
import { useToast } from "@/hooks/use-toast";
import { useSoftDelete } from "@/hooks/useSoftDelete";
import { ExcelImportDialog, ImportProgress } from "@/components/ExcelImportDialog";
import { supplierMasterFields, supplierMasterSampleData, normalizePhoneNumber } from "@/utils/excelImportUtils";
import { FloatingSupplierLedger } from "@/components/FloatingSupplierLedger";
import { MergeSuppliersDialog } from "@/components/MergeSuppliersDialog";
import { ColumnDef } from "@tanstack/react-table";
import { ERPTable } from "@/components/erp-table";

interface Supplier {
  id: string;
  supplier_name: string;
  contact_person: string | null;
  phone: string | null;
  email: string | null;
  address: string | null;
  gst_number: string | null;
  supplier_code: string | null;
  opening_balance: number | null;
  created_at: string;
}

const ITEMS_PER_PAGE = 50;

/** Hidden by default; users can enable via Columns toolbar. */
const SUPPLIER_MASTER_DEFAULT_COLUMN_VISIBILITY: Record<string, boolean> = {
  email: false,
  gst_number: false,
  supplier_code: false,
};

type SegmentFilter = SupplierSegment | "all";

const fmtInr = (n: number) =>
  new Intl.NumberFormat("en-IN", {
    style: "currency",
    currency: "INR",
    maximumFractionDigits: 0,
  }).format(n || 0);

const segmentBadgeClass = (seg: SupplierSegment) => {
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

const SupplierMaster = () => {
  const [searchQuery, setSearchQuery] = useState("");
  const [segmentFilter, setSegmentFilter] = useState<SegmentFilter>("all");
  const [isDialogOpen, setIsDialogOpen] = useState(false);
  const [editingSupplier, setEditingSupplier] = useState<Supplier | null>(null);
  const [formData, setFormData] = useState({
    supplier_name: "",
    contact_person: "",
    phone: "",
    email: "",
    address: "",
    gst_number: "",
    supplier_code: "",
    opening_balance: "",
  });
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const { currentOrganization } = useOrganization();
  const { invalidateSuppliers } = useDashboardInvalidation();
  const navigate = useNavigate();
  const location = useLocation();
  const returnTo = (location.state as any)?.returnTo;
  const [showExcelImport, setShowExcelImport] = useState(false);
  const [selectedSuppliers, setSelectedSuppliers] = useState<Set<string>>(new Set());
  const [currentPage, setCurrentPage] = useState(1);
  const [historySupplier, setHistorySupplier] = useState<Supplier | null>(null);
  const [mergeSuppliers, setMergeSuppliers] = useState<Supplier[]>([]);

  // Debounced search for server-side filtering
  const [debouncedSearch, setDebouncedSearch] = useState("");
  const searchTimerRef = useState<ReturnType<typeof setTimeout> | null>(null);

  useDashboardFilterPersistence(
    WINDOW_FILTER_IDS.suppliers,
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

  // Get total count (lightweight)
  const { data: totalCount = 0 } = useQuery({
    queryKey: ["suppliers-count", currentOrganization?.id],
    queryFn: async () => {
      if (!currentOrganization?.id) return 0;
      const { count, error } = await supabase
        .from("suppliers")
        .select("id", { count: "exact", head: true })
        .eq("organization_id", currentOrganization.id)
        .is("deleted_at", null);
      if (error) throw error;
      return count || 0;
    },
    enabled: !!currentOrganization?.id,
    staleTime: 60000,
  });

  const {
    data: segmentIndex,
    isLoading: segmentsLoading,
    isError: segmentsError,
    refetch: refetchSegments,
  } = useQuery({
    queryKey: ["supplier-segments", currentOrganization?.id],
    queryFn: () => fetchSupplierSegmentIndex(currentOrganization!.id),
    enabled: !!currentOrganization?.id,
    staleTime: 5 * 60 * 1000,
    refetchOnWindowFocus: false,
    retry: 2,
  });

  // Server-side paginated + searched query (with optional segment filter)
  const { data: suppliersPage, isLoading } = useQuery({
    queryKey: ["suppliers", currentOrganization?.id, debouncedSearch, currentPage, segmentFilter],
    queryFn: async () => {
      if (!currentOrganization?.id) return { suppliers: [] as Supplier[], filteredCount: 0 };

      const offset = (currentPage - 1) * ITEMS_PER_PAGE;
      const term = debouncedSearch.trim();
      const orgId = currentOrganization.id;

      const fetchByIds = async (ids: string[]) => {
        if (ids.length === 0) return [] as Supplier[];
        const { data, error } = await supabase
          .from("suppliers")
          .select("*")
          .eq("organization_id", orgId)
          .is("deleted_at", null)
          .in("id", ids)
          .order("supplier_name", { ascending: true });
        if (error) throw error;
        const orderMap = new Map(ids.map((id, i) => [id, i]));
        return ((data || []) as Supplier[]).sort(
          (a, b) => (orderMap.get(a.id) ?? 0) - (orderMap.get(b.id) ?? 0),
        );
      };

      if (segmentFilter !== "all" && segmentIndex) {
        const segmentIds = Object.entries(segmentIndex.segments)
          .filter(([, seg]) => seg === segmentFilter)
          .map(([id]) => id)
          .sort((a, b) => {
            const sa = segmentIndex.stats[a]?.lastPurchaseDate ?? "";
            const sb = segmentIndex.stats[b]?.lastPurchaseDate ?? "";
            if (sa !== sb) return sb.localeCompare(sa);
            return (
              (segmentIndex.stats[b]?.purchaseTotal ?? 0) -
              (segmentIndex.stats[a]?.purchaseTotal ?? 0)
            );
          });

        if (segmentIds.length === 0) {
          return { suppliers: [], filteredCount: 0 };
        }

        if (term) {
          const { data: searchRows, error: searchErr } = await supabase
            .from("suppliers")
            .select("id")
            .eq("organization_id", orgId)
            .is("deleted_at", null)
            .or(
              `supplier_name.ilike.%${term}%,contact_person.ilike.%${term}%,phone.ilike.%${term}%,supplier_code.ilike.%${term}%`,
            );
          if (searchErr) throw searchErr;
          const idSet = new Set(segmentIds);
          const intersection = (searchRows || [])
            .map((r: { id: string }) => r.id)
            .filter((id) => idSet.has(id));
          const filteredCount = intersection.length;
          const pageIds = intersection.slice(offset, offset + ITEMS_PER_PAGE);
          const suppliers = await fetchByIds(pageIds);
          return { suppliers, filteredCount };
        }

        const filteredCount = segmentIds.length;
        const pageIds = segmentIds.slice(offset, offset + ITEMS_PER_PAGE);
        const suppliers = await fetchByIds(pageIds);
        return { suppliers, filteredCount };
      }

      let query = supabase
        .from("suppliers")
        .select("*", { count: "exact" })
        .eq("organization_id", orgId)
        .is("deleted_at", null);

      if (term) {
        query = query.or(
          `supplier_name.ilike.%${term}%,contact_person.ilike.%${term}%,phone.ilike.%${term}%,supplier_code.ilike.%${term}%`,
        );
      }

      const { data, error, count } = await query
        .order("created_at", { ascending: false })
        .order("id")
        .range(offset, offset + ITEMS_PER_PAGE - 1);

      if (error) throw error;
      return { suppliers: (data || []) as Supplier[], filteredCount: count || 0 };
    },
    enabled: !!currentOrganization?.id && (segmentFilter === "all" || !!segmentIndex),
    staleTime: STALE_LIVE,
    refetchOnWindowFocus: false,
  });

  const suppliers = suppliersPage?.suppliers || [];
  const filteredCount = suppliersPage?.filteredCount || 0;

  const createSupplier = useMutation({
    mutationFn: async (data: typeof formData) => {
      if (!currentOrganization?.id) throw new Error("No organization selected");
      
      // Check for duplicate supplier name
      const { data: existing } = await supabase
        .from("suppliers")
        .select("id, supplier_name")
        .eq("organization_id", currentOrganization.id)
        .ilike("supplier_name", data.supplier_name.trim())
        .is("deleted_at", null)
        .limit(1);
      
      if (existing && existing.length > 0) {
        throw new Error(`Supplier "${existing[0].supplier_name}" already exists. Use the merge feature if you have duplicates.`);
      }
      
      const { data: newSupplier, error } = await supabase.from("suppliers").insert([{
        supplier_name: data.supplier_name.trim(),
        contact_person: data.contact_person,
        phone: data.phone,
        email: data.email,
        address: data.address,
        gst_number: data.gst_number,
        supplier_code: data.supplier_code,
        opening_balance: data.opening_balance ? parseFloat(data.opening_balance) : 0,
        organization_id: currentOrganization.id
      }]).select().single();
      if (error) throw error;
      return newSupplier;
    },
    onSuccess: (newSupplier) => {
      queryClient.invalidateQueries({ queryKey: ["suppliers"] });
      queryClient.invalidateQueries({ queryKey: ["supplier-segments"] });
      invalidateSuppliers();
      toast({ title: "Supplier created successfully" });
      resetForm();
      setIsDialogOpen(false);
      if (returnTo === "/purchase-entry") {
        navigate("/purchase-entry", { state: { createdSupplier: newSupplier } });
      }
    },
    onError: (error) => {
      toast({ title: "Error creating supplier", description: error.message, variant: "destructive" });
    },
  });

  const updateSupplier = useMutation({
    mutationFn: async ({ id, data }: { id: string; data: typeof formData }) => {
      const supplierData = {
        supplier_name: data.supplier_name,
        contact_person: data.contact_person,
        phone: data.phone,
        email: data.email,
        address: data.address,
        gst_number: data.gst_number,
        supplier_code: data.supplier_code,
        opening_balance: data.opening_balance ? parseFloat(data.opening_balance) : 0,
      };
      const { error } = await supabase.from("suppliers").update(supplierData).eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["suppliers"] });
      queryClient.invalidateQueries({ queryKey: ["supplier-segments"] });
      toast({ title: "Supplier updated successfully" });
      resetForm();
      setIsDialogOpen(false);
    },
    onError: (error) => {
      toast({ title: "Error updating supplier", description: error.message, variant: "destructive" });
    },
  });

  const { softDelete, bulkSoftDelete } = useSoftDelete();

  const deleteSupplier = useMutation({
    mutationFn: async (id: string) => {
      const success = await softDelete("suppliers", id);
      if (!success) throw new Error("Failed to delete supplier");
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["suppliers"] });
      queryClient.invalidateQueries({ queryKey: ["supplier-segments"] });
      toast({ title: "Supplier moved to recycle bin" });
    },
    onError: (error: any) => {
      toast({ title: "Error deleting supplier", description: error.message, variant: "destructive" });
    },
  });

  const bulkDeleteSuppliers = useMutation({
    mutationFn: async (ids: string[]) => {
      const count = await bulkSoftDelete("suppliers", ids);
      if (count === 0) throw new Error("Failed to delete suppliers");
      return count;
    },
    onSuccess: (count) => {
      queryClient.invalidateQueries({ queryKey: ["suppliers"] });
      queryClient.invalidateQueries({ queryKey: ["supplier-segments"] });
      toast({ title: `${count} suppliers moved to recycle bin` });
      setSelectedSuppliers(new Set());
    },
    onError: (error: any) => {
      toast({ title: "Error deleting suppliers", description: error.message, variant: "destructive" });
    },
  });

  const handleSelectAll = (checked: boolean) => {
    if (checked) {
      setSelectedSuppliers(new Set(suppliers.map(s => s.id)));
    } else {
      setSelectedSuppliers(new Set());
    }
  };

  const handleSelectSupplier = (supplierId: string, checked: boolean) => {
    const newSelected = new Set(selectedSuppliers);
    if (checked) {
      newSelected.add(supplierId);
    } else {
      newSelected.delete(supplierId);
    }
    setSelectedSuppliers(newSelected);
  };

  const handleBulkDelete = () => {
    if (confirm(`Are you sure you want to delete ${selectedSuppliers.size} suppliers?`)) {
      bulkDeleteSuppliers.mutate(Array.from(selectedSuppliers));
    }
  };

  const resetForm = () => {
    setFormData({
      supplier_name: "",
      contact_person: "",
      phone: "",
      email: "",
      address: "",
      gst_number: "",
      supplier_code: "",
      opening_balance: "",
    });
    setEditingSupplier(null);
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (editingSupplier) {
      updateSupplier.mutate({ id: editingSupplier.id, data: formData });
    } else {
      createSupplier.mutate(formData);
    }
  };

  const handleEdit = (supplier: Supplier) => {
    setEditingSupplier(supplier);
    setFormData({
      supplier_name: supplier.supplier_name,
      contact_person: supplier.contact_person || "",
      phone: supplier.phone || "",
      email: supplier.email || "",
      address: supplier.address || "",
      gst_number: supplier.gst_number || "",
      supplier_code: supplier.supplier_code || "",
      opening_balance: supplier.opening_balance?.toString() || "",
    });
    setIsDialogOpen(true);
  };

  const handleDelete = (id: string) => {
    if (confirm("Are you sure you want to delete this supplier?")) {
      deleteSupplier.mutate(id);
    }
  };

  const totalPages = Math.ceil(filteredCount / ITEMS_PER_PAGE);
  const startIndex = (currentPage - 1) * ITEMS_PER_PAGE;

  const handleSegmentFilter = (filter: SegmentFilter) => {
    setSegmentFilter(filter);
    setCurrentPage(1);
    setSelectedSuppliers(new Set());
  };

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
    icon: ReactNode;
  }[] = [
    {
      key: "all",
      label: "Total Suppliers",
      count: segmentCounts.total || totalCount,
      gradient: "from-blue-500 to-blue-600",
      icon: <Package className="h-4 w-4 text-white" />,
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
      const supplierName = row.supplier_name?.toString().trim();
      return supplierName && supplierName.length > 0;
    });

    const { data: existingSuppliers } = await supabase
      .from("suppliers")
      .select("supplier_name")
      .eq("organization_id", currentOrganization.id)
      .is("deleted_at", null);
    
    const existingNames = new Set(
      (existingSuppliers || [])
        .map(s => s.supplier_name?.toString().trim().toLowerCase())
        .filter(Boolean)
    );

    for (let i = 0; i < validRows.length; i += BATCH_SIZE) {
      const batch = validRows.slice(i, i + BATCH_SIZE);
      const suppliersToInsert: any[] = [];

      for (const row of batch) {
        const supplierName = row.supplier_name?.toString().trim();
        if (existingNames.has(supplierName.toLowerCase())) {
          skippedCount++;
          continue;
        }
        suppliersToInsert.push({
          supplier_name: supplierName,
          contact_person: row.contact_person?.toString().trim() || '',
          phone: normalizePhoneNumber(row.phone),
          email: row.email?.toString().trim() || '',
          address: row.address?.toString().trim() || '',
          gst_number: row.gst_number?.toString().trim() || '',
          supplier_code: row.supplier_code?.toString().trim() || '',
          opening_balance: row.opening_balance ? parseFloat(row.opening_balance) : 0,
          organization_id: currentOrganization.id,
        });
        existingNames.add(supplierName.toLowerCase());
      }

      if (suppliersToInsert.length > 0) {
        const { error } = await supabase.from("suppliers").insert(suppliersToInsert);
        if (error) {
          console.error('Batch insert error:', error);
          errorCount += suppliersToInsert.length;
        } else {
          successCount += suppliersToInsert.length;
        }
      }

      if (onProgress) {
        onProgress({
          current: Math.min(i + BATCH_SIZE, validRows.length),
          total: validRows.length,
          successCount,
          errorCount,
          skippedCount,
          isImporting: true,
        });
      }
    }

    queryClient.invalidateQueries({ queryKey: ["suppliers"] });
    queryClient.invalidateQueries({ queryKey: ["supplier-segments"] });
    const skippedEmptyRows = mappedData.length - validRows.length;
    let description = `${successCount} suppliers imported`;
    if (skippedCount > 0) description += `, ${skippedCount} duplicates skipped`;
    if (skippedEmptyRows > 0) description += `, ${skippedEmptyRows} empty rows skipped`;
    if (errorCount > 0) description += `, ${errorCount} failed`;
    toast({ title: "Import completed", description });
    setShowExcelImport(false);
  };

  // ERPTable columns
  const tableColumns = useMemo<ColumnDef<Supplier, any>[]>(() => [
    {
      id: "select",
      header: () => (
        <Checkbox
          checked={suppliers.length > 0 && suppliers.every((s) => selectedSuppliers.has(s.id))}
          onCheckedChange={handleSelectAll}
          aria-label="Select all"
        />
      ),
      cell: ({ row }) => (
        <Checkbox
          checked={selectedSuppliers.has(row.original.id)}
          onCheckedChange={(checked) => handleSelectSupplier(row.original.id, !!checked)}
          onClick={(e) => e.stopPropagation()}
          aria-label={`Select ${row.original.supplier_name}`}
        />
      ),
      size: 48,
      enableResizing: false,
    },
    {
      id: "sr_no",
      header: "Sr No",
      cell: ({ row }) => (
        <span className="tabular-nums text-muted-foreground text-[15px]">
          {startIndex + row.index + 1}
        </span>
      ),
      size: 64,
    },
    {
      accessorKey: "supplier_name",
      header: "Supplier Name",
      cell: ({ row }) => (
        <span
          className="font-semibold text-primary cursor-pointer hover:underline text-[15px]"
          onClick={(e) => {
            e.stopPropagation();
            setHistorySupplier(row.original);
          }}
        >
          {row.original.supplier_name?.toUpperCase()}
        </span>
      ),
      size: 200,
    },
    {
      accessorKey: "contact_person",
      header: "Contact Person",
      cell: ({ row }) => <span className="text-[15px]">{row.original.contact_person || "-"}</span>,
      size: 150,
    },
    {
      accessorKey: "phone",
      header: "Phone",
      cell: ({ row }) => (
        <span className="tabular-nums text-[15px]">{row.original.phone || "-"}</span>
      ),
      size: 130,
    },
    {
      accessorKey: "email",
      header: "Email",
      cell: ({ row }) => (
        <span className="text-muted-foreground text-[15px]">{row.original.email || "-"}</span>
      ),
      size: 180,
    },
    {
      accessorKey: "gst_number",
      header: "GST",
      cell: ({ row }) => (
        <span className="tabular-nums text-[15px]">{row.original.gst_number || "-"}</span>
      ),
      size: 160,
    },
    {
      accessorKey: "supplier_code",
      header: "Supplier Code",
      cell: ({ row }) =>
        row.original.supplier_code ? (
          <Badge variant="secondary" className="font-mono text-xs">
            {row.original.supplier_code}
          </Badge>
        ) : (
          "-"
        ),
      size: 120,
    },
    {
      accessorKey: "opening_balance",
      header: "Opening Bal.",
      cell: ({ row }) => {
        const val = row.original.opening_balance;
        return (
          <span className="text-right font-medium tabular-nums block text-[15px]">
            {val ? `₹${val.toLocaleString("en-IN")}` : "-"}
          </span>
        );
      },
      size: 120,
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
            {SUPPLIER_SEGMENT_LABELS[seg]}
          </span>
        );
      },
    },
    {
      id: "lifetime_purchases",
      header: "Lifetime Purchases",
      size: 140,
      cell: ({ row }) => {
        if (segmentsLoading && !segmentIndex) {
          return <span className="text-right text-muted-foreground text-sm">…</span>;
        }
        if (segmentsError) return <span className="text-right text-destructive text-sm">—</span>;
        const st = segmentIndex?.stats[row.original.id];
        return (
          <span className="text-right font-medium tabular-nums block text-[15px]">
            {st ? fmtInr(st.purchaseTotal) : "-"}
          </span>
        );
      },
    },
    {
      id: "bills",
      header: "Bills",
      size: 80,
      cell: ({ row }) => {
        if (segmentsLoading && !segmentIndex) {
          return <span className="text-right text-muted-foreground text-sm">…</span>;
        }
        if (segmentsError) return <span className="text-right text-destructive text-sm">—</span>;
        const st = segmentIndex?.stats[row.original.id];
        return (
          <span className="text-right tabular-nums block text-[15px]">
            {st ? st.bills : "-"}
          </span>
        );
      },
    },
    {
      id: "last_purchase",
      header: "Last Purchase",
      size: 120,
      cell: ({ row }) => {
        if (segmentsLoading && !segmentIndex) {
          return <span className="text-muted-foreground text-sm">…</span>;
        }
        if (segmentsError) return <span className="text-destructive text-sm">—</span>;
        const pd = segmentIndex?.stats[row.original.id]?.lastPurchaseDate;
        return <span className="tabular-nums text-muted-foreground text-[15px]">{pd || "-"}</span>;
      },
    },
    {
      id: "actions",
      header: "Actions",
      size: 140,
      cell: ({ row }) => (
        <div className="flex items-center justify-end gap-0.5">
          <button
            type="button"
            className="h-8 w-8 rounded-md hover:bg-muted flex items-center justify-center transition"
            onClick={(e) => {
              e.stopPropagation();
              setHistorySupplier(row.original);
            }}
            title="View Ledger"
          >
            <BookOpen className="h-4 w-4 text-primary" />
          </button>
          <button
            type="button"
            className="h-8 w-8 rounded-md hover:bg-muted flex items-center justify-center transition"
            onClick={(e) => {
              e.stopPropagation();
              handleEdit(row.original);
            }}
            title="Edit"
          >
            <Pencil className="h-4 w-4 text-muted-foreground" />
          </button>
          <button
            type="button"
            className="h-8 w-8 rounded-md hover:bg-destructive/10 flex items-center justify-center transition"
            onClick={(e) => {
              e.stopPropagation();
              handleDelete(row.original.id);
            }}
            title="Delete"
          >
            <Trash2 className="h-4 w-4 text-destructive/70" />
          </button>
        </div>
      ),
    },
  ], [
    suppliers,
    selectedSuppliers,
    startIndex,
    segmentIndex,
    segmentsLoading,
    segmentsError,
  ]);

  return (
    <div className="bg-slate-50/50 min-h-screen pb-24 lg:pb-0">
      <div className="space-y-4 p-4">
        <BackToDashboard />
        <div>
          <h1 className="text-2xl font-bold text-blue-700">Supplier Master</h1>
          <p className="text-sm text-muted-foreground mt-0.5">
            Segments use lifetime purchases: VIP = recent + (5+ bills or ₹50k+), Risk = 91–365 days, Lost = 365+ days.
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
              title={SUPPLIER_SEGMENT_HINTS[card.key]}
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
                  {SUPPLIER_SEGMENT_HINTS[card.key]}
                </p>
              </CardContent>
            </Card>
          ))}
        </div>

        {segmentsError && (
          <div className="flex flex-wrap items-center gap-3 rounded-lg border border-destructive/30 bg-destructive/5 px-4 py-2.5 text-sm">
            <span className="text-destructive font-medium">
              Could not load lifetime purchase / segment data for this organization.
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
            {SUPPLIER_SEGMENT_LABELS[segmentFilter]} suppliers
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
                : `${filteredCount.toLocaleString("en-IN")} in ${SUPPLIER_SEGMENT_LABELS[segmentFilter]}`}
            </span>

            <div className="relative flex-1 min-w-[200px] max-w-full sm:max-w-md md:max-w-lg">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-5 w-5 text-muted-foreground" />
              <Input
                placeholder="Search by name, phone, contact..."
                value={searchQuery}
                onChange={(e) => handleSearchChange(e.target.value)}
                className="pl-11 h-10 text-base border-slate-200 bg-slate-50 focus:bg-white"
              />
            </div>

            <div id="erp-toolbar-portal-supplier" className="flex items-center gap-1.5 ml-auto flex-shrink-0" />

            {selectedSuppliers.size > 0 && (
              <Button
                variant="destructive"
                size="sm"
                className="h-10 text-sm px-4 shrink-0"
                onClick={handleBulkDelete}
                disabled={bulkDeleteSuppliers.isPending}
              >
                <Trash2 className="h-4 w-4 mr-2" />
                Delete Selected ({selectedSuppliers.size})
              </Button>
            )}

            {selectedSuppliers.size >= 2 && (
              <Button
                variant="outline"
                size="sm"
                className="h-10 text-sm px-4 shrink-0"
                onClick={() => {
                  const selected = suppliers.filter((s) => selectedSuppliers.has(s.id));
                  setMergeSuppliers(selected);
                }}
              >
                <Merge className="h-4 w-4 mr-2" />
                Merge Selected
              </Button>
            )}

            <div className="flex gap-2 items-center shrink-0">
              <Button
                variant="outline"
                className="h-9 text-sm px-4 rounded-md"
                onClick={() => setShowExcelImport(true)}
              >
                <FileSpreadsheet className="h-4 w-4 mr-2" />
                Import Excel
              </Button>
              <Dialog open={isDialogOpen} onOpenChange={(open) => { setIsDialogOpen(open); if (!open) resetForm(); }}>
                <DialogTrigger asChild>
                  <Button className="h-9 text-sm px-4 rounded-md">
                    <Plus className="h-4 w-4 mr-2" />
                    Add Supplier
                  </Button>
                </DialogTrigger>
                <DialogContent className="sm:max-w-lg">
                  <DialogHeader>
                    <DialogTitle>{editingSupplier ? "Edit Supplier" : "Add New Supplier"}</DialogTitle>
                  </DialogHeader>
                  <form onSubmit={handleSubmit} className="space-y-4">
                    <div>
                      <Label htmlFor="supplier_name">Supplier Name *</Label>
                      <Input id="supplier_name" value={formData.supplier_name} onChange={(e) => setFormData({ ...formData, supplier_name: e.target.value })} required className="h-9" />
                    </div>
                    <div>
                      <Label htmlFor="contact_person">Contact Person</Label>
                      <Input id="contact_person" value={formData.contact_person} onChange={(e) => setFormData({ ...formData, contact_person: e.target.value })} className="h-9" />
                    </div>
                    <div>
                      <Label htmlFor="phone">Phone</Label>
                      <Input id="phone" value={formData.phone} onChange={(e) => setFormData({ ...formData, phone: e.target.value })} className="h-9" />
                    </div>
                    <div>
                      <Label htmlFor="email">Email</Label>
                      <Input id="email" type="email" value={formData.email} onChange={(e) => setFormData({ ...formData, email: e.target.value })} className="h-9" />
                    </div>
                    <div>
                      <Label htmlFor="address">Address</Label>
                      <Textarea id="address" value={formData.address} onChange={(e) => setFormData({ ...formData, address: e.target.value })} className="min-h-[60px]" />
                    </div>
                    <div>
                      <Label htmlFor="gst_number">GST Number</Label>
                      <Input id="gst_number" value={formData.gst_number} onChange={(e) => setFormData({ ...formData, gst_number: e.target.value })} className="h-9" />
                    </div>
                    <div>
                      <Label htmlFor="supplier_code">Supplier Code</Label>
                      <Input id="supplier_code" value={formData.supplier_code} onChange={(e) => setFormData({ ...formData, supplier_code: e.target.value })} placeholder="Optional — shown on barcode labels" className="h-9" />
                    </div>
                    <div>
                      <Label htmlFor="opening_balance">Opening Balance (₹)</Label>
                      <Input id="opening_balance" type="number" step="0.01" value={formData.opening_balance} onChange={(e) => setFormData({ ...formData, opening_balance: e.target.value })} placeholder="Payable to supplier" className="h-9" />
                      <p className="text-[10px] text-muted-foreground mt-0.5">Positive = Payable to supplier</p>
                    </div>
                    <Button type="submit" className="w-full h-9">{editingSupplier ? "Update" : "Create"} Supplier</Button>
                  </form>
                </DialogContent>
              </Dialog>
            </div>
          </div>

          <ERPTable<Supplier>
            tableId="supplier_master"
            columns={tableColumns}
            data={suppliers}
            stickyFirstColumn={false}
            isLoading={isLoading || (segmentFilter !== "all" && segmentsLoading)}
            emptyMessage={
              segmentFilter !== "all"
                ? `No ${SUPPLIER_SEGMENT_LABELS[segmentFilter].toLowerCase()} suppliers match your search`
                : "No suppliers found"
            }
            defaultColumnVisibility={SUPPLIER_MASTER_DEFAULT_COLUMN_VISIBILITY}
            defaultDensity="comfortable"
            className="[&_td]:!text-[15px] [&_th]:!text-[13px]"
            showToolbar={false}
            renderToolbar={(toolbar) => {
              const el = document.getElementById("erp-toolbar-portal-supplier");
              return el ? createPortal(toolbar, el) : toolbar;
            }}
          />

          {totalPages > 1 && (
            <div className="flex flex-wrap items-center justify-between gap-3 px-4 py-3 border-t border-slate-100 bg-white">
              <p className="text-sm text-slate-500 tabular-nums">
                Showing {startIndex + 1}–{Math.min(startIndex + ITEMS_PER_PAGE, filteredCount)} of{" "}
                {filteredCount.toLocaleString("en-IN")} suppliers
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
        targetFields={supplierMasterFields}
        onImport={handleExcelImport}
        sampleData={supplierMasterSampleData}
        sampleFileName="Supplier_Master_Sample.xlsx"
        title="Import Suppliers"
        importType="supplier"
      />

      {historySupplier && currentOrganization && (
        <FloatingSupplierLedger
          isOpen={!!historySupplier}
          onClose={() => setHistorySupplier(null)}
          supplierId={historySupplier.id}
          supplierName={historySupplier.supplier_name}
          supplierPhone={historySupplier.phone}
          organizationId={currentOrganization.id}
        />
      )}

      <MergeSuppliersDialog
        open={mergeSuppliers.length >= 2}
        onOpenChange={(open) => { if (!open) setMergeSuppliers([]); }}
        suppliers={mergeSuppliers}
        onMergeComplete={() => {
          queryClient.invalidateQueries({ queryKey: ["suppliers"] });
          queryClient.invalidateQueries({ queryKey: ["supplier-segments"] });
          setSelectedSuppliers(new Set());
          setMergeSuppliers([]);
        }}
      />
    </div>
  );
};

export default SupplierMaster;
