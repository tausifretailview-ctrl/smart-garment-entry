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
import { toast } from "sonner";
import { BackToDashboard } from "@/components/BackToDashboard";
import { Building2, Crown, Users } from "lucide-react";
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

  const isAdmin = organizationRole === "admin";

  // Fetch organization members
  const { data: members = [] } = useQuery({
    queryKey: ["organization-members", currentOrganization?.id],
    queryFn: async () => {
      if (!currentOrganization) return [];
      
      const { data, error } = await supabase
        .from("organization_members")
        .select("*, user_id")
        .eq("organization_id", currentOrganization.id);

      if (error) throw error;
      return data;
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
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Users className="h-5 w-5" />
                Organization Members
              </CardTitle>
              <CardDescription>View and manage team members</CardDescription>
            </CardHeader>
            <CardContent>
              <div className="space-y-2">
                {members.map((member) => (
                  <div
                    key={member.id}
                    className="flex items-center justify-between p-3 border rounded-lg"
                  >
                    <span className="text-sm">{member.user_id}</span>
                    <Badge className="capitalize">{member.role}</Badge>
                  </div>
                ))}
              </div>
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>
    </div>
  );
}
