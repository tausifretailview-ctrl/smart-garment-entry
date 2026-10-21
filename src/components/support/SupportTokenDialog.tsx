import { useEffect, useState, type FormEvent } from "react";
import { CheckCircle2, Loader2, Ticket } from "lucide-react";
import { toast } from "sonner";
import { useQueryClient } from "@tanstack/react-query";
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
import { cn } from "@/lib/utils";
import {
  SUPPORT_CATEGORIES,
  createSupportToken,
  rememberSupportPhone,
  rememberedSupportPhone,
  type SupportCategory,
} from "@/components/support/supportTokensApi";
import { EZZY_SUPPORT } from "@/components/support/supportContacts";

type SupportTokenDialogProps = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
};

/** "Generate Support Token": the shop types its doubt, gets a token number, and Ezzy's support group is told. */
export function SupportTokenDialog({ open, onOpenChange }: SupportTokenDialogProps) {
  const { currentOrganization } = useOrganization();
  const { user } = useAuth();
  const queryClient = useQueryClient();
  const [contactName, setContactName] = useState("");
  const [contactNo, setContactNo] = useState("");
  const [category, setCategory] = useState<SupportCategory>("technical");
  const [message, setMessage] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [tokenNo, setTokenNo] = useState<number | null>(null);

  useEffect(() => {
    if (!open) return;
    setContactName(
      (user?.user_metadata?.full_name as string | undefined)?.trim() || user?.email?.split("@")[0] || "",
    );
    setContactNo(rememberedSupportPhone());
    setCategory("technical");
    setMessage("");
    setTokenNo(null);
  }, [open, user]);

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    const phone = contactNo.replace(/\D/g, "");
    if (!currentOrganization?.id) {
      toast.error("Select your shop first");
      return;
    }
    if (phone.length < 10) {
      toast.error("Please enter a valid 10-digit contact number");
      return;
    }
    if (message.trim().length < 5) {
      toast.error("Please describe your doubt or issue");
      return;
    }
    setSubmitting(true);
    try {
      const res = await createSupportToken({
        organizationId: currentOrganization.id,
        phone,
        category,
        message: message.trim(),
        userName: contactName.trim(),
        pagePath: window.location.pathname,
      });
      rememberSupportPhone(phone);
      setTokenNo(res.tokenNo);
      void queryClient.invalidateQueries({ queryKey: ["my-support-tokens"] });
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Could not generate the token");
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        {tokenNo !== null ? (
          <div className="flex flex-col items-center text-center gap-3 py-4">
            <CheckCircle2 className="h-12 w-12 text-emerald-500" />
            <DialogHeader className="space-y-1 text-center sm:text-center">
              <DialogTitle className="text-lg font-bold text-slate-800">Token generated</DialogTitle>
              <DialogDescription className="text-sm text-slate-500">
                Our technical team has been informed and will contact you on {contactNo} shortly.
              </DialogDescription>
            </DialogHeader>
            <div className="rounded-xl border-2 border-dashed border-violet-300 bg-violet-50 px-6 py-3">
              <p className="text-xs font-medium uppercase tracking-wide text-violet-600">Your token number</p>
              <p className="text-3xl font-bold text-violet-800">#{tokenNo}</p>
            </div>
            <p className="text-xs text-slate-500">
              Keep this number for reference. Support hours: {EZZY_SUPPORT.hours}
            </p>
            <Button type="button" className="w-full h-10 mt-1" onClick={() => onOpenChange(false)}>
              Done
            </Button>
          </div>
        ) : (
          <>
            <DialogHeader className="text-center sm:text-center space-y-1">
              <DialogTitle className="text-lg font-bold text-slate-800">Generate Support Token</DialogTitle>
              <DialogDescription className="text-sm text-slate-500">
                Tell us your doubt or problem. Our technical engineer will contact you, no call needed.
              </DialogDescription>
            </DialogHeader>
            <form onSubmit={submit} className="space-y-3 pt-1">
              <div className="space-y-1.5">
                <Label>Type</Label>
                <div className="grid grid-cols-2 gap-2">
                  {(Object.keys(SUPPORT_CATEGORIES) as SupportCategory[]).map((key) => (
                    <button
                      key={key}
                      type="button"
                      onClick={() => setCategory(key)}
                      className={cn(
                        "rounded-lg border px-3 py-2 text-sm font-medium transition-colors",
                        category === key
                          ? "border-violet-500 bg-violet-50 text-violet-800"
                          : "border-slate-200 bg-white text-slate-600 hover:border-violet-300",
                      )}
                    >
                      {SUPPORT_CATEGORIES[key]}
                    </button>
                  ))}
                </div>
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="support-token-message">Your doubt / issue</Label>
                <Textarea
                  id="support-token-message"
                  value={message}
                  onChange={(e) => setMessage(e.target.value)}
                  placeholder="e.g. Bill print is not coming on thermal printer since morning"
                  rows={4}
                  maxLength={2000}
                  required
                />
              </div>
              <div className="grid grid-cols-2 gap-2">
                <div className="space-y-1.5">
                  <Label htmlFor="support-token-name">Your name</Label>
                  <Input
                    id="support-token-name"
                    value={contactName}
                    onChange={(e) => setContactName(e.target.value)}
                    placeholder="Name"
                    className="h-10"
                  />
                </div>
                <div className="space-y-1.5">
                  <Label htmlFor="support-token-phone">Contact No.</Label>
                  <Input
                    id="support-token-phone"
                    value={contactNo}
                    onChange={(e) => setContactNo(e.target.value)}
                    placeholder="10-digit mobile"
                    inputMode="tel"
                    className="h-10"
                    required
                  />
                </div>
              </div>
              <p className="text-xs text-slate-500">
                Shop: <span className="font-medium text-slate-700">{currentOrganization?.name || "—"}</span>
              </p>
              <Button
                type="submit"
                disabled={submitting}
                className="w-full h-11 text-sm font-bold bg-violet-600 hover:bg-violet-700 text-white gap-2"
              >
                {submitting ? <Loader2 className="h-4 w-4 animate-spin" /> : <Ticket className="h-4 w-4" />}
                {submitting ? "Generating…" : "Generate Token"}
              </Button>
            </form>
          </>
        )}
      </DialogContent>
    </Dialog>
  );
}
