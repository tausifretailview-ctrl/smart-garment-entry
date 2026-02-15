import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useOrganization } from "@/contexts/OrganizationContext";
import { useDashboardInvalidation } from "@/hooks/useDashboardInvalidation";
import { BackToDashboard } from "@/components/BackToDashboard";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { Plus, Pencil, Trash2, Search, FileSpreadsheet, History, Link2, Phone, Tag, ShoppingCart, Wallet, FileText, RefreshCw, Eye, ArrowUpDown, BookOpen } from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { useSoftDelete } from "@/hooks/useSoftDelete";
import { ExcelImportDialog, ImportProgress } from "@/components/ExcelImportDialog";
import { customerMasterFields, customerMasterSampleData, normalizePhoneNumber } from "@/utils/excelImportUtils";
import { Checkbox } from "@/components/ui/checkbox";
import { LegacyInvoiceImportDialog } from "@/components/LegacyInvoiceImportDialog";
import { CustomerHistoryDialog } from "@/components/CustomerHistoryDialog";
import { RelinkLegacyInvoicesDialog } from "@/components/RelinkLegacyInvoicesDialog";
import { UpdateLegacyPhonesDialog } from "@/components/UpdateLegacyPhonesDialog";
import { BrandDiscountDialog } from "@/components/BrandDiscountDialog";
import { CustomerBalanceImportDialog } from "@/components/CustomerBalanceImportDialog";
import { useOrgNavigation } from "@/hooks/useOrgNavigation";
import { useContextMenu, useIsDesktop } from "@/hooks/useContextMenu";
import { DesktopContextMenu, PageContextMenu, ContextMenuItem } from "@/components/DesktopContextMenu";

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

