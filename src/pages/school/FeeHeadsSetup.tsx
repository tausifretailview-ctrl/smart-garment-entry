import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useOrganization } from "@/contexts/OrganizationContext";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Switch } from "@/components/ui/switch";
import { toast } from "sonner";
import { Plus, Pencil, Trash2, CreditCard, Loader2 } from "lucide-react";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";

interface FeeHead {
  id: string;
  head_name: string;
  description: string | null;
  is_active: boolean | null;
  is_refundable: boolean | null;
  display_order: number | null;
  organization_id: string;
}

const FeeHeadsSetup = () => {
  const { currentOrganization } = useOrganization();
  const queryClient = useQueryClient();
  const [isDialogOpen, setIsDialogOpen] = useState(false);
  const [editingHead, setEditingHead] = useState<FeeHead | null>(null);
  const [formData, setFormData] = useState({
    head_name: "",
    description: "",
    is_active: true,
    is_refundable: false,
    display_order: 0,
  });

  const { data: feeHeads, isLoading } = useQuery({
    queryKey: ["fee-heads", currentOrganization?.id],
    queryFn: async () => {
      if (!currentOrganization?.id) return [];
      const { data, error } = await supabase
        .from("fee_heads")
        .select("*")
        .eq("organization_id", currentOrganization.id)
        .order("display_order", { ascending: true });
      if (error) throw error;
      return data as FeeHead[];
    },
    enabled: !!currentOrganization?.id,
  });

  const createMutation = useMutation({
    mutationFn: async (data: typeof formData) => {
      const { error } = await supabase.from("fee_heads").insert({
        ...data,
        organization_id: currentOrganization!.id,
      });
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["fee-heads"] });
      toast.success("Fee head created successfully");
      closeDialog();
    },
    onError: (error: any) => {
      toast.error(error.message || "Failed to create fee head");
    },
  });

  const updateMutation = useMutation({
    mutationFn: async ({ id, data }: { id: string; data: typeof formData }) => {
      const { error } = await supabase
        .from("fee_heads")
        .update(data)
        .eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["fee-heads"] });
      toast.success("Fee head updated successfully");
      closeDialog();
    },
    onError: (error: any) => {
      toast.error(error.message || "Failed to update fee head");
    },
  });

  const deleteMutation = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from("fee_heads").delete().eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["fee-heads"] });
      toast.success("Fee head deleted successfully");
    },
    onError: (error: any) => {
      toast.error(error.message || "Failed to delete fee head");
    },
  });

  const closeDialog = () => {
    setIsDialogOpen(false);
    setEditingHead(null);
    setFormData({
      head_name: "",
      description: "",
      is_active: true,
      is_refundable: false,
      display_order: 0,
    });
  };

  const openCreateDialog = () => {
    setEditingHead(null);
    setFormData({
      head_name: "",
      description: "",
      is_active: true,
      is_refundable: false,
      display_order: (feeHeads?.length || 0) + 1,
    });
    setIsDialogOpen(true);
  };

  const openEditDialog = (head: FeeHead) => {
    setEditingHead(head);
    setFormData({
      head_name: head.head_name,
      description: head.description || "",
      is_active: head.is_active ?? true,
      is_refundable: head.is_refundable ?? false,
      display_order: head.display_order ?? 0,
    });
    setIsDialogOpen(true);
  };

  const handleSubmit = () => {
    if (!formData.head_name.trim()) {
      toast.error("Fee head name is required");
      return;
    }

    if (editingHead) {
      updateMutation.mutate({ id: editingHead.id, data: formData });
    } else {
      createMutation.mutate(formData);
    }
  };

  const handleDelete = (id: string, name: string) => {
    if (confirm(`Are you sure you want to delete "${name}"?`)) {
      deleteMutation.mutate(id);
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
          <CreditCard className="h-8 w-8 text-primary" />
          <div>
            <h1 className="text-2xl font-bold">Yearly Fees 2025-26</h1>
            <p className="text-muted-foreground">
              Manage yearly fee categories like Tuition, Transport, Library, etc.
            </p>
          </div>
        </div>
        <Button onClick={openCreateDialog}>
          <Plus className="h-4 w-4 mr-2" />
          Add Fee Head
        </Button>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>All Fee Heads</CardTitle>
        </CardHeader>
        <CardContent>
          {isLoading ? (
            <div className="flex items-center justify-center h-32">
              <Loader2 className="h-6 w-6 animate-spin" />
            </div>
          ) : feeHeads?.length === 0 ? (
            <div className="text-center py-8 text-muted-foreground">
              <CreditCard className="h-12 w-12 mx-auto mb-4 opacity-50" />
              <p>No fee heads created yet.</p>
              <p className="text-sm">Click "Add Fee Head" to get started.</p>
            </div>
          ) : (
            <Table>
              <TableHeader className="bg-sidebar">
                <TableRow>
                  <TableHead className="w-12">#</TableHead>
                  <TableHead>Name</TableHead>
                  <TableHead>Description</TableHead>
                  <TableHead className="text-center">Active</TableHead>
                  <TableHead className="text-center">Refundable</TableHead>
                  <TableHead className="w-24">Actions</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {feeHeads?.map((head, index) => (
                  <TableRow key={head.id}>
                    <TableCell className="font-medium">{index + 1}</TableCell>
                    <TableCell className="font-medium">{head.head_name}</TableCell>
                    <TableCell className="text-muted-foreground">
                      {head.description || "-"}
                    </TableCell>
                    <TableCell className="text-center">
                      <span
                        className={`inline-flex px-2 py-1 rounded-full text-xs ${
                          head.is_active
                            ? "bg-green-100 text-green-800 dark:bg-green-900 dark:text-green-200"
                            : "bg-gray-100 text-gray-800 dark:bg-gray-800 dark:text-gray-200"
                        }`}
                      >
                        {head.is_active ? "Yes" : "No"}
                      </span>
                    </TableCell>
                    <TableCell className="text-center">
                      <span
                        className={`inline-flex px-2 py-1 rounded-full text-xs ${
                          head.is_refundable
                            ? "bg-blue-100 text-blue-800 dark:bg-blue-900 dark:text-blue-200"
                            : "bg-gray-100 text-gray-800 dark:bg-gray-800 dark:text-gray-200"
                        }`}
                      >
                        {head.is_refundable ? "Yes" : "No"}
                      </span>
                    </TableCell>
                    <TableCell>
                      <div className="flex items-center gap-2">
                        <Button
                          variant="ghost"
                          size="icon"
                          onClick={() => openEditDialog(head)}
                        >
                          <Pencil className="h-4 w-4" />
                        </Button>
                        <Button
                          variant="ghost"
                          size="icon"
                          onClick={() => handleDelete(head.id, head.head_name)}
                        >
                          <Trash2 className="h-4 w-4 text-destructive" />
                        </Button>
                      </div>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>

      <Dialog open={isDialogOpen} onOpenChange={setIsDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>
              {editingHead ? "Edit Fee Head" : "Add New Fee Head"}
            </DialogTitle>
          </DialogHeader>
          <div className="space-y-4 py-4">
            <div className="space-y-2">
              <Label htmlFor="head_name">Fee Head Name *</Label>
              <Input
                id="head_name"
                value={formData.head_name}
                onChange={(e) =>
                  setFormData({ ...formData, head_name: e.target.value })
                }
                placeholder="e.g., Tuition Fee, Transport Fee"
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="description">Description</Label>
              <Textarea
                id="description"
                value={formData.description}
                onChange={(e) =>
                  setFormData({ ...formData, description: e.target.value })
                }
                placeholder="Optional description..."
                rows={3}
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="display_order">Display Order</Label>
              <Input
                id="display_order"
                type="number"
                value={formData.display_order}
                onChange={(e) =>
                  setFormData({
                    ...formData,
                    display_order: parseInt(e.target.value) || 0,
                  })
                }
              />
            </div>
            <div className="flex items-center justify-between">
              <Label htmlFor="is_active">Active</Label>
              <Switch
                id="is_active"
                checked={formData.is_active}
                onCheckedChange={(checked) =>
                  setFormData({ ...formData, is_active: checked })
                }
              />
            </div>
            <div className="flex items-center justify-between">
              <Label htmlFor="is_refundable">Refundable</Label>
              <Switch
                id="is_refundable"
                checked={formData.is_refundable}
                onCheckedChange={(checked) =>
                  setFormData({ ...formData, is_refundable: checked })
                }
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={closeDialog}>
              Cancel
            </Button>
            <Button
              onClick={handleSubmit}
              disabled={createMutation.isPending || updateMutation.isPending}
            >
              {createMutation.isPending || updateMutation.isPending ? (
                <Loader2 className="h-4 w-4 animate-spin mr-2" />
              ) : null}
              {editingHead ? "Update" : "Create"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
};

export default FeeHeadsSetup;
