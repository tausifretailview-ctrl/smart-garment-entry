import { useState, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { useOrganization } from "@/contexts/OrganizationContext";
import { getStoredOrgSlug, storeOrgSlug } from "@/lib/orgSlug";
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

const getCachedOrgSlugs = (userId: string): { id: string; slug: string; name: string }[] | null => {
  try {
    const raw = localStorage.getItem(`cachedOrgs_${userId}`);
    if (!raw) return null;
    return JSON.parse(raw);
  } catch {
    return null;
  }
};

export const OrganizationSetup = () => {
  const { user, loading: authLoading } = useAuth();
  const navigate = useNavigate();
  const {
    organizations,
    loading: orgLoading,
    fetchError,
    hasResolvedOrganizations,
    refetchOrganizations,
  } = useOrganization();
  const [orgName, setOrgName] = useState("");
  const [orgSlug, setOrgSlug] = useState("");
  const [loading, setLoading] = useState(false);

  // Compute redirect slug (must be before any early returns for hooks rules)
  const storedSlug = getStoredOrgSlug();
  const cachedOrgs = user ? getCachedOrgSlugs(user.id) : null;
  const redirectSlug = cachedOrgs?.[0]?.slug || storedSlug || null;

  // Redirect to org-specific dashboard if user already has organizations
  useEffect(() => {
    if (user && !orgLoading && organizations.length > 0) {
      const firstOrg = organizations[0];
      navigate(`/${firstOrg.slug}`, { replace: true });
    }
  }, [user, organizations, orgLoading, navigate]);

  // Auto-redirect: if resolved with 0 orgs but we have evidence of prior org, redirect there
  useEffect(() => {
    if (user && hasResolvedOrganizations && organizations.length === 0 && !fetchError && redirectSlug) {
      console.log("User has cached/stored org but 0 results — redirecting to", redirectSlug);
      navigate(`/${redirectSlug}`, { replace: true });
    }
  }, [user, hasResolvedOrganizations, organizations.length, fetchError, redirectSlug, navigate]);

  const handleGoToOrgLogin = (e: React.FormEvent) => {
    e.preventDefault();
    const slug = orgSlug.trim().toLowerCase();
    if (!slug) {
      toast.error("Please enter your organization URL");
      return;
    }
    storeOrgSlug(slug);
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
      const { data: orgData, error } = await supabase.rpc("create_organization", {
        p_name: orgName.trim(),
        p_user_id: user.id,
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
        storeOrgSlug(slug);
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

  // Unauthenticated: show org slug entry
  if (!user) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-background to-muted p-4">
        <Card className="w-full max-w-md">
          <CardHeader className="text-center">
            <div className="mx-auto mb-4 flex h-16 w-16 items-center justify-center rounded-full bg-primary/10">
              <Building2 className="h-8 w-8 text-primary" />
            </div>
            <CardTitle>Go to Your Organization</CardTitle>
            <CardDescription>Enter your organization URL to access your login page</CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <form onSubmit={handleGoToOrgLogin} className="space-y-4">
              <div className="space-y-2">
                <Label htmlFor="orgSlug">Organization URL</Label>
                <div className="flex items-center gap-2">
                  <span className="text-sm text-muted-foreground whitespace-nowrap">inventoryshop.in/</span>
                  <Input
                    id="orgSlug"
                    type="text"
                    placeholder="your-org-name"
                    value={orgSlug}
                    onChange={(e) => setOrgSlug(e.target.value.toLowerCase().replace(/\s+/g, "-"))}
                    required
                    className="flex-1"
                  />
                </div>
                <p className="text-xs text-muted-foreground">Example: demo, sm-hair-replacement, gurukrupasarees</p>
              </div>
              <Button type="submit" className="w-full">
                <LogIn className="mr-2 h-4 w-4" />
                Go to Login
              </Button>
            </form>
            <div className="relative">
              <div className="absolute inset-0 flex items-center"><span className="w-full border-t" /></div>
              <div className="relative flex justify-center text-xs uppercase">
                <span className="bg-card px-2 text-muted-foreground">Or</span>
              </div>
            </div>
            <Button variant="outline" className="w-full" onClick={() => navigate("/auth")}>
              <Shield className="mr-2 h-4 w-4" />
              Platform Admin Login
            </Button>
          </CardContent>
        </Card>
      </div>
    );
  }

  // Still loading orgs
  if (orgLoading) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <Loader2 className="h-8 w-8 animate-spin text-primary" />
      </div>
    );
  }

  // Fetch failed — show Connection Problem with retry + cached shortcuts
  if (fetchError) {
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
          {cachedOrgs && cachedOrgs.length > 0 && (
            <div className="mt-4 space-y-2">
              <p className="text-xs text-muted-foreground">Or go to your organization directly:</p>
              {cachedOrgs.map((org) => (
                <Button key={org.id} variant="outline" className="w-full" onClick={() => navigate(`/${org.slug}`, { replace: true })}>
                  <LogIn className="mr-2 h-4 w-4" />
                  Go to {org.name}
                </Button>
              ))}
            </div>
          )}
          {!cachedOrgs?.length && storedSlug && (
            <Button variant="outline" className="w-full mt-3" onClick={() => navigate(`/${storedSlug}`, { replace: true })}>
              <LogIn className="mr-2 h-4 w-4" />
              Go to {storedSlug}
            </Button>
          )}
        </div>
      </div>
    );
  }

  // Orgs haven't been confirmed yet
  if (!hasResolvedOrganizations) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <Loader2 className="h-8 w-8 animate-spin text-primary" />
      </div>
    );
  }

  // If redirect will happen (cached/stored slug exists), show spinner while navigating
  if (redirectSlug && organizations.length === 0) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <Loader2 className="h-8 w-8 animate-spin text-primary" />
      </div>
    );
  }

  // Genuinely new user (no slug, no cache, fresh session) — show create form
  return (
    <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-background to-muted p-4">
      <Card className="w-full max-w-md">
        <CardHeader className="text-center">
          <div className="mx-auto mb-4 flex h-16 w-16 items-center justify-center rounded-full bg-primary/10">
            <Building2 className="h-8 w-8 text-primary" />
          </div>
          <CardTitle>Create Your Organization</CardTitle>
          <CardDescription>Set up your organization to get started with the Smart Inventory System</CardDescription>
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
