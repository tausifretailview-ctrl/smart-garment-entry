import { useState, useEffect } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent } from "@/components/ui/card";
import { Loader2, AlertCircle, ArrowRight, MapPin, ShoppingBag, Users } from "lucide-react";
import { toast } from "sonner";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { validateAuth } from "@/lib/validations";

const FIELD_SALES_COLOR = "#F97316"; // Orange-500

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
const LOCKOUT_DURATION_MS = 60000;

export default function FieldSalesAuth() {
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

  useEffect(() => {
    const storedLockout = localStorage.getItem(`field_sales_lockout_${orgSlug}`);
    if (storedLockout) {
      const lockoutDate = new Date(storedLockout);
      if (lockoutDate > new Date()) {
        setLockoutUntil(lockoutDate);
      } else {
        localStorage.removeItem(`field_sales_lockout_${orgSlug}`);
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
    const checkUserAccess = async () => {
      if (user && organization) {
        // Check if user has field sales access
        const { data: fieldSalesEmployee } = await supabase
          .from("employees")
          .select("id")
          .eq("organization_id", organization.id)
          .eq("user_id", user.id)
          .eq("field_sales_access", true)
          .is("deleted_at", null)
          .maybeSingle();

        if (fieldSalesEmployee) {
          localStorage.setItem("selectedOrgSlug", organization.slug);
          sessionStorage.setItem("selectedOrgSlug", organization.slug);
          sessionStorage.setItem('fieldSalesPWA', 'true');
          navigate(`/${organization.slug}/salesman`);
        } else {
          setError("You don't have Field Sales access. Please contact your administrator.");
          await supabase.auth.signOut();
        }
      }
    };

    checkUserAccess();
  }, [user, organization, navigate]);

  const handleSignIn = async (e: React.FormEvent) => {
    e.preventDefault();
    
    if (!organization) {
      toast.error("Organization not found");
      return;
    }

    if (lockoutUntil && new Date() < lockoutUntil) {
      const remainingSeconds = Math.ceil((lockoutUntil.getTime() - Date.now()) / 1000);
      toast.error(`Too many failed attempts. Please wait ${remainingSeconds} seconds.`);
      return;
    }

    if (lockoutUntil && new Date() >= lockoutUntil) {
      setLockoutUntil(null);
      setLoginAttempts(0);
      localStorage.removeItem(`field_sales_lockout_${orgSlug}`);
    }

    const validation = validateAuth(email, password);
    if (!validation.success) {
      toast.error(validation.error);
      return;
    }

    setLoading(true);
    setError("");

    try {
      await supabase.auth.signOut({ scope: 'local' });
      localStorage.removeItem('auth_refresh_lock');

      const { data: authData, error: authError } = await supabase.auth.signInWithPassword({
        email,
        password,
      });

      if (authError) {
        const newAttempts = loginAttempts + 1;
        setLoginAttempts(newAttempts);
        
        if (newAttempts >= MAX_LOGIN_ATTEMPTS) {
          const lockoutDate = new Date(Date.now() + LOCKOUT_DURATION_MS);
          setLockoutUntil(lockoutDate);
          localStorage.setItem(`field_sales_lockout_${orgSlug}`, lockoutDate.toISOString());
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
      
      setLoginAttempts(0);
      localStorage.removeItem(`field_sales_lockout_${orgSlug}`);

      if (!authData.user) {
        setError("Login failed. Please try again.");
        setLoading(false);
        return;
      }

      // Check organization membership
      const { data: membership, error: membershipError } = await supabase
        .from("organization_members")
        .select("id, role")
        .eq("user_id", authData.user.id)
        .eq("organization_id", organization.id)
        .single();

      if (membershipError || !membership) {
        setError("You are not a member of this organization.");
        await supabase.auth.signOut();
        setLoading(false);
        return;
      }

      // Check field sales access
      const { data: fieldSalesEmployee } = await supabase
        .from("employees")
        .select("id, employee_name")
        .eq("organization_id", organization.id)
        .eq("user_id", authData.user.id)
        .eq("field_sales_access", true)
        .is("deleted_at", null)
        .maybeSingle();

      if (!fieldSalesEmployee) {
        setError("You don't have Field Sales access. Please contact your administrator.");
        await supabase.auth.signOut();
        setLoading(false);
        return;
      }

      // Set context and navigate
      localStorage.setItem("selectedOrgSlug", organization.slug);
      sessionStorage.setItem("selectedOrgSlug", organization.slug);
      sessionStorage.setItem('fieldSalesPWA', 'true');
      
      toast.success(`Welcome, ${fieldSalesEmployee.employee_name || 'Salesman'}!`);
      navigate(`/${organization.slug}/salesman`);
    } catch (err) {
      setError("An unexpected error occurred. Please try again.");
    } finally {
      setLoading(false);
    }
  };

  if (orgLoading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-orange-50 to-orange-100">
        <Loader2 className="h-8 w-8 animate-spin text-orange-500" />
      </div>
    );
  }

  if (!organization) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-orange-50 to-orange-100 p-4">
        <Card className="w-full max-w-md shadow-xl border-orange-200">
          <div className="p-6 text-center">
            <AlertCircle className="h-12 w-12 text-orange-500 mx-auto mb-4" />
            <h2 className="text-xl font-semibold mb-2">Organization Not Found</h2>
            <p className="text-muted-foreground mb-4">
              The organization URL you're trying to access doesn't exist.
            </p>
          </div>
        </Card>
      </div>
    );
  }

  const displayName = orgSettings?.bill_barcode_settings?.login_display_name 
    || orgSettings?.business_name 
    || organization.name;
  const logoUrl = orgSettings?.bill_barcode_settings?.logo_url;

  return (
    <div className="min-h-screen flex flex-col bg-gradient-to-br from-orange-50 via-white to-orange-100">
      {/* Header with Field Sales branding */}
      <div className="bg-gradient-to-r from-orange-500 to-orange-600 text-white py-4 px-6 shadow-lg">
        <div className="max-w-md mx-auto flex items-center gap-3">
          <div className="w-10 h-10 bg-white/20 rounded-xl flex items-center justify-center backdrop-blur-sm">
            <ShoppingBag className="h-5 w-5" />
          </div>
          <div>
            <h1 className="font-bold text-lg">Field Sales</h1>
            <p className="text-orange-100 text-xs">Mobile Order Management</p>
          </div>
        </div>
      </div>

      {/* Main content */}
      <div className="flex-1 flex items-center justify-center p-4">
        <div className="w-full max-w-md space-y-6">
          {/* Organization branding */}
          <div className="text-center">
            {logoUrl ? (
              <img 
                src={logoUrl} 
                alt={displayName} 
                className="h-16 w-auto mx-auto object-contain mb-3"
              />
            ) : (
              <div className="mx-auto w-16 h-16 rounded-xl bg-gradient-to-br from-orange-400 to-orange-600 flex items-center justify-center mb-3 shadow-lg">
                <Users className="h-8 w-8 text-white" />
              </div>
            )}
            <h2 className="text-2xl font-bold text-gray-900">{displayName}</h2>
            <p className="text-muted-foreground text-sm mt-1">
              Sign in to access your Field Sales account
            </p>
          </div>

          {/* Features preview */}
          <div className="flex justify-center gap-6 text-center">
            <div className="flex flex-col items-center gap-1">
              <div className="w-10 h-10 rounded-full bg-orange-100 flex items-center justify-center">
                <ShoppingBag className="h-5 w-5 text-orange-600" />
              </div>
              <span className="text-xs text-muted-foreground">Quick Orders</span>
            </div>
            <div className="flex flex-col items-center gap-1">
              <div className="w-10 h-10 rounded-full bg-orange-100 flex items-center justify-center">
                <Users className="h-5 w-5 text-orange-600" />
              </div>
              <span className="text-xs text-muted-foreground">Customers</span>
            </div>
            <div className="flex flex-col items-center gap-1">
              <div className="w-10 h-10 rounded-full bg-orange-100 flex items-center justify-center">
                <MapPin className="h-5 w-5 text-orange-600" />
              </div>
              <span className="text-xs text-muted-foreground">Route Plan</span>
            </div>
          </div>

          {/* Login form */}
          <Card className="shadow-xl border-orange-100">
            <CardContent className="p-6 space-y-4">
              {error && (
                <Alert variant="destructive" className="rounded-lg">
                  <AlertCircle className="h-4 w-4" />
                  <AlertDescription>{error}</AlertDescription>
                </Alert>
              )}
              
              <form onSubmit={handleSignIn} className="space-y-4">
                <div className="space-y-2">
                  <Label htmlFor="email" className="font-medium">Email Address</Label>
                  <Input
                    id="email"
                    type="email"
                    placeholder="you@example.com"
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    disabled={loading}
                    required
                    className="h-11 border-orange-200 focus:border-orange-400 focus:ring-orange-400"
                  />
                </div>
                
                <div className="space-y-2">
                  <Label htmlFor="password" className="font-medium">Password</Label>
                  <Input
                    id="password"
                    type="password"
                    placeholder="••••••••"
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    disabled={loading}
                    required
                    className="h-11 border-orange-200 focus:border-orange-400 focus:ring-orange-400"
                  />
                </div>

                <Button 
                  type="submit" 
                  className="w-full h-11 text-base font-semibold bg-gradient-to-r from-orange-500 to-orange-600 hover:from-orange-600 hover:to-orange-700 shadow-lg shadow-orange-500/25" 
                  disabled={loading}
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

          {/* Footer */}
          <p className="text-center text-muted-foreground text-xs">
            Don't have access? Contact your organization administrator.
          </p>
        </div>
      </div>
    </div>
  );
}
