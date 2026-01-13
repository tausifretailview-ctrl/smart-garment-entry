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
      <div className="min-h-screen flex items-center justify-center bg-background">
        <Loader2 className="h-8 w-8 animate-spin text-primary" />
      </div>
    );
  }

  if (!organization) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-background p-4">
        <Card className="w-full max-w-md">
          <div className="p-6 text-center">
            <AlertCircle className="h-12 w-12 text-destructive mx-auto mb-4" />
            <h2 className="text-xl font-semibold mb-2">Organization Not Found</h2>
            <p className="text-muted-foreground mb-4">
              The organization URL you're trying to access doesn't exist.
            </p>
            <Button 
              onClick={() => navigate("/auth")} 
              className="w-full"
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
    <div className="min-h-screen flex w-full">
      {/* Left Panel - Product Showcase with Light Office Background */}
      <div className="hidden lg:flex lg:w-[55%] flex-col relative overflow-hidden">
        {/* Soft Light Office Background */}
        <div className="absolute inset-0">
          {/* Base light gradient */}
          <div className="absolute inset-0 bg-gradient-to-br from-blue-50 via-slate-50 to-indigo-50" />
          
          {/* Soft window light effect */}
          <div className="absolute top-0 left-0 right-0 h-1/2 bg-gradient-to-b from-white/60 to-transparent" />
          
          {/* Blurred glass office shapes */}
          <div className="absolute top-10 left-10 w-40 h-32 bg-white/40 rounded-2xl blur-xl" />
          <div className="absolute top-20 right-20 w-56 h-40 bg-blue-100/30 rounded-3xl blur-2xl" />
          <div className="absolute bottom-32 left-20 w-32 h-24 bg-indigo-100/40 rounded-2xl blur-xl" />
          <div className="absolute bottom-20 right-16 w-48 h-36 bg-slate-100/50 rounded-2xl blur-2xl" />
          
          {/* Subtle city silhouette at bottom */}
          <div className="absolute bottom-0 left-0 right-0 h-20 opacity-[0.03]">
            <div className="absolute bottom-0 left-[5%] w-16 h-16 bg-slate-800 rounded-t-sm" />
            <div className="absolute bottom-0 left-[15%] w-10 h-24 bg-slate-700 rounded-t-sm" />
            <div className="absolute bottom-0 left-[22%] w-20 h-14 bg-slate-600 rounded-t-sm" />
            <div className="absolute bottom-0 right-[20%] w-14 h-20 bg-slate-700 rounded-t-sm" />
            <div className="absolute bottom-0 right-[10%] w-18 h-16 bg-slate-800 rounded-t-sm" />
          </div>
        </div>

        {/* Content */}
        <div className="relative z-10 flex-1 flex flex-col p-8 lg:p-10">
          {/* Hero Section - SafPro Branding + POS Image Merged */}
          <div className="flex-1 flex flex-col">
            {/* SafPro Logo & Title - Large and Prominent */}
            <div className="mb-6">
              <img 
                src={safproLogo} 
                alt="SafPro ERP" 
                className="h-16 w-auto object-contain drop-shadow-sm"
              />
              <p className="text-slate-500 text-base mt-2 font-light tracking-wide">
                Clean & Professional Software
              </p>
            </div>

            {/* POS System Image - Large, Natural, No Frame */}
            <div className="flex-1 flex items-center justify-center relative py-4">
              <img 
                src={posIllustration} 
                alt="SafPro ERP - Complete POS System" 
                className="w-full max-w-[580px] h-auto object-contain"
                style={{ 
                  filter: 'drop-shadow(0 20px 40px rgba(0,0,0,0.08))',
                  maxHeight: '380px'
                }}
              />
            </div>

            {/* Software Features - Soft White Cards */}
            <div className="mt-auto pt-6">
              <h3 className="text-slate-600 font-medium text-sm mb-4 flex items-center gap-2">
                <span className="w-8 h-px bg-slate-300" />
                Software Features
                <span className="w-8 h-px bg-slate-300" />
              </h3>
              <div className="grid grid-cols-3 gap-3">
                {softwareFeatures.map((feature, index) => (
                  <div 
                    key={index} 
                    className="bg-white/70 backdrop-blur-sm rounded-xl px-4 py-3 shadow-sm border border-white/80 hover:bg-white/90 hover:shadow-md transition-all duration-200 group"
                  >
                    <div className="flex items-start gap-2.5">
                      <div className="w-5 h-5 rounded-full bg-gradient-to-br from-emerald-400 to-green-500 flex items-center justify-center flex-shrink-0 shadow-sm group-hover:scale-105 transition-transform">
                        <Check className="w-3 h-3 text-white" strokeWidth={3} />
                      </div>
                      <span className="text-slate-600 text-xs leading-snug font-medium">{feature}</span>
                    </div>
                  </div>
                ))}
              </div>
            </div>

            {/* Footer */}
            <div className="mt-6 pt-4 border-t border-slate-200/50">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2.5">
                  {/* Mini Printer Icon */}
                  <div className="bg-slate-100 rounded-lg p-1.5">
                    <div className="w-6 h-5 bg-slate-600 rounded relative">
                      <div className="absolute bottom-0 left-0.5 right-0.5 h-2 bg-white rounded-sm flex items-center justify-center">
                        <div className="flex gap-px">
                          {[1, 1.5, 1, 1.5, 1].map((w, i) => (
                            <div key={i} className="bg-slate-700 h-1.5" style={{ width: `${w}px` }} />
                          ))}
                        </div>
                      </div>
                    </div>
                  </div>
                  <span className="text-slate-400 text-xs">Thermal & Barcode Ready</span>
                </div>
                
                <a 
                  href="https://adtechagency.in/" 
                  target="_blank" 
                  rel="noopener noreferrer"
                  className="flex items-center gap-1.5 text-slate-400 text-xs hover:text-indigo-500 transition-colors"
                >
                  <Globe className="w-3.5 h-3.5" />
                  <span>www.adtechagency.in</span>
                </a>
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* Right Panel - Login Form */}
      <div className="flex-1 flex items-center justify-center p-6 lg:p-12 bg-white">
        <div className="w-full max-w-md space-y-8">
          {/* Mobile: Show SafPro logo */}
          <div className="lg:hidden text-center mb-8">
            <img 
              src={safproLogo} 
              alt="SafPro ERP" 
              className="h-14 w-auto mx-auto object-contain"
            />
            <p className="text-slate-500 mt-2">Clean & Professional Software</p>
          </div>

          {/* Login Card */}
          <div className="space-y-8">
            {/* Organization Branding */}
            <div className="text-center">
              {logoUrl ? (
                <img 
                  src={logoUrl} 
                  alt={displayName} 
                  className="h-20 w-auto mx-auto object-contain mb-4"
                />
              ) : (
                <div 
                  className="mx-auto w-20 h-20 rounded-2xl flex items-center justify-center mb-4 shadow-lg"
                  style={{ 
                    background: `linear-gradient(135deg, ${brandColor} 0%, #5849c4 100%)` 
                  }}
                >
                  <Building2 className="h-10 w-10 text-white" />
                </div>
              )}
              
              <h1 
                className="text-3xl font-bold tracking-tight"
                style={{ color: brandColor }}
              >
                {displayName}
              </h1>
              <p className="mt-2 text-slate-500">
                Sign in to access your account
              </p>
            </div>

            {/* Login Form */}
            <Card className="shadow-2xl border-0 bg-white">
              <CardContent className="p-8 space-y-6">
                {error && (
                  <Alert variant="destructive" className="rounded-xl">
                    <AlertCircle className="h-4 w-4" />
                    <AlertDescription>{error}</AlertDescription>
                  </Alert>
                )}
                
                <form onSubmit={handleSignIn} className="space-y-5">
                  <div className="space-y-2">
                    <Label htmlFor="email" className="text-slate-700 font-medium">Email Address</Label>
                    <Input
                      id="email"
                      type="email"
                      placeholder="you@example.com"
                      value={email}
                      onChange={(e) => setEmail(e.target.value)}
                      disabled={loading}
                      required
                      className="h-12 rounded-xl bg-slate-50 border-slate-200 focus:border-purple-500 focus:ring-purple-500/20 transition-all"
                    />
                  </div>
                  
                  <div className="space-y-2">
                    <Label htmlFor="password" className="text-slate-700 font-medium">Password</Label>
                    <Input
                      id="password"
                      type="password"
                      placeholder="••••••••"
                      value={password}
                      onChange={(e) => setPassword(e.target.value)}
                      disabled={loading}
                      required
                      className="h-12 rounded-xl bg-slate-50 border-slate-200 focus:border-purple-500 focus:ring-purple-500/20 transition-all"
                    />
                  </div>

                  <Button 
                    type="submit" 
                    className="w-full h-12 text-base font-semibold rounded-xl text-white shadow-lg shadow-purple-500/25 hover:shadow-xl hover:shadow-purple-500/30 transition-all" 
                    disabled={loading}
                    style={{ 
                      background: `linear-gradient(135deg, ${brandColor} 0%, #4F46E5 50%, #7C3AED 100%)` 
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
                  className="font-semibold hover:underline transition-colors"
                  style={{ color: brandColor }}
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
                  className="w-11 h-11 rounded-full bg-[#1877F2] flex items-center justify-center hover:scale-110 hover:shadow-lg transition-all shadow-md"
                >
                  <Facebook className="w-5 h-5 text-white" />
                </a>
                <a 
                  href="https://instagram.com" 
                  target="_blank" 
                  rel="noopener noreferrer"
                  className="w-11 h-11 rounded-full flex items-center justify-center hover:scale-110 hover:shadow-lg transition-all shadow-md"
                  style={{ background: 'linear-gradient(45deg, #f09433 0%, #e6683c 25%, #dc2743 50%, #cc2366 75%, #bc1888 100%)' }}
                >
                  <Instagram className="w-5 h-5 text-white" />
                </a>
                <a 
                  href="https://google.com" 
                  target="_blank" 
                  rel="noopener noreferrer"
                  className="w-11 h-11 rounded-full bg-white border-2 border-slate-200 flex items-center justify-center hover:scale-110 hover:shadow-lg hover:border-slate-300 transition-all shadow-md"
                >
                  <svg className="w-5 h-5" viewBox="0 0 24 24">
                    <path fill="#4285F4" d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z"/>
                    <path fill="#34A853" d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"/>
                    <path fill="#FBBC05" d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z"/>
                    <path fill="#EA4335" d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z"/>
                  </svg>
                </a>
              </div>

              {/* Website & Support */}
              <div className="pt-4 border-t border-slate-100 space-y-3">
                <a 
                  href="https://adtechagency.in/" 
                  target="_blank" 
                  rel="noopener noreferrer"
                  className="flex items-center justify-center gap-2 text-slate-500 text-sm hover:text-purple-600 transition-colors"
                >
                  <Globe className="w-4 h-4" />
                  <span className="font-medium">www.adtechagency.in</span>
                </a>
                
                <a 
                  href="tel:+918424034844"
                  className="flex items-center justify-center gap-2 text-slate-600 hover:text-purple-600 transition-colors"
                >
                  <div className="w-8 h-8 rounded-full bg-green-500 flex items-center justify-center">
                    <Phone className="w-4 h-4 text-white" />
                  </div>
                  <span className="font-semibold">+91-8424034844</span>
                </a>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
