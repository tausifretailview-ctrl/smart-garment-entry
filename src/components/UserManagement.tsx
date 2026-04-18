import { useState, useEffect } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useToast } from "@/hooks/use-toast";
import { useOrganization } from "@/contexts/OrganizationContext";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Loader2, Plus, X, Store, KeyRound } from "lucide-react";

interface User {
  id: string;
  email: string;
  created_at: string;
  roles: string[];
  org_role: string;
  shop_name: string | null;
}

const AVAILABLE_ROLES = ["admin", "manager", "user"];

export function UserManagement() {
  const [users, setUsers] = useState<User[]>([]);
  const [loading, setLoading] = useState(true);
  const [resetUser, setResetUser] = useState<User | null>(null);
  const [resetPassword, setResetPassword] = useState("");
  const [resetConfirm, setResetConfirm] = useState("");
  const [resetLoading, setResetLoading] = useState(false);
  const { toast } = useToast();
  const { currentOrganization } = useOrganization();

  useEffect(() => {
    if (currentOrganization) {
      fetchOrganizationUsers();
    }
  }, [currentOrganization]);

  const handleResetPassword = async () => {
    if (!resetUser || !currentOrganization) return;
    if (resetPassword.length < 6) {
      toast({ title: "Error", description: "Password must be at least 6 characters", variant: "destructive" });
      return;
    }
    if (resetPassword !== resetConfirm) {
      toast({ title: "Error", description: "Passwords do not match", variant: "destructive" });
      return;
    }
    setResetLoading(true);
    try {
      const { data, error } = await supabase.functions.invoke("admin-reset-user-password", {
        body: {
          target_user_id: resetUser.id,
          new_password: resetPassword,
          organization_id: currentOrganization.id,
        },
      });
      if (error) throw error;
      if (data?.error) throw new Error(data.error);
      toast({ title: "Success", description: `Password reset for ${resetUser.email}` });
      setResetUser(null);
      setResetPassword("");
      setResetConfirm("");
    } catch (err: any) {
      toast({ title: "Error", description: err.message || "Failed to reset password", variant: "destructive" });
    } finally {
      setResetLoading(false);
    }
  };

  const fetchOrganizationUsers = async () => {
    if (!currentOrganization) return;
    
    setLoading(true);
    try {
      // First, get organization members
      const { data: members, error: membersError } = await supabase
        .from("organization_members")
        .select("user_id, role, created_at, shop_name")
        .eq("organization_id", currentOrganization.id);

      if (membersError) throw membersError;

      if (!members || members.length === 0) {
        setUsers([]);
        return;
      }

      // Get user details via edge function for the specific user IDs
      const { data: { session } } = await supabase.auth.getSession();
      if (!session) {
        throw new Error("No active session");
      }

      const response = await fetch(
        `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/get-users`,
        {
          headers: {
            Authorization: `Bearer ${session.access_token}`,
          },
        }
      );

      if (!response.ok) {
        const error = await response.json();
        throw new Error(error.error || "Failed to fetch users");
      }

      const data = await response.json();
      
      // Filter users to only include those who are members of current organization
      const memberUserIds = members.map(m => m.user_id);
      const orgUsers = data.users
        .filter((user: any) => memberUserIds.includes(user.id))
        .map((user: any) => {
          const member = members.find(m => m.user_id === user.id);
          return {
            ...user,
            org_role: member?.role || 'user',
            created_at: member?.created_at || user.created_at,
            shop_name: member?.shop_name || null,
          };
        });

      setUsers(orgUsers);
    } catch (error) {
      console.error("Error fetching users:", error);
      toast({
        title: "Error",
        description: error instanceof Error ? error.message : "Failed to fetch users",
        variant: "destructive",
      });
    } finally {
      setLoading(false);
    }
  };

  const addRole = async (userId: string, role: string) => {
    try {
      const { error } = await (supabase as any)
        .from("user_roles")
        .insert({ user_id: userId, role: role });

      if (error) throw error;

      toast({
        title: "Success",
        description: `Role ${role} added successfully`,
      });

      fetchOrganizationUsers();
    } catch (error) {
      console.error("Error adding role:", error);
      toast({
        title: "Error",
        description: "Failed to add role",
        variant: "destructive",
      });
    }
  };

  const removeRole = async (userId: string, role: string) => {
    try {
      const { error } = await (supabase as any)
        .from("user_roles")
        .delete()
        .eq("user_id", userId)
        .eq("role", role);

      if (error) throw error;

      toast({
        title: "Success",
        description: `Role ${role} removed successfully`,
      });

      fetchOrganizationUsers();
    } catch (error) {
      console.error("Error removing role:", error);
      toast({
        title: "Error",
        description: "Failed to remove role",
        variant: "destructive",
      });
    }
  };

  const updateShopName = async (userId: string, newShopName: string) => {
    if (!currentOrganization) return;
    try {
      const { error } = await supabase
        .from("organization_members")
        .update({ shop_name: newShopName || null })
        .eq("user_id", userId)
        .eq("organization_id", currentOrganization.id);

      if (error) throw error;

      toast({ title: "Success", description: "Shop name updated" });
      setUsers(prev => prev.map(u => u.id === userId ? { ...u, shop_name: newShopName || null } : u));
    } catch (error) {
      console.error("Error updating shop name:", error);
      toast({ title: "Error", description: "Failed to update shop name", variant: "destructive" });
    }
  };

  if (!currentOrganization) {
    return (
      <div className="text-center py-8 text-muted-foreground">
        No organization selected
      </div>
    );
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center py-8">
        <Loader2 className="h-8 w-8 animate-spin" />
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <div className="rounded-md border">
         <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Email</TableHead>
              <TableHead>Shop Name</TableHead>
              <TableHead>Roles</TableHead>
              <TableHead>Created At</TableHead>
              <TableHead>Actions</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {users.length === 0 ? (
              <TableRow>
                <TableCell colSpan={5} className="text-center text-muted-foreground">
                  No users in this organization
                </TableCell>
              </TableRow>
            ) : (
              users.map((user) => (
                <TableRow key={user.id}>
                  <TableCell className="font-medium">{user.email}</TableCell>
                  <TableCell>
                    <div className="flex items-center gap-1">
                      <Store className="h-3.5 w-3.5 text-muted-foreground shrink-0" />
                      <Input
                        className="h-8 w-32"
                        placeholder="e.g. Shop 1"
                        defaultValue={user.shop_name || ""}
                        onBlur={(e) => {
                          const val = e.target.value.trim();
                          if (val !== (user.shop_name || "")) {
                            updateShopName(user.id, val);
                          }
                        }}
                      />
                    </div>
                  </TableCell>
                  <TableCell>
                    <div className="flex flex-wrap gap-1">
                      {user.roles.length > 0 ? (
                        user.roles.map((role) => (
                          <Badge
                            key={role}
                            variant="secondary"
                            className="flex items-center gap-1"
                          >
                            {role}
                            <button
                              onClick={() => removeRole(user.id, role)}
                              className="ml-1 hover:text-destructive"
                            >
                              <X className="h-3 w-3" />
                            </button>
                          </Badge>
                        ))
                      ) : (
                        <span className="text-muted-foreground text-sm">No roles</span>
                      )}
                    </div>
                  </TableCell>
                  <TableCell>
                    {new Date(user.created_at).toLocaleDateString()}
                  </TableCell>
                  <TableCell>
                    <div className="flex gap-1 flex-wrap">
                      {AVAILABLE_ROLES.filter((role) => !user.roles.includes(role)).map(
                        (role) => (
                          <Button
                            key={role}
                            variant="outline"
                            size="sm"
                            onClick={() => addRole(user.id, role)}
                          >
                            <Plus className="h-3 w-3 mr-1" />
                            {role}
                          </Button>
                        )
                      )}
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={() => {
                          setResetUser(user);
                          setResetPassword("");
                          setResetConfirm("");
                        }}
                      >
                        <KeyRound className="h-3 w-3 mr-1" />
                        Reset Password
                      </Button>
                    </div>
                  </TableCell>
                </TableRow>
              ))
            )}
          </TableBody>
        </Table>
      </div>

      <Dialog open={!!resetUser} onOpenChange={(open) => !open && setResetUser(null)}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>Reset Password</DialogTitle>
            <DialogDescription>
              Set a new password for <strong>{resetUser?.email}</strong>. They will need to use this new password to sign in.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="reset-pw">New Password</Label>
              <Input
                id="reset-pw"
                type="password"
                value={resetPassword}
                onChange={(e) => setResetPassword(e.target.value)}
                minLength={6}
                disabled={resetLoading}
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="reset-pw-confirm">Confirm Password</Label>
              <Input
                id="reset-pw-confirm"
                type="password"
                value={resetConfirm}
                onChange={(e) => setResetConfirm(e.target.value)}
                minLength={6}
                disabled={resetLoading}
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setResetUser(null)} disabled={resetLoading}>
              Cancel
            </Button>
            <Button onClick={handleResetPassword} disabled={resetLoading}>
              {resetLoading ? (
                <>
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                  Resetting...
                </>
              ) : (
                "Reset Password"
              )}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
