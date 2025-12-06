import { useState } from "react";
import { useNavigate, useLocation } from "react-router-dom";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useOrganization } from "@/contexts/OrganizationContext";
import { BackToDashboard } from "@/components/BackToDashboard";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
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
import { ExcelImportDialog, ImportProgress } from "@/components/ExcelImportDialog";
import { supplierMasterFields, supplierMasterSampleData, normalizePhoneNumber } from "@/utils/excelImportUtils";

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
  const navigate = useNavigate();
  const location = useLocation();
  const returnTo = (location.state as any)?.returnTo;
  const [showExcelImport, setShowExcelImport] = useState(false);

  const { data: suppliers = [], isLoading } = useQuery({
    queryKey: ["suppliers", currentOrganization?.id],
    queryFn: async () => {
      if (!currentOrganization?.id) return [];
      const { data, error } = await supabase
        .from("suppliers")
        .select("*")
        .eq("organization_id", currentOrganization.id)
        .order("created_at", { ascending: false });
      if (error) throw error;
      return data as Supplier[];
    },
    enabled: !!currentOrganization?.id,
  });

  const createSupplier = useMutation({
    mutationFn: async (data: typeof formData) => {
      if (!currentOrganization?.id) throw new Error("No organization selected");
      const { data: newSupplier, error } = await supabase.from("suppliers").insert([{
        supplier_name: data.supplier_name,
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
      toast({ title: "Supplier created successfully" });
      resetForm();
      setIsDialogOpen(false);
      
      // If coming from purchase entry, navigate back with the created supplier
      if (returnTo === "/purchase-entry") {
        navigate("/purchase-entry", { 
          state: { createdSupplier: newSupplier } 
        });
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

  const deleteSupplier = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from("suppliers").delete().eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["suppliers"] });
      toast({ title: "Supplier deleted successfully" });
    },
    onError: (error) => {
      toast({ title: "Error deleting supplier", description: error.message, variant: "destructive" });
    },
  });

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

  const filteredSuppliers = suppliers.filter((supplier) =>
    supplier.supplier_name.toLowerCase().includes(searchQuery.toLowerCase()) ||
    supplier.contact_person?.toLowerCase().includes(searchQuery.toLowerCase()) ||
    supplier.phone?.toLowerCase().includes(searchQuery.toLowerCase()) ||
    supplier.supplier_code?.toLowerCase().includes(searchQuery.toLowerCase())
  );

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

    // Filter out empty rows (no supplier_name)
    const validRows = mappedData.filter(row => {
      const supplierName = row.supplier_name?.toString().trim();
      return supplierName && supplierName.length > 0;
    });

    // Get existing supplier names to check for duplicates
    const { data: existingSuppliers } = await supabase
      .from("suppliers")
      .select("supplier_name")
      .eq("organization_id", currentOrganization.id);
    
    const existingNames = new Set(
      (existingSuppliers || [])
        .map(s => s.supplier_name?.toString().trim().toLowerCase())
        .filter(Boolean)
    );

    // Process in batches
    for (let i = 0; i < validRows.length; i += BATCH_SIZE) {
      const batch = validRows.slice(i, i + BATCH_SIZE);
      const suppliersToInsert: any[] = [];

      for (const row of batch) {
        const supplierName = row.supplier_name?.toString().trim();
        
        // Skip duplicates
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

        // Add to existing set to prevent duplicates within same import
        existingNames.add(supplierName.toLowerCase());
      }

      if (suppliersToInsert.length > 0) {
        const { error } = await supabase
          .from("suppliers")
          .insert(suppliersToInsert);
        
        if (error) {
          console.error('Batch insert error:', error);
          errorCount += suppliersToInsert.length;
        } else {
          successCount += suppliersToInsert.length;
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

    queryClient.invalidateQueries({ queryKey: ["suppliers"] });
    
    const skippedEmptyRows = mappedData.length - validRows.length;
    let description = `${successCount} suppliers imported`;
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
    <div className="container mx-auto p-6 space-y-6">
      <BackToDashboard />
      
      <div className="flex justify-between items-center">
        <h1 className="text-3xl font-bold">Supplier Master</h1>
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
                <Input
                  id="supplier_name"
                  value={formData.supplier_name}
                  onChange={(e) => setFormData({ ...formData, supplier_name: e.target.value })}
                  required
                />
              </div>
              <div>
                <Label htmlFor="contact_person">Contact Person</Label>
                <Input
                  id="contact_person"
                  value={formData.contact_person}
                  onChange={(e) => setFormData({ ...formData, contact_person: e.target.value })}
                />
              </div>
              <div>
                <Label htmlFor="phone">Phone</Label>
                <Input
                  id="phone"
                  value={formData.phone}
                  onChange={(e) => setFormData({ ...formData, phone: e.target.value })}
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
                <Label htmlFor="supplier_code">Supplier Code</Label>
                <Input
                  id="supplier_code"
                  value={formData.supplier_code}
                  onChange={(e) => setFormData({ ...formData, supplier_code: e.target.value })}
                  placeholder="Enter supplier code (optional)"
                />
                <p className="text-xs text-muted-foreground mt-1">
                  This code will be displayed on barcode labels to identify the supplier
                </p>
              </div>
              <div>
                <Label htmlFor="opening_balance">Opening Balance (₹)</Label>
                <Input
                  id="opening_balance"
                  type="number"
                  step="0.01"
                  value={formData.opening_balance}
                  onChange={(e) => setFormData({ ...formData, opening_balance: e.target.value })}
                  placeholder="Payable to supplier"
                />
                <p className="text-xs text-muted-foreground mt-1">
                  Positive = Payable to supplier
                </p>
              </div>
              <Button type="submit" className="w-full">
                {editingSupplier ? "Update" : "Create"} Supplier
              </Button>
            </form>
          </DialogContent>
        </Dialog>
        </div>
      </div>

      <div className="flex items-center gap-2">
        <Search className="h-4 w-4 text-muted-foreground" />
        <Input
          placeholder="Search suppliers..."
          value={searchQuery}
          onChange={(e) => setSearchQuery(e.target.value)}
          className="max-w-sm"
        />
      </div>

      <div className="border rounded-lg">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead className="w-16">Sr No</TableHead>
              <TableHead>Supplier Name</TableHead>
              <TableHead>Contact Person</TableHead>
              <TableHead>Phone</TableHead>
              <TableHead>Email</TableHead>
              <TableHead>GST Number</TableHead>
              <TableHead>Supplier Code</TableHead>
              <TableHead className="text-right">Opening Bal.</TableHead>
              <TableHead className="text-right">Actions</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {isLoading ? (
              <TableRow>
                <TableCell colSpan={9} className="text-center">Loading...</TableCell>
              </TableRow>
            ) : filteredSuppliers.length === 0 ? (
              <TableRow>
                <TableCell colSpan={9} className="text-center">No suppliers found</TableCell>
              </TableRow>
            ) : (
              filteredSuppliers.map((supplier, index) => (
                <TableRow key={supplier.id}>
                  <TableCell className="text-muted-foreground">{index + 1}</TableCell>
                  <TableCell className="font-medium">{supplier.supplier_name}</TableCell>
                  <TableCell>{supplier.contact_person || "-"}</TableCell>
                  <TableCell>{supplier.phone || "-"}</TableCell>
                  <TableCell>{supplier.email || "-"}</TableCell>
                  <TableCell>{supplier.gst_number || "-"}</TableCell>
                  <TableCell>
                    {supplier.supplier_code ? (
                      <Badge variant="secondary">{supplier.supplier_code}</Badge>
                    ) : (
                      "-"
                    )}
                  </TableCell>
                  <TableCell className="text-right">
                    {supplier.opening_balance ? `₹${supplier.opening_balance.toLocaleString()}` : "-"}
                  </TableCell>
                  <TableCell className="text-right">
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={() => handleEdit(supplier)}
                    >
                      <Pencil className="h-4 w-4" />
                    </Button>
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={() => handleDelete(supplier.id)}
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
        targetFields={supplierMasterFields}
        onImport={handleExcelImport}
        sampleData={supplierMasterSampleData}
        sampleFileName="Supplier_Master_Sample.xlsx"
        title="Import Suppliers"
      />
    </div>
  );
};

export default SupplierMaster;
