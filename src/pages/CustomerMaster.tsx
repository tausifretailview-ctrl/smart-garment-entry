import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useOrganization } from "@/contexts/OrganizationContext";
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
import { Plus, Pencil, Trash2, Search, FileSpreadsheet } from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { ExcelImportDialog } from "@/components/ExcelImportDialog";
import { customerMasterFields, customerMasterSampleData } from "@/utils/excelImportUtils";

interface Customer {
  id: string;
  customer_name: string;
  phone: string | null;
  email: string | null;
  address: string | null;
  gst_number: string | null;
  opening_balance: number | null;
  created_at: string;
}

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
  });
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const { currentOrganization } = useOrganization();
  const [showExcelImport, setShowExcelImport] = useState(false);
  const [importLoading, setImportLoading] = useState(false);

  const { data: customers = [], isLoading } = useQuery({
    queryKey: ["customers", currentOrganization?.id],
    queryFn: async () => {
      if (!currentOrganization?.id) return [];
      const { data, error } = await supabase
        .from("customers")
        .select("*")
        .eq("organization_id", currentOrganization.id)
        .order("created_at", { ascending: false });
      if (error) throw error;
      return data as Customer[];
    },
    enabled: !!currentOrganization?.id,
  });

  const createCustomer = useMutation({
    mutationFn: async (data: typeof formData) => {
      if (!currentOrganization?.id) throw new Error("No organization selected");
      // Use phone as customer name if name is empty
      const customerData = {
        customer_name: data.customer_name.trim() || data.phone,
        phone: data.phone,
        email: data.email,
        address: data.address,
        gst_number: data.gst_number,
        opening_balance: data.opening_balance ? parseFloat(data.opening_balance) : 0,
        organization_id: currentOrganization.id
      };
      const { error } = await supabase.from("customers").insert([customerData]);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["customers"] });
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
      // Use phone as customer name if name is empty
      const customerData = {
        customer_name: data.customer_name.trim() || data.phone,
        phone: data.phone,
        email: data.email,
        address: data.address,
        gst_number: data.gst_number,
        opening_balance: data.opening_balance ? parseFloat(data.opening_balance) : 0,
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

  const deleteCustomer = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from("customers").delete().eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["customers"] });
      toast({ title: "Customer deleted successfully" });
    },
    onError: (error) => {
      toast({ title: "Error deleting customer", description: error.message, variant: "destructive" });
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

  const handleExcelImport = async (mappedData: Record<string, any>[]) => {
    if (!currentOrganization?.id) {
      toast({ title: "No organization selected", variant: "destructive" });
      return;
    }

    setImportLoading(true);
    let successCount = 0;
    let errorCount = 0;

    try {
      for (const row of mappedData) {
        const phone = row.phone?.toString().trim();
        if (!phone) {
          errorCount++;
          continue;
        }

        const customerData = {
          customer_name: row.customer_name?.toString().trim() || phone,
          phone: phone,
          email: row.email?.toString().trim() || '',
          address: row.address?.toString().trim() || '',
          gst_number: row.gst_number?.toString().trim() || '',
          opening_balance: row.opening_balance ? parseFloat(row.opening_balance) : 0,
          organization_id: currentOrganization.id,
        };

        const { error } = await supabase.from("customers").insert([customerData]);
        if (error) {
          console.error('Error inserting customer:', error);
          errorCount++;
        } else {
          successCount++;
        }
      }

      queryClient.invalidateQueries({ queryKey: ["customers"] });
      toast({
        title: "Import completed",
        description: `${successCount} customers imported${errorCount > 0 ? `, ${errorCount} failed` : ''}`,
      });
      setShowExcelImport(false);
    } catch (error) {
      console.error('Import error:', error);
      toast({ title: "Import failed", variant: "destructive" });
    } finally {
      setImportLoading(false);
    }
  };

  return (
    <div className="container mx-auto p-6 space-y-6">
      <BackToDashboard />
      
      <div className="flex justify-between items-center">
        <h1 className="text-3xl font-bold">Customer Master</h1>
        <div className="flex gap-2">
          <Button variant="outline" onClick={() => setShowExcelImport(true)}>
            <FileSpreadsheet className="h-4 w-4 mr-2" />
            Import Excel
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
          onChange={(e) => setSearchQuery(e.target.value)}
          className="max-w-sm"
        />
      </div>

      <div className="border rounded-lg">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Customer Name</TableHead>
              <TableHead>Phone</TableHead>
              <TableHead>Email</TableHead>
              <TableHead>GST Number</TableHead>
              <TableHead className="text-right">Opening Bal.</TableHead>
              <TableHead className="text-right">Actions</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {isLoading ? (
              <TableRow>
                <TableCell colSpan={6} className="text-center">Loading...</TableCell>
              </TableRow>
            ) : filteredCustomers.length === 0 ? (
              <TableRow>
                <TableCell colSpan={6} className="text-center">No customers found</TableCell>
              </TableRow>
            ) : (
              filteredCustomers.map((customer) => (
                <TableRow key={customer.id}>
                  <TableCell className="font-medium">{customer.customer_name}</TableCell>
                  <TableCell>{customer.phone || "-"}</TableCell>
                  <TableCell>{customer.email || "-"}</TableCell>
                  <TableCell>{customer.gst_number || "-"}</TableCell>
                  <TableCell className="text-right">
                    {customer.opening_balance ? `₹${customer.opening_balance.toLocaleString()}` : "-"}
                  </TableCell>
                  <TableCell className="text-right">
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
    </div>
  );
};

export default CustomerMaster;
