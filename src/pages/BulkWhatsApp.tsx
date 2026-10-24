import { useRef, useState } from "react";
import { useSearchParams } from "react-router-dom";
import { BarChart3, MessagesSquare, Send } from "lucide-react";
import { useAuth } from "@/contexts/AuthContext";
import { useOrganization } from "@/contexts/OrganizationContext";
import { BulkWhatsAppWorkspace } from "@/components/bulk-whatsapp/BulkWhatsAppWorkspace";
import { BulkWhatsAppInbox } from "@/components/bulk-whatsapp/BulkWhatsAppInbox";
import { useInboxChats } from "@/components/bulk-whatsapp/bulkWhatsAppApi";
import { cn } from "@/lib/utils";

/** Full view: the top menu and window tabs are hidden here (entryPageLayout), so the page scrolls itself. */
export default function BulkWhatsApp() {
  const { user } = useAuth();
  const { currentOrganization } = useOrganization();
  if (!currentOrganization?.id) return null;
  return <BulkWhatsAppPage organizationId={currentOrganization.id} userId={user?.id} />;
}

function BulkWhatsAppPage({ organizationId, userId }: { organizationId: string; userId: string | undefined }) {
  const [tab, setTab] = useState<"send" | "inbox" | "report">("send");
  const scrollRef = useRef<HTMLDivElement>(null);
  const open = (next: "send" | "report") => {
    setTab(next);
    scrollRef.current?.scrollTo({ top: 0 });
  };
  // ?winback=90 from Business Insights > Quiet Customers opens the picker on that win-back list.
  const [params] = useSearchParams();
  const winBack = Number.parseInt(params.get("winback") ?? "", 10);
  const winBackDays = Number.isFinite(winBack) && winBack > 0 ? winBack : null;
  const inbox = useInboxChats(organizationId, tab === "inbox");
  const unread = (inbox.data ?? []).filter((c) => c.unread_count > 0).length;
  const tabs = [
    { id: "send" as const, label: "Send", icon: <Send className="h-4 w-4" /> },
    { id: "inbox" as const, label: "Inbox", icon: <MessagesSquare className="h-4 w-4" />, badge: unread },
    { id: "report" as const, label: "Report", icon: <BarChart3 className="h-4 w-4" /> },
  ];

  return (
    <div ref={scrollRef} className="h-full min-h-0 w-full overflow-y-auto">
      <div className="flex gap-1 border-b border-slate-200 bg-white px-3 pt-2 sm:px-4">
        {tabs.map((t) => (
          <button
            key={t.id}
            type="button"
            onClick={() => setTab(t.id)}
            className={cn(
              "flex items-center gap-1.5 border-b-2 px-3 py-2 text-sm font-medium transition",
              tab === t.id ? "border-emerald-600 text-emerald-700" : "border-transparent text-slate-500 hover:text-slate-800",
            )}
          >
            {t.icon}
            {t.label}
            {t.badge ? (
              <span className="flex h-5 min-w-5 items-center justify-center rounded-full bg-emerald-500 px-1.5 text-[11px] font-bold text-white">
                {t.badge}
              </span>
            ) : null}
          </button>
        ))}
      </div>
      {/* One workspace for Send and Report, kept mounted so a half-written message survives a look elsewhere. */}
      <div className={cn(tab === "inbox" && "hidden")}>
        <BulkWhatsAppWorkspace
          organizationId={organizationId}
          userId={userId}
          view={tab === "report" ? "reports" : "send"}
          onOpenReports={() => open("report")}
          onOpenSend={() => open("send")}
          previewTopClass="lg:top-3"
          winBackDays={winBackDays}
        />
      </div>
      {tab === "inbox" && (
        <div className="px-2 py-3 sm:px-4">
          <BulkWhatsAppInbox organizationId={organizationId} userId={userId} className="h-[calc(100dvh-8rem)] min-h-[480px]" />
        </div>
      )}
    </div>
  );
}
