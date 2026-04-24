import { useState, useEffect } from "react";
import { Plus, Trash2, Edit, Check, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { useToast } from "@/hooks/use-toast";
import { supabase } from "@/integrations/supabase/client";
import { useOrganization } from "@/contexts/OrganizationContext";
import { withJwtRetry } from "@/lib/jwtRetry";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";

interface SizeGroup {
  id: string;
  group_name: string;
  sizes: string[];
}

export function SizeGroupManagement() {
  const { toast } = useToast();
  const { currentOrganization } = useOrganization();
  const [sizeGroups, setSizeGroups] = useState<SizeGroup[]>([]);
  const [loading, setLoading] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [deleteDialogOpen, setDeleteDialogOpen] = useState(false);
  const [deleteId, setDeleteId] = useState<string | null>(null);
  const [newGroup, setNewGroup] = useState({ group_name: "", sizes: "" });
  const [editGroup, setEditGroup] = useState({ group_name: "", sizes: "" });

  useEffect(() => {
    fetchSizeGroups();
  }, [currentOrganization?.id]);

  const fetchSizeGroups = async () => {
    if (!currentOrganization?.id) return;
    
    try {
      const { data, error } = await supabase
        .from("size_groups")
        .select("*")
        .eq("organization_id", currentOrganization.id)
        .order("group_name");

      if (error) throw error;
      
      const typedData = (data || []).map(group => ({
        id: group.id,
        group_name: group.group_name,
        sizes: Array.isArray(group.sizes) ? group.sizes.map(s => String(s)) : []
      }));
      
      // Check if "Free Size" group exists, if not create it
      const freeSizeExists = typedData.some(g => g.group_name.toLowerCase() === 'free size');
      if (!freeSizeExists) {
        const { data: newGroup, error: insertError } = await supabase
          .from("size_groups")
          .insert({
            group_name: "Free Size",
            sizes: ["Free"],
            organization_id: currentOrganization.id,
          })
          .select()
          .single();
          
        if (!insertError && newGroup) {
          typedData.push({
            id: newGroup.id,
            group_name: newGroup.group_name,
            sizes: Array.isArray(newGroup.sizes) ? newGroup.sizes.map(s => String(s)) : []
          });
        }
      }
      
      setSizeGroups(typedData);
    } catch (error) {
      console.error("Error fetching size groups:", error);
      toast({
        title: "Error",
        description: "Failed to fetch size groups",
        variant: "destructive",
      });
    }
  };

  const handleAdd = async () => {
    if (!newGroup.group_name || !newGroup.sizes) {
      toast({
        title: "Validation Error",
        description: "Please fill in all fields",
        variant: "destructive",
      });
      return;
    }

    if (!currentOrganization?.id) {
      toast({
        title: "Error",
        description: "No organization selected",
        variant: "destructive",
      });
      return;
    }

    setLoading(true);
    try {
      const sizesArray = newGroup.sizes.split(",").map(s => s.trim()).filter(s => s);
      
      const { error } = await withJwtRetry(() =>
        supabase
          .from("size_groups")
          .insert({
            group_name: newGroup.group_name,
            sizes: sizesArray,
            organization_id: currentOrganization.id,
          })
      );

      if (error) {
        console.error("Database error details:", error);
        throw error;
      }

      toast({
        title: "Success",
        description: "Size group added successfully",
      });

      setNewGroup({ group_name: "", sizes: "" });
      fetchSizeGroups();
    } catch (error: any) {
      console.error("Error adding size group:", error);
      const errorMessage = error?.message || "Failed to add size group";
      toast({
        title: "Error",
        description: errorMessage,
        variant: "destructive",
      });
    } finally {
      setLoading(false);
    }
  };

  const handleEdit = (group: SizeGroup) => {
    setEditingId(group.id);
    setEditGroup({
      group_name: group.group_name,
      sizes: group.sizes.join(", "),
    });
  };

  const handleSaveEdit = async () => {
    if (!editingId) return;

    setLoading(true);
    try {
      const sizesArray = editGroup.sizes.split(",").map(s => s.trim()).filter(s => s);
      
      const { error } = await withJwtRetry(() =>
        supabase
          .from("size_groups")
          .update({
            group_name: editGroup.group_name,
            sizes: sizesArray,
          })
          .eq("id", editingId)
      );

      if (error) throw error;

      toast({
        title: "Success",
        description: "Size group updated successfully",
      });

      setEditingId(null);
      fetchSizeGroups();
    } catch (error) {
      console.error("Error updating size group:", error);
      toast({
        title: "Error",
        description: "Failed to update size group",
        variant: "destructive",
      });
    } finally {
      setLoading(false);
    }
  };

  const handleCancelEdit = () => {
    setEditingId(null);
    setEditGroup({ group_name: "", sizes: "" });
  };

  const handleDelete = async () => {
    if (!deleteId) return;

    setLoading(true);
    try {
      const { error } = await withJwtRetry(() =>
        supabase
          .from("size_groups")
          .delete()
          .eq("id", deleteId)
      );

      if (error) throw error;

      toast({
        title: "Success",
        description: "Size group deleted successfully",
      });

      setDeleteDialogOpen(false);
      setDeleteId(null);
      fetchSizeGroups();
    } catch (error) {
      console.error("Error deleting size group:", error);
      toast({
        title: "Error",
        description: "Failed to delete size group",
        variant: "destructive",
      });
    } finally {
      setLoading(false);
    }
  };

  return (
    <>
      <Card className="mt-4">
        <CardHeader>
          <CardTitle>Size Group Management</CardTitle>
          <CardDescription>
            Create and manage size groups for your products
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          {/* Add New Size Group */}
          <div className="border rounded-lg p-4 space-y-4">
            <h3 className="font-medium">Add New Size Group</h3>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label htmlFor="new_group_name">Group Name</Label>
                <Input
                  id="new_group_name"
                  placeholder="e.g., S-XXL"
                  value={newGroup.group_name}
                  onChange={(e) =>
                    setNewGroup({ ...newGroup, group_name: e.target.value })
                  }
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="new_sizes">Sizes (comma separated)</Label>
                <Input
                  id="new_sizes"
                  placeholder="e.g., S, M, L, XL, XXL"
                  value={newGroup.sizes}
                  onChange={(e) =>
                    setNewGroup({ ...newGroup, sizes: e.target.value })
                  }
                />
              </div>
            </div>
            <Button onClick={handleAdd} disabled={loading}>
              <Plus className="h-4 w-4 mr-2" />
              Add Size Group
            </Button>
          </div>

          {/* Size Groups List */}
          <div className="border rounded-lg">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Group Name</TableHead>
                  <TableHead>Sizes</TableHead>
                  <TableHead className="text-right">Actions</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {sizeGroups.length === 0 ? (
                  <TableRow>
                    <TableCell colSpan={3} className="text-center text-muted-foreground">
                      No size groups found. Add one to get started.
                    </TableCell>
                  </TableRow>
                ) : (
                  sizeGroups.map((group) => (
                    <TableRow key={group.id}>
                      <TableCell>
                        {editingId === group.id ? (
                          <Input
                            value={editGroup.group_name}
                            onChange={(e) =>
                              setEditGroup({ ...editGroup, group_name: e.target.value })
                            }
                          />
                        ) : (
                          <span className="font-medium">{group.group_name}</span>
                        )}
                      </TableCell>
                      <TableCell>
                        {editingId === group.id ? (
                          <Input
                            value={editGroup.sizes}
                            onChange={(e) =>
                              setEditGroup({ ...editGroup, sizes: e.target.value })
                            }
                            placeholder="e.g., S, M, L"
                          />
                        ) : (
                          <div className="flex flex-wrap gap-1">
                            {group.sizes.map((size, idx) => (
                              <span
                                key={idx}
                                className="inline-flex items-center px-2 py-1 rounded-md bg-secondary text-secondary-foreground text-xs"
                              >
                                {size}
                              </span>
                            ))}
                          </div>
                        )}
                      </TableCell>
                      <TableCell className="text-right">
                        {editingId === group.id ? (
                          <div className="flex justify-end gap-2">
                            <Button
                              size="sm"
                              variant="ghost"
                              onClick={handleSaveEdit}
                              disabled={loading}
                            >
                              <Check className="h-4 w-4" />
                            </Button>
                            <Button
                              size="sm"
                              variant="ghost"
                              onClick={handleCancelEdit}
                            >
                              <X className="h-4 w-4" />
                            </Button>
                          </div>
                        ) : (
                          <div className="flex justify-end gap-2">
                            <Button
                              size="sm"
                              variant="ghost"
                              onClick={() => handleEdit(group)}
                            >
                              <Edit className="h-4 w-4" />
                            </Button>
                            <Button
                              size="sm"
                              variant="ghost"
                              onClick={() => {
                                setDeleteId(group.id);
                                setDeleteDialogOpen(true);
                              }}
                            >
                              <Trash2 className="h-4 w-4" />
                            </Button>
                          </div>
                        )}
                      </TableCell>
                    </TableRow>
                  ))
                )}
              </TableBody>
            </Table>
          </div>
        </CardContent>
      </Card>

      {/* Delete Confirmation Dialog */}
      <AlertDialog open={deleteDialogOpen} onOpenChange={setDeleteDialogOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Are you sure?</AlertDialogTitle>
            <AlertDialogDescription>
              This will permanently delete this size group. This action cannot be undone.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel onClick={() => setDeleteId(null)}>
              Cancel
            </AlertDialogCancel>
            <AlertDialogAction onClick={handleDelete} disabled={loading}>
              Delete
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}
