import { useState, useEffect } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useOrganization } from "@/contexts/OrganizationContext";
import { SoftDeleteEntity, useSoftDelete } from "@/hooks/useSoftDelete";
import { useUserPermissions } from "@/hooks/useUserPermissions";
import { useProductProtection } from "@/hooks/useProductProtection";
import { ProductRelationDialog } from "@/components/ProductRelationDialog";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Table, TableBody, TableCell, TableRow } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from "@/components/ui/alert-dialog";
import { Trash2, Search, Archive, Users, Truck, Package, ShoppingCart, FileText, Receipt, Loader2, RotateCcw, ArrowLeft } from "lucide-react";
import { ListTableSkeleton } from "@/components/skeletons/ListPageSkeleton";
import { format } from "date-fns";
import { useToast } from "@/hooks/use-toast";
import { useOrgNavigation } from "@/hooks/useOrgNavigation";
import { cn } from "@/lib/utils";
import {
  INSIGHTS_BODY_CELL,
  INSIGHTS_BODY_CELL_NUM,
  INSIGHTS_BODY_ROW,
  INSIGHTS_NEUTRAL_TH,
  InsightsKpiCard,
  InsightsKpiStrip,
  InsightsPanel,
  InsightsStaticTh,
  InsightsTableHeader,
} from "@/components/business-insights/insightsLayout";
import {
  extractRepairTag,
  formatRecycleBinDeletedBy,
  isRepairTaggedDeletion,
} from "@/utils/recycleBinDeletionReason";

/** Client-side gate for permanent delete (admin convenience password). */
export const RECYCLE_BIN_PERMANENT_DELETE_PASSWORD = "admin@123";

const RECYCLE_TAB_TRIGGER = cn(
  "h-9 px-3 text-sm font-semibold rounded-md border border-slate-200 bg-white text-slate-600 shadow-sm",
  "data-[state=active]:bg-slate-700 data-[state=active]:text-white data-[state=active]:border-slate-700",
);

interface DeletedRecord {
  id: string;
  deleted_at: string;
  deleted_by: string;
  [key: string]: any;
}

interface EntityConfigItem {
  label: string;
  icon: any;
  displayField: string;
  secondaryField?: string;
  detailFields?: { key: string; label: string; isAmount?: boolean; isDate?: boolean }[];
}

const entityConfig: Record<SoftDeleteEntity, EntityConfigItem> = {
  customers: { 
    label: "Customers", 
    icon: Users, 
    displayField: "customer_name", 
    secondaryField: "phone",
    detailFields: [
      { key: "email", label: "Email" },
      { key: "gst_number", label: "GST" },
      { key: "address", label: "Address" },
    ]
  },
  suppliers: { 
    label: "Suppliers", 
    icon: Truck, 
    displayField: "supplier_name", 
    secondaryField: "phone",
    detailFields: [
      { key: "contact_person", label: "Contact" },
      { key: "email", label: "Email" },
      { key: "gst_number", label: "GST" },
    ]
  },
  employees: { 
    label: "Employees", 
    icon: Users, 
    displayField: "employee_name", 
    secondaryField: "designation",
    detailFields: [
      { key: "phone", label: "Phone" },
      { key: "email", label: "Email" },
      { key: "status", label: "Status" },
    ]
  },
  products: { 
    label: "Products", 
    icon: Package, 
    displayField: "product_name", 
    secondaryField: "category",
    detailFields: [
      { key: "brand", label: "Brand" },
      { key: "style", label: "Style" },
      { key: "hsn_code", label: "HSN" },
      { key: "default_sale_price", label: "Sale Price", isAmount: true },
    ]
  },
  purchase_bills: { 
    label: "Purchase Bills", 
    icon: FileText, 
    displayField: "software_bill_no", 
    secondaryField: "supplier_name",
    detailFields: [
      { key: "supplier_invoice_no", label: "Supplier Inv" },
      { key: "net_amount", label: "Amount", isAmount: true },
      { key: "bill_date", label: "Date", isDate: true },
      { key: "payment_status", label: "Status" },
    ]
  },
  sales: { 
    label: "Sales/POS", 
    icon: ShoppingCart, 
    displayField: "sale_number", 
    secondaryField: "customer_name",
    detailFields: [
      { key: "customer_phone", label: "Phone" },
      { key: "net_amount", label: "Amount", isAmount: true },
      { key: "sale_date", label: "Date", isDate: true },
      { key: "payment_status", label: "Payment" },
    ]
  },
  sale_returns: { 
    label: "Sale Returns", 
    icon: RotateCcw, 
    displayField: "return_number", 
    secondaryField: "customer_name",
    detailFields: [
      { key: "original_sale_number", label: "Original Sale" },
      { key: "net_amount", label: "Amount", isAmount: true },
      { key: "return_date", label: "Date", isDate: true },
    ]
  },
  purchase_returns: { 
    label: "Purchase Returns", 
    icon: RotateCcw, 
    displayField: "return_number", 
    secondaryField: "supplier_name",
    detailFields: [
      { key: "original_bill_number", label: "Original Bill" },
      { key: "net_amount", label: "Amount", isAmount: true },
      { key: "return_date", label: "Date", isDate: true },
    ]
  },
  sale_orders: { 
    label: "Sale Orders", 
    icon: FileText, 
    displayField: "order_number", 
    secondaryField: "customer_name",
    detailFields: [
      { key: "customer_phone", label: "Phone" },
      { key: "net_amount", label: "Amount", isAmount: true },
      { key: "order_date", label: "Date", isDate: true },
      { key: "status", label: "Status" },
    ]
  },
  purchase_orders: { 
    label: "Purchase Orders", 
    icon: FileText, 
    displayField: "order_number", 
    secondaryField: "supplier_name",
    detailFields: [
      { key: "supplier_phone", label: "Phone" },
      { key: "net_amount", label: "Amount", isAmount: true },
      { key: "order_date", label: "Date", isDate: true },
      { key: "status", label: "Status" },
    ]
  },
  quotations: { 
    label: "Quotations", 
    icon: FileText, 
    displayField: "quotation_number", 
    secondaryField: "customer_name",
    detailFields: [
      { key: "customer_phone", label: "Phone" },
      { key: "net_amount", label: "Amount", isAmount: true },
      { key: "quotation_date", label: "Date", isDate: true },
      { key: "status", label: "Status" },
    ]
  },
  voucher_entries: { 
    label: "Vouchers", 
    icon: Receipt, 
    displayField: "voucher_number", 
    secondaryField: "voucher_type",
    detailFields: [
      { key: "total_amount", label: "Amount", isAmount: true },
      { key: "voucher_date", label: "Date", isDate: true },
      { key: "description", label: "Description" },
    ]
  },
  credit_notes: { 
    label: "Credit Notes", 
    icon: Receipt, 
    displayField: "credit_note_number", 
    secondaryField: "customer_name",
    detailFields: [
      { key: "customer_phone", label: "Phone" },
      { key: "credit_amount", label: "Amount", isAmount: true },
      { key: "status", label: "Status" },
    ]
  },
};

