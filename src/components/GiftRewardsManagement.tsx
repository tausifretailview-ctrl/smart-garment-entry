import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useOrganization } from "@/contexts/OrganizationContext";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Switch } from "@/components/ui/switch";
import { Badge } from "@/components/ui/badge";
import { Card } from "@/components/ui/card";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { useToast } from "@/hooks/use-toast";
import { Plus, Pencil, Trash2, Gift, Package } from "lucide-react";
import { format } from "date-fns";

interface GiftReward {
  id: string;
  gift_name: string;
  description: string | null;
  points_required: number;
  valid_from: string;
  valid_until: string | null;
  stock_qty: number;
  is_active: boolean;
  created_at: string;
}

interface GiftFormData {
  gift_name: string;
  description: string;
  points_required: number;
  valid_from: string;
  valid_until: string;
  stock_qty: number;
  is_active: boolean;
}

const defaultFormData: GiftFormData = {
  gift_name: "",
  description: "",
  points_required: 100,
  valid_from: new Date().toISOString().split("T")[0],
  valid_until: "",
  stock_qty: 10,
  is_active: true,
};

export function GiftRewardsManagement() {
  const { currentOrganization } = useOrganization();
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const [isDialogOpen, setIsDialogOpen] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [formData, setFormData] = useState<GiftFormData>(defaultFormData);

  // Fetch gift rewards
  const { data: giftRewards, isLoading } = useQuery({
    queryKey: ["gift-rewards", currentOrganization?.id],
    queryFn: async () => {
      if (!currentOrganization?.id) return [];
      const { data, error } = await supabase
        .from("gift_rewards" as any)
        .select("*")
        .eq("organization_id", currentOrganization.id)
        .order("created_at", { ascending: false });
      if (error) throw error;
      return (data || []) as unknown as GiftReward[];
    },
    enabled: !!currentOrganization?.id,
  });

  // Create/Update mutation
  const saveMutation = useMutation({
    mutationFn: async (data: GiftFormData) => {
      if (!currentOrganization?.id) throw new Error("No organization");
      
      const payload = {
        organization_id: currentOrganization.id,
        gift_name: data.gift_name,
        description: data.description || null,
        points_required: data.points_required,
        valid_from: data.valid_from,
        valid_until: data.valid_until || null,
        stock_qty: data.stock_qty,
        is_active: data.is_active,
      };

      if (editingId) {
        const { error } = await supabase
          .from("gift_rewards" as any)
          .update(payload)
          .eq("id", editingId);
        if (error) throw error;
      } else {
        const { error } = await supabase
          .from("gift_rewards" as any)
          .insert(payload);
        if (error) throw error;
      }
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["gift-rewards"] });
      toast({ title: editingId ? "Gift reward updated" : "Gift reward created" });
      handleCloseDialog();
    },
    onError: (error: any) => {
      toast({ title: "Error", description: error.message, variant: "destructive" });
    },
  });

  // Delete mutation
  const deleteMutation = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase
        .from("gift_rewards" as any)
        .delete()
        .eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["gift-rewards"] });
      toast({ title: "Gift reward deleted" });
    },
    onError: (error: any) => {
      toast({ title: "Error", description: error.message, variant: "destructive" });
    },
  });

  const handleOpenDialog = (reward?: GiftReward) => {
    if (reward) {
      setEditingId(reward.id);
      setFormData({
        gift_name: reward.gift_name,
        description: reward.description || "",
        points_required: reward.points_required,
        valid_from: reward.valid_from,
        valid_until: reward.valid_until || "",
        stock_qty: reward.stock_qty,
        is_active: reward.is_active,
      });
    } else {
      setEditingId(null);
      setFormData(defaultFormData);
    }
    setIsDialogOpen(true);
  };

  const handleCloseDialog = () => {
    setIsDialogOpen(false);
    setEditingId(null);
    setFormData(defaultFormData);
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!formData.gift_name.trim()) {
      toast({ title: "Gift name is required", variant: "destructive" });
      return;
    }
    saveMutation.mutate(formData);
  };

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <Gift className="h-5 w-5 text-primary" />
          <h3 className="font-semibold">Gift Rewards</h3>
        </div>
        <Dialog open={isDialogOpen} onOpenChange={setIsDialogOpen}>
          <DialogTrigger asChild>
            <Button size="sm" onClick={() => handleOpenDialog()}>
              <Plus className="h-4 w-4 mr-1" />
              Add Gift Reward
            </Button>
          </DialogTrigger>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>{editingId ? "Edit" : "Add"} Gift Reward</DialogTitle>
            </DialogHeader>
            <form onSubmit={handleSubmit} className="space-y-4">
              <div className="space-y-2">
                <Label htmlFor="gift_name">Gift Name *</Label>
                <Input
                  id="gift_name"
                  value={formData.gift_name}
                  onChange={(e) => setFormData({ ...formData, gift_name: e.target.value })}
                  placeholder="e.g., Free T-Shirt, Water Bottle"
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="description">Description</Label>
                <Textarea
                  id="description"
                  value={formData.description}
                  onChange={(e) => setFormData({ ...formData, description: e.target.value })}
                  placeholder="Optional description"
                  rows={2}
                />
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label htmlFor="points_required">Points Required</Label>
                  <Input
                    id="points_required"
                    type="number"
                    min="1"
                    value={formData.points_required}
                    onChange={(e) => setFormData({ ...formData, points_required: parseInt(e.target.value) || 100 })}
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="stock_qty">Stock Quantity</Label>
                  <Input
                    id="stock_qty"
                    type="number"
                    min="0"
                    value={formData.stock_qty}
                    onChange={(e) => setFormData({ ...formData, stock_qty: parseInt(e.target.value) || 0 })}
                  />
                </div>
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label htmlFor="valid_from">Valid From</Label>
                  <Input
                    id="valid_from"
                    type="date"
                    value={formData.valid_from}
                    onChange={(e) => setFormData({ ...formData, valid_from: e.target.value })}
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="valid_until">Valid Until (optional)</Label>
                  <Input
                    id="valid_until"
                    type="date"
                    value={formData.valid_until}
                    onChange={(e) => setFormData({ ...formData, valid_until: e.target.value })}
                  />
                </div>
              </div>
              <div className="flex items-center space-x-2">
                <Switch
                  id="is_active"
                  checked={formData.is_active}
                  onCheckedChange={(checked) => setFormData({ ...formData, is_active: checked })}
                />
                <Label htmlFor="is_active">Active</Label>
              </div>
              <div className="flex justify-end gap-2 pt-4">
                <Button type="button" variant="outline" onClick={handleCloseDialog}>
                  Cancel
                </Button>
                <Button type="submit" disabled={saveMutation.isPending}>
                  {editingId ? "Update" : "Create"}
                </Button>
              </div>
            </form>
          </DialogContent>
        </Dialog>
      </div>

      {isLoading ? (
        <div className="text-center py-4 text-muted-foreground">Loading...</div>
      ) : giftRewards && giftRewards.length > 0 ? (
        <Card className="overflow-hidden">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Gift Name</TableHead>
                <TableHead className="text-center">Points</TableHead>
                <TableHead className="text-center">Stock</TableHead>
                <TableHead>Validity</TableHead>
                <TableHead className="text-center">Status</TableHead>
                <TableHead className="text-right">Actions</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {giftRewards.map((reward) => (
                <TableRow key={reward.id}>
                  <TableCell>
                    <div className="flex items-center gap-2">
                      <Package className="h-4 w-4 text-muted-foreground" />
                      <div>
                        <div className="font-medium">{reward.gift_name}</div>
                        {reward.description && (
                          <div className="text-xs text-muted-foreground truncate max-w-[200px]">
                            {reward.description}
                          </div>
                        )}
                      </div>
                    </div>
                  </TableCell>
                  <TableCell className="text-center font-semibold">
                    {reward.points_required}
                  </TableCell>
                  <TableCell className="text-center">
                    <Badge variant={reward.stock_qty > 0 ? "default" : "destructive"}>
                      {reward.stock_qty}
                    </Badge>
                  </TableCell>
                  <TableCell className="text-sm">
                    {format(new Date(reward.valid_from), "dd MMM yyyy")}
                    {reward.valid_until && (
                      <> - {format(new Date(reward.valid_until), "dd MMM yyyy")}</>
                    )}
                  </TableCell>
                  <TableCell className="text-center">
                    <Badge variant={reward.is_active ? "default" : "secondary"}>
                      {reward.is_active ? "Active" : "Inactive"}
                    </Badge>
                  </TableCell>
                  <TableCell className="text-right">
                    <div className="flex items-center justify-end gap-1">
                      <Button
                        size="icon"
                        variant="ghost"
                        onClick={() => handleOpenDialog(reward)}
                      >
                        <Pencil className="h-4 w-4" />
                      </Button>
                      <Button
                        size="icon"
                        variant="ghost"
                        onClick={() => {
                          if (confirm("Delete this gift reward?")) {
                            deleteMutation.mutate(reward.id);
                          }
                        }}
                      >
                        <Trash2 className="h-4 w-4 text-destructive" />
                      </Button>
                    </div>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </Card>
      ) : (
        <Card className="p-8 text-center">
          <Gift className="h-12 w-12 mx-auto text-muted-foreground/50 mb-3" />
          <p className="text-muted-foreground">No gift rewards configured</p>
          <p className="text-xs text-muted-foreground mt-1">
            Create gift rewards that customers can claim using their points
          </p>
        </Card>
      )}
    </div>
  );
}
