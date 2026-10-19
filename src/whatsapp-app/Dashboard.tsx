import { useEffect, useState, type ReactNode } from "react";
import { BarChart3, LogOut, MessagesSquare, Send, Store } from "lucide-react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { BulkWhatsAppWorkspace } from "@/components/bulk-whatsapp/BulkWhatsAppWorkspace";
import { BulkWhatsAppInbox } from "@/components/bulk-whatsapp/BulkWhatsAppInbox";
import { useInboxChats } from "@/components/bulk-whatsapp/bulkWhatsAppApi";

export interface SiteShop {
  id: string;
  name: string;
  slug: string;
  organization_type: string | null;
  is_suspended: boolean | null;
  role?: string;
}

type Page = "send" | "reports" | "inbox";

const PAGES: { id: Page; label: string; title: string; hint: string; icon: ReactNode }[] = [
  {
    id: "send",
    label: "Send campaign",
    title: "Bulk promotions",
    hint: "Link your WhatsApp, write your offer, add numbers and send. Every message gets a delivery and read report.",
    icon: <Send className="h-4 w-4" />,
  },
  {
    id: "reports",
    label: "Reports",
    title: "Reports",
    hint: "Every campaign with sent, delivered, read and failed counts. Open one for each number's status.",
    icon: <BarChart3 className="h-4 w-4" />,
  },
  {
    id: "inbox",
    label: "Inbox",
    title: "Inbox",
    hint: "Customers who replied to your bulk messages. Tag interested customers and reply from your linked WhatsApp.",
    icon: <MessagesSquare className="h-4 w-4" />,
  },
];

/** The page lives in the URL hash so a refresh stays on it. */
const pageFromHash = (): Page =>
  window.location.hash === "#reports" ? "reports" : window.location.hash === "#inbox" ? "inbox" : "send";

/** Signed-in home: top bar (shop, login, sign out), side menu, and the shared Bulk WhatsApp screen. */
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
  const [page, setPage] = useState<Page>(pageFromHash);
  useEffect(() => {
    const onHash = () => setPage(pageFromHash());
    window.addEventListener("hashchange", onHash);
    return () => window.removeEventListener("hashchange", onHash);
  }, []);
  const go = (next: Page) => {
    setPage(next);
    const hash = next === "send" ? "" : `#${next}`;
    if (window.location.hash !== hash) history.replaceState(null, "", `${window.location.pathname}${window.location.search}${hash}`);
    window.scrollTo({ top: 0 });
  };
  const current = PAGES.find((p) => p.id === page) ?? PAGES[0];
  const inbox = useInboxChats(shop.id, page === "inbox");
  const unread = (inbox.data ?? []).filter((c) => c.unread_count > 0).length;
  const badge = (p: Page) =>
    p === "inbox" && unread ? (
      <span className="ml-auto flex h-5 min-w-5 items-center justify-center rounded-full bg-emerald-500 px-1.5 text-[11px] font-bold text-white">
        {unread}
      </span>
    ) : null;

  return (
    <div className="flex min-h-[100dvh] flex-col">
      <header className="sticky top-0 z-30 bg-gradient-to-r from-slate-900 via-slate-800 to-indigo-900 text-white shadow-md">
        <div className="flex items-center justify-between gap-3 px-3 py-2.5 sm:px-5">
          <div className="flex min-w-0 items-center gap-2.5">
            <img src="/icon.svg" alt="" className="h-9 w-9 shrink-0 rounded-xl ring-2 ring-white/30" />
            <div className="min-w-0">
              <div className="text-base font-bold leading-tight tracking-tight">Ezzy Bulk Sender</div>
              <div className="flex items-center gap-1 truncate text-xs text-slate-300">
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
            <span className="hidden max-w-[220px] truncate text-xs text-slate-300 sm:inline">{email}</span>
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
      <div className="flex flex-1">
        <nav className="sticky top-[56px] hidden h-[calc(100dvh-56px)] w-56 shrink-0 flex-col gap-1 border-r border-slate-200 bg-white p-3 md:flex">
          <div className="px-2 pb-1 text-[11px] font-semibold uppercase tracking-wider text-slate-400">Menu</div>
          {PAGES.map((p) => (
            <button
              key={p.id}
              type="button"
              onClick={() => go(p.id)}
              className={cn(
                "flex items-center gap-2.5 rounded-lg px-3 py-2 text-left text-sm font-medium transition",
                page === p.id ? "bg-emerald-50 text-emerald-800 ring-1 ring-inset ring-emerald-200" : "text-slate-600 hover:bg-slate-50",
              )}
            >
              <span
                className={cn(
                  "flex h-7 w-7 items-center justify-center rounded-md",
                  page === p.id ? "bg-emerald-600 text-white" : "bg-slate-100 text-slate-500",
                )}
              >
                {p.icon}
              </span>
              {p.label}
              {badge(p.id)}
            </button>
          ))}
        </nav>
        <main className="min-w-0 flex-1 pb-16 md:pb-0">
          <div className="px-2 pt-4 sm:px-4">
            <h1 className="text-xl font-bold tracking-tight text-slate-900 sm:text-2xl">{current.title}</h1>
            <p className="text-sm text-slate-500">{current.hint}</p>
          </div>
          {/* Kept mounted so a half-written campaign survives a look at the Inbox. */}
          <div className={cn(page === "inbox" && "hidden")}>
            <BulkWhatsAppWorkspace
              key={shop.id}
              organizationId={shop.id}
              userId={userId}
              showCustomerMaster={false}
              showTitle={false}
              view={page === "reports" ? "reports" : "send"}
              onOpenReports={() => go("reports")}
              onOpenSend={() => go("send")}
            />
          </div>
          {page === "inbox" && (
            <div className="px-2 py-3 sm:px-4">
              <BulkWhatsAppInbox
                key={shop.id}
                organizationId={shop.id}
                userId={userId}
                className="h-[calc(100dvh-13rem)] min-h-[440px] md:h-[calc(100dvh-10rem)]"
              />
            </div>
          )}
        </main>
      </div>
      {/* Phones: the menu sits at the bottom. */}
      <nav className="fixed inset-x-0 bottom-0 z-30 grid grid-cols-3 border-t border-slate-200 bg-white md:hidden">
        {PAGES.map((p) => (
          <button
            key={p.id}
            type="button"
            onClick={() => go(p.id)}
            className={cn(
              "relative flex flex-col items-center gap-0.5 py-2 text-[11px] font-medium",
              page === p.id ? "text-emerald-700" : "text-slate-500",
            )}
          >
            {p.icon}
            {p.label}
            {p.id === "inbox" && unread > 0 && (
              <span className="absolute right-[calc(50%-1.25rem)] top-1 h-2 w-2 rounded-full bg-emerald-500" />
            )}
          </button>
        ))}
      </nav>
    </div>
  );
}
