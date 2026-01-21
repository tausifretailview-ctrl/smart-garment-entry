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
import ezzyerpLogo from "@/assets/ezzyerp-logo.jpg";
import ezzyerpLogoFull from "@/assets/ezzyerp-logo-full.png";
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

const MAX_LOGIN_ATTEMPTS = 5;
const LOCKOUT_DURATION_MS = 60000; // 1 minute

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
  const [loginAttempts, setLoginAttempts] = useState(0);
  const [lockoutUntil, setLockoutUntil] = useState<Date | null>(null);

  // Check and clear lockout on mount
  useEffect(() => {
    const storedLockout = localStorage.getItem(`org_auth_lockout_${orgSlug}`);
    if (storedLockout) {
      const lockoutDate = new Date(storedLockout);
      if (lockoutDate > new Date()) {
        setLockoutUntil(lockoutDate);
      } else {
        localStorage.removeItem(`org_auth_lockout_${orgSlug}`);
      }
    }
  }, [orgSlug]);

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
          // Store in both localStorage and sessionStorage for PWA resilience
          localStorage.setItem("selectedOrgSlug", organization.slug);
          sessionStorage.setItem("selectedOrgSlug", organization.slug);
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

    // Check for rate limiting lockout
    if (lockoutUntil && new Date() < lockoutUntil) {
      const remainingSeconds = Math.ceil((lockoutUntil.getTime() - Date.now()) / 1000);
      toast.error(`Too many failed attempts. Please wait ${remainingSeconds} seconds.`);
      return;
    }

    // Clear lockout if expired
    if (lockoutUntil && new Date() >= lockoutUntil) {
      setLockoutUntil(null);
      setLoginAttempts(0);
      localStorage.removeItem(`org_auth_lockout_${orgSlug}`);
    }

    const validation = validateAuth(email, password);
    if (!validation.success) {
      toast.error(validation.error);
      return;
    }

    setLoading(true);
    setError("");

    try {
      // CRITICAL: Clear any existing stale session before login attempt
      // This prevents conflicts with corrupted/expired tokens in Chrome regular mode
      await supabase.auth.signOut({ scope: 'local' });
      localStorage.removeItem('auth_refresh_lock');

      const { data: authData, error: authError } = await supabase.auth.signInWithPassword({
        email,
        password,
      });

      if (authError) {
        // Increment failed attempts
        const newAttempts = loginAttempts + 1;
        setLoginAttempts(newAttempts);
        
        // Check if lockout threshold reached
        if (newAttempts >= MAX_LOGIN_ATTEMPTS) {
          const lockoutDate = new Date(Date.now() + LOCKOUT_DURATION_MS);
          setLockoutUntil(lockoutDate);
          localStorage.setItem(`org_auth_lockout_${orgSlug}`, lockoutDate.toISOString());
          setLoginAttempts(0);
          setError("Too many failed attempts. Please wait 1 minute before trying again.");
          setLoading(false);
          return;
        }
        
        if (authError.message.includes("Invalid login credentials")) {
          setError(`Invalid email or password (${MAX_LOGIN_ATTEMPTS - newAttempts} attempts remaining)`);
        } else {
          setError(`${authError.message} (${MAX_LOGIN_ATTEMPTS - newAttempts} attempts remaining)`);
        }
        setLoading(false);
        return;
      }
      
      // Reset attempts on successful auth
      setLoginAttempts(0);
      localStorage.removeItem(`org_auth_lockout_${orgSlug}`);

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

      // Store in both localStorage and sessionStorage for PWA resilience
      localStorage.setItem("selectedOrgSlug", organization.slug);
      sessionStorage.setItem("selectedOrgSlug", organization.slug);
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
      {/* Left Panel - Product Showcase with Office Background */}
      <div className="hidden lg:flex lg:w-[58%] flex-col relative overflow-hidden">
        {/* Office/Window Background Scene */}
        <div 
          className="absolute inset-0"
          style={{
            background: 'linear-gradient(180deg, #E8F4FC 0%, #D4E8F5 25%, #C5DCF0 50%, #B8D4EC 75%, #AAC8E5 100%)'
          }}
        />
        {/* Window frame overlay effect */}
        <div 
          className="absolute inset-0"
          style={{
            background: 'radial-gradient(ellipse at 50% 20%, rgba(255,255,255,0.4) 0%, transparent 60%)'
          }}
        />
        {/* Subtle city/horizon silhouette at bottom */}
        <div 
          className="absolute bottom-0 left-0 right-0 h-32"
          style={{
            background: 'linear-gradient(to top, rgba(156,163,175,0.15) 0%, transparent 100%)'
          }}
        />

        {/* Content - Single cohesive layout */}
        <div className="relative z-10 flex-1 flex flex-col px-8 pt-4 pb-6">

          {/* POS Hero Image - Centered with desk shadow effect */}
          <div className="flex-1 flex items-start justify-center relative pt-2">
            {/* Desk surface shadow */}
            <div 
              className="absolute bottom-8 left-1/2 -translate-x-1/2 w-[85%] h-8 rounded-[100%]"
              style={{
                background: 'radial-gradient(ellipse, rgba(0,0,0,0.12) 0%, transparent 70%)',
                filter: 'blur(8px)'
              }}
            />
            <img 
              src={posIllustration} 
              alt="Complete POS System" 
              className="w-full h-auto object-contain relative z-10"
              style={{ 
                filter: 'drop-shadow(0 25px 50px rgba(0,0,0,0.18)) contrast(1.03) saturate(1.05) brightness(1.01)',
                maxHeight: 'calc(100vh - 280px)',
                imageRendering: 'auto'
              }}
            />
          </div>

          {/* Software Features - Integrated at bottom */}
          <div className="mt-auto pt-4">
            <h3 className="text-slate-700 text-sm font-bold mb-3 tracking-wider uppercase text-center">
              Software Features
            </h3>
            <div className="grid grid-cols-3 gap-2.5">
              {softwareFeatures.map((feature, index) => (
                <div 
                  key={index} 
                  className="bg-white/95 backdrop-blur-sm rounded-xl px-3.5 py-3 border border-white/80 hover:bg-white hover:shadow-lg transition-all duration-200"
                  style={{
                    boxShadow: '0 4px 15px -3px rgba(0,0,0,0.08), 0 0 0 1px rgba(255,255,255,0.5) inset'
                  }}
                >
                  <div className="flex items-center gap-2.5">
                    <div className="w-5 h-5 rounded-full bg-emerald-500 flex items-center justify-center flex-shrink-0 shadow-sm">
                      <Check className="w-3 h-3 text-white" strokeWidth={3} />
                    </div>
                    <span className="text-slate-700 text-xs leading-tight font-semibold">{feature}</span>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>
      </div>

      {/* Right Panel - Login Form */}
      <div className="flex-1 flex items-start justify-center p-8 lg:p-14 pt-8 lg:pt-10 bg-white overflow-y-auto">
        <div className="w-full max-w-lg space-y-6">
          {/* Mobile: Show EzzyERP logo */}
          <div className="lg:hidden text-center mb-6">
            <img 
              src={ezzyerpLogo} 
              alt="EzzyERP" 
              className="h-14 w-auto mx-auto object-contain"
            />
            <p className="text-slate-500 mt-1 text-sm">Easy Billing, Smart Business</p>
          </div>

          {/* EzzyERP Branding - Above Organization Logo */}
          <div className="hidden lg:block text-center mb-4">
            <img 
              src={ezzyerpLogoFull} 
              alt="EzzyERP - Easy Billing, Smart Business" 
              className="h-10 w-auto mx-auto object-contain"
            />
          </div>

          {/* Login Section */}
          <div className="space-y-6">
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
