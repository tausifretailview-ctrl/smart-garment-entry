import { useEffect } from "react";
import { useNavigate, useLocation } from "react-router-dom";
import { toast } from "sonner";
import { consumeElectronOAuthErrorMessage } from "@/lib/electronOAuthRecovery";
import { getStoredOrgSlug } from "@/lib/orgSlug";

/** Shows a friendly message after Electron recovers from a raw Supabase OAuth JSON page. */
export function ElectronOAuthRecovery() {
  const navigate = useNavigate();
  const location = useLocation();

  useEffect(() => {
    const msg = consumeElectronOAuthErrorMessage();
    if (!msg) return;

    toast.error(msg);

    const slug = getStoredOrgSlug();
    if (slug && (location.pathname === "/" || location.pathname === "/auth")) {
      navigate(`/${slug}`, { replace: true });
    }
  }, [location.pathname, navigate]);

  return null;
}
