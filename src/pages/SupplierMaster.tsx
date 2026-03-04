import { useState, useMemo } from "react";
import { createPortal } from "react-dom";
import { useNavigate, useLocation } from "react-router-dom";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
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
import { Plus, Pencil, Trash2, Search, FileSpreadsheet, BookOpen, Merge } from "lucide-react";
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

const SupplierMaster = () => {
  const [searchQuery, setSearchQuery] = useState("");
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
  const searchTimerRef = useState<NodeJS.Timeout | null>(null);
  
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

  // Server-side paginated + searched query
  const { data: suppliersPage, isLoading } = useQuery({
    queryKey: ["suppliers", currentOrganization?.id, debouncedSearch, currentPage],
    queryFn: async () => {
      if (!currentOrganization?.id) return { suppliers: [] as Supplier[], filteredCount: 0 };
      
      const offset = (currentPage - 1) * ITEMS_PER_PAGE;
      const term = debouncedSearch.trim();
      
      let query = supabase
        .from("suppliers")
        .select("*", { count: "exact" })
        .eq("organization_id", currentOrganization.id)
        .is("deleted_at", null);
      
      if (term) {
        const filters = [
          `supplier_name.ilike.%${term}%`,
          `contact_person.ilike.%${term}%`,
          `phone.ilike.%${term}%`,
          `supplier_code.ilike.%${term}%`,
        ];
        query = query.or(filters.join(','));
      }
      
      const { data, error, count } = await query
        .order("created_at", { ascending: false })
        .order("id")
        .range(offset, offset + ITEMS_PER_PAGE - 1);
      
      if (error) throw error;
      return { suppliers: (data || []) as Supplier[], filteredCount: count || 0 };
    },
    enabled: !!currentOrganization?.id,
    staleTime: 30000,
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
          checked={suppliers.length > 0 && selectedSuppliers.size === suppliers.length}
          onCheckedChange={handleSelectAll}
        />
      ),
      cell: ({ row }) => (
        <Checkbox
          checked={selectedSuppliers.has(row.original.id)}
          onCheckedChange={(checked) => handleSelectSupplier(row.original.id, checked as boolean)}
          onClick={(e) => e.stopPropagation()}
        />
      ),
      size: 40,
      enableResizing: false,
    },
    {
      id: "sr_no",
      header: "Sr No",
      cell: ({ row }) => <span className="text-muted-foreground">{startIndex + row.index + 1}</span>,
      size: 60,
    },
    {
      accessorKey: "supplier_name",
      header: "Supplier Name",
      cell: ({ row }) => (
        <span
          className="font-medium text-primary cursor-pointer hover:underline"
          onClick={(e) => { e.stopPropagation(); setHistorySupplier(row.original); }}
        >
          {row.original.supplier_name}
        </span>
      ),
      size: 200,
    },
    { accessorKey: "contact_person", header: "Contact Person", cell: ({ row }) => row.original.contact_person || "-", size: 150 },
    { accessorKey: "phone", header: "Phone", cell: ({ row }) => row.original.phone || "-", size: 130 },
    { accessorKey: "email", header: "Email", cell: ({ row }) => row.original.email || "-", size: 180 },
    { accessorKey: "gst_number", header: "GST Number", cell: ({ row }) => row.original.gst_number || "-", size: 160 },
    {
      accessorKey: "supplier_code",
      header: "Supplier Code",
      cell: ({ row }) => row.original.supplier_code ? <Badge variant="secondary">{row.original.supplier_code}</Badge> : "-",
      size: 120,
    },
    {
      accessorKey: "opening_balance",
      header: "Opening Bal.",
      cell: ({ row }) => (
        <span className="text-right block tabular-nums">
          {row.original.opening_balance ? `₹${row.original.opening_balance.toLocaleString()}` : "-"}
        </span>
      ),
      size: 120,
    },
    {
      id: "actions",
      header: "Actions",
      cell: ({ row }) => (
        <div className="flex items-center gap-1">
          <Button variant="ghost" size="sm" onClick={(e) => { e.stopPropagation(); setHistorySupplier(row.original); }} title="View Ledger">
            <BookOpen className="h-4 w-4" />
          </Button>
          <Button variant="ghost" size="sm" onClick={(e) => { e.stopPropagation(); handleEdit(row.original); }}>
            <Pencil className="h-4 w-4" />
          </Button>
          <Button variant="ghost" size="sm" onClick={(e) => { e.stopPropagation(); handleDelete(row.original.id); }}>
            <Trash2 className="h-4 w-4" />
          </Button>
        </div>
      ),
      size: 140,
    },
  ], [suppliers, selectedSuppliers, startIndex]);

  return (
    <div className="w-full px-6 py-6 space-y-6">
      <BackToDashboard />
      
      <div className="flex items-center gap-4">
        <h1 className="text-[20px] font-bold text-foreground shrink-0">Supplier Master</h1>
        <span className="text-[12px] text-muted-foreground bg-muted px-2.5 py-1 rounded-full font-medium shrink-0">
          {totalCount.toLocaleString()} records
        </span>

        <div className="relative flex-1 max-w-sm">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <Input
            placeholder="Search suppliers..."
            value={searchQuery}
            onChange={(e) => handleSearchChange(e.target.value)}
            className="h-9 text-sm pl-9"
          />
        </div>

        <div id="erp-toolbar-portal-supplier" className="flex items-center gap-2" />

        {selectedSuppliers.size > 0 && (
          <Button variant="destructive" size="sm" className="h-9 shrink-0" onClick={handleBulkDelete} disabled={bulkDeleteSuppliers.isPending}>
            <Trash2 className="h-4 w-4 mr-2" />
            Delete Selected ({selectedSuppliers.size})
          </Button>
        )}

        {selectedSuppliers.size >= 2 && (
          <Button variant="outline" size="sm" className="h-9 shrink-0" onClick={() => {
            const selected = suppliers.filter(s => selectedSuppliers.has(s.id));
            setMergeSuppliers(selected);
          }}>
            <Merge className="h-4 w-4 mr-2" />
            Merge Selected
          </Button>
        )}

        <div className="flex gap-2 items-center ml-auto shrink-0">
          <Button variant="outline" size="sm" className="h-9" onClick={() => setShowExcelImport(true)}>
            <FileSpreadsheet className="h-4 w-4 mr-2" />
            Import Excel
          </Button>
          <Dialog open={isDialogOpen} onOpenChange={(open) => { setIsDialogOpen(open); if (!open) resetForm(); }}>
            <DialogTrigger asChild>
              <Button size="sm" className="h-9">
                <Plus className="h-4 w-4 mr-2" />
                Add Supplier
              </Button>
            </DialogTrigger>
            <DialogContent>
              <DialogHeader>
                <DialogTitle>{editingSupplier ? "Edit Supplier" : "Add New Supplier"}</DialogTitle>
              </DialogHeader>
              <form onSubmit={handleSubmit} className="space-y-4">
                <div>
                  <Label htmlFor="supplier_name">Supplier Name *</Label>
                  <Input id="supplier_name" value={formData.supplier_name} onChange={(e) => setFormData({ ...formData, supplier_name: e.target.value })} required />
                </div>
                <div>
                  <Label htmlFor="contact_person">Contact Person</Label>
                  <Input id="contact_person" value={formData.contact_person} onChange={(e) => setFormData({ ...formData, contact_person: e.target.value })} />
                </div>
                <div>
                  <Label htmlFor="phone">Phone</Label>
                  <Input id="phone" value={formData.phone} onChange={(e) => setFormData({ ...formData, phone: e.target.value })} />
                </div>
                <div>
                  <Label htmlFor="email">Email</Label>
                  <Input id="email" type="email" value={formData.email} onChange={(e) => setFormData({ ...formData, email: e.target.value })} />
                </div>
                <div>
                  <Label htmlFor="address">Address</Label>
                  <Textarea id="address" value={formData.address} onChange={(e) => setFormData({ ...formData, address: e.target.value })} />
                </div>
                <div>
                  <Label htmlFor="gst_number">GST Number</Label>
                  <Input id="gst_number" value={formData.gst_number} onChange={(e) => setFormData({ ...formData, gst_number: e.target.value })} />
                </div>
                <div>
                  <Label htmlFor="supplier_code">Supplier Code</Label>
                  <Input id="supplier_code" value={formData.supplier_code} onChange={(e) => setFormData({ ...formData, supplier_code: e.target.value })} placeholder="Enter supplier code (optional)" />
                  <p className="text-xs text-muted-foreground mt-1">This code will be displayed on barcode labels to identify the supplier</p>
                </div>
                <div>
                  <Label htmlFor="opening_balance">Opening Balance (₹)</Label>
                  <Input id="opening_balance" type="number" step="0.01" value={formData.opening_balance} onChange={(e) => setFormData({ ...formData, opening_balance: e.target.value })} placeholder="Payable to supplier" />
                  <p className="text-xs text-muted-foreground mt-1">Positive = Payable to supplier</p>
                </div>
                <Button type="submit" className="w-full">{editingSupplier ? "Update" : "Create"} Supplier</Button>
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
        isLoading={isLoading}
        emptyMessage="No suppliers found"
        defaultDensity="compact"
        showToolbar={false}
        renderToolbar={(toolbar) => {
          const el = document.getElementById('erp-toolbar-portal-supplier');
          return el ? createPortal(toolbar, el) : toolbar;
        }}
      />

      {/* Pagination */}
      {totalPages > 1 && (
        <div className="flex items-center justify-between">
          <p className="text-sm text-muted-foreground">
            Showing {startIndex + 1}-{Math.min(startIndex + ITEMS_PER_PAGE, filteredCount)} of {filteredCount} suppliers
          </p>
          <div className="flex items-center gap-2">
            <Button variant="outline" size="sm" onClick={() => setCurrentPage(p => Math.max(1, p - 1))} disabled={currentPage === 1}>Previous</Button>
            <span className="text-sm">Page {currentPage} of {totalPages}</span>
            <Button variant="outline" size="sm" onClick={() => setCurrentPage(p => Math.min(totalPages, p + 1))} disabled={currentPage === totalPages}>Next</Button>
          </div>
        </div>
      )}

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
          setSelectedSuppliers(new Set());
          setMergeSuppliers([]);
        }}
      />
    </div>
  );
};

export default SupplierMaster;
