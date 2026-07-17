import { useState, useEffect } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useOrganization } from "@/contexts/OrganizationContext";
import { SoftDeleteEntity, useSoftDelete } from "@/hooks/useSoftDelete";
import { useUserPermissions } from "@/hooks/useUserPermissions";
import { useProductProtection } from "@/hooks/useProductProtection";
import { ProductRelationDialog } from "@/components/ProductRelationDialog";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from "@/components/ui/alert-dialog";
import { Trash2, Search, Archive, Users, Truck, Package, ShoppingCart, FileText, Receipt, Loader2, RotateCcw } from "lucide-react";
import { format } from "date-fns";
import { useToast } from "@/hooks/use-toast";

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
  const [deleteConfirmText, setDeleteConfirmText] = useState("");
  const [deleteReason, setDeleteReason] = useState("");
  const [relationDialog, setRelationDialog] = useState<{
    open: boolean;
    productName: string;
    productId: string;
    relations: Array<{ type: string; count: number; samples: string[] }>;
  }>({ open: false, productName: "", productId: "", relations: [] });

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
    setDeleteConfirmText("");
    setDeleteReason("");
    setDeleteDialogOpen(true);
  };

  const handleConfirmDelete = async () => {
    if (!recordToDelete) return;
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
    setDeleteConfirmText("");
    setDeleteReason("");
    setBulkDeleteDialogOpen(true);
  };

  const handleConfirmBulkDelete = async () => {
    if (selectedIds.size === 0) return;

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

  const handleRestore = async (record: DeletedRecord) => {
    setIsRestoring(record.id);
    const success = await restore(activeTab, record.id);
    setIsRestoring(null);
    
    if (success) {
      toast({
        title: "Restored",
        description: `${record[config.displayField]} has been restored.`,
      });
      invalidateDeletedQueries();
      setSelectedIds((prev) => {
        const next = new Set(prev);
        next.delete(record.id);
        return next;
      });
    }
  };

  return (
    <div className="w-full px-6 py-6 space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold flex items-center gap-3">
            <Archive className="h-8 w-8 text-primary" />
            Recycle Bin
          </h1>
          <p className="text-muted-foreground mt-1">
            View and manage deleted records. Restore or permanently delete items.
          </p>
        </div>
        <Badge variant="secondary" className="text-lg px-4 py-2">
          {totalDeletedCount} deleted items
        </Badge>
      </div>

      <Card>
        <CardContent className="pt-6">
          <Tabs value={activeTab} onValueChange={(v) => setActiveTab(v as SoftDeleteEntity)}>
            <TabsList className="flex flex-wrap h-auto gap-1 mb-6">
              {Object.entries(entityConfig).map(([key, { label, icon: Icon }]) => (
                <TabsTrigger key={key} value={key} className="flex items-center gap-2">
                  <Icon className="h-4 w-4" />
                  {label}
                  {(counts[key] || 0) > 0 && (
                    <Badge variant="destructive" className="ml-1 h-5 px-1.5">
                      {counts[key]}
                    </Badge>
                  )}
                </TabsTrigger>
              ))}
            </TabsList>

            {Object.keys(entityConfig).map((entity) => {
              const entityConf = entityConfig[entity as SoftDeleteEntity];
              return (
                <TabsContent key={entity} value={entity}>
                  <div className="space-y-4">
                    <div className="flex flex-wrap items-center gap-4">
                      <div className="relative flex-1 max-w-md">
                        <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                        <Input
                          placeholder={`Search deleted ${entityConf.label.toLowerCase()}...`}
                          value={searchQuery}
                          onChange={(e) => setSearchQuery(e.target.value)}
                          className="pl-10"
                        />
                      </div>
                      {selectedIds.size > 0 && (
                        <div className="flex flex-wrap items-center gap-2">
                          <Badge variant="secondary">{selectedIds.size} selected</Badge>
                          <Button
                            variant="outline"
                            size="sm"
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
                              onClick={handleBulkDeleteClick}
                              disabled={isDeleting || isBulkRestoring}
                            >
                              <Trash2 className="h-4 w-4" />
                              <span className="ml-1">Delete Permanently</span>
                            </Button>
                          )}
                        </div>
                      )}
                    </div>

                    {isLoading ? (
                      <div className="flex items-center justify-center py-12">
                        <Loader2 className="h-8 w-8 animate-spin text-primary" />
                      </div>
                    ) : filteredRecords.length === 0 ? (
                      <div className="text-center py-12">
                        <Trash2 className="h-16 w-16 mx-auto text-muted-foreground mb-4" />
                        <h3 className="text-lg font-semibold mb-2">No Deleted Records</h3>
                        <p className="text-muted-foreground">
                          No deleted {entityConf.label.toLowerCase()} found
                        </p>
                      </div>
                    ) : (
                      <div className="border rounded-lg overflow-x-auto">
                        <Table>
                          <TableHeader>
                            <TableRow className="bg-muted/50">
                              <TableHead className="w-10">
                                <Checkbox
                                  checked={allFilteredSelected ? true : someFilteredSelected ? "indeterminate" : false}
                                  onCheckedChange={(checked) => toggleSelectAll(!!checked)}
                                  aria-label="Select all"
                                />
                              </TableHead>
                              <TableHead className="font-semibold">
                                {entityConf.displayField.replace(/_/g, " ").replace(/\b\w/g, (l) => l.toUpperCase())}
                              </TableHead>
                              {entityConf.secondaryField && (
                                <TableHead className="font-semibold">
                                  {entityConf.secondaryField.replace(/_/g, " ").replace(/\b\w/g, (l) => l.toUpperCase())}
                                </TableHead>
                              )}
                              {entityConf.detailFields?.map((field) => (
                                <TableHead key={field.key} className="font-semibold hidden md:table-cell">
                                  {field.label}
                                </TableHead>
                              ))}
                              <TableHead className="font-semibold">Deleted At</TableHead>
                              <TableHead className="font-semibold text-right">Actions</TableHead>
                            </TableRow>
                          </TableHeader>
                          <TableBody>
                            {filteredRecords.map((record) => (
                              <TableRow key={record.id} className={selectedIds.has(record.id) ? "bg-muted/30" : ""}>
                                <TableCell>
                                  <Checkbox
                                    checked={selectedIds.has(record.id)}
                                    onCheckedChange={(checked) => toggleSelectRecord(record.id, !!checked)}
                                    aria-label={`Select ${record[entityConf.displayField] || "record"}`}
                                  />
                                </TableCell>
                                <TableCell>
                                  <div className="font-medium">
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
                                  <TableCell>{record[entityConf.secondaryField] || "-"}</TableCell>
                                )}
                                {entityConf.detailFields?.map((field) => (
                                  <TableCell key={field.key} className="hidden md:table-cell">
                                    {formatValue(record[field.key], field)}
                                  </TableCell>
                                ))}
                                <TableCell className="whitespace-nowrap">
                                  {record.deleted_at
                                    ? format(new Date(record.deleted_at), "dd/MM/yyyy HH:mm")
                                    : "-"}
                                </TableCell>
                                <TableCell className="text-right">
                                  <div className="flex items-center justify-end gap-2">
                                    <Button
                                      variant="outline"
                                      size="sm"
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
                      </div>
                    )}
                  </div>
                </TabsContent>
              );
            })}
          </Tabs>
        </CardContent>
      </Card>

      <AlertDialog open={deleteDialogOpen} onOpenChange={setDeleteDialogOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Permanently Delete?</AlertDialogTitle>
            <AlertDialogDescription>
              Are you sure you want to permanently delete <strong>{recordToDelete?.name}</strong>? 
              This action cannot be undone and the record will be completely removed from the system.
            </AlertDialogDescription>
          </AlertDialogHeader>
          {requiresStrictDeleteConfirm && (
            <div className="space-y-3 py-2">
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
            </div>
          )}
          <AlertDialogFooter>
            <AlertDialogCancel disabled={isDeleting}>Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={handleConfirmDelete}
              disabled={isDeleting}
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
          {bulkStrictDeleteConfirm && (
            <div className="space-y-3 py-2">
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
            </div>
          )}
          <AlertDialogFooter>
            <AlertDialogCancel disabled={isDeleting}>Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={handleConfirmBulkDelete}
              disabled={isDeleting}
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