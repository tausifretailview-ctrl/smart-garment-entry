import { useState, useEffect } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Loader2, Building2, AlertCircle, Phone, ArrowRight, Check, Globe, Facebook, Instagram } from "lucide-react";
import { toast } from "sonner";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { validateAuth } from "@/lib/validations";
import safproLogo from "@/assets/safpro-logo-full.png";
import posIllustration from "@/assets/pos-illustration.png";

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

  const softwareFeatures = [
    "Billing & Invoice Management",
    "Inventory & Stock Control",
    "Customer & Vendor Management",
    "GST Reports & Accounting",
    "Barcode & Thermal Printer Support",
    "Cloud Backup & Secure Login",
  ];

  return (
    <div className="min-h-screen flex w-full">
      {/* Left Panel - Light Theme with POS Illustration */}
      <div className="hidden lg:flex lg:w-1/2 bg-gradient-to-br from-blue-50 via-indigo-50 to-purple-100 flex-col p-8 relative overflow-hidden">
        {/* Subtle background effect */}
        <div className="absolute inset-0 opacity-5">
          <div className="absolute bottom-0 left-0 right-0 h-48 bg-gradient-to-t from-slate-400 to-transparent" />
        </div>

        {/* POS Illustration with Logo - Center */}
        <div className="flex-1 flex items-center justify-center z-10">
          <img 
            src={posIllustration} 
            alt="SafPro ERP - POS System" 
            className="w-full max-w-lg object-contain drop-shadow-xl"
          />
        </div>

        {/* Bottom Section - Features & Hardware */}
        <div className="z-10 grid grid-cols-2 gap-8">
          {/* Software Features */}
          <div>
            <h3 className="text-slate-700 font-medium italic mb-4 text-sm">Software Features</h3>
            <ul className="space-y-2.5">
              {softwareFeatures.map((feature, index) => (
                <li key={index} className="flex items-start gap-2">
                  <div className="w-5 h-5 rounded-full bg-green-500 flex items-center justify-center flex-shrink-0 mt-0.5">
                    <Check className="w-3 h-3 text-white" strokeWidth={3} />
                  </div>
                  <span className="text-slate-600 text-sm">{feature}</span>
                </li>
              ))}
            </ul>
          </div>

          {/* Supported Hardware - Thermal Printer */}
          <div>
            <h3 className="text-slate-700 font-medium italic mb-4 text-sm">Supported Hardware</h3>
            <div className="flex justify-center">
              {/* Thermal Printer Graphic */}
              <div className="relative">
                {/* Printer Body */}
                <div className="bg-slate-700 rounded-lg p-4 w-32 shadow-lg">
                  {/* Top vent lines */}
                  <div className="flex gap-1 mb-2">
                    {[...Array(8)].map((_, i) => (
                      <div key={i} className="h-0.5 flex-1 bg-slate-600 rounded" />
                    ))}
                  </div>
                  {/* Paper slot */}
                  <div className="bg-slate-800 rounded h-2 w-full" />
                  {/* Printing paper with barcode */}
                  <div className="bg-white rounded-sm mt-1 p-1.5 animate-bill-slide overflow-hidden">
                    <div className="flex justify-center gap-px">
                      {[2, 1, 3, 1, 2, 1, 3, 2, 1, 2, 1, 3, 1, 2].map((w, i) => (
                        <div key={i} className="bg-slate-900 h-6" style={{ width: `${w}px` }} />
                      ))}
                    </div>
                    <p className="text-[5px] text-center text-slate-500 mt-0.5 font-mono">8901234567890</p>
                  </div>
                </div>
                {/* Printer stand/base */}
                <div className="bg-slate-600 rounded-b-lg h-2 w-28 mx-auto -mt-1" />
              </div>
            </div>
          </div>
        </div>

        {/* Website Link - Bottom */}
        <div className="z-10 mt-6 text-center">
          <a 
            href="https://adtechagency.in/" 
            target="_blank" 
            rel="noopener noreferrer"
            className="text-slate-500 text-sm hover:text-slate-700 transition-colors"
          >
            Visit us: <span className="font-medium text-slate-700">www.adtechagency.in</span>
          </a>
        </div>
      </div>

      {/* Right Panel - Login Form */}
      <div className="flex-1 flex items-center justify-center p-6 lg:p-12 bg-slate-50">
        <div className="w-full max-w-sm space-y-6">
          {/* Mobile: Show SafPro logo */}
          <div className="lg:hidden text-center mb-6">
            <img 
              src={safproLogo} 
              alt="SafPro ERP" 
              className="h-12 w-auto mx-auto object-contain"
            />
          </div>

          <Card className="shadow-xl border-0 bg-white">
            <CardHeader className="text-center space-y-4 pb-4">
              {/* Organization Branding */}
              {logoUrl ? (
                <div className="mx-auto">
                  <img 
                    src={logoUrl} 
                    alt={displayName} 
                    className="h-16 w-auto mx-auto object-contain"
                  />
                </div>
              ) : (
                <div 
                  className="mx-auto w-14 h-14 rounded-full flex items-center justify-center"
                  style={{ backgroundColor: `${brandColor}15` }}
                >
                  <Building2 className="h-7 w-7" style={{ color: brandColor }} />
                </div>
              )}
              
              <div>
                <CardTitle 
                  className="text-xl font-bold"
                  style={{ color: brandColor }}
                >
                  {displayName}
                </CardTitle>
                <CardDescription className="mt-1 text-slate-500">
                  Sign in to access your account
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
                  <Label htmlFor="email" className="text-slate-600 text-sm">Email</Label>
                  <Input
                    id="email"
                    type="email"
                    placeholder="you@example.com"
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    disabled={loading}
                    required
                    className="h-11 rounded-lg bg-slate-100 border-0 focus:ring-2 focus:ring-offset-0"
                    style={{ ['--tw-ring-color' as any]: brandColor }}
                  />
                </div>
                
                <div className="space-y-2">
                  <Label htmlFor="password" className="text-slate-600 text-sm">Password</Label>
                  <Input
                    id="password"
                    type="password"
                    placeholder="••••••••"
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    disabled={loading}
                    required
                    className="h-11 rounded-lg bg-slate-100 border-0 focus:ring-2 focus:ring-offset-0"
                    style={{ ['--tw-ring-color' as any]: brandColor }}
                  />
                </div>

                <Button 
                  type="submit" 
                  className="w-full h-11 text-base font-medium rounded-lg text-white" 
                  disabled={loading}
                  style={{ 
                    background: `linear-gradient(135deg, ${brandColor} 0%, #5849c4 100%)` 
                  }}
                >
                  {loading ? (
                    <>
                      <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                      Signing in...
                    </>
                  ) : (
                    <>
                      Sign In
                      <ArrowRight className="ml-2 h-4 w-4" />
                    </>
                  )}
                </Button>
              </form>
            </CardContent>
          </Card>

          {/* Footer Section */}
          <div className="text-center space-y-4">
            <p className="text-slate-500 text-sm">
              Don't have access?{" "}
              <a 
                href="#"
                className="font-medium hover:underline"
                style={{ color: brandColor }}
                onClick={(e) => {
                  e.preventDefault();
                  toast.info("Please contact your organization administrator for access.");
                }}
              >
                Contact your organization administrator
              </a>
            </p>

            {/* Social Media Icons */}
            <div className="flex justify-center gap-4">
              <a 
                href="https://facebook.com" 
                target="_blank" 
                rel="noopener noreferrer"
                className="w-9 h-9 rounded-full bg-[#1877F2] flex items-center justify-center hover:opacity-80 transition-opacity shadow-md"
              >
                <Facebook className="w-4 h-4 text-white" />
              </a>
              <a 
                href="https://instagram.com" 
                target="_blank" 
                rel="noopener noreferrer"
                className="w-9 h-9 rounded-full flex items-center justify-center hover:opacity-80 transition-opacity shadow-md"
                style={{ background: 'linear-gradient(45deg, #f09433 0%, #e6683c 25%, #dc2743 50%, #cc2366 75%, #bc1888 100%)' }}
              >
                <Instagram className="w-4 h-4 text-white" />
              </a>
              <a 
                href="https://google.com" 
                target="_blank" 
                rel="noopener noreferrer"
                className="w-9 h-9 rounded-full bg-white flex items-center justify-center hover:opacity-80 transition-opacity shadow-md border border-slate-200"
              >
                <svg className="w-4 h-4" viewBox="0 0 24 24">
                  <path fill="#4285F4" d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z"/>
                  <path fill="#34A853" d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"/>
                  <path fill="#FBBC05" d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z"/>
                  <path fill="#EA4335" d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z"/>
                </svg>
              </a>
            </div>

            {/* Website Link */}
            <a 
              href="https://adtechagency.in/" 
              target="_blank" 
              rel="noopener noreferrer"
              className="inline-flex items-center gap-1.5 text-slate-500 text-sm hover:text-slate-700 transition-colors"
            >
              <Globe className="w-3.5 h-3.5" />
              Visit us: <span className="font-medium text-slate-700">www.adtechagency.in</span>
            </a>
          </div>

          {/* Support Section */}
          <div className="flex items-center justify-center gap-3 p-3 bg-white rounded-xl border border-slate-100 shadow-sm">
            <div 
              className="w-10 h-10 rounded-full flex items-center justify-center"
              style={{ backgroundColor: brandColor }}
            >
              <Phone className="w-4 h-4 text-white" />
            </div>
            <div>
              <p className="text-[10px] text-slate-400 uppercase tracking-wider font-medium">Support</p>
              <p className="text-sm font-bold text-slate-700">+91-8424034844</p>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
