import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Layout } from "@/components/Layout";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";
import { toast } from "sonner";
import { Building2, Users, Plus, Shield, Edit, Trash2 } from "lucide-react";
import { Badge } from "@/components/ui/badge";

interface Organization {
  id: string;
  name: string;
  subscription_tier: string;
  enabled_features: string[];
  created_at: string;
}

interface User {
  id: string;
  email: string;
  created_at: string;
}

interface OrgMember {
  organization_id: string;
  user_id: string;
  role: string;
  user_email?: string;
  org_name?: string;
}

const AVAILABLE_FEATURES = [
  "advanced_reports",
  "loyalty_points",
  "multi_location",
  "custom_branding",
  "api_access",
  "bulk_operations"
];

export default function PlatformAdmin() {
  const [createOrgOpen, setCreateOrgOpen] = useState(false);
  const [createUserOpen, setCreateUserOpen] = useState(false);
  const [editFeaturesOpen, setEditFeaturesOpen] = useState(false);
  const [selectedOrg, setSelectedOrg] = useState<Organization | null>(null);
  
  const [orgName, setOrgName] = useState("");
  const [adminEmail, setAdminEmail] = useState("");
  const [selectedFeatures, setSelectedFeatures] = useState<string[]>([]);
  
  const [userEmail, setUserEmail] = useState("");
  const [userPassword, setUserPassword] = useState("");
  const [userOrgId, setUserOrgId] = useState("");
  const [userRole, setUserRole] = useState<"admin" | "manager" | "user">("user");

  const queryClient = useQueryClient();

  // Fetch all organizations
  const { data: organizations = [], isLoading: orgsLoading } = useQuery({
    queryKey: ["platform-organizations"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("organizations")
        .select("*")
        .order("created_at", { ascending: false });
      
      if (error) throw error;
      return data as Organization[];
    },
  });

  // Fetch all organization members with user emails
  const { data: members = [] } = useQuery({
    queryKey: ["platform-members"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("organization_members")
        .select("organization_id, user_id, role");
      
      if (error) throw error;

      // Fetch user emails and org names
      const membersWithDetails = await Promise.all(
        (data as OrgMember[]).map(async (member) => {
          const { data: userData } = await supabase.auth.admin.getUserById(member.user_id);
          const org = organizations.find(o => o.id === member.organization_id);
          
          return {
            ...member,
            user_email: userData.user?.email || "Unknown",
            org_name: org?.name || "Unknown"
          };
        })
      );

      return membersWithDetails;
    },
    enabled: organizations.length > 0,
  });

  // Create organization mutation
  const createOrgMutation = useMutation({
    mutationFn: async () => {
      const { data, error } = await supabase.rpc("platform_create_organization", {
        p_name: orgName,
        p_enabled_features: selectedFeatures,
        p_admin_email: adminEmail || null,
      });

      if (error) throw error;
      return data;
    },
    onSuccess: () => {
      toast.success("Organization created successfully!");
      setCreateOrgOpen(false);
      setOrgName("");
      setAdminEmail("");
      setSelectedFeatures([]);
      queryClient.invalidateQueries({ queryKey: ["platform-organizations"] });
    },
    onError: (error: any) => {
      toast.error(error.message || "Failed to create organization");
    },
  });

  // Create user and assign to organization
  const createUserMutation = useMutation({
    mutationFn: async () => {
      // Step 1: Create user
      const { data: authData, error: authError } = await supabase.auth.signUp({
        email: userEmail,
        password: userPassword,
      });

      if (authError) throw authError;

      // Step 2: Assign to organization
      const { error: assignError } = await supabase.rpc("platform_assign_user_to_org", {
        p_user_email: userEmail,
        p_org_id: userOrgId,
        p_role: userRole,
      });

      if (assignError) throw assignError;

      return authData;
    },
    onSuccess: () => {
      toast.success("User created and assigned successfully!");
      setCreateUserOpen(false);
      setUserEmail("");
      setUserPassword("");
      setUserOrgId("");
      setUserRole("user");
      queryClient.invalidateQueries({ queryKey: ["platform-members"] });
    },
    onError: (error: any) => {
      toast.error(error.message || "Failed to create user");
    },
  });

  // Update organization features
  const updateFeaturesMutation = useMutation({
    mutationFn: async (features: string[]) => {
      if (!selectedOrg) throw new Error("No organization selected");

      const { error } = await supabase
        .from("organizations")
        .update({ enabled_features: features })
        .eq("id", selectedOrg.id);

      if (error) throw error;
    },
    onSuccess: () => {
      toast.success("Features updated successfully!");
      setEditFeaturesOpen(false);
      setSelectedOrg(null);
      queryClient.invalidateQueries({ queryKey: ["platform-organizations"] });
    },
    onError: (error: any) => {
      toast.error(error.message || "Failed to update features");
    },
  });

  const handleCreateOrg = () => {
    if (!orgName.trim()) {
      toast.error("Organization name is required");
      return;
    }
    if (organizations.length >= 5) {
      toast.error("Maximum 5 organizations allowed");
      return;
    }
    createOrgMutation.mutate();
  };

  const handleCreateUser = () => {
    if (!userEmail || !userPassword || !userOrgId) {
      toast.error("All fields are required");
      return;
    }
    createUserMutation.mutate();
  };

  const handleEditFeatures = (org: Organization) => {
    setSelectedOrg(org);
    setSelectedFeatures(Array.isArray(org.enabled_features) ? org.enabled_features : []);
    setEditFeaturesOpen(true);
  };

  const toggleFeature = (feature: string) => {
    setSelectedFeatures(prev =>
      prev.includes(feature)
        ? prev.filter(f => f !== feature)
        : [...prev, feature]
    );
  };

  const orgCount = organizations.length;
  const userCount = members.length;

  return (
    <Layout>
      <div className="container mx-auto p-6 space-y-6">
        {/* Header */}
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-3xl font-bold flex items-center gap-2">
              <Shield className="h-8 w-8 text-primary" />
              Platform Admin Dashboard
            </h1>
            <p className="text-muted-foreground mt-1">
              Manage all organizations and users
            </p>
          </div>
        </div>

        {/* Stats Cards */}
        <div className="grid gap-4 md:grid-cols-3">
          <Card>
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-sm font-medium">Organizations</CardTitle>
              <Building2 className="h-4 w-4 text-muted-foreground" />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold">{orgCount} / 5</div>
              <p className="text-xs text-muted-foreground">
                {5 - orgCount} slots remaining
              </p>
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-sm font-medium">Total Users</CardTitle>
              <Users className="h-4 w-4 text-muted-foreground" />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold">{userCount}</div>
              <p className="text-xs text-muted-foreground">Across all organizations</p>
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-sm font-medium">Status</CardTitle>
              <Shield className="h-4 w-4 text-muted-foreground" />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold text-green-600">Active</div>
              <p className="text-xs text-muted-foreground">All systems operational</p>
            </CardContent>
          </Card>
        </div>

        {/* Tabs */}
        <Tabs defaultValue="organizations" className="space-y-4">
          <TabsList>
            <TabsTrigger value="organizations">Organizations</TabsTrigger>
            <TabsTrigger value="users">Users</TabsTrigger>
          </TabsList>

          {/* Organizations Tab */}
          <TabsContent value="organizations" className="space-y-4">
            <div className="flex justify-between items-center">
              <h2 className="text-xl font-semibold">Organizations</h2>
              <Dialog open={createOrgOpen} onOpenChange={setCreateOrgOpen}>
                <DialogTrigger asChild>
                  <Button disabled={orgCount >= 5}>
                    <Plus className="h-4 w-4 mr-2" />
                    Create Organization
                  </Button>
                </DialogTrigger>
                <DialogContent className="max-w-md">
                  <DialogHeader>
                    <DialogTitle>Create New Organization</DialogTitle>
                    <DialogDescription>
                      Add a new organization to the platform (Max 5)
                    </DialogDescription>
                  </DialogHeader>
                  <div className="space-y-4 py-4">
                    <div className="space-y-2">
                      <Label htmlFor="orgName">Organization Name *</Label>
                      <Input
                        id="orgName"
                        value={orgName}
                        onChange={(e) => setOrgName(e.target.value)}
                        placeholder="Enter organization name"
                      />
                    </div>
                    <div className="space-y-2">
                      <Label htmlFor="adminEmail">Admin Email (optional)</Label>
                      <Input
                        id="adminEmail"
                        type="email"
                        value={adminEmail}
                        onChange={(e) => setAdminEmail(e.target.value)}
                        placeholder="Assign existing user as admin"
                      />
                    </div>
                    <div className="space-y-2">
                      <Label>Enabled Features</Label>
                      <div className="space-y-2">
                        {AVAILABLE_FEATURES.map((feature) => (
                          <div key={feature} className="flex items-center space-x-2">
                            <Switch
                              id={feature}
                              checked={selectedFeatures.includes(feature)}
                              onCheckedChange={() => toggleFeature(feature)}
                            />
                            <Label htmlFor={feature} className="cursor-pointer capitalize">
                              {feature.replace(/_/g, " ")}
                            </Label>
                          </div>
                        ))}
                      </div>
                    </div>
                  </div>
                  <DialogFooter>
                    <Button variant="outline" onClick={() => setCreateOrgOpen(false)}>
                      Cancel
                    </Button>
                    <Button onClick={handleCreateOrg} disabled={createOrgMutation.isPending}>
                      {createOrgMutation.isPending ? "Creating..." : "Create"}
                    </Button>
                  </DialogFooter>
                </DialogContent>
              </Dialog>
            </div>

            <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
              {organizations.map((org) => {
                const orgMembers = members.filter(m => m.organization_id === org.id);
                const features = Array.isArray(org.enabled_features) ? org.enabled_features : [];
                
                return (
                  <Card key={org.id}>
                    <CardHeader>
                      <CardTitle className="flex items-center justify-between">
                        <span>{org.name}</span>
                        <Badge variant="secondary">{org.subscription_tier}</Badge>
                      </CardTitle>
                      <CardDescription>
                        Created {new Date(org.created_at).toLocaleDateString()}
                      </CardDescription>
                    </CardHeader>
                    <CardContent className="space-y-4">
                      <div className="flex items-center justify-between text-sm">
                        <span className="text-muted-foreground">Users:</span>
                        <span className="font-medium">{orgMembers.length}</span>
                      </div>
                      <div className="flex items-center justify-between text-sm">
                        <span className="text-muted-foreground">Features:</span>
                        <span className="font-medium">{features.length} enabled</span>
                      </div>
                      <div className="flex gap-2">
                        <Button
                          size="sm"
                          variant="outline"
                          onClick={() => handleEditFeatures(org)}
                          className="flex-1"
                        >
                          <Edit className="h-3 w-3 mr-1" />
                          Features
                        </Button>
                      </div>
                    </CardContent>
                  </Card>
                );
              })}
            </div>
          </TabsContent>

          {/* Users Tab */}
          <TabsContent value="users" className="space-y-4">
            <div className="flex justify-between items-center">
              <h2 className="text-xl font-semibold">Users</h2>
              <Dialog open={createUserOpen} onOpenChange={setCreateUserOpen}>
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
                      Create a user account and assign to organization
                    </DialogDescription>
                  </DialogHeader>
                  <div className="space-y-4 py-4">
                    <div className="space-y-2">
                      <Label htmlFor="userEmail">Email *</Label>
                      <Input
                        id="userEmail"
                        type="email"
                        value={userEmail}
                        onChange={(e) => setUserEmail(e.target.value)}
                        placeholder="user@example.com"
                      />
                    </div>
                    <div className="space-y-2">
                      <Label htmlFor="userPassword">Temporary Password *</Label>
                      <Input
                        id="userPassword"
                        type="password"
                        value={userPassword}
                        onChange={(e) => setUserPassword(e.target.value)}
                        placeholder="Enter temporary password"
                      />
                    </div>
                    <div className="space-y-2">
                      <Label htmlFor="userOrg">Organization *</Label>
                      <Select value={userOrgId} onValueChange={setUserOrgId}>
                        <SelectTrigger>
                          <SelectValue placeholder="Select organization" />
                        </SelectTrigger>
                        <SelectContent>
                          {organizations.map((org) => (
                            <SelectItem key={org.id} value={org.id}>
                              {org.name}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </div>
                    <div className="space-y-2">
                      <Label htmlFor="userRole">Role *</Label>
                      <Select value={userRole} onValueChange={(value: any) => setUserRole(value)}>
                        <SelectTrigger>
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="admin">Admin</SelectItem>
                          <SelectItem value="manager">Manager</SelectItem>
                          <SelectItem value="user">User</SelectItem>
                        </SelectContent>
                      </Select>
                    </div>
                  </div>
                  <DialogFooter>
                    <Button variant="outline" onClick={() => setCreateUserOpen(false)}>
                      Cancel
                    </Button>
                    <Button onClick={handleCreateUser} disabled={createUserMutation.isPending}>
                      {createUserMutation.isPending ? "Creating..." : "Create User"}
                    </Button>
                  </DialogFooter>
                </DialogContent>
              </Dialog>
            </div>

            <Card>
              <CardContent className="pt-6">
                <div className="space-y-4">
                  {members.map((member) => (
                    <div
                      key={`${member.user_id}-${member.organization_id}`}
                      className="flex items-center justify-between p-4 border rounded-lg"
                    >
                      <div className="flex-1">
                        <p className="font-medium">{member.user_email}</p>
                        <p className="text-sm text-muted-foreground">
                          {member.org_name} • {member.role}
                        </p>
                      </div>
                      <Badge variant="outline" className="capitalize">
                        {member.role}
                      </Badge>
                    </div>
                  ))}
                </div>
              </CardContent>
            </Card>
          </TabsContent>
        </Tabs>

        {/* Edit Features Dialog */}
        <Dialog open={editFeaturesOpen} onOpenChange={setEditFeaturesOpen}>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>Edit Features - {selectedOrg?.name}</DialogTitle>
              <DialogDescription>
                Toggle features on or off for this organization
              </DialogDescription>
            </DialogHeader>
            <div className="space-y-4 py-4">
              {AVAILABLE_FEATURES.map((feature) => (
                <div key={feature} className="flex items-center justify-between">
                  <Label htmlFor={`edit-${feature}`} className="capitalize">
                    {feature.replace(/_/g, " ")}
                  </Label>
                  <Switch
                    id={`edit-${feature}`}
                    checked={selectedFeatures.includes(feature)}
                    onCheckedChange={() => toggleFeature(feature)}
                  />
                </div>
              ))}
            </div>
            <DialogFooter>
              <Button variant="outline" onClick={() => setEditFeaturesOpen(false)}>
                Cancel
              </Button>
              <Button
                onClick={() => updateFeaturesMutation.mutate(selectedFeatures)}
                disabled={updateFeaturesMutation.isPending}
              >
                {updateFeaturesMutation.isPending ? "Saving..." : "Save Changes"}
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      </div>
    </Layout>
  );
}