const formatValue = (value: any, field: { key: string; label: string; isAmount?: boolean; isDate?: boolean }): string => {
  if (value === null || value === undefined || value === "") return "-";
  
  if (field.isDate) {
    try {
      return format(new Date(value), "dd/MM/yyyy");
    } catch {
      return String(value);
    }
  }
  
  if (field.isAmount) {
    return `₹${Number(value).toLocaleString("en-IN", { minimumFractionDigits: 2 })}`;
  }
  
  return String(value);
};

export default function RecycleBin() {
  const { currentOrganization, organizationRole } = useOrganization();
  const { hardDelete, bulkHardDelete, restore, bulkRestore } = useSoftDelete();
  const { hasSpecialPermission } = useUserPermissions();
  const { getProductRelationDetails } = useProductProtection();
  const { toast } = useToast();
  const { orgNavigate } = useOrgNavigation();
  const queryClient = useQueryClient();
  const canDelete = hasSpecialPermission("delete_records");
  const [activeTab, setActiveTab] = useState<SoftDeleteEntity>("customers");
  const [searchQuery, setSearchQuery] = useState("");
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [deleteDialogOpen, setDeleteDialogOpen] = useState(false);
  const [bulkDeleteDialogOpen, setBulkDeleteDialogOpen] = useState(false);
  const [recordToDelete, setRecordToDelete] = useState<{ id: string; name: string } | null>(null);
  const [isDeleting, setIsDeleting] = useState(false);
  const [isRestoring, setIsRestoring] = useState<string | null>(null);
  const [isBulkRestoring, setIsBulkRestoring] = useState(false);
  const [deletePassword, setDeletePassword] = useState("");
  const [deleteConfirmText, setDeleteConfirmText] = useState("");
  const [deleteReason, setDeleteReason] = useState("");
  const [relationDialog, setRelationDialog] = useState<{
    open: boolean;
    productName: string;
    productId: string;
    relations: Array<{ type: string; count: number; samples: string[] }>;
  }>({ open: false, productName: "", productId: "", relations: [] });
  const [restoreRepairDialogOpen, setRestoreRepairDialogOpen] = useState(false);
  const [recordToRestore, setRecordToRestore] = useState<DeletedRecord | null>(null);

  useEffect(() => {
    setSelectedIds(new Set());
    setSearchQuery("");
  }, [activeTab]);

  // Fetch deleted records for the active tab
  const { data: deletedRecords = [], isLoading } = useQuery({
    queryKey: ["deleted-records", activeTab, currentOrganization?.id],
    queryFn: async (): Promise<DeletedRecord[]> => {
      if (!currentOrganization?.id) return [];

      const PAGE_SIZE = 1000;
      const allRecords: any[] = [];
      let offset = 0;
      let hasMore = true;
      
      const getTableName = () => {
        switch (activeTab) {
          case 'customers': return 'customers';
          case 'suppliers': return 'suppliers';
          case 'employees': return 'employees';
          case 'products': return 'products';
          case 'purchase_bills': return 'purchase_bills';
          case 'sales': return 'sales';
          case 'sale_returns': return 'sale_returns';
          case 'purchase_returns': return 'purchase_returns';
          case 'sale_orders': return 'sale_orders';
          case 'quotations': return 'quotations';
          case 'voucher_entries': return 'voucher_entries';
          case 'credit_notes': return 'credit_notes';
          default: return null;
        }
      };
      
      const tableName = getTableName();
      if (!tableName) return [];
      
      while (hasMore) {
        const baseQuery = supabase
          .from(tableName as any)
          .select('*')
          .eq('organization_id', currentOrganization.id);

        const query =
          activeTab === "purchase_bills"
            ? baseQuery
                .or('deleted_at.not.is.null,is_cancelled.eq.true')
                .order('updated_at', { ascending: false })
            : baseQuery
                .not('deleted_at', 'is', null)
                .order('deleted_at', { ascending: false });

        const { data, error } = await query.range(offset, offset + PAGE_SIZE - 1);
        
        if (error) throw error;
        
        if (data && data.length > 0) {
          allRecords.push(...data);
          offset += PAGE_SIZE;
          hasMore = data.length === PAGE_SIZE;
        } else {
          hasMore = false;
        }
      }
      
      return allRecords as unknown as DeletedRecord[];
    },
    enabled: !!currentOrganization?.id,
  });

  // Count deleted records per entity
  const { data: counts = {} } = useQuery<Record<string, number>>({
    queryKey: ["deleted-counts", currentOrganization?.id],
    queryFn: async (): Promise<Record<string, number>> => {
      if (!currentOrganization?.id) return {};

      const countPromises = Object.keys(entityConfig).map(async (entity) => {
        const baseQuery = supabase
          .from(entity as any)
          .select("*", { count: "exact", head: true })
          .eq("organization_id", currentOrganization.id);

        const { count, error } =
          entity === "purchase_bills"
            ? await baseQuery.or("deleted_at.not.is.null,is_cancelled.eq.true")
            : await baseQuery.not("deleted_at", "is", null);

        return { entity, count: error ? 0 : (count || 0) };
      });

      const results = await Promise.all(countPromises);
      return results.reduce((acc, { entity, count }) => ({ ...acc, [entity]: count }), {});
    },
    enabled: !!currentOrganization?.id,
  });

  const totalDeletedCount = Object.values(counts).reduce((sum, count) => sum + count, 0);

  const config = entityConfig[activeTab];

  const filteredRecords = deletedRecords.filter((record) => {
    const primaryValue = record[config.displayField]?.toString().toLowerCase() || "";
    const secondaryValue = record[config.secondaryField || ""]?.toString().toLowerCase() || "";
    const search = searchQuery.toLowerCase();
    
    const detailMatch = config.detailFields?.some(field => {
      const value = record[field.key]?.toString().toLowerCase() || "";
      return value.includes(search);
    }) || false;
    
    return primaryValue.includes(search) || secondaryValue.includes(search) || detailMatch;
  });

  const canHardDeleteRecord = (entity: SoftDeleteEntity) => {
    if (!canDelete) return false;

    const adminOnlyEntities: SoftDeleteEntity[] = [
      "purchase_bills",
      "sales",
      "sale_returns",
      "purchase_returns",
      "products",
      "customers",
    ];
    const isAdminOrOwner = organizationRole === "admin";
    if (adminOnlyEntities.includes(entity) && !isAdminOrOwner) return false;
    return true;
  };

  const invalidateDeletedQueries = () => {
    queryClient.invalidateQueries({ queryKey: ["deleted-records"] });
    queryClient.invalidateQueries({ queryKey: ["deleted-counts"] });
  };

  const allFilteredSelected =
    filteredRecords.length > 0 && filteredRecords.every((record) => selectedIds.has(record.id));
  const someFilteredSelected = filteredRecords.some((record) => selectedIds.has(record.id));

  const toggleSelectAll = (checked: boolean) => {
    if (checked) {
      setSelectedIds(new Set(filteredRecords.map((record) => record.id)));
    } else {
      setSelectedIds(new Set());
    }
  };

  const toggleSelectRecord = (id: string, checked: boolean) => {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (checked) next.add(id);
      else next.delete(id);
      return next;
    });
  };

  const showProductBlockedDialog = async (productId: string, productName: string) => {
    const result = await getProductRelationDetails(productId);
    setRelationDialog({
      open: true,
      productName,
      productId,
      relations: result.relations,
    });
  };

  const requiresStrictDeleteConfirm = activeTab === "purchase_bills" && canHardDeleteRecord(activeTab);
  const requiredDeletePhrase = `DELETE ${recordToDelete?.name || ""}`.trim();
  const bulkStrictDeleteConfirm =
    activeTab === "purchase_bills" &&
    canHardDeleteRecord(activeTab) &&
    selectedIds.size === 1;
  const bulkRequiredDeletePhrase = (() => {
    if (!bulkStrictDeleteConfirm) return "";
    const onlyId = Array.from(selectedIds)[0];
    const onlyRecord = filteredRecords.find((record) => record.id === onlyId);
    return `DELETE ${onlyRecord?.[config.displayField] || ""}`.trim();
  })();

  const handleDeleteClick = (record: DeletedRecord) => {
    if (!canHardDeleteRecord(activeTab)) {
      toast({
        title: "Permission Denied",
        description: canDelete
          ? "Only admin can permanently delete this record."
          : "You don't have permission to delete records. Ask admin to enable 'Delete Records' in User Rights.",
        variant: "destructive",
      });
      return;
    }
    setRecordToDelete({
      id: record.id,
      name: record[config.displayField] || "this record",
    });
    setDeletePassword("");
    setDeleteConfirmText("");
    setDeleteReason("");
    setDeleteDialogOpen(true);
  };

  const handleConfirmDelete = async () => {
    if (!recordToDelete) return;
    if (deletePassword !== RECYCLE_BIN_PERMANENT_DELETE_PASSWORD) {
      toast({
        title: "Incorrect password",
        description: "Enter the permanent-delete password to continue.",
        variant: "destructive",
      });
      return;
    }
    if (requiresStrictDeleteConfirm) {
      if (deleteConfirmText.trim() !== requiredDeletePhrase) {
        toast({
          title: "Confirmation mismatch",
          description: `Type exactly: ${requiredDeletePhrase}`,
          variant: "destructive",
        });
        return;
      }
      if (!deleteReason.trim()) {
        toast({
          title: "Reason required",
          description: "Please enter a reason for permanent deletion.",
          variant: "destructive",
        });
        return;
      }
    }

    if (activeTab === "products") {
      const result = await getProductRelationDetails(recordToDelete.id);
      if (result.hasTransactions) {
        setDeleteDialogOpen(false);
        setRelationDialog({
          open: true,
          productName: recordToDelete.name,
          productId: recordToDelete.id,
          relations: result.relations,
        });
        setRecordToDelete(null);
        return;
      }
    }

    setIsDeleting(true);
    const success = await hardDelete(activeTab, recordToDelete.id);
    setIsDeleting(false);

    if (success) {
      toast({
        title: "Permanently Deleted",
        description: `${recordToDelete.name} has been permanently deleted.`,
      });
      invalidateDeletedQueries();
      setSelectedIds((prev) => {
        const next = new Set(prev);
        next.delete(recordToDelete.id);
        return next;
      });
    }

    setDeleteDialogOpen(false);
    setRecordToDelete(null);
  };

  const handleBulkRestore = async () => {
    if (selectedIds.size === 0) return;
    setIsBulkRestoring(true);
    const count = await bulkRestore(activeTab, Array.from(selectedIds));
    setIsBulkRestoring(false);

    if (count > 0) {
      toast({
        title: "Restored",
        description: `${count} record(s) restored.`,
      });
      invalidateDeletedQueries();
      setSelectedIds(new Set());
    }
  };

  const handleBulkDeleteClick = () => {
    if (!canHardDeleteRecord(activeTab)) {
      toast({
        title: "Permission Denied",
        description: canDelete
          ? "Only admin can permanently delete these records."
          : "You don't have permission to delete records. Ask admin to enable 'Delete Records' in User Rights.",
        variant: "destructive",
      });
      return;
    }
    if (selectedIds.size === 0) return;
    setDeletePassword("");
    setDeleteConfirmText("");
    setDeleteReason("");
    setBulkDeleteDialogOpen(true);
  };

  const handleConfirmBulkDelete = async () => {
    if (selectedIds.size === 0) return;

    if (deletePassword !== RECYCLE_BIN_PERMANENT_DELETE_PASSWORD) {
      toast({
        title: "Incorrect password",
        description: "Enter the permanent-delete password to continue.",
        variant: "destructive",
      });
      return;
    }

    if (bulkStrictDeleteConfirm) {
      if (deleteConfirmText.trim() !== bulkRequiredDeletePhrase) {
        toast({
          title: "Confirmation mismatch",
          description: `Type exactly: ${bulkRequiredDeletePhrase}`,
          variant: "destructive",
        });
        return;
      }
      if (!deleteReason.trim()) {
        toast({
          title: "Reason required",
          description: "Please enter a reason for permanent deletion.",
          variant: "destructive",
        });
        return;
      }
    }

    const ids = Array.from(selectedIds);

    setIsDeleting(true);
    const result = await bulkHardDelete(activeTab, ids);
    setIsDeleting(false);

    if (result.successCount > 0) {
      toast({
        title: "Permanently Deleted",
        description: `${result.successCount} record(s) permanently deleted.`,
      });
      invalidateDeletedQueries();
      setSelectedIds(new Set());
    } else if (result.blockedProducts.length > 0) {
      const firstBlocked = result.blockedProducts[0];
      const blockedRecord = filteredRecords.find((item) => item.id === firstBlocked.id);
      setBulkDeleteDialogOpen(false);
      await showProductBlockedDialog(
        firstBlocked.id,
        blockedRecord?.[config.displayField] || "Product",
      );
    }

    setBulkDeleteDialogOpen(false);
  };

  const performRestore = async (record: DeletedRecord) => {
    setIsRestoring(record.id);
    const success = await restore(activeTab, record.id);
    setIsRestoring(null);

    if (success) {
      toast({
        title: "Restored",
        description:
          typeof success === "string"
            ? success
            : `${record[config.displayField]} has been restored.`,
      });
      invalidateDeletedQueries();
      setSelectedIds((prev) => {
        const next = new Set(prev);
        next.delete(record.id);
        return next;
      });
    }
  };

  const handleRestore = (record: DeletedRecord) => {
    if (
      activeTab === "voucher_entries" &&
      isRepairTaggedDeletion({
        deletedBy: record.deleted_by,
        notes: record.notes,
        description: record.description,
      })
    ) {
      setRecordToRestore(record);
      setRestoreRepairDialogOpen(true);
      return;
    }
    void performRestore(record);
  };

  const handleConfirmRepairRestore = async () => {
    if (!recordToRestore) return;
    setRestoreRepairDialogOpen(false);
    await performRestore(recordToRestore);
    setRecordToRestore(null);
  };

  const fieldLabel = (key: string) =>
    key.replace(/_/g, " ").replace(/\b\w/g, (l) => l.toUpperCase());

  return (
    <div className="business-insights-workspace flex flex-col bg-slate-50 px-2 sm:px-3 py-2 min-h-0 h-full overflow-hidden w-full">
      <div className="w-full min-w-0 flex flex-col flex-1 min-h-0 gap-2">
        <div className="no-print flex flex-wrap items-center justify-between gap-2 shrink-0">
          <div className="flex flex-wrap items-center gap-2 min-w-0">
            <Button
              variant="outline"
              size="sm"
              className="h-9 px-3 text-sm shrink-0"
              onClick={() => orgNavigate("/")}
            >
              <ArrowLeft className="h-4 w-4 mr-1" />
              Dashboard
            </Button>
            <div className="min-w-0">
              <h1 className="text-xl font-bold text-teal-700 tracking-tight leading-none flex items-center gap-2">
                <Archive className="h-5 w-5 shrink-0" />
                Recycle Bin
              </h1>
              <p className="text-sm text-muted-foreground mt-1 truncate">
                Restore or permanently delete records
              </p>
            </div>
          </div>
        </div>

        <InsightsKpiStrip>
          <InsightsKpiCard
            label="Deleted items"
            value={totalDeletedCount}
            tone={totalDeletedCount > 0 ? "attention" : "neutral"}
            sub="All categories"
          />
          <InsightsKpiCard
            label={config.label}
            value={counts[activeTab] || 0}
            tone={(counts[activeTab] || 0) > 0 ? "attention" : "neutral"}
            sub="This tab"
          />
          <InsightsKpiCard
            label="Selected"
            value={selectedIds.size}
            tone={selectedIds.size > 0 ? "attention" : "neutral"}
            sub={selectedIds.size > 0 ? "Ready to restore or delete" : "None selected"}
          />
        </InsightsKpiStrip>

        <Tabs
          value={activeTab}
          onValueChange={(v) => setActiveTab(v as SoftDeleteEntity)}
          className="flex flex-col flex-1 min-h-0 gap-2"
        >
          <TabsList className="no-print flex h-auto w-full flex-wrap justify-start gap-1 bg-transparent p-0 shrink-0">
            {Object.entries(entityConfig).map(([key, { label, icon: Icon }]) => (
              <TabsTrigger key={key} value={key} className={cn(RECYCLE_TAB_TRIGGER, "group flex items-center gap-1.5")}>
                <Icon className="h-3.5 w-3.5 shrink-0" />
                {label}
                {(counts[key] || 0) > 0 && (
                  <span className="ml-0.5 rounded-full bg-amber-100 px-1.5 text-[10px] font-bold tabular-nums text-amber-900 group-data-[state=active]:bg-white/20 group-data-[state=active]:text-white">
                    {counts[key]}
                  </span>
                )}
              </TabsTrigger>
            ))}
          </TabsList>

          {Object.keys(entityConfig).map((entity) => {
            const entityConf = entityConfig[entity as SoftDeleteEntity];
            return (
              <TabsContent
                key={entity}
                value={entity}
                className="mt-0 flex flex-1 min-h-0 flex-col focus-visible:outline-none data-[state=inactive]:hidden"
              >
                <InsightsPanel
                  className="flex-1 min-h-0"
                  title={entityConf.label}
                  subtitle={
                    isLoading
                      ? "Loading…"
                      : `${filteredRecords.length} shown${searchQuery.trim() ? " · filtered" : ""}`
                  }
                  toolbar={
                    <div className="flex flex-wrap items-center gap-2">
                      <div className="relative min-w-[12rem] flex-1 sm:max-w-xs">
                        <Search className="absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-slate-400" />
                        <Input
                          placeholder={`Search deleted ${entityConf.label.toLowerCase()}…`}
                          value={searchQuery}
                          onChange={(e) => setSearchQuery(e.target.value)}
                          className="h-9 pl-8 text-sm border-slate-200 bg-white"
                        />
                      </div>
                      {selectedIds.size > 0 && (
                        <>
                          <Button
                            variant="outline"
                            size="sm"
                            className="h-9"
                            onClick={handleBulkRestore}
                            disabled={isBulkRestoring || isDeleting}
                          >
                            {isBulkRestoring ? (
                              <Loader2 className="h-4 w-4 animate-spin" />
                            ) : (
                              <RotateCcw className="h-4 w-4" />
                            )}
                            <span className="ml-1">Restore Selected</span>
                          </Button>
                          {canHardDeleteRecord(activeTab) && (
                            <Button
                              variant="destructive"
                              size="sm"
                              className="h-9"
                              onClick={handleBulkDeleteClick}
                              disabled={isDeleting || isBulkRestoring}
                            >
                              <Trash2 className="h-4 w-4" />
                              <span className="ml-1">Delete Permanently</span>
                            </Button>
                          )}
                        </>
                      )}
                    </div>
                  }
                >
                  {isLoading ? (
                    <ListTableSkeleton rows={8} columns={5} className="py-2" />
                  ) : filteredRecords.length === 0 ? (
                    <div className="text-center py-10">
                      <Trash2 className="h-10 w-10 mx-auto text-slate-300 mb-3" />
                      <h3 className="text-sm font-bold text-slate-800 mb-1">No deleted records</h3>
                      <p className="text-xs text-muted-foreground">
                        No deleted {entityConf.label.toLowerCase()} found
                      </p>
                    </div>
                  ) : (
                    <Table className="w-full min-w-max">
                      <InsightsTableHeader>
                        <th className={cn(INSIGHTS_NEUTRAL_TH, "w-10")}>
                          <Checkbox
                            checked={allFilteredSelected ? true : someFilteredSelected ? "indeterminate" : false}
                            onCheckedChange={(checked) => toggleSelectAll(!!checked)}
                            aria-label="Select all"
                            className="border-white/70 data-[state=checked]:bg-white data-[state=checked]:text-slate-800"
                          />
                        </th>
                        <InsightsStaticTh label={fieldLabel(entityConf.displayField)} />
                        {entityConf.secondaryField && (
                          <InsightsStaticTh label={fieldLabel(entityConf.secondaryField)} />
                        )}
                        {entityConf.detailFields?.map((field) => (
                          <InsightsStaticTh
                            key={field.key}
                            label={field.label}
                            className={cn("hidden md:table-cell", field.isAmount && "text-right")}
                          />
                        ))}
                        {(activeTab === "voucher_entries" || activeTab === "sales") && (
                          <>
                            <InsightsStaticTh label="Deleted By" className="hidden lg:table-cell" />
                            <InsightsStaticTh label="Reason" className="hidden lg:table-cell" />
                          </>
                        )}
                        <InsightsStaticTh label="Deleted At" />
                        <InsightsStaticTh label="Actions" className="text-right" />
                      </InsightsTableHeader>
                      <TableBody>
                        {filteredRecords.map((record) => (
                          <TableRow
                            key={record.id}
                            className={cn(
                              INSIGHTS_BODY_ROW,
                              selectedIds.has(record.id) && "bg-sky-100 hover:bg-sky-100",
                            )}
                          >
                            <TableCell className={INSIGHTS_BODY_CELL}>
                              <Checkbox
                                checked={selectedIds.has(record.id)}
                                onCheckedChange={(checked) => toggleSelectRecord(record.id, !!checked)}
                                aria-label={`Select ${record[entityConf.displayField] || "record"}`}
                              />
                            </TableCell>
                            <TableCell className={INSIGHTS_BODY_CELL}>
                              <div className="font-semibold text-slate-800">
                                {record[entityConf.displayField] || "-"}
                              </div>
                              <div className="md:hidden text-xs text-muted-foreground mt-1 space-y-0.5">
                                {entityConf.detailFields?.map((field) => (
                                  record[field.key] && (
                                    <div key={field.key}>
                                      <span className="font-medium">{field.label}:</span>{" "}
                                      {formatValue(record[field.key], field)}
                                    </div>
                                  )
                                ))}
                              </div>
                            </TableCell>
                            {entityConf.secondaryField && (
                              <TableCell className={INSIGHTS_BODY_CELL}>
                                {record[entityConf.secondaryField] || "-"}
                              </TableCell>
                            )}
                            {entityConf.detailFields?.map((field) => (
                              <TableCell
                                key={field.key}
                                className={cn(
                                  "hidden md:table-cell",
                                  field.isAmount ? INSIGHTS_BODY_CELL_NUM : INSIGHTS_BODY_CELL,
                                )}
                              >
                                {formatValue(record[field.key], field)}
                              </TableCell>
                            ))}
                            {(activeTab === "voucher_entries" || activeTab === "sales") && (
                              <>
                                <TableCell className={cn(INSIGHTS_BODY_CELL, "hidden lg:table-cell whitespace-nowrap")}>
                                  <Badge
                                    variant={
                                      formatRecycleBinDeletedBy({
                                        deletedBy: record.deleted_by,
                                        notes: record.notes,
                                        description: record.description ?? record.cancelled_reason,
                                      }) === "System repair"
                                        ? "secondary"
                                        : "outline"
                                    }
                                  >
                                    {formatRecycleBinDeletedBy({
                                      deletedBy: record.deleted_by,
                                      notes: record.notes,
                                      description: record.description ?? record.cancelled_reason,
                                    })}
                                  </Badge>
                                </TableCell>
                                <TableCell className={cn(INSIGHTS_BODY_CELL, "hidden lg:table-cell max-w-[200px] truncate text-xs text-muted-foreground")}>
                                  {extractRepairTag(record.notes, record.description ?? record.cancelled_reason)
                                    || record.cancelled_reason
                                    || "—"}
                                </TableCell>
                              </>
                            )}
                            <TableCell className={cn(INSIGHTS_BODY_CELL, "whitespace-nowrap tabular-nums")}>
                              {record.deleted_at
                                ? format(new Date(record.deleted_at), "dd/MM/yyyy HH:mm")
                                : "-"}
                            </TableCell>
                            <TableCell className={cn(INSIGHTS_BODY_CELL, "text-right")}>
                              <div className="flex items-center justify-end gap-2">
                                <Button
                                  variant="outline"
                                  size="sm"
                                  className="h-8"
                                  onClick={() => handleRestore(record)}
                                  disabled={isRestoring === record.id}
                                >
                                  {isRestoring === record.id ? (
                                    <Loader2 className="h-4 w-4 animate-spin" />
                                  ) : (
                                    <RotateCcw className="h-4 w-4" />
                                  )}
                                  <span className="ml-1 hidden sm:inline">Restore</span>
                                </Button>
                                {canHardDeleteRecord(activeTab) && (
                                  <Button
                                    variant="destructive"
                                    size="sm"
                                    className="h-8"
                                    onClick={() => handleDeleteClick(record)}
                                  >
                                    <Trash2 className="h-4 w-4" />
                                    <span className="ml-1 hidden sm:inline">Delete</span>
                                  </Button>
                                )}
                              </div>
                            </TableCell>
                          </TableRow>
                        ))}
                      </TableBody>
                    </Table>
                  )}
                </InsightsPanel>
              </TabsContent>
            );
          })}
        </Tabs>
      </div>

      <AlertDialog open={deleteDialogOpen} onOpenChange={setDeleteDialogOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Permanently Delete?</AlertDialogTitle>
            <AlertDialogDescription>
              Are you sure you want to permanently delete <strong>{recordToDelete?.name}</strong>? 
              This action cannot be undone and the record will be completely removed from the system.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <div className="space-y-3 py-2">
            <div className="space-y-1">
              <p className="text-sm text-muted-foreground">
                Enter password to permanently delete
              </p>
              <Input
                type="password"
                autoComplete="off"
                value={deletePassword}
                onChange={(e) => setDeletePassword(e.target.value)}
                placeholder="Password"
                disabled={isDeleting}
              />
            </div>
            {requiresStrictDeleteConfirm && (
              <>
                <div className="space-y-1">
                  <p className="text-sm text-muted-foreground">
                    Type <span className="font-mono font-semibold">{requiredDeletePhrase}</span> to confirm.
                  </p>
                  <Input
                    value={deleteConfirmText}
                    onChange={(e) => setDeleteConfirmText(e.target.value)}
                    placeholder={requiredDeletePhrase}
                    disabled={isDeleting}
                  />
                </div>
                <div className="space-y-1">
                  <p className="text-sm text-muted-foreground">Reason for permanent deletion</p>
                  <Input
                    value={deleteReason}
                    onChange={(e) => setDeleteReason(e.target.value)}
                    placeholder="Enter reason"
                    disabled={isDeleting}
                  />
                </div>
              </>
            )}
          </div>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={isDeleting}>Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={(e) => {
                e.preventDefault();
                void handleConfirmDelete();
              }}
              disabled={isDeleting || !deletePassword}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
            >
              {isDeleting ? (
                <>
                  <Loader2 className="h-4 w-4 animate-spin mr-2" />
                  Deleting...
                </>
              ) : (
                "Delete Permanently"
              )}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      <AlertDialog open={restoreRepairDialogOpen} onOpenChange={setRestoreRepairDialogOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>System repair deletion</AlertDialogTitle>
            <AlertDialogDescription asChild>
              <div className="space-y-2 text-sm text-muted-foreground">
                <p>
                  <strong>{recordToRestore?.[config.displayField]}</strong> was removed by an
                  automated data-repair script, not by a user. Restoring it from Recycle Bin may
                  re-introduce a double-count or leave the linked invoice unpaid.
                </p>
                <p>
                  For credit-note adjustment receipts, use the audited repair script which also
                  sets sale_return_adjust on the invoice.
                </p>
                {recordToRestore && (
                  <p className="text-xs">
                    Tag:{" "}
                    {extractRepairTag(recordToRestore.notes, recordToRestore.description) ||
                      "automated repair"}
                  </p>
                )}
              </div>
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel onClick={() => setRecordToRestore(null)}>Cancel</AlertDialogCancel>
            <AlertDialogAction onClick={() => void handleConfirmRepairRestore()}>
              Restore anyway
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      <AlertDialog open={bulkDeleteDialogOpen} onOpenChange={setBulkDeleteDialogOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Permanently Delete Selected?</AlertDialogTitle>
            <AlertDialogDescription>
              Are you sure you want to permanently delete <strong>{selectedIds.size}</strong> selected
              record(s)? This action cannot be undone.
              {activeTab === "products" && (
                <span className="block mt-2">
                  Products with sales, purchases, or other transaction history cannot be permanently deleted.
                </span>
              )}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <div className="space-y-3 py-2">
            <div className="space-y-1">
              <p className="text-sm text-muted-foreground">
                Enter password to permanently delete
              </p>
              <Input
                type="password"
                autoComplete="off"
                value={deletePassword}
                onChange={(e) => setDeletePassword(e.target.value)}
                placeholder="Password"
                disabled={isDeleting}
              />
            </div>
            {bulkStrictDeleteConfirm && (
              <>
                <div className="space-y-1">
                  <p className="text-sm text-muted-foreground">
                    Type <span className="font-mono font-semibold">{bulkRequiredDeletePhrase}</span> to confirm.
                  </p>
                  <Input
                    value={deleteConfirmText}
                    onChange={(e) => setDeleteConfirmText(e.target.value)}
                    placeholder={bulkRequiredDeletePhrase}
                    disabled={isDeleting}
                  />
                </div>
                <div className="space-y-1">
                  <p className="text-sm text-muted-foreground">Reason for permanent deletion</p>
                  <Input
                    value={deleteReason}
                    onChange={(e) => setDeleteReason(e.target.value)}
                    placeholder="Enter reason"
                    disabled={isDeleting}
                  />
                </div>
              </>
            )}
          </div>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={isDeleting}>Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={(e) => {
                e.preventDefault();
                void handleConfirmBulkDelete();
              }}
              disabled={isDeleting || !deletePassword}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
            >
              {isDeleting ? (
                <>
                  <Loader2 className="h-4 w-4 animate-spin mr-2" />
                  Deleting...
                </>
              ) : (
                `Delete ${selectedIds.size} Permanently`
              )}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      <ProductRelationDialog
        open={relationDialog.open}
        onOpenChange={(open) => setRelationDialog((prev) => ({ ...prev, open }))}
        productName={relationDialog.productName}
        relations={relationDialog.relations}
      />
    </div>
  );
}