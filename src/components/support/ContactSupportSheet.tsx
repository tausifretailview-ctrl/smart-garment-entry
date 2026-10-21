import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import {
  Clock,
  Headset,
  LifeBuoy,
  Mail,
  MessageCircle,
  Phone,
  Ticket,
} from "lucide-react";
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet";
import { Button } from "@/components/ui/button";
import { useOrganization } from "@/contexts/OrganizationContext";
import { useAuth } from "@/contexts/AuthContext";
import {
  EZZY_SUPPORT,
  whatsappSupportUrl,
} from "@/components/support/supportContacts";
import { SupportTokenDialog } from "@/components/support/SupportTokenDialog";
import {
  SUPPORT_STATUS_LABELS,
  supportTokensTable,
  type SupportToken,
} from "@/components/support/supportTokensApi";
import { cn } from "@/lib/utils";

type ContactSupportSheetProps = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
};

const STATUS_CHIP: Record<SupportToken["status"], string> = {
  open: "bg-amber-100 text-amber-800",
  in_progress: "bg-sky-100 text-sky-800",
  closed: "bg-emerald-100 text-emerald-800",
};

export function ContactSupportSheet({ open, onOpenChange }: ContactSupportSheetProps) {
  const { currentOrganization } = useOrganization();
  const { user } = useAuth();
  const [tokenOpen, setTokenOpen] = useState(false);

  // The user's last few tokens (RLS: own rows only). Fails quietly until the SQL is run.
  const { data: myTokens = [] } = useQuery({
    queryKey: ["my-support-tokens", user?.id],
    enabled: open && Boolean(user?.id),
    staleTime: 30_000,
    queryFn: async (): Promise<SupportToken[]> => {
      const { data, error } = await supportTokensTable()
        .select("id, token_no, category, message, status, created_at, admin_note")
        .eq("user_id", user!.id)
        .order("created_at", { ascending: false })
        .limit(5);
      if (error) return [];
      return (data ?? []) as SupportToken[];
    },
  });

  const channels = [
    {
      key: "call",
      title: "Call us",
      value: EZZY_SUPPORT.callDisplay,
      icon: Phone,
      href: `tel:${EZZY_SUPPORT.callTel}`,
      action: "Call",
    },
    {
      key: "whatsapp",
      title: "WhatsApp Chat",
      value: EZZY_SUPPORT.whatsappDisplay,
      icon: MessageCircle,
      href: whatsappSupportUrl(
        `Hi EzzyERP Support — org: ${currentOrganization?.name || "N/A"}`,
      ),
      action: "Chat",
      external: true,
    },
    {
      key: "email",
      title: "Email support",
      value: EZZY_SUPPORT.email,
      icon: Mail,
      href: `mailto:${EZZY_SUPPORT.email}?subject=${encodeURIComponent(
        `EzzyERP Support — ${currentOrganization?.name || "Account"}`,
      )}`,
      action: "Email",
    },
    {
      key: "hours",
      title: "Support hours",
      value: EZZY_SUPPORT.hours,
      icon: Clock,
    },
  ] as const;

  return (
    <>
      <Sheet open={open} onOpenChange={onOpenChange}>
        <SheetContent
          side="right"
          className="w-full sm:max-w-md p-0 flex flex-col gap-0 border-l border-violet-100 bg-gradient-to-b from-violet-50/80 via-white to-white"
        >
          <SheetHeader className="px-5 pt-5 pb-4 text-left space-y-1.5 border-b border-violet-100/80">
            <div className="flex items-start justify-between gap-3 pr-6">
              <div>
                <SheetTitle className="text-xl font-bold text-slate-900 tracking-tight">
                  Contact Support
                </SheetTitle>
                <SheetDescription className="text-sm text-slate-500 mt-1">
                  Pick the best channel for your query. Your EzzyERP support details are right here.
                </SheetDescription>
              </div>
            </div>
          </SheetHeader>

          <div className="flex-1 overflow-y-auto px-5 py-4 space-y-3">
            {channels.map((ch) => {
              const Icon = ch.icon;
              const body = (
                <div className="flex items-start gap-3 min-w-0">
                  <div className="h-10 w-10 rounded-xl bg-violet-100 flex items-center justify-center shrink-0">
                    <Icon className="h-5 w-5 text-violet-700" />
                  </div>
                  <div className="min-w-0 flex-1">
                    <p className="text-sm font-semibold text-slate-900">{ch.title}</p>
                    <p className="text-sm text-slate-600 break-all mt-0.5">{ch.value}</p>
                  </div>
                  {"action" in ch && ch.action ? (
                    <span className="text-xs font-semibold text-violet-700 shrink-0 pt-1">
                      {ch.action}
                    </span>
                  ) : null}
                </div>
              );

              if ("href" in ch && ch.href) {
                return (
                  <a
                    key={ch.key}
                    href={ch.href}
                    target={"external" in ch && ch.external ? "_blank" : undefined}
                    rel={"external" in ch && ch.external ? "noopener noreferrer" : undefined}
                    className={cn(
                      "block rounded-xl border border-slate-200 bg-white px-3.5 py-3",
                      "hover:border-violet-300 hover:shadow-sm transition-all",
                      "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-violet-500",
                    )}
                  >
                    {body}
                  </a>
                );
              }

              return (
                <div
                  key={ch.key}
                  className="rounded-xl border border-slate-200 bg-white px-3.5 py-3"
                >
                  {body}
                </div>
              );
            })}

            {myTokens.length > 0 && (
              <div className="pt-2">
                <p className="text-xs font-semibold uppercase tracking-wide text-slate-500 mb-2">
                  My support tokens
                </p>
                <div className="space-y-2">
                  {myTokens.map((t) => (
                    <div key={t.id} className="rounded-xl border border-slate-200 bg-white px-3.5 py-2.5">
                      <div className="flex items-center justify-between gap-2">
                        <span className="text-sm font-bold text-violet-800">#{t.token_no}</span>
                        <span
                          className={cn(
                            "rounded-full px-2 py-0.5 text-[11px] font-semibold",
                            STATUS_CHIP[t.status] ?? STATUS_CHIP.open,
                          )}
                        >
                          {SUPPORT_STATUS_LABELS[t.status] ?? t.status}
                        </span>
                      </div>
                      <p className="text-xs text-slate-600 mt-1 line-clamp-2">{t.message}</p>
                      {t.admin_note ? (
                        <p className="text-xs text-emerald-700 mt-1 line-clamp-2">Support: {t.admin_note}</p>
                      ) : null}
                      <p className="text-[11px] text-slate-400 mt-1">
                        {new Date(t.created_at).toLocaleString("en-IN", {
                          day: "2-digit",
                          month: "short",
                          hour: "numeric",
                          minute: "2-digit",
                        })}
                      </p>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>

          <div className="px-5 pb-5 pt-2 space-y-3 border-t border-slate-100 bg-white">
            <Button
              type="button"
              className="w-full h-11 text-sm font-semibold bg-violet-600 hover:bg-violet-700 text-white gap-2"
              onClick={() => setTokenOpen(true)}
            >
              <Ticket className="h-4 w-4" />
              Generate Support Token
            </Button>
            <div className="flex items-center justify-between text-xs text-slate-500">
              <span className="inline-flex items-center gap-1.5">
                <span className="h-2 w-2 rounded-full bg-emerald-500" />
                All systems operational
              </span>
              <span className="inline-flex items-center gap-1 text-violet-700 font-medium">
                <Headset className="h-3.5 w-3.5" />
                EzzyERP Support
              </span>
            </div>
          </div>
        </SheetContent>
      </Sheet>

      <SupportTokenDialog open={tokenOpen} onOpenChange={setTokenOpen} />
    </>
  );
}

/** White Support toolbar button — place after Help. */
export function SupportToolbarButton({
  className,
  onClick,
}: {
  className?: string;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        "inline-flex items-center gap-1.5 h-8 px-3 rounded-md border border-violet-200 bg-white",
        "text-sm font-semibold text-violet-700 shadow-sm",
        "hover:bg-violet-50 hover:border-violet-300 transition-colors",
        "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-violet-500",
        className,
      )}
      title="Contact Support"
    >
      <Headset className="h-4 w-4 shrink-0" />
      Support
    </button>
  );
}

/** Peach Help toolbar button (opens shortcuts). */
export function HelpToolbarButton({
  className,
  onClick,
}: {
  className?: string;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        "inline-flex items-center gap-1.5 h-8 px-3 rounded-md border border-orange-200 bg-orange-50",
        "text-sm font-semibold text-orange-700 shadow-sm",
        "hover:bg-orange-100 hover:border-orange-300 transition-colors",
        "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-orange-400",
        className,
      )}
      title="Keyboard shortcuts (F1)"
    >
      <LifeBuoy className="h-4 w-4 shrink-0" />
      Help
      <kbd className="ml-0.5 rounded bg-white/80 border border-orange-200 px-1 py-px text-[10px] font-mono text-slate-600">
        F1
      </kbd>
    </button>
  );
}
