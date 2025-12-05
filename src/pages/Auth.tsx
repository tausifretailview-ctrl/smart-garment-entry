import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { useToast } from "@/hooks/use-toast";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Loader2, Shield, Package } from "lucide-react";
import { validateAuth } from "@/lib/validations";

const Auth = () => {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [loading, setLoading] = useState(false);
  const { toast } = useToast();
  const navigate = useNavigate();

  const handleSignIn = async (e: React.FormEvent) => {
    e.preventDefault();
    
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
    const { data: authData, error } = await supabase.auth.signInWithPassword({
      email,
      password,
    });

    if (error) {
      setLoading(false);
      toast({
        title: "Sign in failed",
        description: error.message,
        variant: "destructive",
      });
      return;
    }

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
    <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-background via-primary/5 to-background p-4 relative overflow-hidden">
      {/* Decorative brand color shapes */}
      <div className="absolute top-0 left-0 w-96 h-96 bg-primary/10 rounded-full blur-3xl -translate-x-1/2 -translate-y-1/2" />
      <div className="absolute bottom-0 right-0 w-96 h-96 bg-primary/10 rounded-full blur-3xl translate-x-1/2 translate-y-1/2" />
      <div className="absolute top-1/2 left-1/4 w-64 h-64 bg-secondary/5 rounded-full blur-2xl" />
      
      <Card className="w-full max-w-md relative border-t-4 border-t-primary shadow-xl brand-glow">
        <CardHeader className="text-center pb-2">
          <div className="mx-auto mb-4 flex h-16 w-16 items-center justify-center rounded-2xl bg-primary shadow-lg">
            <Shield className="h-8 w-8 text-primary-foreground" />
          </div>
          <div className="flex items-center justify-center gap-2 mb-2">
            <div className="bg-primary p-1.5 rounded-lg">
              <Package className="h-4 w-4 text-primary-foreground" />
            </div>
            <CardTitle className="text-2xl font-bold">
              <span className="text-primary">Smart</span> Inventory
            </CardTitle>
          </div>
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
