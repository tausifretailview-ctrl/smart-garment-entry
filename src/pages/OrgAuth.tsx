import { useState, useEffect } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Loader2, Building2, AlertCircle, Phone, ArrowRight, CheckCircle2, Cloud, Globe, Facebook, Instagram, Printer, BarChart3, Users, ShoppingCart, FileText, Shield, Smartphone } from "lucide-react";
import { toast } from "sonner";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { validateAuth } from "@/lib/validations";
import safproLogo from "@/assets/safpro-logo-full.png";

const BRAND_COLOR = "#6C5CE7";

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
  const brandColor = orgSettings?.bill_barcode_settings?.brand_color || BRAND_COLOR;

  const chartHeights = [40, 70, 50, 90, 60];

  const softwareFeatures = [
    { icon: BarChart3, label: "Sales Analytics" },
    { icon: Users, label: "Customer Management" },
    { icon: ShoppingCart, label: "POS Billing" },
    { icon: FileText, label: "GST Reports" },
    { icon: Shield, label: "Multi-User Access" },
    { icon: Smartphone, label: "Mobile Ready" },
  ];

  return (
    <div className="min-h-screen flex w-full">
      {/* Left Panel - Branding with Animated Dashboard */}
      <div className="hidden lg:flex lg:w-1/2 bg-gradient-to-br from-slate-800 via-slate-900 to-[#6C5CE7]/30 flex-col items-center justify-center p-8 relative overflow-hidden">
        {/* Decorative background elements */}
        <div className="absolute top-20 left-10 w-32 h-32 rounded-full blur-3xl" style={{ backgroundColor: `${BRAND_COLOR}20` }} />
        <div className="absolute bottom-20 right-10 w-48 h-48 rounded-full blur-3xl" style={{ backgroundColor: `${BRAND_COLOR}15` }} />
        
        {/* SafPro ERP Branding - Top Left */}
        <div className="absolute top-8 left-8 z-10">
          <img 
            src={safproLogo} 
            alt="SafPro ERP" 
            className="h-12 w-auto object-contain"
          />
          <p className="text-xs text-slate-400 uppercase tracking-widest mt-2">Clean & Professional Software</p>
        </div>

        {/* Animated Mock Dashboard - Centered */}
        <div className="z-10 w-full max-w-lg mt-8">
          {/* Monitor Frame */}
          <div className="bg-slate-900 rounded-3xl p-5 shadow-2xl border border-slate-700/50">
            {/* Traffic light dots & title */}
            <div className="flex items-center gap-2 mb-4">
              <div className="w-3 h-3 rounded-full bg-red-400" />
              <div className="w-3 h-3 rounded-full bg-yellow-400" />
              <div className="w-3 h-3 rounded-full bg-green-400" />
              <span className="text-slate-400 text-xs ml-auto font-mono tracking-wide">SMART INVENTORY v4.0</span>
            </div>
            
            {/* Dashboard Content */}
            <div className="bg-slate-50 rounded-xl p-5 space-y-5">
              {/* Stats Cards */}
              <div className="grid grid-cols-3 gap-4">
                <div className="bg-white rounded-lg p-4 shadow-sm border border-slate-100">
                  <p className="text-[10px] text-slate-400 uppercase tracking-wider font-medium">Total Stock</p>
                  <p className="text-2xl font-bold text-indigo-600">1,284</p>
                </div>
                <div className="bg-white rounded-lg p-4 shadow-sm border border-slate-100">
                  <p className="text-[10px] text-slate-400 uppercase tracking-wider font-medium">Today Sales</p>
                  <p className="text-2xl font-bold text-green-500">₹45k</p>
                </div>
                <div className="bg-white rounded-lg p-4 shadow-sm border border-slate-100">
                  <p className="text-[10px] text-slate-400 uppercase tracking-wider font-medium">Pending</p>
                  <p className="text-2xl font-bold text-orange-500">12</p>
                </div>
              </div>
              
              {/* Animated Chart Bars */}
              <div className="flex items-end justify-between gap-4 h-28 px-4">
                {chartHeights.map((height, i) => (
                  <div 
                    key={i}
                    className="flex-1 bg-gradient-to-t from-indigo-500 to-indigo-400 rounded-t-lg origin-bottom animate-chart-bar shadow-sm"
                    style={{ 
                      height: `${height}%`,
                      animationDelay: `${i * 0.3}s`
                    }}
                  />
                ))}
              </div>
            </div>
          </div>
          
          {/* Receipt/Barcode Printer Animation */}
          <div className="flex justify-center -mt-1">
            <div className="bg-slate-700 rounded-b-xl px-12 py-4 relative overflow-hidden shadow-lg">
              {/* Printer slot lines */}
              <div className="absolute top-0 left-4 right-4 h-0.5 bg-slate-600" />
              {/* Animated receipt paper with barcode lines */}
              <div className="w-20 bg-white rounded-sm animate-bill-slide p-1 space-y-0.5">
                <div className="h-0.5 bg-slate-800 w-full" />
                <div className="h-0.5 bg-slate-800 w-3/4" />
                <div className="h-0.5 bg-slate-800 w-full" />
                <div className="h-0.5 bg-slate-800 w-1/2" />
                <div className="h-0.5 bg-slate-800 w-full" />
                <div className="h-0.5 bg-slate-800 w-2/3" />
              </div>
            </div>
          </div>
        </div>

        {/* Thermal Barcode Printer Image */}
        <div className="flex justify-center mt-6 z-10">
          <div className="relative">
            {/* Printer Body */}
            <div className="bg-slate-700 rounded-xl px-6 py-3 shadow-xl border border-slate-600">
              <div className="flex items-center gap-3">
                <Printer className="w-8 h-8 text-white" />
                <div>
                  <p className="text-white text-sm font-medium">Thermal Barcode Printer</p>
                  <p className="text-slate-400 text-xs">Direct Print Support</p>
                </div>
              </div>
              {/* Printer slot */}
              <div className="mt-2 bg-slate-600 rounded h-1 w-full" />
              {/* Printing barcode label */}
              <div className="bg-white rounded-sm mt-1 p-1.5 animate-bill-slide">
                <div className="flex gap-0.5">
                  {[2, 1, 3, 1, 2, 1, 3, 2, 1, 2].map((w, i) => (
                    <div key={i} className="bg-slate-900 h-4" style={{ width: `${w * 2}px` }} />
                  ))}
                </div>
                <p className="text-[6px] text-center text-slate-600 mt-0.5 font-mono">8901234567890</p>
              </div>
            </div>
          </div>
        </div>

        {/* Feature Badges */}
        <div className="flex flex-wrap justify-center gap-3 mt-8 z-10">
          <Badge variant="secondary" className="bg-white/10 backdrop-blur-sm text-white border-white/20 px-4 py-2 text-sm">
            <CheckCircle2 className="w-4 h-4 text-green-400 mr-2" />
            GST Ready
          </Badge>
          <Badge variant="secondary" className="bg-white/10 backdrop-blur-sm text-white border-white/20 px-4 py-2 text-sm">
            <CheckCircle2 className="w-4 h-4 text-green-400 mr-2" />
            Barcode Print
          </Badge>
          <Badge variant="secondary" className="bg-white/10 backdrop-blur-sm text-white border-white/20 px-4 py-2 text-sm">
            <Cloud className="w-4 h-4 text-blue-400 mr-2" />
            Cloud Sync
          </Badge>
        </div>

        {/* Software Features Grid */}
        <div className="grid grid-cols-3 gap-3 mt-8 z-10 w-full max-w-lg">
          {softwareFeatures.map((feature, index) => (
            <div 
              key={index}
              className="flex items-center gap-2 bg-white/5 backdrop-blur-sm rounded-lg px-3 py-2 border border-white/10"
            >
              <feature.icon className="w-4 h-4" style={{ color: BRAND_COLOR }} />
              <span className="text-white text-xs font-medium">{feature.label}</span>
            </div>
          ))}
        </div>

        {/* Website & Social Links */}
        <div className="flex flex-col items-center gap-4 mt-10 z-10">
          <a 
            href="https://adtechagency.in/" 
            target="_blank" 
            rel="noopener noreferrer"
            className="flex items-center gap-2 text-white/80 hover:text-white transition-colors"
          >
            <Globe className="w-4 h-4" />
            <span className="text-sm">www.adtechagency.in</span>
          </a>
          
          <div className="flex items-center gap-4">
            <a 
              href="https://facebook.com" 
              target="_blank" 
              rel="noopener noreferrer"
              className="w-10 h-10 rounded-full bg-white/10 flex items-center justify-center hover:bg-white/20 transition-colors"
            >
              <Facebook className="w-5 h-5 text-white" />
            </a>
            <a 
              href="https://instagram.com" 
              target="_blank" 
              rel="noopener noreferrer"
              className="w-10 h-10 rounded-full bg-white/10 flex items-center justify-center hover:bg-white/20 transition-colors"
            >
              <Instagram className="w-5 h-5 text-white" />
            </a>
            <a 
              href="https://google.com" 
              target="_blank" 
              rel="noopener noreferrer"
              className="w-10 h-10 rounded-full bg-white/10 flex items-center justify-center hover:bg-white/20 transition-colors"
            >
              <svg className="w-5 h-5 text-white" viewBox="0 0 24 24" fill="currentColor">
                <path d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z"/>
                <path d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"/>
                <path d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z"/>
                <path d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z"/>
              </svg>
            </a>
          </div>
        </div>

        {/* Powered by Footer */}
        <p className="absolute bottom-6 text-slate-500 text-xs z-10">
          Powered by <span className="font-semibold" style={{ color: BRAND_COLOR }}>SafPro ERP</span>
        </p>
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
