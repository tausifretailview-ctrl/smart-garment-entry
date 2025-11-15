import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Building2, Loader2 } from "lucide-react";
import { toast } from "sonner";

export const OrganizationSetup = () => {
  const { user } = useAuth();
  const navigate = useNavigate();
  const [orgName, setOrgName] = useState("");
  const [loading, setLoading] = useState(false);

  const handleCreateOrganization = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!user || !orgName.trim()) return;

    setLoading(true);
    try {
      console.log("Creating organization with user:", user.id);
      
      // Create organization
      const { data: org, error: orgError } = await supabase
        .from("organizations")
        .insert({
          name: orgName.trim(),
          subscription_tier: "free",
          enabled_features: [],
          settings: {},
        })
        .select()
        .single();

      if (orgError) {
        console.error("Organization creation error:", orgError);
        throw orgError;
      }
      
      console.log("Organization created:", org);

      // Add user as admin member
      const { error: memberError } = await supabase
        .from("organization_members")
        .insert({
          organization_id: org.id,
          user_id: user.id,
          role: "admin",
        });

      if (memberError) throw memberError;

      // Add default admin role to user_roles
      const { error: roleError } = await supabase
        .from("user_roles")
        .insert({
          user_id: user.id,
          role: "admin",
        });

      if (roleError && !roleError.message.includes("duplicate")) {
        throw roleError;
      }

      toast.success("Organization created successfully!");
      
      // Store the organization ID
      localStorage.setItem(`currentOrgId_${user.id}`, org.id);
      
      // Navigate to dashboard
      navigate("/");
      window.location.reload(); // Reload to fetch organization data
    } catch (error: any) {
      console.error("Error creating organization:", error);
      toast.error(error.message || "Failed to create organization");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-background to-muted p-4">
      <Card className="w-full max-w-md">
        <CardHeader className="text-center">
          <div className="mx-auto mb-4 flex h-16 w-16 items-center justify-center rounded-full bg-primary/10">
            <Building2 className="h-8 w-8 text-primary" />
          </div>
          <CardTitle>Create Your Organization</CardTitle>
          <CardDescription>
            Set up your organization to get started with the Smart Inventory System
          </CardDescription>
        </CardHeader>
        <CardContent>
          <form onSubmit={handleCreateOrganization} className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="orgName">Organization Name</Label>
              <Input
                id="orgName"
                type="text"
                placeholder="Enter organization name"
                value={orgName}
                onChange={(e) => setOrgName(e.target.value)}
                required
                disabled={loading}
              />
            </div>
            <Button type="submit" className="w-full" disabled={loading}>
              {loading ? (
                <>
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                  Creating...
                </>
              ) : (
                "Create Organization"
              )}
            </Button>
          </form>
        </CardContent>
      </Card>
    </div>
  );
};
