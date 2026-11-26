import { useState, useEffect } from "react";
import { FIELD_SALES_SAFE_TOP, useFieldSalesShell } from "@/hooks/useFieldSalesShell";
import { useNavigate, useParams } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { Loader2, AlertCircle, ArrowRight, Eye, EyeOff, Lock, Mail, ShoppingBag, Users } from "lucide-react";
import { toast } from "sonner";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { validateAuth } from "@/lib/validations";
import { fieldSalesLoginIdToEmail } from "@/lib/fieldSalesLogin";
import { storeOrgSlug } from "@/lib/orgSlug";
import { useFieldSalesManifest } from "@/hooks/useFieldSalesManifest";
import { FieldSalesInstallCard } from "@/components/fieldSales/FieldSalesInstallCard";
import { ChangeOrganization } from "@/components/orgLogin/ChangeOrganization";

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
  useFieldSalesShell();
  const { orgSlug } = useParams<{ orgSlug: string }>();
  const navigate = useNavigate();
  const { user } = useAuth();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [loading, setLoading] = useState(false);
  const [showPassword, setShowPassword] = useState(false);
  const [orgLoading, setOrgLoading] = useState(true);
  const [organization, setOrganization] = useState<Organization | null>(null);
  const [orgSettings, setOrgSettings] = useState<OrgSettings | null>(null);
  const [error, setError] = useState<string>("");
  const [loginAttempts, setLoginAttempts] = useState(0);
  const [lockoutUntil, setLockoutUntil] = useState<Date | null>(null);
  // "Install" on this page adds the shop's Field Sales app (opens /{org}/salesman).
  useFieldSalesManifest(organization?.slug ?? null, organization?.name);

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
        // The public shop lookup (same as the shop login): works before sign-in, where the
        // organizations and settings tables are not readable, and accepts "ellanoor" for "ella-noor".
        const { data, error } = await supabase.rpc("get_org_public_info" as never, { p_slug: orgSlug } as never);
        const info = data as
          | { id?: string; name?: string; slug?: string; settings?: unknown; business_name?: string; bill_barcode_settings?: OrgSettings["bill_barcode_settings"] }
          | null;

        if (error || !info?.id || !info.slug) {
          setError("Organization not found");
          setOrgLoading(false);
          return;
        }

        setOrganization({ id: info.id, name: info.name || info.business_name || info.slug, slug: info.slug, settings: info.settings });
        setOrgSettings({ business_name: info.business_name, bill_barcode_settings: info.bill_barcode_settings });
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
          storeOrgSlug(organization.slug);
          sessionStorage.setItem('fieldSalesPWA', 'true');
          navigate(`/${organization.slug}/salesman`);
        } else {
          setError("You don't have Field Sales access. Please contact your administrator.");
          await supabase.auth.signOut({ scope: "local" });
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

    // A mobile number (login made in Employee Master) becomes this shop's mobile login.
    const loginEmail = fieldSalesLoginIdToEmail(email, organization.slug);
    if (!loginEmail.includes("@")) {
      toast.error("Enter your mobile number or email.");
      return;
    }
    const validation = validateAuth(loginEmail, password);
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
        email: loginEmail,
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
          setError(`Invalid mobile number / email or password (${MAX_LOGIN_ATTEMPTS - newAttempts} attempts remaining)`);
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
        await supabase.auth.signOut({ scope: "local" });
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
        await supabase.auth.signOut({ scope: "local" });
        setLoading(false);
        return;
      }

      // Set context and navigate
      storeOrgSlug(organization.slug);
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
      <div className="flex h-dvh items-center justify-center bg-gradient-to-br from-orange-600 to-orange-500">
        <Loader2 className="h-8 w-8 animate-spin text-white" />
      </div>
    );
  }

  const band = (
    <div
      className="shrink-0 px-5 pb-10 text-white"
      style={{ paddingTop: `calc(${FIELD_SALES_SAFE_TOP} + 18px)` }}
    >
      <div className="mx-auto flex max-w-[440px] items-center gap-3">
        <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-white/20">
          <ShoppingBag className="h-5 w-5" />
        </div>
        <div className="min-w-0">
          <h1 className="text-xl font-bold leading-tight">Field Sales</h1>
          <p className="text-xs leading-tight text-orange-100">Orders, customers and outstanding</p>
        </div>
      </div>
    </div>
  );

  if (!organization) {
    return (
      <div className="flex h-dvh flex-col overflow-y-auto bg-gradient-to-br from-orange-600 to-orange-500">
        {band}
        <div className="-mt-5 flex flex-1 flex-col items-center rounded-t-[28px] bg-white px-5 pt-10 text-center">
          <AlertCircle className="h-12 w-12 text-orange-500" />
          <h2 className="mt-3 text-xl font-bold text-slate-900">Organisation not found</h2>
          <p className="mt-1 max-w-xs text-sm text-slate-500">
            This shop link does not exist. Enter the correct organisation code to continue.
          </p>
          <ChangeOrganization fieldSales accent="orange" className="mt-4 border border-orange-200 bg-orange-50" />
        </div>
      </div>
    );
  }

  const displayName = orgSettings?.bill_barcode_settings?.login_display_name 
    || orgSettings?.business_name 
    || organization.name;
  const logoUrl = orgSettings?.bill_barcode_settings?.logo_url;
  const inputClass =
    "no-uppercase h-12 w-full rounded-xl border border-slate-300 bg-white pl-11 pr-3 text-base text-slate-900 outline-none placeholder:text-slate-400 focus:border-orange-400 focus:ring-2 focus:ring-orange-200 disabled:opacity-60";

  return (
    <div
      className="flex h-dvh flex-col overflow-y-auto bg-gradient-to-br from-orange-600 to-orange-500"
      data-testid="field-sales-login"
    >
      {band}

      <div
        className="-mt-5 flex flex-1 flex-col rounded-t-[28px] bg-white px-5 pt-6 shadow-[0_-8px_24px_rgba(154,52,18,0.25)]"
        style={{ paddingBottom: "calc(env(safe-area-inset-bottom, 0px) + 24px)" }}
      >
        <div className="mx-auto w-full max-w-[440px] space-y-5">
          {/* Shop */}
          <div className="text-center">
            <div className="mx-auto flex h-[84px] w-[84px] items-center justify-center rounded-2xl border border-slate-200 bg-white p-2.5 shadow-sm">
              {logoUrl ? (
                <img src={logoUrl} alt={displayName} className="max-h-full max-w-full object-contain" />
              ) : (
                <Users className="h-9 w-9 text-orange-500" />
              )}
            </div>
            <h2 className="mt-3 text-lg font-bold uppercase tracking-wide text-slate-900">{displayName}</h2>
            <p className="text-sm text-slate-500">Sign in with your salesman login</p>
            <ChangeOrganization currentName={displayName} fieldSales accent="orange" className="mt-1" />
          </div>

          {error && (
            <Alert variant="destructive" className="rounded-xl">
              <AlertCircle className="h-4 w-4" />
              <AlertDescription>{error}</AlertDescription>
            </Alert>
          )}

          <form onSubmit={handleSignIn} className="space-y-4">
            <div className="space-y-1.5">
              <label htmlFor="email" className="block text-sm font-semibold text-slate-700">
                Mobile number or email
              </label>
              <div className="relative">
                <Mail className="pointer-events-none absolute left-3.5 top-1/2 h-5 w-5 -translate-y-1/2 text-slate-400" />
                <input
                  id="email"
                  type="text"
                  inputMode="email"
                  autoComplete="username"
                  autoCapitalize="none"
                  spellCheck={false}
                  placeholder="Mobile number or email"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  disabled={loading}
                  required
                  className={inputClass}
                />
              </div>
            </div>

            <div className="space-y-1.5">
              <label htmlFor="password" className="block text-sm font-semibold text-slate-700">
                Password
              </label>
              <div className="relative">
                <Lock className="pointer-events-none absolute left-3.5 top-1/2 h-5 w-5 -translate-y-1/2 text-slate-400" />
                <input
                  id="password"
                  type={showPassword ? "text" : "password"}
                  autoComplete="current-password"
                  placeholder="••••••••"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  disabled={loading}
                  required
                  className={`${inputClass} pr-12`}
                />
                <button
                  type="button"
                  onClick={() => setShowPassword((v) => !v)}
                  className="absolute right-1.5 top-1/2 flex h-9 w-9 -translate-y-1/2 items-center justify-center rounded-full text-slate-500 active:bg-slate-100"
                  aria-label={showPassword ? "Hide password" : "Show password"}
                >
                  {showPassword ? <EyeOff className="h-5 w-5" /> : <Eye className="h-5 w-5" />}
                </button>
              </div>
            </div>

            <button
              type="submit"
              disabled={loading}
              className="flex h-12 w-full items-center justify-center gap-2 rounded-xl bg-gradient-to-r from-orange-500 to-orange-600 text-base font-bold text-white shadow-md shadow-orange-500/30 active:scale-[0.99] disabled:opacity-60"
            >
              {loading ? (
                <>
                  <Loader2 className="h-5 w-5 animate-spin" />
                  Signing in...
                </>
              ) : (
                <>
                  Sign In
                  <ArrowRight className="h-5 w-5" />
                </>
              )}
            </button>
          </form>

          <FieldSalesInstallCard />

          <div className="space-y-1 pb-2 text-center text-xs text-slate-500">
            <p>No salesman login? Ask the shop owner to turn on Field Sales for you in Employee Master.</p>
            <p>
              Shop owner or staff?{" "}
              <button
                type="button"
                className="font-semibold text-slate-800 underline underline-offset-2"
                onClick={() => {
                  sessionStorage.removeItem("fieldSalesPWA");
                  navigate(`/${organization.slug}`);
                }}
              >
                Open the shop login
              </button>
            </p>
          </div>
        </div>
      </div>
    </div>
  );
}
