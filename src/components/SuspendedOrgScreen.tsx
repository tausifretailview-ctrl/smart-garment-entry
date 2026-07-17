import { useEffect } from "react";
import { supabase } from "@/integrations/supabase/client";
import { resolveOrgLoginPath } from "@/lib/orgLoginRedirect";
import { Button } from "@/components/ui/button";
import { AlertCircle, LogOut } from "lucide-react";

interface Props {
  orgName: string;
  reason?: string | null;
}

const CONTACT_NUMBER = "+919820330995";
const DEFAULT_REASON =
  "Your subscription is on hold due to pending payment. Please complete the payment to resume the software.";

export const SuspendedOrgScreen = ({ orgName, reason }: Props) => {
  useEffect(() => {
    // Auto sign-out after 8 seconds so no stale session lingers
    const t = setTimeout(() => {
      void supabase.auth.signOut().then(() => {
        window.location.href = resolveOrgLoginPath();
      });
    }, 8000);
    return () => clearTimeout(t);
  }, []);

  const handleSignOut = async () => {
    await supabase.auth.signOut();
    window.location.href = resolveOrgLoginPath();
  };

  const waLink = `https://wa.me/${CONTACT_NUMBER.replace(/[^0-9]/g, "")}?text=${encodeURIComponent(
    `Hello, I need to resume my subscription for ${orgName}.`,
  )}`;

  return (
    <div className="fixed inset-0 z-[9999] flex items-center justify-center bg-background p-4">
      <div className="w-full max-w-md rounded-lg border border-destructive/30 bg-card p-6 shadow-xl">
        <div className="flex flex-col items-center text-center">
          <div className="mb-4 flex h-16 w-16 items-center justify-center rounded-full bg-destructive/10">
            <AlertCircle className="h-9 w-9 text-destructive" />
          </div>
          <h1 className="text-2xl font-bold text-destructive">Payment Pending</h1>
          <p className="mt-1 text-sm text-muted-foreground">{orgName}</p>
          <p className="mt-4 text-sm text-foreground">{reason || DEFAULT_REASON}</p>

          <div className="mt-6 w-full space-y-2 rounded-md bg-muted/40 p-4 text-sm">
            <p className="font-medium text-foreground">Contact Support</p>
            <p className="text-muted-foreground">
              Phone / WhatsApp:{" "}
              <a href={`tel:${CONTACT_NUMBER}`} className="font-semibold text-primary">
                {CONTACT_NUMBER}
              </a>
            </p>
          </div>

          <div className="mt-6 flex w-full flex-col gap-2">
            <Button asChild className="w-full">
              <a href={waLink} target="_blank" rel="noopener noreferrer">
                Message on WhatsApp
              </a>
            </Button>
            <Button variant="outline" className="w-full" onClick={handleSignOut}>
              <LogOut className="mr-2 h-4 w-4" />
              Sign Out
            </Button>
          </div>

          <p className="mt-4 text-xs text-muted-foreground">
            You will be signed out automatically.
          </p>
        </div>
      </div>
    </div>
  );
};

export default SuspendedOrgScreen;