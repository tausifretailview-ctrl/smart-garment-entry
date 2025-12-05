import { useState, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { useOrganization } from "@/contexts/OrganizationContext";
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
  const { organizations, loading: orgLoading } = useOrganization();
  const [orgName, setOrgName] = useState("");
  const [loading, setLoading] = useState(false);

  // Redirect to org-specific dashboard if user already has organizations
  useEffect(() => {
    if (!orgLoading && organizations.length > 0) {
      const firstOrg = organizations[0];
      navigate(`/${firstOrg.slug}`, { replace: true });
    }
  }, [organizations, orgLoading, navigate]);

  const handleCreateOrganization = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!user || !orgName.trim()) return;

    setLoading(true);
    try {
      console.log("Creating organization with user:", user.id);
      
      // Check if user already has organizations
      const { data: existingOrgs, error: checkError } = await supabase
        .from("organization_members")
        .select("organization_id")
        .eq("user_id", user.id);
      
      if (checkError) throw checkError;
      
      if (existingOrgs && existingOrgs.length > 0) {
        toast.error("You already have an organization. Redirecting to dashboard...");
        navigate("/", { replace: true });
        return;
      }
      
      // Create organization atomically using database function
      const { data: orgData, error } = await supabase.rpc('create_organization', {
        p_name: orgName.trim(),
        p_user_id: user.id
      });

      if (error) {
        console.error("Organization creation error:", error);
        throw error;
      }
      
      const org = orgData as { id: string; name: string };
      console.log("Organization created:", org);

      toast.success("Organization created successfully! Redirecting to dashboard...");
      
      // Store the organization ID
      localStorage.setItem(`currentOrgId_${user.id}`, org.id);
      
      // Need to fetch the full org data with slug to redirect properly
      const { data: newOrg } = await supabase
        .from("organizations")
        .select("slug")
        .eq("id", org.id)
        .single();
      
      // Wait a moment for the database to update, then navigate
      setTimeout(() => {
        const slug = newOrg?.slug || org.id;
        navigate(`/${slug}`, { replace: true });
        window.location.reload(); // Reload to fetch organization data
      }, 500);
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
