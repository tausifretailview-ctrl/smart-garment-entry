import { useState, useEffect, useRef } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card } from "@/components/ui/card";
import { Loader2, Building2, AlertCircle, ArrowRight, Eye, EyeOff, RefreshCw, Trash2, Mail, Lock } from "lucide-react";
import { toast } from "sonner";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { validateAuth } from "@/lib/validations";
import { isValidOrgSlug, normalizeOrgSlug, storeOrgSlug } from "@/lib/orgSlug";
import { signInWithGoogleOAuth } from "@/lib/googleOAuthSignIn";
import { hideAppBootSplash } from "@/lib/appBootSplash";
import { useCompactLoginLayout } from "@/hooks/use-mobile";
import { OrgLoginShell, OrgLoginTrustBadges } from "@/components/orgLogin/OrgLoginShell";

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
const MAX_ORG_FETCH_RETRIES = 3;
const ORG_FETCH_RETRY_DELAY_MS = 800;

export default function OrgAuth() {
  const { orgSlug } = useParams<{ orgSlug: string }>();
  const navigate = useNavigate();
  const { user } = useAuth();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [loading, setLoading] = useState(false);
  const [orgLoading, setOrgLoading] = useState(true);
  const [organization, setOrganization] = useState<Organization | null>(null);
  const [orgSettings, setOrgSettings] = useState<OrgSettings | null>(null);
  const [error, setError] = useState<string>("");
  const [loginAttempts, setLoginAttempts] = useState(0);
  const [lockoutUntil, setLockoutUntil] = useState<Date | null>(null);
  const [inputSlug, setInputSlug] = useState(orgSlug || "");
  const [orgFetchErrorType, setOrgFetchErrorType] = useState<"none" | "not_found" | "network" | "invalid_slug">("none");
  const [orgFetchRetryKey, setOrgFetchRetryKey] = useState(0);
  const [showCacheRecovery, setShowCacheRecovery] = useState(false);
  const compactLogin = useCompactLoginLayout();

  // Request lifecycle guard: prevent stale async fetches from updating state
  const fetchTokenRef = useRef(0);
  // Guard: prevent checkUserMembership from running while handleSignIn is active
  const isSigningInRef = useRef(false);

  useEffect(() => {
    hideAppBootSplash();
  }, []);

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
    const currentToken = ++fetchTokenRef.current;

    const fetchOrganization = async () => {
      const normalizedSlug = normalizeOrgSlug(orgSlug);

      if (currentToken !== fetchTokenRef.current) return;
      setError("");
      setOrgFetchErrorType("none");
      setOrganization(null);
      setOrgSettings(null);

      if (!isValidOrgSlug(normalizedSlug)) {
        setError("Invalid organization URL");
        setOrgFetchErrorType("invalid_slug");
        setOrgLoading(false);
        return;
      }

      // Cache key for localStorage persistence
      const cacheKey = `org_pub_${normalizedSlug}`;
      let usedCache = false;

      // Try loading from cache first (instant, no network needed)
      try {
        const cached = localStorage.getItem(cacheKey);
        if (cached) {
          const parsed = JSON.parse(cached);
          if (parsed?.id && parsed?.name && parsed?.slug) {
            setOrganization({
              id: parsed.id,
              name: parsed.name,
              slug: parsed.slug,
              settings: parsed.settings,
            });
            if (parsed.business_name || parsed.bill_barcode_settings) {
              setOrgSettings({
                business_name: parsed.business_name,
                bill_barcode_settings: parsed.bill_barcode_settings,
              });
            }
            setOrgLoading(false);
            usedCache = true;
          }
        }
      } catch {
        // Corrupt cache — ignore
      }

      let resolvedOrgData: any = null;
      let failureType: "none" | "not_found" | "network" | "invalid_slug" = "none";
      let failureMessage = "";
      let lastError: unknown = null;

      for (let attempt = 1; attempt <= MAX_ORG_FETCH_RETRIES; attempt += 1) {
        if (currentToken !== fetchTokenRef.current) return; // abort if stale
        try {
          const { data, error } = await supabase.rpc("get_org_public_info", {
            p_slug: normalizedSlug,
          });

          if (currentToken !== fetchTokenRef.current) return;

          if (error) {
            const errorMessage = (error.message || "").toLowerCase();
            const isNotFound =
              errorMessage.includes("not found") ||
              errorMessage.includes("no rows") ||
              error.code === "PGRST116";

            if (isNotFound) {
              failureType = "not_found";
              failureMessage = "Organization not found";
              break;
            }

            throw error;
          }

          if (!data) {
            failureType = "not_found";
            failureMessage = "Organization not found";
            break;
          }

          resolvedOrgData = data as any;
          break;
        } catch (err) {
          lastError = err;
          if (attempt < MAX_ORG_FETCH_RETRIES) {
            await new Promise((resolve) =>
              setTimeout(resolve, ORG_FETCH_RETRY_DELAY_MS * attempt)
            );
          }
        }
      }

      if (currentToken !== fetchTokenRef.current) return;

      if (resolvedOrgData) {
        // Update state with fresh data
        setOrganization({
          id: resolvedOrgData.id,
          name: resolvedOrgData.name,
          slug: resolvedOrgData.slug,
          settings: resolvedOrgData.settings,
        });

        if (resolvedOrgData.business_name || resolvedOrgData.bill_barcode_settings) {
          setOrgSettings({
            business_name: resolvedOrgData.business_name,
            bill_barcode_settings: resolvedOrgData.bill_barcode_settings,
          });
        }

        // Persist to cache for future visits on blocked networks
        try {
          localStorage.setItem(cacheKey, JSON.stringify(resolvedOrgData));
        } catch {
          // Storage full — ignore
        }
      } else if (!usedCache) {
        // Only show error if we don't have cached data
        if (failureType === "none") {
          failureType = "network";
          failureMessage = "Unable to connect. You can still sign in below.";
          console.error("Error fetching organization:", lastError);
        }

        setOrgFetchErrorType(failureType);
        setError(failureMessage);
      }
      // If usedCache is true and RPC failed, silently keep cached data (no warning)

      setOrgLoading(false);
    };

    setOrgLoading(true);
    fetchOrganization();
  }, [orgSlug, orgFetchRetryKey]);

  // Track if membership check already ran to avoid re-triggering after sign-out
  const [membershipChecked, setMembershipChecked] = useState(false);

  useEffect(() => {
    const checkUserMembership = async () => {
      // Skip if handleSignIn is actively running (it handles its own membership check)
      if (!user || !organization || membershipChecked || isSigningInRef.current) return;

      setMembershipChecked(true);

      const { data: membership } = await supabase
        .from("organization_members")
        .select("id")
        .eq("user_id", user.id)
        .eq("organization_id", organization.id)
        .single();

      if (membership) {
        storeOrgSlug(organization.slug);
        navigate(`/${organization.slug}`);
      } else {
        setError("You are not a member of this organization. Please contact your administrator.");
        await supabase.auth.signOut();
      }
    };

    checkUserMembership();
  }, [user, organization, navigate, membershipChecked]);

  const handleSignIn = async (e: React.FormEvent) => {
    e.preventDefault();

    const normalizedSlug = normalizeOrgSlug(orgSlug);

    // Only block if slug itself is invalid or org was confirmed not found
    if (!isValidOrgSlug(normalizedSlug)) {
      toast.error("Invalid organization URL");
      return;
    }
    if (orgFetchErrorType === "not_found") {
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
    setShowCacheRecovery(false);
    isSigningInRef.current = true;

    try {
      // CRITICAL: Clear any existing stale session before login attempt
      try {
        await supabase.auth.signOut({ scope: 'local' });
        localStorage.removeItem('auth_refresh_lock');
      } catch (_signOutErr) {
        // Ignore - local signOut failing should not block sign-in
      }

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
      
      setLoginAttempts(0);
      localStorage.removeItem(`org_auth_lockout_${orgSlug}`);

      if (!authData.user) {
        setError("Login failed. Please try again.");
        setLoading(false);
        return;
      }

      // Resolve organization: use pre-fetched org if available, otherwise resolve post-auth via slug
      let resolvedOrg = organization;

      if (!resolvedOrg) {
        // Fallback: resolve org membership by slug after authentication
        const { data: membershipRows, error: membershipQueryError } = await supabase
          .from("organization_members")
          .select(`
            id, role, organization_id,
            organizations (id, name, slug, settings)
          `)
          .eq("user_id", authData.user.id);

        if (membershipQueryError) {
          console.error("Membership query failed:", membershipQueryError);
          setError("Unable to verify organization membership. Please try again.");
          await supabase.auth.signOut();
          setLoading(false);
          return;
        }

        const matchingMembership = membershipRows?.find(
          (m: any) => m.organizations?.slug === normalizedSlug
        );

        if (!matchingMembership || !matchingMembership.organizations) {
          setError("You are not a member of this organization. Please contact your administrator.");
          await supabase.auth.signOut();
          setLoading(false);
          return;
        }

        resolvedOrg = matchingMembership.organizations as unknown as Organization;
      } else {
        // Standard path: verify membership using pre-fetched org
        const { data: membership, error: membershipError } = await supabase
          .from("organization_members")
          .select("id, role")
          .eq("user_id", authData.user.id)
          .eq("organization_id", resolvedOrg.id)
          .single();

        if (membershipError || !membership) {
          setError("You are not a member of this organization. Please contact your administrator.");
          await supabase.auth.signOut();
          setLoading(false);
          return;
        }
      }

      // Check if user has field sales access
      const { data: fieldSalesEmployee } = await supabase
        .from("employees")
        .select("id")
        .eq("organization_id", resolvedOrg.id)
        .eq("user_id", authData.user.id)
        .eq("field_sales_access", true)
        .is("deleted_at", null)
        .maybeSingle();

      storeOrgSlug(resolvedOrg.slug);

      if (fieldSalesEmployee) {
        sessionStorage.setItem('fieldSalesPWA', 'true');
        toast.success(`Welcome to Field Sales, ${resolvedOrg.name}!`);
        navigate(`/${resolvedOrg.slug}/salesman`);
      } else {
        sessionStorage.removeItem('fieldSalesPWA');
        toast.success(`Welcome to ${resolvedOrg.name}!`);
        navigate(`/${resolvedOrg.slug}`);
      }
    } catch (err: any) {
      const isNetworkError = err instanceof TypeError && 
        (err.message?.includes('Failed to fetch') || err.message?.includes('NetworkError'));
      
      if (isNetworkError) {
        setError("Network connection failed. Your browser may have a stale cache. Try clearing the app cache below, or check your internet connection.");
        setShowCacheRecovery(true);
      } else {
        setError("An unexpected error occurred. Please try again.");
      }
    } finally {
      isSigningInRef.current = false;
      setLoading(false);
    }
  };

  // Chrome cache/SW recovery action
  const handleClearCacheAndRetry = async () => {
    try {
      if ('serviceWorker' in navigator) {
        const registrations = await navigator.serviceWorker.getRegistrations();
        for (const registration of registrations) {
          await registration.unregister();
        }
      }
      if ('caches' in window) {
        const cacheNames = await caches.keys();
        await Promise.all(cacheNames.map(name => caches.delete(name)));
      }
    } catch (e) {
      console.error('Error clearing cache:', e);
    }
    window.location.reload();
  };

  const handleGoToOrgLogin = () => {
    const normalizedSlug = normalizeOrgSlug(inputSlug).replace(/[^a-z0-9-]/g, "-").replace(/-+/g, "-").replace(/^-|-$/g, "");
    if (isValidOrgSlug(normalizedSlug)) {
      storeOrgSlug(normalizedSlug);
      navigate(`/${normalizedSlug}`);
    }
  };

  const handleRetryOrganizationLoad = () => {
    setOrgFetchRetryKey((prev) => prev + 1);
  };

  // For invalid_slug and not_found: show blocking error card (no login possible)
  if (orgFetchErrorType === "invalid_slug" || orgFetchErrorType === "not_found") {
    const isInvalidSlug = orgFetchErrorType === "invalid_slug";
    return (
      <div className="min-h-screen flex items-center justify-center bg-background p-4">
        <Card className="w-full max-w-md shadow-elevated">
          <div className="p-6 text-center space-y-4">
            <AlertCircle className="h-12 w-12 text-destructive mx-auto" />
            <h2 className="text-xl font-semibold text-card-foreground">
              Organization Not Found
            </h2>
            <p className="text-muted-foreground text-sm">
              {isInvalidSlug
                ? "The organization URL format is invalid. Enter the correct organization code below."
                : "The organization URL you're trying to access doesn't exist. Enter the correct organization code below."}
            </p>

            <div className="space-y-2 text-left">
              <Label htmlFor="orgSlugInput" className="text-card-foreground font-medium text-sm">Organization Code</Label>
              <div className="flex items-center gap-2">
                <span className="text-muted-foreground text-sm whitespace-nowrap shrink-0">{window.location.host} /</span>
                <Input
                  id="orgSlugInput"
                  value={inputSlug}
                  onChange={(e) => setInputSlug(e.target.value)}
                  placeholder="your-org-slug"
                  className="h-10"
                  onKeyDown={(e) => e.key === "Enter" && handleGoToOrgLogin()}
                />
              </div>
            </div>

            <Button
              onClick={handleGoToOrgLogin}
              className="w-full"
              disabled={!inputSlug.trim()}
            >
              Go to Organization Login
              <ArrowRight className="ml-2 h-4 w-4" />
            </Button>

            <Button
              onClick={() => navigate("/auth")}
              variant="outline"
              className="w-full"
            >
              Go to General Login
            </Button>
          </div>
        </Card>
      </div>
    );
  }

  // Derive branding — works whether org loaded or not
  const displayName = orgSettings?.bill_barcode_settings?.login_display_name 
    || orgSettings?.business_name 
    || organization?.name
    || normalizeOrgSlug(orgSlug).replace(/-/g, ' ').replace(/\b\w/g, c => c.toUpperCase());
  const logoUrl = orgSettings?.bill_barcode_settings?.logo_url;
  const brandColor = orgSettings?.bill_barcode_settings?.brand_color || BRAND_COLOR;

  // Network error banner (shown inside the login form, not blocking)
  const showNetworkWarning = orgFetchErrorType === "network" && !organization;

  return (
    <OrgLoginShell
      title="Welcome back"
      subtitle="Sign in to your store account"
      compactLogin={compactLogin}
    >
      {/* Organization Branding — conditional logic unchanged */}
      <div className="text-center">
              {orgLoading ? (
                <div
                  className="mx-auto mb-3 flex h-[88px] w-[88px] animate-pulse items-center justify-center bg-white p-2"
                  style={{ border: "1px solid #e2e8f0", borderRadius: 14, boxShadow: "0 1px 3px rgba(15,23,42,0.08)" }}
                >
                  <Building2 className="h-9 w-9 text-muted-foreground" />
                </div>
              ) : logoUrl ? (
                <div
                  className="mx-auto mb-3 flex h-[88px] w-[88px] items-center justify-center bg-white p-2"
                  style={{ border: "1px solid #e2e8f0", borderRadius: 14, boxShadow: "0 1px 3px rgba(15,23,42,0.08)" }}
                >
                  <img
                    src={logoUrl}
                    alt={displayName}
                    className="max-h-full max-w-full object-contain"
                  />
                </div>
              ) : (
                <div
                  className="mx-auto mb-3 flex h-[88px] w-[88px] items-center justify-center bg-white p-2"
                  style={{ border: "1px solid #e2e8f0", borderRadius: 14, boxShadow: "0 1px 3px rgba(15,23,42,0.08)" }}
                >
                  <Building2 className="h-10 w-10" style={{ color: "#1e3a8a" }} />
                </div>
              )}

              <h2 className="uppercase" style={{ color: "#1e3a8a", fontSize: 14, fontWeight: 600, letterSpacing: "0.04em" }}>
                {displayName}
              </h2>
              <div className="mx-auto mt-4 h-px w-full" style={{ background: "#e2e8f0" }} />
            </div>

            <div className="space-y-4">
              {/* Network warning banner — non-blocking */}
              {showNetworkWarning && (
                <Alert className="rounded-lg border-yellow-500/50 bg-yellow-50 py-2 dark:bg-yellow-900/20">
                  <AlertCircle className="h-4 w-4 text-yellow-600 dark:text-yellow-400" />
                  <AlertDescription className="text-sm text-yellow-800 dark:text-yellow-200">
                    Connection issue detected. You can still sign in — we'll verify your access after login.
                    <div className="mt-2 flex gap-2">
                      <Button
                        type="button"
                        variant="outline"
                        size="sm"
                        className="h-7 text-xs"
                        onClick={handleRetryOrganizationLoad}
                      >
                        <RefreshCw className="mr-1 h-3 w-3" />
                        Retry
                      </Button>
                      <Button
                        type="button"
                        variant="outline"
                        size="sm"
                        className="h-7 text-xs"
                        onClick={handleClearCacheAndRetry}
                      >
                        <Trash2 className="mr-1 h-3 w-3" />
                        Reset Cache & Reload
                      </Button>
                    </div>
                  </AlertDescription>
                </Alert>
              )}

              {error && !showNetworkWarning && (
                <Alert
                  variant={showCacheRecovery ? "default" : "destructive"}
                  className={`rounded-lg py-2 ${showCacheRecovery ? "border-yellow-500/50 bg-yellow-50 dark:bg-yellow-900/20" : ""}`}
                >
                  <AlertCircle className="h-4 w-4" />
                  <AlertDescription className="text-sm">
                    {error}
                    {showCacheRecovery && (
                      <Button
                        type="button"
                        variant="outline"
                        size="sm"
                        className="mt-2 h-7 w-full text-xs"
                        onClick={handleClearCacheAndRetry}
                      >
                        <Trash2 className="mr-1 h-3 w-3" />
                        Clear App Cache & Retry
                      </Button>
                    )}
                  </AlertDescription>
                </Alert>
              )}

              <form onSubmit={handleSignIn} className="space-y-4">
                <div className="space-y-1.5">
                  <Label htmlFor="email" style={{ fontSize: 13, fontWeight: 500, color: "#0f172a" }}>
                    Email address
                  </Label>
                  <div className="login-field relative">
                    <Mail className="login-icon pointer-events-none absolute left-3.5 top-1/2 h-5 w-5 -translate-y-1/2 text-muted-foreground" />
                    <Input
                      id="email"
                      type="email"
                      placeholder="you@example.com"
                      value={email}
                      onChange={(e) => setEmail(e.target.value)}
                      disabled={loading}
                      required
                      className="login-input no-uppercase h-11 border-border pl-11 text-base"
                    />
                  </div>
                </div>

                <div className="space-y-1.5">
                  <div className="flex items-center justify-between gap-3">
                    <Label htmlFor="password" style={{ fontSize: 13, fontWeight: 500, color: "#0f172a" }}>
                      Password
                    </Label>
                    <button
                      type="button"
                      className="hover:underline"
                      style={{ fontSize: 13, fontWeight: 500, color: "#2957c9" }}
                      onClick={async () => {
                        if (!email) {
                          toast.error("Enter your email first");
                          return;
                        }
                        const { error } = await supabase.auth.resetPasswordForEmail(email, {
                          redirectTo: `${window.location.origin}/reset-password`,
                        });
                        if (error) {
                          toast.error(error.message);
                        } else {
                          toast.success("Password reset link sent. Check your email.");
                        }
                      }}
                    >
                      Forgot password?
                    </button>
                  </div>
                  <div className="login-field relative">
                    <Lock className="login-icon pointer-events-none absolute left-3.5 top-1/2 h-5 w-5 -translate-y-1/2 text-muted-foreground" />
                    <Input
                      id="password"
                      type={showPassword ? "text" : "password"}
                      placeholder="••••••••"
                      value={password}
                      onChange={(e) => setPassword(e.target.value)}
                      disabled={loading}
                      required
                      className="login-input no-uppercase h-11 border-border pl-11 pr-11 text-base"
                    />
                    <button
                      type="button"
                      className="absolute right-3.5 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
                      onClick={() => setShowPassword(!showPassword)}
                      tabIndex={-1}
                    >
                      {showPassword ? <EyeOff className="h-5 w-5" /> : <Eye className="h-5 w-5" />}
                    </button>
                  </div>
                  {loginAttempts > 0 && (
                    <div className="mt-2 flex items-center gap-1.5">
                      {Array.from({ length: MAX_LOGIN_ATTEMPTS }).map((_, i) => (
                        <div
                          key={i}
                          className="h-1.5 flex-1 rounded-full"
                          style={{
                            background: i < loginAttempts ? "#ef4444" : "hsl(var(--muted))",
                          }}
                        />
                      ))}
                      <span className="ml-1 text-sm text-muted-foreground">
                        {MAX_LOGIN_ATTEMPTS - loginAttempts} attempt
                        {MAX_LOGIN_ATTEMPTS - loginAttempts !== 1 ? "s" : ""} left
                      </span>
                    </div>
                  )}
                </div>

                <Button
                  type="submit"
                  className="login-submit mt-1 h-11 w-full rounded-[10px] text-base font-semibold text-white"
                  disabled={loading}
                >
                  {loading ? (
                    <>
                      <Loader2 className="mr-2 h-5 w-5 animate-spin" />
                      Signing in...
                    </>
                  ) : (
                    <>
                      Sign in
                      <ArrowRight className="ml-2 h-5 w-5" />
                    </>
                  )}
                </Button>
              </form>

              {/* Divider */}
              <div className="relative my-1">
                <div className="absolute inset-0 flex items-center">
                  <span className="w-full border-t border-border" />
                </div>
                <div className="relative flex justify-center">
                  <span className="bg-card px-3 uppercase" style={{ fontSize: 12, letterSpacing: "0.06em", color: "#64748b" }}>or</span>
                </div>
              </div>

              {/* Google Sign-In */}
              <Button
                type="button"
                variant="outline"
                className="login-google h-11 w-full rounded-[10px] border bg-background text-base font-medium"
                disabled={loading}
                onClick={async () => {
                  setLoading(true);
                  setError("");
                  const result = await signInWithGoogleOAuth({ orgSlug });
                  if (!result.ok) {
                    const msg = (result as { ok: false; message: string }).message;
                    setError(msg);
                    if (msg.includes("browser")) {
                      toast.info(msg);
                    }
                  }
                  setLoading(false);
                }}
              >
                <svg className="mr-2.5 h-5 w-5 md:h-6 md:w-6" viewBox="0 0 24 24">
                  <path
                    fill="#4285F4"
                    d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z"
                  />
                  <path
                    fill="#34A853"
                    d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"
                  />
                  <path
                    fill="#FBBC05"
                    d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z"
                  />
                  <path
                    fill="#EA4335"
                    d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z"
                  />
                </svg>
                Sign in with Google
              </Button>

              <p className="text-center" style={{ fontSize: 13, color: "#64748b" }}>
                Don&apos;t have access?{" "}
                <button
                  type="button"
                  className="transition-colors hover:underline"
                  style={{ fontSize: 13, fontWeight: 600, color: "#0f172a" }}
                  onClick={() => {
                    toast.info("Please contact your organization administrator for access.");
                  }}
                >
                  Contact your organization administrator
                </button>
              </p>

              {/* Trust Badges */}
              <OrgLoginTrustBadges />
            </div>
    </OrgLoginShell>
  );
}
