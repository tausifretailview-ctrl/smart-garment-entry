import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useOrganization } from "@/contexts/OrganizationContext";
import { useDashboardInvalidation } from "@/hooks/useDashboardInvalidation";
import { BackToDashboard } from "@/components/BackToDashboard";
import { Card } from "@/components/ui/card";
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
import { Plus, Pencil, Trash2, Search, FileSpreadsheet, CheckSquare, History, Link2, Phone, Tag } from "lucide-react";
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
  const [selectedCustomers, setSelectedCustomers] = useState<Set<string>>(new Set());
  const [currentPage, setCurrentPage] = useState(1);
  const [showCustomerHistory, setShowCustomerHistory] = useState(false);
  const [selectedCustomerForHistory, setSelectedCustomerForHistory] = useState<{ id: string; name: string } | null>(null);
  const [showRelinkDialog, setShowRelinkDialog] = useState(false);
  const [showBrandDiscountDialog, setShowBrandDiscountDialog] = useState(false);
  const [selectedCustomerForBrandDiscount, setSelectedCustomerForBrandDiscount] = useState<{ id: string; name: string } | null>(null);
  const [showUpdatePhonesDialog, setShowUpdatePhonesDialog] = useState(false);

  // Fetch ALL customers using pagination to bypass 1000 row limit
  const { data: customers = [], isLoading } = useQuery({
    queryKey: ["customers", currentOrganization?.id],
    queryFn: async () => {
      if (!currentOrganization?.id) return [];
      
      const allCustomers: Customer[] = [];
      const PAGE_SIZE = 1000;
      let offset = 0;
      let hasMore = true;
      
      while (hasMore) {
        const { data, error } = await supabase
          .from("customers")
          .select("*")
          .eq("organization_id", currentOrganization.id)
          .order("created_at", { ascending: false })
          .range(offset, offset + PAGE_SIZE - 1);
        
        if (error) throw error;
        
        if (data && data.length > 0) {
          allCustomers.push(...(data as Customer[]));
          offset += PAGE_SIZE;
          hasMore = data.length === PAGE_SIZE;
        } else {
          hasMore = false;
        }
      }
      
      return allCustomers;
    },
    enabled: !!currentOrganization?.id,
  });

  const createCustomer = useMutation({
    mutationFn: async (data: typeof formData) => {
      if (!currentOrganization?.id) throw new Error("No organization selected");
      const normalizedPhone = normalizePhoneNumber(data.phone);
      
      if (!normalizedPhone) {
        throw new Error("Valid phone number is required");
      }
      
      // Check for existing customer with same phone
      const { data: existingCustomers, error: checkError } = await supabase
        .from("customers")
        .select("id, customer_name, phone")
        .eq("organization_id", currentOrganization.id)
        .is("deleted_at", null);
      
      if (checkError) throw checkError;
      
      // Find duplicate by normalized phone
      const duplicate = existingCustomers?.find(c => 
        normalizePhoneNumber(c.phone) === normalizedPhone
      );
      
      if (duplicate) {
        throw new Error(`Customer with this phone already exists: ${duplicate.customer_name || duplicate.phone}`);
      }
      
      // Use phone as customer name if name is empty
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
      invalidateCustomers(); // Update dashboard counts
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
      
      // Check for existing customer with same phone (excluding current customer)
      const { data: existingCustomers, error: checkError } = await supabase
        .from("customers")
        .select("id, customer_name, phone")
        .eq("organization_id", currentOrganization.id)
        .is("deleted_at", null)
        .neq("id", id);
      
      if (checkError) throw checkError;
      
      // Find duplicate by normalized phone
      const duplicate = existingCustomers?.find(c => 
        normalizePhoneNumber(c.phone) === normalizedPhone
      );
      
      if (duplicate) {
        throw new Error(`Customer with this phone already exists: ${duplicate.customer_name || duplicate.phone}`);
      }
      
      // Use phone as customer name if name is empty
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

  const filteredCustomers = customers.filter((customer) =>
    customer.customer_name.toLowerCase().includes(searchQuery.toLowerCase()) ||
    customer.phone?.toLowerCase().includes(searchQuery.toLowerCase()) ||
    customer.email?.toLowerCase().includes(searchQuery.toLowerCase())
  );

  // Pagination
  const totalPages = Math.ceil(filteredCustomers.length / ITEMS_PER_PAGE);
  const startIndex = (currentPage - 1) * ITEMS_PER_PAGE;
  const paginatedCustomers = filteredCustomers.slice(startIndex, startIndex + ITEMS_PER_PAGE);

  // Reset to page 1 when search changes
  const handleSearchChange = (value: string) => {
    setSearchQuery(value);
    setCurrentPage(1);
  };

  const handleSelectAll = (checked: boolean) => {
    if (checked) {
      setSelectedCustomers(new Set(filteredCustomers.map(c => c.id)));
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

  const isAllSelected = filteredCustomers.length > 0 && filteredCustomers.every(c => selectedCustomers.has(c.id));
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

    // Filter out empty rows (no phone) and normalize phone numbers
    const validRows = mappedData.filter(row => {
      const phone = normalizePhoneNumber(row.phone);
      return phone && phone.length > 0;
    });

    // Get existing phone numbers to check for duplicates (normalized)
    const { data: existingCustomers } = await supabase
      .from("customers")
      .select("phone")
      .eq("organization_id", currentOrganization.id);
    
    const existingPhones = new Set(
      (existingCustomers || [])
        .map(c => normalizePhoneNumber(c.phone))
        .filter(Boolean)
    );

    // Process in batches
    for (let i = 0; i < validRows.length; i += BATCH_SIZE) {
      const batch = validRows.slice(i, i + BATCH_SIZE);
      const customersToInsert: any[] = [];

      for (const row of batch) {
        const phone = normalizePhoneNumber(row.phone);
        
        // Skip duplicates
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

        // Add to existing set to prevent duplicates within same import
        existingPhones.add(phone);
      }

      if (customersToInsert.length > 0) {
        const { error, data } = await supabase
          .from("customers")
          .insert(customersToInsert);
        
        if (error) {
          console.error('Batch insert error:', error);
          errorCount += customersToInsert.length;
        } else {
          successCount += customersToInsert.length;
        }
      }

      // Report progress
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
    <div className="space-y-4">
      <BackToDashboard />
      
      <div className="flex justify-between items-center">
        <h1 className="text-2xl font-bold text-foreground">Customer Master</h1>
        <div className="flex gap-2">
          <Button variant="outline" onClick={() => setShowLegacyImport(true)}>
            <History className="h-4 w-4 mr-2" />
            Import Legacy Invoices
          </Button>
          <Button variant="outline" onClick={() => setShowUpdatePhonesDialog(true)}>
            <Phone className="h-4 w-4 mr-2" />
            Update Legacy Phones
          </Button>
          <Button variant="outline" onClick={() => setShowRelinkDialog(true)}>
            <Link2 className="h-4 w-4 mr-2" />
            Re-link Legacy
          </Button>
          <Button variant="outline" onClick={() => setShowExcelImport(true)}>
            <FileSpreadsheet className="h-4 w-4 mr-2" />
            Import Customers
          </Button>
          <Dialog open={isDialogOpen} onOpenChange={(open) => {
            setIsDialogOpen(open);
            if (!open) resetForm();
          }}>
            <DialogTrigger asChild>
              <Button>
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

      <div className="flex items-center gap-2">
        <Search className="h-4 w-4 text-muted-foreground" />
        <Input
          placeholder="Search customers..."
          value={searchQuery}
          onChange={(e) => handleSearchChange(e.target.value)}
          className="max-w-sm"
        />
        {isSomeSelected && (
          <Button 
            variant="destructive" 
            size="sm" 
            onClick={handleBulkDelete}
            disabled={bulkDeleteCustomers.isPending}
          >
            <Trash2 className="h-4 w-4 mr-2" />
            Delete Selected ({selectedCustomers.size})
          </Button>
        )}
      </div>

      <Card className="border-border">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead className="w-12">
                <Checkbox
                  checked={isAllSelected}
                  onCheckedChange={handleSelectAll}
                  aria-label="Select all"
                />
              </TableHead>
              <TableHead className="w-16">Sr No</TableHead>
              <TableHead>Customer Name</TableHead>
              <TableHead>Phone</TableHead>
              <TableHead>Email</TableHead>
              <TableHead>GST Number</TableHead>
              <TableHead className="text-right">Opening Bal.</TableHead>
              <TableHead className="text-right">Discount %</TableHead>
              <TableHead className="text-right">Actions</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {isLoading ? (
              <TableRow>
                <TableCell colSpan={9} className="text-center">Loading...</TableCell>
              </TableRow>
            ) : filteredCustomers.length === 0 ? (
              <TableRow>
                <TableCell colSpan={9} className="text-center">No customers found</TableCell>
              </TableRow>
            ) : (
              paginatedCustomers.map((customer, index) => (
                <TableRow key={customer.id}>
                  <TableCell>
                    <Checkbox
                      checked={selectedCustomers.has(customer.id)}
                      onCheckedChange={(checked) => handleSelectCustomer(customer.id, !!checked)}
                      aria-label={`Select ${customer.customer_name}`}
                    />
                  </TableCell>
                  <TableCell className="text-muted-foreground">{startIndex + index + 1}</TableCell>
                  <TableCell 
                    className="font-medium cursor-pointer text-primary hover:underline"
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
                  <TableCell>{customer.phone || "-"}</TableCell>
                  <TableCell>{customer.email || "-"}</TableCell>
                  <TableCell>{customer.gst_number || "-"}</TableCell>
                  <TableCell className="text-right">
                    {customer.opening_balance ? `₹${customer.opening_balance.toLocaleString()}` : "-"}
                  </TableCell>
                  <TableCell className="text-right">
                    {customer.discount_percent ? `${customer.discount_percent}%` : "-"}
                  </TableCell>
                  <TableCell className="text-right">
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={() => {
                        setSelectedCustomerForBrandDiscount({
                          id: customer.id,
                          name: customer.customer_name
                        });
                        setShowBrandDiscountDialog(true);
                      }}
                      title="Brand-wise Discount"
                    >
                      <Tag className="h-4 w-4" />
                    </Button>
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={() => handleEdit(customer)}
                    >
                      <Pencil className="h-4 w-4" />
                    </Button>
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={() => handleDelete(customer.id)}
                    >
                      <Trash2 className="h-4 w-4" />
                    </Button>
                  </TableCell>
                </TableRow>
              ))
            )}
          </TableBody>
        </Table>
      </Card>

      {/* Pagination */}
      {totalPages > 1 && (
        <div className="flex items-center justify-between">
          <p className="text-sm text-muted-foreground">
            Showing {startIndex + 1}-{Math.min(startIndex + ITEMS_PER_PAGE, filteredCustomers.length)} of {filteredCustomers.length} customers
          </p>
          <div className="flex items-center gap-2">
            <Button
              variant="outline"
              size="sm"
              onClick={() => setCurrentPage(p => Math.max(1, p - 1))}
              disabled={currentPage === 1}
            >
              Previous
            </Button>
            <span className="text-sm">
              Page {currentPage} of {totalPages}
            </span>
            <Button
              variant="outline"
              size="sm"
              onClick={() => setCurrentPage(p => Math.min(totalPages, p + 1))}
              disabled={currentPage === totalPages}
            >
              Next
            </Button>
          </div>
        </div>
      )}

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

      {/* Customer History Dialog */}
      <CustomerHistoryDialog
        open={showCustomerHistory}
        onOpenChange={setShowCustomerHistory}
        customerId={selectedCustomerForHistory?.id || null}
        customerName={selectedCustomerForHistory?.name || ''}
        organizationId={currentOrganization?.id || ''}
      />

      {/* Re-link Legacy Invoices Dialog */}
      <RelinkLegacyInvoicesDialog
        open={showRelinkDialog}
        onOpenChange={setShowRelinkDialog}
      />

      {/* Update Legacy Phones Dialog */}
      <UpdateLegacyPhonesDialog
        open={showUpdatePhonesDialog}
        onOpenChange={setShowUpdatePhonesDialog}
      />

      {/* Brand Discount Dialog */}
      <BrandDiscountDialog
        open={showBrandDiscountDialog}
        onOpenChange={setShowBrandDiscountDialog}
        customer={selectedCustomerForBrandDiscount}
      />
    </div>
  );
};

export default CustomerMaster;
