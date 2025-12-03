import { useState, useEffect } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useToast } from "@/hooks/use-toast";
import { useOrganization } from "@/contexts/OrganizationContext";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Loader2, Plus, X } from "lucide-react";

interface User {
  id: string;
  email: string;
  created_at: string;
  roles: string[];
  org_role: string;
}

const AVAILABLE_ROLES = ["admin", "manager", "user"];

export function UserManagement() {
  const [users, setUsers] = useState<User[]>([]);
  const [loading, setLoading] = useState(true);
  const { toast } = useToast();
  const { currentOrganization } = useOrganization();

  useEffect(() => {
    if (currentOrganization) {
      fetchOrganizationUsers();
    }
  }, [currentOrganization]);

  const fetchOrganizationUsers = async () => {
    if (!currentOrganization) return;
    
    setLoading(true);
    try {
      // First, get organization members
      const { data: members, error: membersError } = await supabase
        .from("organization_members")
        .select("user_id, role, created_at")
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
            created_at: member?.created_at || user.created_at
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
              <TableHead>Roles</TableHead>
              <TableHead>Created At</TableHead>
              <TableHead>Actions</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {users.length === 0 ? (
              <TableRow>
                <TableCell colSpan={4} className="text-center text-muted-foreground">
                  No users in this organization
                </TableCell>
              </TableRow>
            ) : (
              users.map((user) => (
                <TableRow key={user.id}>
                  <TableCell className="font-medium">{user.email}</TableCell>
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
                    <div className="flex gap-1">
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
                    </div>
                  </TableCell>
                </TableRow>
              ))
            )}
          </TableBody>
        </Table>
      </div>
    </div>
  );
}
