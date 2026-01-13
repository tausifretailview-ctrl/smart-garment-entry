import { useState, useEffect } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Loader2, Building2, AlertCircle, Phone, ArrowRight, CheckCircle2, Cloud } from "lucide-react";
import { toast } from "sonner";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { validateAuth } from "@/lib/validations";
import safproLogo from "@/assets/safpro-logo.png";

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
  const brandColor = orgSettings?.bill_barcode_settings?.brand_color || "#6C5CE7";

  const chartHeights = [40, 70, 50, 90, 60];

  return (
    <div className="min-h-screen flex">
      {/* Left Panel - Branding with Animated Dashboard */}
      <div className="hidden lg:flex lg:w-[55%] bg-gradient-to-br from-indigo-50 via-indigo-100 to-purple-100 flex-col items-center justify-center p-12 relative overflow-hidden">
        {/* Decorative background circles */}
        <div className="absolute top-20 left-10 w-32 h-32 bg-indigo-200/30 rounded-full blur-2xl" />
        <div className="absolute bottom-20 right-10 w-48 h-48 bg-purple-200/40 rounded-full blur-3xl" />
        <div className="absolute top-1/2 left-1/4 w-24 h-24 bg-violet-200/30 rounded-full blur-xl" />
        
        {/* SafPro ERP Branding */}
        <div className="text-center z-10 mb-8">
          <img 
            src={safproLogo} 
            alt="SafPro ERP" 
            className="h-20 w-auto mx-auto mb-4 object-contain"
          />
          <p className="text-lg text-indigo-600 font-medium">Clean & Professional Software</p>
        </div>

        {/* Animated Mock Dashboard */}
        <div className="z-10 w-full max-w-md">
          {/* Monitor Frame */}
          <div className="bg-slate-800 rounded-2xl p-4 shadow-2xl">
            {/* Traffic light dots & title */}
            <div className="flex items-center gap-2 mb-3">
              <div className="w-3 h-3 rounded-full bg-red-400" />
              <div className="w-3 h-3 rounded-full bg-yellow-400" />
              <div className="w-3 h-3 rounded-full bg-green-400" />
              <span className="text-white/80 text-xs ml-auto font-mono">SMART INVENTORY v4.0</span>
            </div>
            
            {/* Dashboard Content */}
            <div className="bg-slate-100 rounded-lg p-4 space-y-4">
              {/* Stats Cards */}
              <div className="grid grid-cols-3 gap-3">
                <div className="bg-white rounded-lg p-3 shadow-sm">
                  <p className="text-[10px] text-slate-400 uppercase tracking-wide">Total Stock</p>
                  <p className="text-xl font-bold text-indigo-600">1,284</p>
                </div>
                <div className="bg-white rounded-lg p-3 shadow-sm">
                  <p className="text-[10px] text-slate-400 uppercase tracking-wide">Today Sales</p>
                  <p className="text-xl font-bold text-green-500">₹45k</p>
                </div>
                <div className="bg-white rounded-lg p-3 shadow-sm">
                  <p className="text-[10px] text-slate-400 uppercase tracking-wide">Pending</p>
                  <p className="text-xl font-bold text-orange-500">12</p>
                </div>
              </div>
              
              {/* Animated Chart Bars */}
              <div className="flex items-end justify-center gap-3 h-20 pt-2">
                {chartHeights.map((height, i) => (
                  <div 
                    key={i}
                    className="w-10 bg-gradient-to-t from-indigo-400 to-indigo-300 rounded-t origin-bottom animate-chart-bar"
                    style={{ 
                      height: `${height}%`,
                      animationDelay: `${i * 0.3}s`
                    }}
                  />
                ))}
              </div>
            </div>
          </div>
          
          {/* Receipt Printer Animation */}
          <div className="flex justify-center -mt-2">
            <div className="bg-slate-700 rounded-b-lg px-10 py-3 relative overflow-hidden">
              <div className="w-16 h-6 bg-white rounded-sm animate-bill-slide" />
            </div>
          </div>
        </div>

        {/* Feature Badges */}
        <div className="flex flex-wrap justify-center gap-3 mt-8 z-10">
          <Badge variant="secondary" className="bg-white/80 backdrop-blur-sm px-3 py-1.5 text-sm shadow-sm">
            <CheckCircle2 className="w-4 h-4 text-green-500 mr-1.5" />
            GST Ready
          </Badge>
          <Badge variant="secondary" className="bg-white/80 backdrop-blur-sm px-3 py-1.5 text-sm shadow-sm">
            <CheckCircle2 className="w-4 h-4 text-green-500 mr-1.5" />
            Barcode Print
          </Badge>
          <Badge variant="secondary" className="bg-white/80 backdrop-blur-sm px-3 py-1.5 text-sm shadow-sm">
            <Cloud className="w-4 h-4 text-blue-500 mr-1.5" />
            Cloud Sync
          </Badge>
        </div>

        {/* Footer */}
        <div className="absolute bottom-6 text-center text-indigo-500 text-sm">
          <p>Powered by SafPro ERP</p>
        </div>
      </div>

      {/* Right Panel - Login Form */}
      <div className="flex-1 flex items-center justify-center p-6 lg:p-12 bg-background">
        <div className="w-full max-w-md space-y-6">
          <Card className="shadow-lg border-border/50">
            <CardHeader className="text-center space-y-4 pb-6">
              {/* Mobile: Show SafPro logo */}
              <div className="lg:hidden mx-auto mb-2">
                <img 
                  src={safproLogo} 
                  alt="SafPro ERP" 
                  className="h-14 w-auto mx-auto object-contain"
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
                <CardTitle className="text-xl font-semibold text-foreground">
                  Account Login
                </CardTitle>
                <CardDescription className="mt-1">
                  Enter your credentials to access the ERP dashboard
                </CardDescription>
              </div>
            </CardHeader>

            <CardContent className="space-y-5">
              {error && (
                <Alert variant="destructive">
                  <AlertCircle className="h-4 w-4" />
                  <AlertDescription>{error}</AlertDescription>
                </Alert>
              )}
              
              <form onSubmit={handleSignIn} className="space-y-4">
                <div className="space-y-2">
                  <Label htmlFor="email">Username / Email</Label>
                  <Input
                    id="email"
                    type="email"
                    placeholder="you@example.com"
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    disabled={loading}
                    required
                    className="h-12 rounded-xl bg-slate-50 border-slate-200 focus:border-indigo-400"
                  />
                </div>
                
                <div className="space-y-2">
                  <div className="flex justify-between items-center">
                    <Label htmlFor="password">Password</Label>
                    <a 
                      href="#" 
                      className="text-sm font-medium hover:underline"
                      style={{ color: brandColor }}
                      onClick={(e) => {
                        e.preventDefault();
                        toast.info("Please contact your administrator to reset your password.");
                      }}
                    >
                      Forgot?
                    </a>
                  </div>
                  <Input
                    id="password"
                    type="password"
                    placeholder="••••••••"
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    disabled={loading}
                    required
                    className="h-12 rounded-xl bg-slate-50 border-slate-200 focus:border-indigo-400"
                  />
                </div>

                <Button 
                  type="submit" 
                  className="w-full h-12 text-base font-medium rounded-xl" 
                  disabled={loading}
                  style={{ backgroundColor: brandColor }}
                >
                  {loading ? (
                    <>
                      <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                      Signing in...
                    </>
                  ) : (
                    <>
                      Login to System
                      <ArrowRight className="ml-2 h-5 w-5" />
                    </>
                  )}
                </Button>
              </form>
            </CardContent>
          </Card>

          {/* Support Section */}
          <div className="flex items-center justify-center gap-3 p-4 bg-slate-50 rounded-xl border border-slate-100">
            <div 
              className="w-12 h-12 rounded-full flex items-center justify-center animate-pulse-phone"
              style={{ backgroundColor: brandColor }}
            >
              <Phone className="w-5 h-5 text-white" />
            </div>
            <div>
              <p className="text-xs text-muted-foreground uppercase tracking-wider font-medium">Support & Sales</p>
              <p className="text-lg font-bold text-foreground">+91-8424034844</p>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
