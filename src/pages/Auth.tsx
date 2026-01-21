import { useState, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { useToast } from "@/hooks/use-toast";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Loader2, Shield } from "lucide-react";
import { validateAuth } from "@/lib/validations";
import ezzyerpLogo from "@/assets/ezzyerp-logo.jpg";

const MAX_LOGIN_ATTEMPTS = 5;
const LOCKOUT_DURATION_MS = 60000; // 1 minute

const Auth = () => {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [loading, setLoading] = useState(false);
  const [loginAttempts, setLoginAttempts] = useState(0);
  const [lockoutUntil, setLockoutUntil] = useState<Date | null>(null);
  const { toast } = useToast();
  const navigate = useNavigate();

  // Check and clear lockout on mount
  useEffect(() => {
    const storedLockout = localStorage.getItem('auth_lockout');
    if (storedLockout) {
      const lockoutDate = new Date(storedLockout);
      if (lockoutDate > new Date()) {
        setLockoutUntil(lockoutDate);
      } else {
        localStorage.removeItem('auth_lockout');
      }
    }
  }, []);

  const handleSignIn = async (e: React.FormEvent) => {
    e.preventDefault();
    
    // Check for rate limiting lockout
    if (lockoutUntil && new Date() < lockoutUntil) {
      const remainingSeconds = Math.ceil((lockoutUntil.getTime() - Date.now()) / 1000);
      toast({
        title: "Too Many Attempts",
        description: `Please wait ${remainingSeconds} seconds before trying again.`,
        variant: "destructive",
      });
      return;
    }

    // Clear lockout if expired
    if (lockoutUntil && new Date() >= lockoutUntil) {
      setLockoutUntil(null);
      setLoginAttempts(0);
      localStorage.removeItem('auth_lockout');
    }
    
    // Validate with Zod schema
    const validation = validateAuth(email, password);
    if (!validation.success) {
      toast({
        title: "Validation Error",
        description: validation.error,
        variant: "destructive",
      });
      return;
    }

    setLoading(true);
    
    // CRITICAL: Clear any existing stale session before login attempt
    // This prevents conflicts with corrupted/expired tokens in Chrome regular mode
    await supabase.auth.signOut({ scope: 'local' });
    localStorage.removeItem('auth_refresh_lock');

    const { data: authData, error } = await supabase.auth.signInWithPassword({
      email,
      password,
    });

    if (error) {
      setLoading(false);
      
      // Increment failed attempts
      const newAttempts = loginAttempts + 1;
      setLoginAttempts(newAttempts);
      
      // Check if lockout threshold reached
      if (newAttempts >= MAX_LOGIN_ATTEMPTS) {
        const lockoutDate = new Date(Date.now() + LOCKOUT_DURATION_MS);
        setLockoutUntil(lockoutDate);
        localStorage.setItem('auth_lockout', lockoutDate.toISOString());
        setLoginAttempts(0);
        
        toast({
          title: "Account Temporarily Locked",
          description: "Too many failed attempts. Please wait 1 minute before trying again.",
          variant: "destructive",
        });
        return;
      }
      
      toast({
        title: "Sign in failed",
        description: `${error.message} (${MAX_LOGIN_ATTEMPTS - newAttempts} attempts remaining)`,
        variant: "destructive",
      });
      return;
    }
    
    // Reset attempts on successful auth
    setLoginAttempts(0);
    localStorage.removeItem('auth_lockout');

    // Check if user is platform_admin
    const { data: roleData, error: roleError } = await (supabase as any)
      .from("user_roles")
      .select("role")
      .eq("user_id", authData.user?.id)
      .eq("role", "platform_admin")
      .maybeSingle();

    if (roleError || !roleData) {
      // Not a platform admin - sign out and show error
      await supabase.auth.signOut();
      setLoading(false);
      toast({
        title: "Access Denied",
        description: "This login is for Platform Admin only. Please use your organization's login URL.",
        variant: "destructive",
      });
      return;
    }

    setLoading(false);
    toast({
      title: "Success",
      description: "Signed in as Platform Admin!",
    });
    navigate("/");
  };

  return (
    <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-background via-primary/5 to-background dark:bg-background p-4 relative overflow-hidden">
      {/* Decorative brand color shapes (light mode only) */}
      <div className="absolute top-0 left-0 w-96 h-96 bg-primary/10 rounded-full blur-3xl -translate-x-1/2 -translate-y-1/2 dark:hidden" />
      <div className="absolute bottom-0 right-0 w-96 h-96 bg-primary/10 rounded-full blur-3xl translate-x-1/2 translate-y-1/2 dark:hidden" />
      <div className="absolute top-1/2 left-1/4 w-64 h-64 bg-secondary/5 rounded-full blur-2xl dark:hidden" />
      
      <Card className="w-full max-w-md relative border-t-4 border-t-primary shadow-xl brand-glow">
        <CardHeader className="text-center pb-2">
          <div className="mx-auto mb-4">
            <img 
              src={ezzyerpLogo} 
              alt="EzzyERP" 
              className="h-20 w-auto mx-auto object-contain"
            />
          </div>
          <p className="text-slate-500 text-sm mb-3">Easy Billing, Smart Business</p>
          <CardDescription className="text-base">
            <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full bg-primary/10 text-primary font-medium text-sm">
              <Shield className="h-3.5 w-3.5" />
              Platform Admin Login
            </span>
          </CardDescription>
        </CardHeader>
        <CardContent className="pt-4">
          <form onSubmit={handleSignIn} className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="login-email" className="text-foreground font-medium">Email</Label>
              <Input
                id="login-email"
                type="email"
                placeholder="admin@example.com"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                disabled={loading}
                required
                className="h-11 border-2 focus:border-primary transition-colors"
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="login-password" className="text-foreground font-medium">Password</Label>
              <Input
                id="login-password"
                type="password"
                placeholder="••••••"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                disabled={loading}
                required
                className="h-11 border-2 focus:border-primary transition-colors"
              />
            </div>
            <Button type="submit" className="w-full h-11 text-base font-semibold" disabled={loading}>
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
          <div className="mt-6 pt-4 border-t border-border">
            <p className="text-center text-sm text-muted-foreground">
              Organization users must login via their{" "}
              <span className="text-primary font-medium">organization URL</span>
            </p>
          </div>
        </CardContent>
      </Card>
    </div>
  );
};

export default Auth;