const CustomerMaster = () => {
  const [searchQuery, setSearchQuery] = useState("");
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
  const [showCustomerHistory, setShowCustomerHistory] = useState(false);
  const [selectedCustomerForHistory, setSelectedCustomerForHistory] = useState<{ id: string; name: string } | null>(null);
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
          setSelectedCustomerForHistory({
            id: customer.id,
            name: customer.customer_name
          });
          setShowCustomerHistory(true);
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
          setSelectedCustomerForBrandDiscount({
            id: customer.id,
            name: customer.customer_name
          });
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
      onClick: () => {
        resetForm();
        setIsDialogOpen(true);
      },
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
  const searchTimerRef = useState<NodeJS.Timeout | null>(null);
  
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
    staleTime: 60000,
  });

  const { data: customersPage, isLoading } = useQuery({
    queryKey: ["customers", currentOrganization?.id, debouncedSearch, currentPage],
    queryFn: async () => {
      if (!currentOrganization?.id) return { customers: [] as Customer[], filteredCount: 0 };
      
      const offset = (currentPage - 1) * ITEMS_PER_PAGE;
      const term = debouncedSearch.trim();
      
      let query = supabase
        .from("customers")
        .select("*", { count: "exact" })
        .eq("organization_id", currentOrganization.id)
        .is("deleted_at", null);
      
      if (term) {
        const filters: string[] = [
          `customer_name.ilike.%${term}%`,
          `phone.ilike.%${term}%`,
          `email.ilike.%${term}%`,
        ];
        query = query.or(filters.join(','));
      }
      
      const { data, error, count } = await query
        .order("created_at", { ascending: false })
        .order("id")
        .range(offset, offset + ITEMS_PER_PAGE - 1);
      
      if (error) throw error;
      return { customers: (data || []) as Customer[], filteredCount: count || 0 };
    },
    enabled: !!currentOrganization?.id,
    staleTime: 30000,
    refetchOnWindowFocus: false,
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
    staleTime: 30000,
  });

  const createCustomer = useMutation({
    mutationFn: async (data: typeof formData) => {
      if (!currentOrganization?.id) throw new Error("No organization selected");
      const normalizedPhone = normalizePhoneNumber(data.phone);
      
      if (!normalizedPhone) {
        throw new Error("Valid phone number is required");
      }
      
      const { data: existingCustomers, error: checkError } = await supabase
        .from("customers")
        .select("id, customer_name, phone")
        .eq("organization_id", currentOrganization.id)
        .is("deleted_at", null);
      
      if (checkError) throw checkError;
      
      const duplicate = existingCustomers?.find(c => 
        normalizePhoneNumber(c.phone) === normalizedPhone
      );
      
      if (duplicate) {
        throw new Error(`Customer with this phone already exists: ${duplicate.customer_name || duplicate.phone}`);
      }
      
      const customerData = {
        customer_name: data.customer_name.trim() || normalizedPhone,
        phone: normalizedPhone,
        email: data.email,
        address: data.address,
        gst_number: data.gst_number,
        opening_balance: data.opening_balance ? parseFloat(data.opening_balance) : 0,
        discount_percent: data.discount_percent ? parseFloat(data.discount_percent) : 0,
        organization_id: currentOrganization.id
      };
      const { error } = await supabase.from("customers").insert([customerData]);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["customers"] });
      invalidateCustomers();
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
      const normalizedPhone = normalizePhoneNumber(data.phone);
      
      if (!normalizedPhone) {
        throw new Error("Valid phone number is required");
      }
      
      const { data: existingCustomers, error: checkError } = await supabase
        .from("customers")
        .select("id, customer_name, phone")
        .eq("organization_id", currentOrganization.id)
        .is("deleted_at", null)
        .neq("id", id);
      
      if (checkError) throw checkError;
      
      const duplicate = existingCustomers?.find(c => 
        normalizePhoneNumber(c.phone) === normalizedPhone
      );
      
      if (duplicate) {
        throw new Error(`Customer with this phone already exists: ${duplicate.customer_name || duplicate.phone}`);
      }
      
      const customerData = {
        customer_name: data.customer_name.trim() || normalizedPhone,
        phone: normalizedPhone,
        email: data.email,
        address: data.address,
        gst_number: data.gst_number,
        opening_balance: data.opening_balance ? parseFloat(data.opening_balance) : 0,
        discount_percent: data.discount_percent ? parseFloat(data.discount_percent) : 0,
      };
      const { error } = await supabase.from("customers").update(customerData).eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["customers"] });
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
      toast({ title: `${count} customers moved to recycle bin` });
      setSelectedCustomers(new Set());
    },
    onError: (error: any) => {
      toast({ title: "Error deleting customers", description: error.message, variant: "destructive" });
    },
  });

  const resetForm = () => {
    setFormData({
      customer_name: "",
      phone: "",
      email: "",
      address: "",
      gst_number: "",
      opening_balance: "",
      discount_percent: "",
    });
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
    });
    setIsDialogOpen(true);
  };

  const handleDelete = (id: string) => {
    if (confirm("Are you sure you want to delete this customer?")) {
      deleteCustomer.mutate(id);
    }
  };

  const totalPages = Math.ceil(filteredCount / ITEMS_PER_PAGE);
  const startIndex = (currentPage - 1) * ITEMS_PER_PAGE;

  const handleSelectAll = (checked: boolean) => {
    if (checked) {
      setSelectedCustomers(new Set(customers.map(c => c.id)));
    } else {
      setSelectedCustomers(new Set());
    }
  };

  const handleSelectCustomer = (customerId: string, checked: boolean) => {
    const newSelected = new Set(selectedCustomers);
    if (checked) {
      newSelected.add(customerId);
    } else {
      newSelected.delete(customerId);
    }
    setSelectedCustomers(newSelected);
  };

  const handleBulkDelete = () => {
    if (selectedCustomers.size === 0) return;
    if (confirm(`Are you sure you want to delete ${selectedCustomers.size} customer(s)?`)) {
      bulkDeleteCustomers.mutate(Array.from(selectedCustomers));
    }
  };

  const isAllSelected = customers.length > 0 && customers.every(c => selectedCustomers.has(c.id));
  const isSomeSelected = selectedCustomers.size > 0;

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
      (existingCustomers || [])
        .map(c => normalizePhoneNumber(c.phone))
        .filter(Boolean)
    );

    for (let i = 0; i < validRows.length; i += BATCH_SIZE) {
      const batch = validRows.slice(i, i + BATCH_SIZE);
      const customersToInsert: any[] = [];

      for (const row of batch) {
        const phone = normalizePhoneNumber(row.phone);
        
        if (existingPhones.has(phone)) {
          skippedCount++;
          continue;
        }

        customersToInsert.push({
          customer_name: row.customer_name?.toString().trim() || phone,
          phone: phone,
          email: row.email?.toString().trim() || '',
          address: row.address?.toString().trim() || '',
          gst_number: row.gst_number?.toString().trim() || '',
          opening_balance: row.opening_balance ? parseFloat(row.opening_balance) : 0,
          organization_id: currentOrganization.id,
        });

        existingPhones.add(phone);
      }

      if (customersToInsert.length > 0) {
        const { error } = await supabase
          .from("customers")
          .insert(customersToInsert);
        
        if (error) {
          console.error('Batch insert error:', error);
          errorCount += customersToInsert.length;
        } else {
          successCount += customersToInsert.length;
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

    queryClient.invalidateQueries({ queryKey: ["customers"] });
    
    const skippedEmptyRows = mappedData.length - validRows.length;
    let description = `${successCount} customers imported`;
    if (skippedCount > 0) description += `, ${skippedCount} duplicates skipped`;
    if (skippedEmptyRows > 0) description += `, ${skippedEmptyRows} empty rows skipped`;
    if (errorCount > 0) description += `, ${errorCount} failed`;
    
    toast({
      title: "Import completed",
      description,
    });
    setShowExcelImport(false);
  };

  return (
    <div className="bg-slate-50/50 min-h-screen" onContextMenu={handlePageContextMenu}>
      <div className="space-y-4 p-4">
        <BackToDashboard />
        
        <div className="bg-white shadow-sm rounded-lg p-5">
          {/* Page Header - Vasy Style */}
          <div className="flex justify-between items-center mb-4">
            <div className="flex items-center gap-3">
              <h1 className="text-[20px] font-bold text-slate-800">Customer Master</h1>
              <span className="text-[12px] text-slate-500 bg-slate-100 px-2.5 py-1 rounded-full font-medium">
                {totalCount.toLocaleString()} records
              </span>
            </div>
            <div className="flex gap-2 items-center">
              <Button variant="outline" className="h-9 text-sm px-4 rounded-md" onClick={() => setShowLegacyImport(true)}>
                <History className="h-4 w-4 mr-2" />
                Import Legacy Invoices
              </Button>
              <Button variant="outline" className="h-9 text-sm px-4 rounded-md" onClick={() => setShowUpdatePhonesDialog(true)}>
                <Phone className="h-4 w-4 mr-2" />
                Update Legacy Phones
              </Button>
              <Button variant="outline" className="h-9 text-sm px-4 rounded-md" onClick={() => setShowRelinkDialog(true)}>
                <Link2 className="h-4 w-4 mr-2" />
                Re-link Legacy
              </Button>
              <Button variant="outline" className="h-9 text-sm px-4 rounded-md" onClick={() => setShowBalanceImport(true)}>
                <ArrowUpDown className="h-4 w-4 mr-2" />
                Import Balances
              </Button>
              <Button variant="outline" className="h-9 text-sm px-4 rounded-md" onClick={() => setShowExcelImport(true)}>
                <FileSpreadsheet className="h-4 w-4 mr-2" />
                Import Customers
              </Button>
              <Dialog open={isDialogOpen} onOpenChange={(open) => {
                setIsDialogOpen(open);
                if (!open) resetForm();
              }}>
                <DialogTrigger asChild>
                  <Button className="h-9 text-sm px-4 rounded-md">
                    <Plus className="h-4 w-4 mr-2" />
                    Add Customer
                  </Button>
                </DialogTrigger>
                <DialogContent>
                  <DialogHeader>
                    <DialogTitle>{editingCustomer ? "Edit Customer" : "Add New Customer"}</DialogTitle>
                  </DialogHeader>
                  <form onSubmit={handleSubmit} className="space-y-4">
                    <div>
                      <Label htmlFor="phone">Mobile Number *</Label>
                      <Input
                        id="phone"
                        value={formData.phone}
                        onChange={(e) => setFormData({ ...formData, phone: e.target.value })}
                        required
                        autoFocus
                        placeholder="Enter mobile number"
                      />
                    </div>
                    <div>
                      <Label htmlFor="customer_name">Customer Name</Label>
                      <Input
                        id="customer_name"
                        value={formData.customer_name}
                        onChange={(e) => setFormData({ ...formData, customer_name: e.target.value })}
                        placeholder="Enter customer name (optional)"
                      />
                    </div>
                    <div>
                      <Label htmlFor="email">Email</Label>
                      <Input
                        id="email"
                        type="email"
                        value={formData.email}
                        onChange={(e) => setFormData({ ...formData, email: e.target.value })}
                      />
                    </div>
                    <div>
                      <Label htmlFor="address">Address</Label>
                      <Textarea
                        id="address"
                        value={formData.address}
                        onChange={(e) => setFormData({ ...formData, address: e.target.value })}
                      />
                    </div>
                    <div>
                      <Label htmlFor="gst_number">GST Number</Label>
                      <Input
                        id="gst_number"
                        value={formData.gst_number}
                        onChange={(e) => setFormData({ ...formData, gst_number: e.target.value })}
                      />
                    </div>
                    <div>
                      <Label htmlFor="opening_balance">Opening Balance (₹)</Label>
                      <Input
                        id="opening_balance"
                        type="number"
                        step="0.01"
                        value={formData.opening_balance}
                        onChange={(e) => setFormData({ ...formData, opening_balance: e.target.value })}
                        placeholder="Receivable from customer"
                      />
                      <p className="text-xs text-muted-foreground mt-1">
                        Positive = Receivable from customer
                      </p>
                    </div>
                    <div>
                      <Label htmlFor="discount_percent">Discount %</Label>
                      <Input
                        id="discount_percent"
                        type="number"
                        step="0.01"
                        min="0"
                        max="100"
                        value={formData.discount_percent}
                        onChange={(e) => setFormData({ ...formData, discount_percent: e.target.value })}
                        placeholder="Fixed discount for this customer"
                      />
                      <p className="text-xs text-muted-foreground mt-1">
                        Auto-applied on POS & invoices
                      </p>
                    </div>
                    <Button type="submit" className="w-full">
                      {editingCustomer ? "Update" : "Create"} Customer
                    </Button>
                  </form>
                </DialogContent>
              </Dialog>
            </div>
          </div>

          {/* Search + Filter Bar - Slim Professional Row */}
          <div className="flex items-center gap-3 mb-4">
            <div className="relative flex-1 max-w-sm">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-slate-400" />
              <Input
                placeholder="Search by name, phone, email..."
                value={searchQuery}
                onChange={(e) => handleSearchChange(e.target.value)}
                className="h-9 text-sm pl-9 rounded-md border"
              />
            </div>
            {isSomeSelected && (
              <Button 
                variant="destructive" 
                size="sm" 
                className="h-9 text-sm px-4 rounded-md"
                onClick={handleBulkDelete}
                disabled={bulkDeleteCustomers.isPending}
              >
                <Trash2 className="h-4 w-4 mr-2" />
                Delete Selected ({selectedCustomers.size})
              </Button>
            )}
          </div>

          {/* Table - Vasy ERP Grid Precision */}
          <div className="border border-slate-200 rounded-lg overflow-hidden">
            <Table>
              <TableHeader className="bg-slate-100/80 border-b border-slate-200">
                <TableRow className="hover:bg-slate-100/80">
                  <TableHead className="w-12 py-2 px-4 text-[12px] uppercase tracking-wider font-bold text-slate-600">
                    <Checkbox
                      checked={isAllSelected}
                      onCheckedChange={handleSelectAll}
                      aria-label="Select all"
                    />
                  </TableHead>
                   <TableHead className="w-16 py-2 px-4 text-[12px] uppercase tracking-wider font-semibold text-slate-600">Sr No</TableHead>
                   <TableHead className="py-2 px-4 text-[12px] uppercase tracking-wider font-semibold text-slate-600">Customer Name</TableHead>
                   <TableHead className="py-2 px-4 text-[12px] uppercase tracking-wider font-semibold text-slate-600">Mobile</TableHead>
                   <TableHead className="py-2 px-4 text-[12px] uppercase tracking-wider font-semibold text-slate-600">Email</TableHead>
                   <TableHead className="py-2 px-4 text-[12px] uppercase tracking-wider font-semibold text-slate-600">GST</TableHead>
                   <TableHead className="py-2 px-4 text-[12px] uppercase tracking-wider font-semibold text-slate-600 text-right">Opening Bal.</TableHead>
                   <TableHead className="py-2 px-4 text-[12px] uppercase tracking-wider font-semibold text-slate-600 text-right">Advance</TableHead>
                   <TableHead className="py-2 px-4 text-[12px] uppercase tracking-wider font-semibold text-slate-600 text-right">Discount %</TableHead>
                   <TableHead className="py-2 px-4 text-[12px] uppercase tracking-wider font-semibold text-slate-600 text-center">Status</TableHead>
                   <TableHead className="py-2 px-4 text-[12px] uppercase tracking-wider font-semibold text-slate-600 text-right">Actions</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {isLoading ? (
                  <TableRow>
                     <TableCell colSpan={11} className="text-center text-[14px] leading-5 py-8 text-slate-500">Loading...</TableCell>
                   </TableRow>
                 ) : customers.length === 0 ? (
                   <TableRow>
                     <TableCell colSpan={11} className="text-center text-[14px] leading-5 py-8 text-slate-500">No customers found</TableCell>
                  </TableRow>
                ) : (
                  customers.map((customer, index) => (
                    <TableRow 
                      key={customer.id}
                      className="h-12 hover:bg-blue-50/30 transition border-b border-slate-100"
                      onContextMenu={(e) => handleRowContextMenu(e, customer)}
                    >
                      <TableCell className="py-2 px-4">
                        <Checkbox
                          checked={selectedCustomers.has(customer.id)}
                          onCheckedChange={(checked) => handleSelectCustomer(customer.id, !!checked)}
                          aria-label={`Select ${customer.customer_name}`}
                        />
                      </TableCell>
                       <TableCell className="py-2 px-4 text-[14px] leading-5 font-medium tabular-nums text-slate-500">{startIndex + index + 1}</TableCell>
                       <TableCell 
                         className="py-2 px-4 text-[14px] leading-5 font-semibold text-blue-600 cursor-pointer hover:underline"
                        onClick={() => {
                          setSelectedCustomerForHistory({
                            id: customer.id,
                            name: customer.customer_name
                          });
                          setShowCustomerHistory(true);
                        }}
                      >
                        {customer.customer_name}
                      </TableCell>
                       <TableCell className="py-2 px-4 text-[14px] leading-5 tabular-nums text-slate-700">{customer.phone || "-"}</TableCell>
                       <TableCell className="py-2 px-4 text-[14px] leading-5 text-slate-600">{customer.email || "-"}</TableCell>
                       <TableCell className="py-2 px-4 text-[14px] leading-5 tabular-nums text-slate-600">{customer.gst_number || "-"}</TableCell>
                       <TableCell className="py-2 px-4 text-[14px] leading-5 text-right font-medium tabular-nums text-slate-800">
                         {customer.opening_balance ? `₹${customer.opening_balance.toLocaleString('en-IN')}` : "-"}
                       </TableCell>
                       <TableCell className="py-2 px-4 text-[14px] leading-5 text-right font-medium tabular-nums">
                         {advanceBalances[customer.id] ? (
                           <span className="text-purple-600">₹{Math.round(advanceBalances[customer.id]).toLocaleString('en-IN')}</span>
                         ) : "-"}
                       </TableCell>
                       <TableCell className="py-2 px-4 text-[14px] leading-5 text-right font-medium tabular-nums text-slate-700">
                        {customer.discount_percent ? `${customer.discount_percent}%` : "-"}
                      </TableCell>
                      <TableCell className="py-2 px-4 text-center">
                        <span className="px-2.5 py-0.5 rounded-full text-[11px] font-semibold bg-green-100 text-green-700 border border-green-200">
                          Active
                        </span>
                      </TableCell>
                      <TableCell className="py-2 px-4 text-right">
                        <div className="flex items-center justify-end gap-0.5">
                          <button
                            className="h-8 w-8 rounded-md hover:bg-slate-100 flex items-center justify-center transition"
                            onClick={() => navigate("/accounts?tab=customer-ledger&customer=" + customer.id)}
                            title="Account Ledger"
                          >
                            <BookOpen className="h-4 w-4 text-blue-600" />
                          </button>
                          <button
                            className="h-8 w-8 rounded-md hover:bg-slate-100 flex items-center justify-center transition"
                            onClick={() => {
                              setSelectedCustomerForBrandDiscount({
                                id: customer.id,
                                name: customer.customer_name
                              });
                              setShowBrandDiscountDialog(true);
                            }}
                            title="Brand-wise Discount"
                          >
                            <Tag className="h-4 w-4 text-slate-500" />
                          </button>
                          <button
                            className="h-8 w-8 rounded-md hover:bg-slate-100 flex items-center justify-center transition"
                            onClick={() => handleEdit(customer)}
                            title="Edit"
                          >
                            <Pencil className="h-4 w-4 text-slate-500" />
                          </button>
                          <button
                            className="h-8 w-8 rounded-md hover:bg-red-50 flex items-center justify-center transition"
                            onClick={() => handleDelete(customer.id)}
                            title="Delete"
                          >
                            <Trash2 className="h-4 w-4 text-red-400" />
                          </button>
                        </div>
                      </TableCell>
                    </TableRow>
                  ))
                )}
              </TableBody>
            </Table>
          </div>

          {/* Pagination */}
          {totalPages > 1 && (
            <div className="flex items-center justify-between mt-4">
              <p className="text-[13px] text-slate-500">
                Showing {startIndex + 1}–{Math.min(startIndex + ITEMS_PER_PAGE, filteredCount)} of {filteredCount.toLocaleString('en-IN')} customers
              </p>
              <div className="flex items-center gap-2">
                <Button
                  variant="outline"
                  size="sm"
                  className="h-9 text-sm rounded-md"
                  onClick={() => setCurrentPage(p => Math.max(1, p - 1))}
                  disabled={currentPage === 1}
                >
                  Previous
                </Button>
                <span className="text-[13px] text-slate-600 tabular-nums">
                  Page {currentPage} of {totalPages}
                </span>
                <Button
                  variant="outline"
                  size="sm"
                  className="h-9 text-sm rounded-md"
                  onClick={() => setCurrentPage(p => Math.min(totalPages, p + 1))}
                  disabled={currentPage === totalPages}
                >
                  Next
                </Button>
              </div>
            </div>
          )}
        </div>
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
        <LegacyInvoiceImportDialog
          open={showLegacyImport}
          onOpenChange={setShowLegacyImport}
          organizationId={currentOrganization.id}
        />
      )}

      <CustomerHistoryDialog
        open={showCustomerHistory}
        onOpenChange={setShowCustomerHistory}
        customerId={selectedCustomerForHistory?.id || null}
        customerName={selectedCustomerForHistory?.name || ''}
        organizationId={currentOrganization?.id || ''}
      />

      <RelinkLegacyInvoicesDialog
        open={showRelinkDialog}
        onOpenChange={setShowRelinkDialog}
      />

      <UpdateLegacyPhonesDialog
        open={showUpdatePhonesDialog}
        onOpenChange={setShowUpdatePhonesDialog}
      />

      <BrandDiscountDialog
        open={showBrandDiscountDialog}
        onOpenChange={setShowBrandDiscountDialog}
        customer={selectedCustomerForBrandDiscount}
      />

      <CustomerBalanceImportDialog
        open={showBalanceImport}
        onOpenChange={setShowBalanceImport}
      />

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
