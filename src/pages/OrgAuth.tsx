import { useState, useEffect } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Loader2, Building2, AlertCircle } from "lucide-react";
import { toast } from "sonner";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { validateAuth } from "@/lib/validations";
import safproLogo from "@/assets/safpro-logo.png";
import posIllustration from "@/assets/pos-illustration.png";

interface Organization {
  id: string;
  name: string;
  slug: string;
  settings: any;
}

interface OrgSettings {
  business_name?: string;
  bill_barcode_settings?: {
    logo_url?: string;
    brand_color?: string;
    login_display_name?: string;
  };
}

export default function OrgAuth() {
  const { orgSlug } = useParams<{ orgSlug: string }>();
  const navigate = useNavigate();
  const { user } = useAuth();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [loading, setLoading] = useState(false);
  const [orgLoading, setOrgLoading] = useState(true);
  const [organization, setOrganization] = useState<Organization | null>(null);
  const [orgSettings, setOrgSettings] = useState<OrgSettings | null>(null);
  const [error, setError] = useState<string>("");

  useEffect(() => {
    const fetchOrganization = async () => {
      if (!orgSlug) {
        setError("Invalid organization URL");
        setOrgLoading(false);
        return;
      }

      try {
        const { data, error } = await supabase
          .from("organizations")
          .select("id, name, slug, settings")
          .eq("slug", orgSlug)
          .single();

        if (error || !data) {
          setError("Organization not found");
          setOrgLoading(false);
          return;
        }

        setOrganization(data);

        // Fetch organization branding settings
        const { data: settingsData } = await supabase
          .from("settings")
          .select("business_name, bill_barcode_settings")
          .eq("organization_id", data.id)
          .single();

        if (settingsData) {
          setOrgSettings(settingsData as OrgSettings);
        }
      } catch (err) {
        console.error("Error fetching organization:", err);
        setError("Failed to load organization");
      } finally {
        setOrgLoading(false);
      }
    };

    fetchOrganization();
  }, [orgSlug]);

  useEffect(() => {
    // If user is already logged in, verify they belong to this org
    const checkUserMembership = async () => {
      if (user && organization) {
        const { data: membership } = await supabase
          .from("organization_members")
          .select("id")
          .eq("user_id", user.id)
          .eq("organization_id", organization.id)
          .single();

        if (membership) {
          // User belongs to this org, redirect to org-scoped dashboard
          localStorage.setItem("selectedOrgSlug", organization.slug);
          navigate(`/${organization.slug}`);
        } else {
          // User is logged in but not a member of this org
          setError("You are not a member of this organization. Please contact your administrator.");
          await supabase.auth.signOut();
        }
      }
    };

    checkUserMembership();
  }, [user, organization, navigate]);

  const handleSignIn = async (e: React.FormEvent) => {
    e.preventDefault();
    
    if (!organization) {
      toast.error("Organization not found");
      return;
    }

    // Validate with Zod schema
    const validation = validateAuth(email, password);
    if (!validation.success) {
      toast.error(validation.error);
      return;
    }

    setLoading(true);
    setError("");

    try {
      // First, authenticate the user
      const { data: authData, error: authError } = await supabase.auth.signInWithPassword({
        email,
        password,
      });

      if (authError) {
        if (authError.message.includes("Invalid login credentials")) {
          setError("Invalid email or password");
        } else {
          setError(authError.message);
        }
        setLoading(false);
        return;
      }

      if (!authData.user) {
        setError("Login failed. Please try again.");
        setLoading(false);
        return;
      }

      // Check if user belongs to this organization
      const { data: membership, error: membershipError } = await supabase
        .from("organization_members")
        .select("id, role")
        .eq("user_id", authData.user.id)
        .eq("organization_id", organization.id)
        .single();

      if (membershipError || !membership) {
        setError("You are not a member of this organization. Please contact your administrator.");
        await supabase.auth.signOut();
        setLoading(false);
        return;
      }

      // Success! Store the organization slug and redirect to org-scoped dashboard
      localStorage.setItem("selectedOrgSlug", organization.slug);
      toast.success(`Welcome to ${organization.name}!`);
      navigate(`/${organization.slug}`);
    } catch (err) {
      setError("An unexpected error occurred. Please try again.");
    } finally {
      setLoading(false);
    }
  };

  if (orgLoading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-background">
        <Loader2 className="h-8 w-8 animate-spin text-primary" />
      </div>
    );
  }

  if (!organization) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-background p-4">
        <Card className="w-full max-w-md">
          <CardHeader className="text-center">
            <AlertCircle className="h-12 w-12 text-destructive mx-auto mb-4" />
            <CardTitle>Organization Not Found</CardTitle>
            <CardDescription>
              The organization URL you're trying to access doesn't exist.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <Button 
              onClick={() => navigate("/auth")} 
              className="w-full"
            >
              Go to General Login
            </Button>
          </CardContent>
        </Card>
      </div>
    );
  }

  const displayName = orgSettings?.bill_barcode_settings?.login_display_name 
    || orgSettings?.business_name 
    || organization.name;
  const logoUrl = orgSettings?.bill_barcode_settings?.logo_url;
  const brandColor = orgSettings?.bill_barcode_settings?.brand_color || "#3b82f6";

  return (
    <div className="min-h-screen flex">
      {/* Left Panel - Branding */}
      <div className="hidden lg:flex lg:w-[55%] bg-gradient-to-br from-blue-50 via-blue-100 to-sky-100 flex-col items-center justify-center p-12 relative overflow-hidden">
        {/* Decorative background circles */}
        <div className="absolute top-20 left-10 w-32 h-32 bg-blue-200/30 rounded-full blur-2xl" />
        <div className="absolute bottom-20 right-10 w-48 h-48 bg-sky-200/40 rounded-full blur-3xl" />
        
        {/* SafPro ERP Branding */}
        <div className="text-center z-10">
          <img 
            src={safproLogo} 
            alt="SafPro ERP" 
            className="h-24 w-auto mx-auto mb-6 object-contain"
          />
          <h1 className="text-3xl font-bold text-blue-900 mb-2">SafPro ERP</h1>
          <p className="text-lg text-blue-700 mb-10">Clean & Professional Software</p>
        </div>

        {/* POS System Illustration */}
        <div className="z-10 max-w-lg">
          <img 
            src={posIllustration} 
            alt="POS System" 
            className="w-full h-auto object-contain drop-shadow-xl"
          />
        </div>

        {/* Footer */}
        <div className="absolute bottom-6 text-center text-blue-600 text-sm">
          <p>Powered by SafPro ERP</p>
        </div>
      </div>

      {/* Right Panel - Login Form */}
      <div className="flex-1 flex items-center justify-center p-6 lg:p-12 bg-background">
        <Card className="w-full max-w-md shadow-lg border-border/50">
          <CardHeader className="text-center space-y-4 pb-6">
            {/* Mobile: Show SafPro logo */}
            <div className="lg:hidden mx-auto mb-2">
              <img 
                src={safproLogo} 
                alt="SafPro ERP" 
                className="h-16 w-auto mx-auto object-contain"
              />
              <div className="border-t border-border/50 mt-4 pt-4" />
            </div>

            {/* Organization Branding */}
            {logoUrl ? (
              <div className="mx-auto">
                <img 
                  src={logoUrl} 
                  alt={displayName} 
                  className="h-20 w-auto mx-auto object-contain"
                />
              </div>
            ) : (
              <div 
                className="mx-auto w-16 h-16 rounded-full flex items-center justify-center"
                style={{ backgroundColor: `${brandColor}20` }}
              >
                <Building2 className="h-8 w-8" style={{ color: brandColor }} />
              </div>
            )}
            
            <div>
              <CardTitle 
                className="text-2xl font-bold"
                style={{ color: brandColor }}
              >
                {displayName}
              </CardTitle>
              <CardDescription className="mt-2">
                Sign in to access your account
              </CardDescription>
            </div>
          </CardHeader>

          <CardContent className="space-y-6">
            {error && (
              <Alert variant="destructive">
                <AlertCircle className="h-4 w-4" />
                <AlertDescription>{error}</AlertDescription>
              </Alert>
            )}
            
            <form onSubmit={handleSignIn} className="space-y-4">
              <div className="space-y-2">
                <Label htmlFor="email">Email</Label>
                <Input
                  id="email"
                  type="email"
                  placeholder="you@example.com"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  disabled={loading}
                  required
                  className="h-11"
                />
              </div>
              
              <div className="space-y-2">
                <Label htmlFor="password">Password</Label>
                <Input
                  id="password"
                  type="password"
                  placeholder="••••••••"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  disabled={loading}
                  required
                  className="h-11"
                />
              </div>

              <Button 
                type="submit" 
                className="w-full h-11 text-base font-medium" 
                disabled={loading}
                style={{ backgroundColor: brandColor }}
              >
                {loading ? (
                  <>
                    <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                    Signing in...
                  </>
                ) : (
                  "Sign In"
                )}
              </Button>
            </form>

            <div className="pt-4 text-center text-sm text-muted-foreground border-t border-border/50">
              <p>Don't have access?</p>
              <p className="mt-1">Contact your organization administrator</p>
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
