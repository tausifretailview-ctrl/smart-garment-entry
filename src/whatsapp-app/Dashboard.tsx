import { LogOut, Store } from "lucide-react";
import { Button } from "@/components/ui/button";
import { BulkWhatsAppWorkspace } from "@/components/bulk-whatsapp/BulkWhatsAppWorkspace";

export interface SiteShop {
  id: string;
  name: string;
  slug: string;
  organization_type: string | null;
  is_suspended: boolean | null;
  role?: string;
}

/** Signed-in home: top bar (shop, login, sign out) over the shared Bulk WhatsApp screen. */
export function Dashboard({
  shop,
  shops,
  email,
  userId,
  onSwitchShop,
  onSignOut,
}: {
  shop: SiteShop;
  shops: SiteShop[];
  email: string;
  userId: string;
  onSwitchShop: (id: string) => void;
  onSignOut: () => void;
}) {
  return (
    <div className="flex min-h-[100dvh] flex-col">
      <header className="sticky top-0 z-30 bg-gradient-to-r from-emerald-700 via-emerald-600 to-teal-600 text-white shadow-md">
        <div className="mx-auto flex max-w-7xl items-center justify-between gap-3 px-3 py-2.5 sm:px-5">
          <div className="flex min-w-0 items-center gap-2.5">
            <img src="/icon.svg" alt="" className="h-9 w-9 shrink-0 rounded-xl ring-2 ring-white/30" />
            <div className="min-w-0">
              <div className="text-base font-bold leading-tight tracking-tight">Ezzy WhatsApp</div>
              <div className="flex items-center gap-1 truncate text-xs text-emerald-50/90">
                <Store className="h-3 w-3 shrink-0" />
                {shops.length > 1 ? (
                  <select
                    value={shop.id}
                    onChange={(e) => onSwitchShop(e.target.value)}
                    className="max-w-[180px] truncate rounded bg-transparent text-xs font-medium text-white outline-none"
                  >
                    {shops.map((s) => (
                      <option key={s.id} value={s.id} className="text-slate-900">
                        {s.name}
                      </option>
                    ))}
                  </select>
                ) : (
                  <span className="truncate font-medium">{shop.name}</span>
                )}
              </div>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <span className="hidden max-w-[220px] truncate text-xs text-emerald-50/90 sm:inline">{email}</span>
            <Button
              size="sm"
              variant="secondary"
              className="h-8 gap-1.5 bg-white/15 text-white hover:bg-white/25"
              onClick={onSignOut}
            >
              <LogOut className="h-4 w-4" />
              <span className="hidden sm:inline">Sign out</span>
            </Button>
          </div>
        </div>
      </header>
      <main className="mx-auto w-full max-w-7xl flex-1">
        <div className="px-2 pt-4 sm:px-4">
          <h1 className="text-xl font-bold tracking-tight text-slate-900 sm:text-2xl">Bulk promotions</h1>
          <p className="text-sm text-slate-500">
            Link your WhatsApp, write your offer, add numbers and send. Every message gets a delivery and read report.
          </p>
        </div>
        <BulkWhatsAppWorkspace
          key={shop.id}
          organizationId={shop.id}
          userId={userId}
          showCustomerMaster={false}
          showTitle={false}
        />
      </main>
    </div>
  );
}
