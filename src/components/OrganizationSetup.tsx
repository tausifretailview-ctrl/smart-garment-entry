import { useState, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { useOrganization } from "@/contexts/OrganizationContext";
import { getStoredOrgSlug } from "@/lib/orgSlug";
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
import { Building2, Loader2, LogIn, Shield, WifiOff, RefreshCw } from "lucide-react";
import { toast } from "sonner";

export const OrganizationSetup = () => {
  const { user, loading: authLoading } = useAuth();
  const navigate = useNavigate();
  const { organizations, loading: orgLoading, fetchError, refetchOrganizations } = useOrganization();
  const [orgName, setOrgName] = useState("");
  const [orgSlug, setOrgSlug] = useState("");
  const [loading, setLoading] = useState(false);

  // Redirect to org-specific dashboard if user already has organizations
  useEffect(() => {
    if (user && !orgLoading && organizations.length > 0) {
      const firstOrg = organizations[0];
      navigate(`/${firstOrg.slug}`, { replace: true });
    }
  }, [user, organizations, orgLoading, navigate]);

  // For unauthenticated users, show org slug entry form
  const handleGoToOrgLogin = (e: React.FormEvent) => {
    e.preventDefault();
    const slug = orgSlug.trim().toLowerCase();
    
    if (!slug) {
      toast.error("Please enter your organization URL");
      return;
    }
    
    localStorage.setItem("selectedOrgSlug", slug);
    navigate(`/${slug}`, { replace: true });
  };

  const handleCreateOrganization = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!user || !orgName.trim()) return;

    setLoading(true);
    try {
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
      
      const { data: orgData, error } = await supabase.rpc('create_organization', {
        p_name: orgName.trim(),
        p_user_id: user.id
      });

      if (error) throw error;
      
      const org = orgData as { id: string; name: string };
      toast.success("Organization created successfully! Redirecting to dashboard...");
      
      localStorage.setItem(`currentOrgId_${user.id}`, org.id);
      
      const { data: newOrg } = await supabase
        .from("organizations")
        .select("slug")
        .eq("id", org.id)
        .single();
      
      setTimeout(() => {
        const slug = newOrg?.slug || org.id;
        localStorage.setItem("selectedOrgSlug", slug);
        navigate(`/${slug}`, { replace: true });
        window.location.reload();
      }, 500);
    } catch (error: any) {
      console.error("Error creating organization:", error);
      toast.error(error.message || "Failed to create organization");
    } finally {
      setLoading(false);
    }
  };

  if (authLoading) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <Loader2 className="h-8 w-8 animate-spin text-primary" />
      </div>
    );
  }

  // For unauthenticated users, show organization login finder
  if (!user) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-background to-muted p-4">
        <Card className="w-full max-w-md">
          <CardHeader className="text-center">
            <div className="mx-auto mb-4 flex h-16 w-16 items-center justify-center rounded-full bg-primary/10">
              <Building2 className="h-8 w-8 text-primary" />
            </div>
            <CardTitle>Go to Your Organization</CardTitle>
            <CardDescription>
              Enter your organization URL to access your login page
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <form onSubmit={handleGoToOrgLogin} className="space-y-4">
              <div className="space-y-2">
                <Label htmlFor="orgSlug">Organization URL</Label>
                <div className="flex items-center gap-2">
                  <span className="text-sm text-muted-foreground whitespace-nowrap">
                    inventoryshop.in/
                  </span>
                  <Input
                    id="orgSlug"
                    type="text"
                    placeholder="your-org-name"
                    value={orgSlug}
                    onChange={(e) => setOrgSlug(e.target.value.toLowerCase().replace(/\s+/g, '-'))}
                    required
                    className="flex-1"
                  />
                </div>
                <p className="text-xs text-muted-foreground">
                  Example: demo, sm-hair-replacement, gurukrupasarees
                </p>
              </div>
              <Button type="submit" className="w-full">
                <LogIn className="mr-2 h-4 w-4" />
                Go to Login
              </Button>
            </form>
            
            <div className="relative">
              <div className="absolute inset-0 flex items-center">
                <span className="w-full border-t" />
              </div>
              <div className="relative flex justify-center text-xs uppercase">
                <span className="bg-card px-2 text-muted-foreground">
                  Or
                </span>
              </div>
            </div>
            
            <Button 
              variant="outline" 
              className="w-full"
              onClick={() => navigate("/auth")}
            >
              <Shield className="mr-2 h-4 w-4" />
              Platform Admin Login
            </Button>
          </CardContent>
        </Card>
      </div>
    );
  }

  // Authenticated user: check if org fetch failed (network issue)
  if (fetchError && organizations.length === 0) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-background p-4">
        <div className="text-center p-6 max-w-sm mx-auto">
          <WifiOff className="h-12 w-12 text-muted-foreground mx-auto mb-4" />
          <h2 className="text-lg font-semibold text-foreground mb-2">Connection Problem</h2>
          <p className="text-sm text-muted-foreground mb-6">
            Unable to load your organization data. Please check your internet connection and try again.
          </p>
          <Button onClick={refetchOrganizations} className="gap-2">
            <RefreshCw className="h-4 w-4" />
            Retry
          </Button>
          {(() => {
            const storedSlug = getStoredOrgSlug();
            if (storedSlug) {
              return (
                <Button
                  variant="outline"
                  className="w-full mt-3"
                  onClick={() => navigate(`/${storedSlug}`, { replace: true })}
                >
                  <LogIn className="mr-2 h-4 w-4" />
                  Go to {storedSlug}
                </Button>
              );
            }
            return null;
          })()}
        </div>
      </div>
    );
  }

  // Authenticated user with a stored slug but no orgs loaded yet — offer shortcut
  const storedSlug = getStoredOrgSlug();

  // For authenticated users without organizations, show create form
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
          {storedSlug && (
            <div className="mb-4">
              <Button
                variant="outline"
                className="w-full"
                onClick={() => navigate(`/${storedSlug}`, { replace: true })}
              >
                <LogIn className="mr-2 h-4 w-4" />
                Go to {storedSlug} instead
              </Button>
              <div className="relative my-4">
                <div className="absolute inset-0 flex items-center">
                  <span className="w-full border-t" />
                </div>
                <div className="relative flex justify-center text-xs uppercase">
                  <span className="bg-card px-2 text-muted-foreground">Or create new</span>
                </div>
              </div>
            </div>
          )}
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
