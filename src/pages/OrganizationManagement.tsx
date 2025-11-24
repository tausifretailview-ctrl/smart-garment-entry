import { useState } from "react";
import { useOrganization } from "@/contexts/OrganizationContext";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Badge } from "@/components/ui/badge";
import { Switch } from "@/components/ui/switch";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { toast } from "sonner";
import { BackToDashboard } from "@/components/BackToDashboard";
import { Building2, Crown, Users, Plus, Loader2, UserX } from "lucide-react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";

const AVAILABLE_FEATURES = [
  { id: "advanced_reports", name: "Advanced Reports", tier: "professional" },
  { id: "loyalty_points", name: "Loyalty Points System", tier: "professional" },
  { id: "multi_location", name: "Multi-Location Support", tier: "enterprise" },
  { id: "custom_branding", name: "Custom Branding", tier: "basic" },
  { id: "api_access", name: "API Access", tier: "enterprise" },
  { id: "bulk_operations", name: "Bulk Operations", tier: "professional" },
];

export default function OrganizationManagement() {
  const { currentOrganization, organizationRole } = useOrganization();
  const queryClient = useQueryClient();
  const [orgName, setOrgName] = useState(currentOrganization?.name || "");
  const [selectedTier, setSelectedTier] = useState<string>(currentOrganization?.subscription_tier || "free");
  const [isCreateUserOpen, setIsCreateUserOpen] = useState(false);
  const [newUserEmail, setNewUserEmail] = useState("");
  const [newUserPassword, setNewUserPassword] = useState("");
  const [newUserRole, setNewUserRole] = useState<"admin" | "manager" | "user">("user");

  const isAdmin = organizationRole === "admin";

  // Fetch organization members with user details
  const { data: members = [], isLoading: membersLoading } = useQuery({
    queryKey: ["organization-members", currentOrganization?.id],
    queryFn: async () => {
      if (!currentOrganization) return [];
      
      const { data: memberData, error: memberError } = await supabase
        .from("organization_members")
        .select("*")
        .eq("organization_id", currentOrganization.id);

      if (memberError) throw memberError;
      
      // Fetch user emails using the edge function
      const { data: { session } } = await supabase.auth.getSession();
      if (!session) return memberData;

      const response = await fetch(
        `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/get-users`,
        {
          headers: {
            Authorization: `Bearer ${session.access_token}`,
          },
        }
      );

      if (response.ok) {
        const { users } = await response.json();
        return memberData.map(member => ({
          ...member,
          email: users.find((u: any) => u.id === member.user_id)?.email || 'Unknown',
          created_at_user: users.find((u: any) => u.id === member.user_id)?.created_at
        }));
      }
      
      return memberData;
    },
    enabled: !!currentOrganization,
  });

  const updateOrgMutation = useMutation({
    mutationFn: async (updates: any) => {
      if (!currentOrganization) throw new Error("No organization selected");
      
      const { error } = await supabase
        .from("organizations")
        .update(updates)
        .eq("id", currentOrganization.id);

      if (error) throw error;
    },
    onSuccess: () => {
      toast.success("Organization updated successfully");
      queryClient.invalidateQueries({ queryKey: ["organizations"] });
    },
    onError: (error: any) => {
      toast.error(error.message || "Failed to update organization");
    },
  });

  const handleSaveSettings = () => {
    updateOrgMutation.mutate({
      name: orgName,
      subscription_tier: selectedTier,
    });
  };

  const toggleFeature = (featureId: string, enabled: boolean) => {
    if (!currentOrganization) return;

    const currentFeatures = currentOrganization.enabled_features || [];
    const newFeatures = enabled
      ? [...currentFeatures, featureId]
      : currentFeatures.filter((f) => f !== featureId);

    updateOrgMutation.mutate({
      enabled_features: newFeatures,
    });
  };

  const createUserMutation = useMutation({
    mutationFn: async (userData: { email: string; password: string; role: string }) => {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session) throw new Error("Not authenticated");

      const response = await fetch(
        `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/create-org-user`,
        {
          method: 'POST',
          headers: {
            'Authorization': `Bearer ${session.access_token}`,
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({
            email: userData.email,
            password: userData.password,
            role: userData.role,
            organizationId: currentOrganization?.id,
          }),
        }
      );

      if (!response.ok) {
        const error = await response.json();
        throw new Error(error.error || 'Failed to create user');
      }

      return response.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["organization-members"] });
      setIsCreateUserOpen(false);
      setNewUserEmail("");
      setNewUserPassword("");
      setNewUserRole("user");
      toast.success("User created successfully. They can now log in with their credentials.");
    },
    onError: (error: Error) => {
      toast.error(error.message);
    },
  });

  const removeMemberMutation = useMutation({
    mutationFn: async (userId: string) => {
      if (!currentOrganization?.id) throw new Error("No organization selected");
      
      const { error } = await supabase
        .from("organization_members")
        .delete()
        .eq("organization_id", currentOrganization.id)
        .eq("user_id", userId);
      
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["organization-members"] });
      toast.success("User removed from organization");
    },
    onError: (error: Error) => {
      toast.error(error.message);
    },
  });

  const updateMemberRoleMutation = useMutation({
    mutationFn: async ({ userId, role }: { userId: string; role: "admin" | "manager" | "user" }) => {
      if (!currentOrganization?.id) throw new Error("No organization selected");
      
      const { error } = await supabase
        .from("organization_members")
        .update({ role })
        .eq("organization_id", currentOrganization.id)
        .eq("user_id", userId);
      
      if (error) throw error;

      // Also update user_roles table
      const { error: deleteError } = await supabase
        .from("user_roles")
        .delete()
        .eq("user_id", userId);

      if (!deleteError) {
        await supabase
          .from("user_roles")
          .insert({ user_id: userId, role: role as any });
      }
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["organization-members"] });
      toast.success("User role updated successfully");
    },
    onError: (error: Error) => {
      toast.error(error.message);
    },
  });

  if (!currentOrganization) {
    return (
      <div className="container mx-auto p-6">
        <BackToDashboard />
        <Card className="mt-6">
          <CardContent className="pt-6">
            <p className="text-center text-muted-foreground">No organization selected</p>
          </CardContent>
        </Card>
      </div>
    );
  }

  if (!isAdmin) {
    return (
      <div className="container mx-auto p-6">
        <BackToDashboard />
        <Card className="mt-6">
          <CardContent className="pt-6">
            <p className="text-center text-muted-foreground">
              Only administrators can manage organization settings
            </p>
          </CardContent>
        </Card>
      </div>
    );
  }

  return (
    <div className="container mx-auto p-6 space-y-6">
      <BackToDashboard />

      <div className="flex items-center gap-3">
        <Building2 className="h-8 w-8 text-primary" />
        <div>
          <h1 className="text-3xl font-bold">Organization Management</h1>
          <p className="text-muted-foreground">Manage your organization settings and features</p>
        </div>
      </div>

      <Tabs defaultValue="general" className="space-y-6">
        <TabsList>
          <TabsTrigger value="general">General</TabsTrigger>
          <TabsTrigger value="features">Features</TabsTrigger>
          <TabsTrigger value="members">Members</TabsTrigger>
        </TabsList>

        <TabsContent value="general" className="space-y-6">
          <Card>
            <CardHeader>
              <CardTitle>Organization Details</CardTitle>
              <CardDescription>Update your organization information</CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="space-y-2">
                <Label htmlFor="orgName">Organization Name</Label>
                <Input
                  id="orgName"
                  value={orgName}
                  onChange={(e) => setOrgName(e.target.value)}
                />
              </div>

              <div className="space-y-2">
                <Label htmlFor="tier">Subscription Tier</Label>
                <Select value={selectedTier} onValueChange={setSelectedTier}>
                  <SelectTrigger id="tier">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="free">Free</SelectItem>
                    <SelectItem value="basic">Basic</SelectItem>
                    <SelectItem value="professional">Professional</SelectItem>
                    <SelectItem value="enterprise">Enterprise</SelectItem>
                  </SelectContent>
                </Select>
              </div>

              <Button onClick={handleSaveSettings}>Save Changes</Button>
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="features" className="space-y-6">
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Crown className="h-5 w-5" />
                Feature Management
              </CardTitle>
              <CardDescription>
                Enable or disable features for your organization
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              {AVAILABLE_FEATURES.map((feature) => {
                const isEnabled = currentOrganization.enabled_features?.includes(feature.id);
                return (
                  <div
                    key={feature.id}
                    className="flex items-center justify-between p-4 border rounded-lg"
                  >
                    <div className="space-y-1">
                      <div className="flex items-center gap-2">
                        <span className="font-medium">{feature.name}</span>
                        <Badge variant="secondary" className="capitalize">
                          {feature.tier}
                        </Badge>
                      </div>
                    </div>
                    <Switch
                      checked={isEnabled}
                      onCheckedChange={(checked) => toggleFeature(feature.id, checked)}
                    />
                  </div>
                );
              })}
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="members" className="space-y-6">
          <Card>
            <CardHeader className="flex flex-row items-center justify-between">
              <div>
                <CardTitle className="flex items-center gap-2">
                  <Users className="h-5 w-5" />
                  Organization Members
                </CardTitle>
                <CardDescription>Manage who has access to this organization</CardDescription>
              </div>
              <Dialog open={isCreateUserOpen} onOpenChange={setIsCreateUserOpen}>
                <DialogTrigger asChild>
                  <Button>
                    <Plus className="h-4 w-4 mr-2" />
                    Create User
                  </Button>
                </DialogTrigger>
                <DialogContent>
                  <DialogHeader>
                    <DialogTitle>Create New User</DialogTitle>
                    <DialogDescription>
                      Add a new user to your organization. They will be able to log in immediately with the provided credentials.
                    </DialogDescription>
                  </DialogHeader>
                  <div className="space-y-4 py-4">
                    <div className="space-y-2">
                      <Label htmlFor="email">Email</Label>
                      <Input
                        id="email"
                        type="email"
                        placeholder="user@example.com"
                        value={newUserEmail}
                        onChange={(e) => setNewUserEmail(e.target.value)}
                      />
                    </div>
                    <div className="space-y-2">
                      <Label htmlFor="password">Temporary Password</Label>
                      <Input
                        id="password"
                        type="password"
                        placeholder="Enter a secure password"
                        value={newUserPassword}
                        onChange={(e) => setNewUserPassword(e.target.value)}
                      />
                      <p className="text-xs text-muted-foreground">
                        User can change this after first login
                      </p>
                    </div>
                    <div className="space-y-2">
                      <Label htmlFor="role">Role</Label>
                      <Select value={newUserRole} onValueChange={(value: any) => setNewUserRole(value)}>
                        <SelectTrigger>
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="user">User</SelectItem>
                          <SelectItem value="manager">Manager</SelectItem>
                          <SelectItem value="admin">Admin</SelectItem>
                        </SelectContent>
                      </Select>
                      {newUserRole === "manager" && (
                        <div className="mt-2 p-3 bg-muted rounded-md text-xs space-y-1">
                          <p className="font-medium">Manager Permissions:</p>
                          <p className="text-muted-foreground">✅ Access: Purchases, Reports, Customers, Suppliers, Employees</p>
                          <p className="text-muted-foreground">❌ Cannot: Manage settings or organization</p>
                        </div>
                      )}
                    </div>
                  </div>
                  <DialogFooter>
                    <Button
                      variant="outline"
                      onClick={() => setIsCreateUserOpen(false)}
                      disabled={createUserMutation.isPending}
                    >
                      Cancel
                    </Button>
                    <Button
                      onClick={() => {
                        if (!newUserEmail || !newUserPassword) {
                          toast.error("Please fill in all fields");
                          return;
                        }
                        createUserMutation.mutate({
                          email: newUserEmail,
                          password: newUserPassword,
                          role: newUserRole,
                        });
                      }}
                      disabled={createUserMutation.isPending}
                    >
                      {createUserMutation.isPending && (
                        <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                      )}
                      Create User
                    </Button>
                  </DialogFooter>
                </DialogContent>
              </Dialog>
            </CardHeader>
            <CardContent>
              {membersLoading ? (
                <div className="flex items-center justify-center py-8">
                  <Loader2 className="h-6 w-6 animate-spin" />
                </div>
              ) : (
                <div className="space-y-4">
                  {members.map((member: any) => (
                    <div key={member.id} className="flex items-center justify-between py-3 border-b last:border-0">
                      <div className="flex-1">
                        <p className="font-medium">{member.email || `User ID: ${member.user_id}`}</p>
                        <div className="flex items-center gap-2 mt-1">
                          <Badge variant="secondary" className="capitalize">
                            {member.role}
                          </Badge>
                          <span className="text-xs text-muted-foreground">
                            Joined {new Date(member.created_at).toLocaleDateString()}
                          </span>
                        </div>
                      </div>
                      <div className="flex items-center gap-2">
                        <Select
                          value={member.role}
                          onValueChange={(newRole) => {
                            updateMemberRoleMutation.mutate({
                              userId: member.user_id,
                              role: newRole as "admin" | "manager" | "user",
                            });
                          }}
                        >
                          <SelectTrigger className="w-32">
                            <SelectValue />
                          </SelectTrigger>
                          <SelectContent>
                            <SelectItem value="user">User</SelectItem>
                            <SelectItem value="manager">Manager</SelectItem>
                            <SelectItem value="admin">Admin</SelectItem>
                          </SelectContent>
                        </Select>
                        <Button
                          variant="ghost"
                          size="icon"
                          onClick={() => {
                            if (confirm(`Remove ${member.email || 'this user'} from the organization?`)) {
                              removeMemberMutation.mutate(member.user_id);
                            }
                          }}
                          disabled={removeMemberMutation.isPending}
                        >
                          <UserX className="h-4 w-4" />
                        </Button>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>
    </div>
  );
}
