import { useEffect, useState } from "react";
import type { Session } from "@supabase/supabase-js";
import { QueryClient, QueryClientProvider, useQuery } from "@tanstack/react-query";
import { Loader2 } from "lucide-react";
import { Toaster } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { LoginScreen } from "./LoginScreen";
import { Dashboard, type SiteShop } from "./Dashboard";

const queryClient = new QueryClient({
  defaultOptions: { queries: { retry: 1, refetchOnWindowFocus: true } },
});

const SHOP_KEY = "ezzy_whatsapp_shop";

function readSavedShop(): string | null {
  try {
    return localStorage.getItem(SHOP_KEY);
  } catch {
    return null;
  }
}

function saveShop(id: string) {
  try {
    localStorage.setItem(SHOP_KEY, id);
  } catch {
    /* private mode: the first shop is used next time */
  }
}

/** Shops this login belongs to; WhatsApp-only shops first. */
async function fetchShops(userId: string): Promise<SiteShop[]> {
  const { data, error } = await supabase
    .from("organization_members")
    .select("role, organizations (id, name, slug, organization_type, is_suspended)")
    .eq("user_id", userId);
  if (error) throw error;
  const shops: SiteShop[] = [];
  for (const row of data ?? []) {
    const o = row.organizations as unknown as SiteShop | null;
    if (o?.id) shops.push({ ...o, role: row.role });
  }
  return shops.sort(
    (a, b) =>
      Number(b.organization_type === "whatsapp") - Number(a.organization_type === "whatsapp") ||
      a.name.localeCompare(b.name),
  );
}

function FullScreen({ children }: { children: React.ReactNode }) {
  return (
    <div className="flex min-h-[100dvh] items-center justify-center bg-gradient-to-br from-slate-50 via-white to-emerald-50 p-6">
      {children}
    </div>
  );
}

function SignedIn({ session }: { session: Session }) {
  const userId = session.user.id;
  const shops = useQuery({ queryKey: ["site-shops", userId], queryFn: () => fetchShops(userId) });
  const [shopId, setShopId] = useState<string | null>(readSavedShop);

  if (shops.isLoading) {
    return (
      <FullScreen>
        <Loader2 className="h-6 w-6 animate-spin text-emerald-600" />
      </FullScreen>
    );
  }

  const list = shops.data ?? [];
  const shop = list.find((s) => s.id === shopId) ?? list[0];
  const signOut = () => void supabase.auth.signOut({ scope: "local" });

  if (shops.isError || !shop) {
    return (
      <FullScreen>
        <div className="max-w-sm space-y-4 text-center">
          <h1 className="text-lg font-semibold text-slate-900">
            {shops.isError ? "Could not load your account" : "No shop is linked to this login"}
          </h1>
          <p className="text-sm text-slate-500">
            {shops.isError
              ? "Check your internet connection and try again."
              : "Please contact Ezzy ERP to set up your WhatsApp account."}
          </p>
          <div className="flex justify-center gap-2">
            {shops.isError && <Button onClick={() => void shops.refetch()}>Try again</Button>}
            <Button variant="outline" onClick={signOut}>
              Sign out
            </Button>
          </div>
        </div>
      </FullScreen>
    );
  }

  if (shop.is_suspended) {
    return (
      <FullScreen>
        <div className="max-w-sm space-y-4 text-center">
          <h1 className="text-lg font-semibold text-slate-900">This account is suspended</h1>
          <p className="text-sm text-slate-500">Please contact Ezzy ERP to continue sending WhatsApp messages.</p>
          <Button variant="outline" onClick={signOut}>
            Sign out
          </Button>
        </div>
      </FullScreen>
    );
  }

  return (
    <Dashboard
      shop={shop}
      shops={list}
      email={session.user.email ?? ""}
      userId={userId}
      onSwitchShop={(id) => {
        saveShop(id);
        setShopId(id);
      }}
      onSignOut={signOut}
    />
  );
}

export default function WhatsAppSite() {
  const [session, setSession] = useState<Session | null | undefined>(undefined);

  useEffect(() => {
    void supabase.auth.getSession().then(({ data }) => setSession(data.session));
    const { data } = supabase.auth.onAuthStateChange((_event, next) => {
      setSession(next);
      if (!next) queryClient.clear();
    });
    return () => data.subscription.unsubscribe();
  }, []);

  return (
    <QueryClientProvider client={queryClient}>
      {session === undefined ? (
        <FullScreen>
          <Loader2 className="h-6 w-6 animate-spin text-emerald-600" />
        </FullScreen>
      ) : session ? (
        <SignedIn session={session} />
      ) : (
        <LoginScreen />
      )}
      <Toaster position="top-center" richColors closeButton />
    </QueryClientProvider>
  );
}
