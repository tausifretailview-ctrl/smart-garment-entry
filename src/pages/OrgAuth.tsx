import { useState, useEffect } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent } from "@/components/ui/card";
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
    const checkUserMembership = async () => {
      if (user && organization) {
        const { data: membership } = await supabase
          .from("organization_members")
          .select("id")
          .eq("user_id", user.id)
          .eq("organization_id", organization.id)
          .single();

        if (membership) {
          localStorage.setItem("selectedOrgSlug", organization.slug);
          navigate(`/${organization.slug}`);
        } else {
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

    const validation = validateAuth(email, password);
    if (!validation.success) {
      toast.error(validation.error);
      return;
    }

    setLoading(true);
    setError("");

    try {
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
      <div className="min-h-screen flex items-center justify-center bg-slate-50">
        <Loader2 className="h-8 w-8 animate-spin text-slate-400" />
      </div>
    );
  }

  if (!organization) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-slate-50 p-4">
        <Card className="w-full max-w-md shadow-lg">
          <div className="p-6 text-center">
            <AlertCircle className="h-12 w-12 text-red-500 mx-auto mb-4" />
            <h2 className="text-xl font-semibold mb-2 text-slate-800">Organization Not Found</h2>
            <p className="text-slate-500 mb-4">
              The organization URL you're trying to access doesn't exist.
            </p>
            <Button 
              onClick={() => navigate("/auth")} 
              className="w-full bg-slate-800 hover:bg-slate-700"
            >
              Go to General Login
            </Button>
          </div>
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
    <div className="min-h-screen flex w-full bg-slate-50">
      {/* Left Panel - Product Showcase */}
      <div className="hidden lg:flex lg:w-[58%] flex-col relative overflow-hidden">
        {/* Split Background - Top: Office Desk Scene, Bottom: Frosted Panel */}
        <div className="absolute inset-0">
          {/* Office desk scene background for POS image - warm, professional */}
          <div className="absolute inset-0 bg-gradient-to-b from-slate-100 via-slate-50 to-slate-100/80" />
          
          {/* Subtle warm office lighting from top */}
          <div className="absolute top-0 left-0 right-0 h-2/3 bg-gradient-to-br from-amber-50/30 via-slate-50 to-slate-100/50" />
          
          {/* Desk surface hint at bottom of POS area */}
          <div className="absolute top-[45%] left-0 right-0 h-24 bg-gradient-to-b from-transparent via-stone-100/40 to-stone-200/30" />
        </div>

        {/* Content */}
        <div className="relative z-10 flex-1 flex flex-col px-10 py-6">
          {/* POS Hero Image Section - Full height, clearly visible above features */}
          <div className="flex-1 flex items-center justify-center overflow-hidden mb-5">
            <div 
              className="relative w-full flex items-center justify-center overflow-hidden rounded-2xl"
              style={{ 
                minHeight: '380px',
                background: 'linear-gradient(180deg, rgba(248,250,252,0.3) 0%, rgba(241,245,249,0.5) 50%, rgba(226,232,240,0.4) 100%)'
              }}
            >
              {/* Subtle desk shadow beneath POS */}
              <div 
                className="absolute bottom-4 left-1/2 -translate-x-1/2 w-3/4 h-10 rounded-full opacity-25"
                style={{ 
                  background: 'radial-gradient(ellipse at center, rgba(0,0,0,0.35) 0%, transparent 70%)',
                  filter: 'blur(10px)'
                }}
              />
              <img 
                src={posIllustration} 
                alt="Complete POS System" 
                className="w-full max-w-[90%] h-auto object-contain relative z-10"
                style={{ 
                  filter: 'drop-shadow(0 20px 40px rgba(0,0,0,0.18)) contrast(1.05) saturate(1.08) brightness(1.02)',
                  maxHeight: '360px',
                  imageRendering: 'auto'
                }}
              />
            </div>
          </div>

          {/* Software Features - Frosted Glass Panel Container */}
          <div 
            className="mt-4 rounded-2xl p-5 border border-white/60"
            style={{
              background: 'linear-gradient(135deg, rgba(255,255,255,0.85) 0%, rgba(248,250,252,0.9) 50%, rgba(241,245,249,0.85) 100%)',
              backdropFilter: 'blur(12px)',
              boxShadow: '0 4px 24px -4px rgba(0,0,0,0.08), 0 0 0 1px rgba(255,255,255,0.5) inset'
            }}
          >
            <h3 className="text-slate-700 text-base font-semibold mb-4 tracking-wide uppercase">
              Software Features
            </h3>
            <div className="grid grid-cols-3 gap-3.5">
              {softwareFeatures.map((feature, index) => (
                <div 
                  key={index} 
                  className="bg-white/90 rounded-xl px-4 py-4 shadow-sm border border-slate-100/80 hover:shadow-md hover:bg-white transition-all duration-200"
                >
                  <div className="flex items-center gap-3">
                    <div className="w-7 h-7 rounded-full bg-emerald-500 flex items-center justify-center flex-shrink-0 shadow-sm">
                      <Check className="w-4 h-4 text-white" strokeWidth={3} />
                    </div>
                    <span className="text-slate-700 text-sm leading-tight font-semibold">{feature}</span>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>
      </div>

      {/* Right Panel - Login Form */}
      <div className="flex-1 flex items-center justify-center p-8 lg:p-14 bg-white">
        <div className="w-full max-w-lg space-y-10">
          {/* Mobile: Show SafPro logo */}
          <div className="lg:hidden text-center mb-10">
            <img 
              src={safproLogo} 
              alt="SafPro ERP" 
              className="h-16 w-auto mx-auto object-contain"
            />
            <p className="text-slate-500 mt-2 text-sm">Clean & Professional Software</p>
          </div>

          {/* Login Section */}
          <div className="space-y-10">
            {/* Organization Branding */}
            <div className="text-center">
              {logoUrl ? (
                <img 
                  src={logoUrl} 
                  alt={displayName} 
                  className="h-24 w-auto mx-auto object-contain mb-5"
                />
              ) : (
                <div 
                  className="mx-auto w-24 h-24 rounded-2xl flex items-center justify-center mb-5 shadow-xl"
                  style={{ 
                    background: `linear-gradient(145deg, ${brandColor} 0%, #5849c4 100%)` 
                  }}
                >
                  <Building2 className="h-12 w-12 text-white" />
                </div>
              )}
              
              <h1 
                className="text-3xl font-bold tracking-tight"
                style={{ color: brandColor }}
              >
                {displayName}
              </h1>
              <p className="mt-2 text-slate-500 text-base">
                Sign in to access your account
              </p>
            </div>

            {/* Login Form Card */}
            <Card className="shadow-xl border-0 bg-white rounded-2xl">
              <CardContent className="p-8 space-y-6">
                {error && (
                  <Alert variant="destructive" className="rounded-xl">
                    <AlertCircle className="h-4 w-4" />
                    <AlertDescription>{error}</AlertDescription>
                  </Alert>
                )}
                
                <form onSubmit={handleSignIn} className="space-y-5">
                  <div className="space-y-2">
                    <Label htmlFor="email" className="text-slate-700 font-medium text-sm">Email Address</Label>
                    <Input
                      id="email"
                      type="email"
                      placeholder="you@example.com"
                      value={email}
                      onChange={(e) => setEmail(e.target.value)}
                      disabled={loading}
                      required
                      className="h-12 rounded-xl bg-slate-50 border-slate-200 focus:border-indigo-400 focus:ring-indigo-100 transition-all text-base"
                    />
                  </div>
                  
                  <div className="space-y-2">
                    <Label htmlFor="password" className="text-slate-700 font-medium text-sm">Password</Label>
                    <Input
                      id="password"
                      type="password"
                      placeholder="••••••••"
                      value={password}
                      onChange={(e) => setPassword(e.target.value)}
                      disabled={loading}
                      required
                      className="h-12 rounded-xl bg-slate-50 border-slate-200 focus:border-indigo-400 focus:ring-indigo-100 transition-all text-base"
                    />
                  </div>

                  <Button 
                    type="submit" 
                    className="w-full h-12 text-base font-semibold rounded-xl text-white shadow-lg hover:shadow-xl transition-all mt-2" 
                    disabled={loading}
                    style={{ 
                      background: `linear-gradient(135deg, ${brandColor} 0%, #4F46E5 100%)`,
                      boxShadow: '0 10px 30px -10px rgba(108, 92, 231, 0.4)'
                    }}
                  >
                    {loading ? (
                      <>
                        <Loader2 className="mr-2 h-5 w-5 animate-spin" />
                        Signing in...
                      </>
                    ) : (
                      <>
                        Sign In
                        <ArrowRight className="ml-2 h-5 w-5" />
                      </>
                    )}
                  </Button>
                </form>
              </CardContent>
            </Card>

            {/* Footer Section */}
            <div className="text-center space-y-6">
              <p className="text-slate-500 text-sm">
                Don't have access?{" "}
                <button
                  className="font-semibold hover:underline transition-colors text-slate-700"
                  onClick={() => {
                    toast.info("Please contact your organization administrator for access.");
                  }}
                >
                  Contact your organization administrator
                </button>
              </p>

              {/* Social Media Icons */}
              <div className="flex justify-center gap-4">
                <a 
                  href="https://facebook.com" 
                  target="_blank" 
                  rel="noopener noreferrer"
                  className="w-11 h-11 rounded-full bg-[#1877F2] flex items-center justify-center hover:scale-105 hover:shadow-lg transition-all shadow-md"
                >
                  <Facebook className="w-5 h-5 text-white" />
                </a>
                <a 
                  href="https://instagram.com" 
                  target="_blank" 
                  rel="noopener noreferrer"
                  className="w-11 h-11 rounded-full flex items-center justify-center hover:scale-105 hover:shadow-lg transition-all shadow-md"
                  style={{ background: 'linear-gradient(45deg, #f09433 0%, #e6683c 25%, #dc2743 50%, #cc2366 75%, #bc1888 100%)' }}
                >
                  <Instagram className="w-5 h-5 text-white" />
                </a>
                <a 
                  href="https://google.com" 
                  target="_blank" 
                  rel="noopener noreferrer"
                  className="w-11 h-11 rounded-full bg-white border-2 border-slate-200 flex items-center justify-center hover:scale-105 hover:shadow-lg hover:border-slate-300 transition-all shadow-md"
                >
                  <svg className="w-5 h-5" viewBox="0 0 24 24">
                    <path fill="#4285F4" d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z"/>
                    <path fill="#34A853" d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"/>
                    <path fill="#FBBC05" d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z"/>
                    <path fill="#EA4335" d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z"/>
                  </svg>
                </a>
              </div>


            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
