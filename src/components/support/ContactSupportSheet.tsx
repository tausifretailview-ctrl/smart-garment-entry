import { useEffect, useState, type FormEvent } from "react";
import {
  Clock,
  Headset,
  LifeBuoy,
  Loader2,
  Mail,
  MessageCircle,
  Phone,
  PhoneCall,
} from "lucide-react";
import { toast } from "sonner";
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { useOrganization } from "@/contexts/OrganizationContext";
import { useAuth } from "@/contexts/AuthContext";
import {
  EZZY_SUPPORT,
  enqueueSupportCallback,
  whatsappSupportUrl,
} from "@/components/support/supportContacts";
import { cn } from "@/lib/utils";

type ContactSupportSheetProps = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
};

export function ContactSupportSheet({ open, onOpenChange }: ContactSupportSheetProps) {
  const { currentOrganization } = useOrganization();
  const { user } = useAuth();
  const [callbackOpen, setCallbackOpen] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [businessName, setBusinessName] = useState("");
  const [contactName, setContactName] = useState("");
  const [contactNo, setContactNo] = useState("");
  const [notes, setNotes] = useState("");

  useEffect(() => {
    if (!callbackOpen) return;
    setBusinessName(currentOrganization?.name?.trim() || "");
    setContactName(
      (user?.user_metadata?.full_name as string | undefined)?.trim() ||
        user?.email?.split("@")[0] ||
        currentOrganization?.name?.trim() ||
        "",
    );
    setContactNo("");
    setNotes("");
  }, [callbackOpen, currentOrganization?.name, user]);

  const submitCallback = async (e: FormEvent) => {
    e.preventDefault();
    const biz = businessName.trim();
    const name = contactName.trim();
    const phone = contactNo.replace(/\D/g, "");
    if (!biz || !name || phone.length < 10) {
      toast.error("Please enter business name, contact name, and a valid phone number");
      return;
    }
    setSubmitting(true);
    try {
      enqueueSupportCallback({
        businessName: biz,
        contactName: name,
        contactNo: phone,
        notes: notes.trim(),
        submittedAt: new Date().toISOString(),
        organizationId: currentOrganization?.id ?? null,
        organizationName: currentOrganization?.name ?? null,
        userEmail: user?.email ?? null,
      });
      toast.success("Callback request submitted", {
        description: "Our team will reach out shortly. Collection settings will be updated soon.",
      });
      setCallbackOpen(false);
    } finally {
      setSubmitting(false);
    }
  };

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
          </div>

          <div className="px-5 pb-5 pt-2 space-y-3 border-t border-slate-100 bg-white">
            <Button
              type="button"
              className="w-full h-11 text-sm font-semibold bg-violet-600 hover:bg-violet-700 text-white gap-2"
              onClick={() => setCallbackOpen(true)}
            >
              <PhoneCall className="h-4 w-4" />
              Schedule a Callback
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

      <Dialog open={callbackOpen} onOpenChange={setCallbackOpen}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader className="text-center sm:text-center space-y-1">
            <DialogTitle className="text-lg font-bold text-slate-800">
              Talk To Our Expert
            </DialogTitle>
            <DialogDescription className="text-sm text-slate-500">
              Fill in your info — we&apos;ll reach out shortly
            </DialogDescription>
          </DialogHeader>
          <form onSubmit={submitCallback} className="space-y-3 pt-1">
            <div className="space-y-1.5">
              <Label htmlFor="support-biz">Business Name</Label>
              <Input
                id="support-biz"
                value={businessName}
                onChange={(e) => setBusinessName(e.target.value)}
                placeholder="Business name"
                className="h-10"
                required
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="support-name">Contact Name</Label>
              <Input
                id="support-name"
                value={contactName}
                onChange={(e) => setContactName(e.target.value)}
                placeholder="Contact name"
                className="h-10"
                required
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="support-phone">Contact No.</Label>
              <Input
                id="support-phone"
                value={contactNo}
                onChange={(e) => setContactNo(e.target.value)}
                placeholder="10-digit mobile"
                inputMode="tel"
                className="h-10"
                required
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="support-notes">Notes</Label>
              <Textarea
                id="support-notes"
                value={notes}
                onChange={(e) => setNotes(e.target.value)}
                placeholder="Notes"
                rows={3}
              />
            </div>
            <Button
              type="submit"
              disabled={submitting}
              className="w-full h-11 text-sm font-bold bg-blue-600 hover:bg-blue-700 text-white"
            >
              {submitting ? (
                <>
                  <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                  Submitting…
                </>
              ) : (
                "Submit"
              )}
            </Button>
          </form>
        </DialogContent>
      </Dialog>
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
