import { useState } from "react";
import * as DialogPrimitive from "@radix-ui/react-dialog";
import { ArrowRight, Building2, Loader2, X } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { getBundledOrgSlug } from "@/lib/bundledOrg";
import { orgCodeFromInput, storeOrgSlug } from "@/lib/orgSlug";
import { cn } from "@/lib/utils";

/**
 * "Change organisation" on a login page. The app remembers the last shop and always opens its
 * login; in the phone and desktop apps there is no address bar to type another shop's link, so
 * a salesman or owner who works with a second shop (or wants the demo shop) was stuck.
 *
 * Type the organisation code → it is checked → the app remembers it and opens that shop's login.
 * Not shown in an app built for one shop.
 */
export function ChangeOrganization({
  currentName,
  fieldSales = false,
  accent = "blue",
  className,
}: {
  currentName?: string | null;
  /** Open the Field Sales login of the new shop instead of the owner / staff login. */
  fieldSales?: boolean;
  accent?: "blue" | "orange";
  className?: string;
}) {
  const [open, setOpen] = useState(false);
  const [code, setCode] = useState("");
  const [busy, setBusy] = useState(false);
  const [problem, setProblem] = useState("");

  if (getBundledOrgSlug()) return null;

  const tone = accent === "orange" ? "text-orange-600" : "text-[#2957c9]";
  const solid =
    accent === "orange"
      ? "bg-gradient-to-r from-orange-500 to-orange-600 shadow-orange-500/30"
      : "bg-gradient-to-b from-[#2957c9] to-[#1e3a8a] shadow-blue-900/30";
  const ring = accent === "orange" ? "focus:border-orange-400 focus:ring-orange-200" : "focus:border-[#2957c9] focus:ring-blue-200";

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (busy) return;
    const slug = orgCodeFromInput(code);
    if (!slug) {
      setProblem("Enter the organisation code, for example: demo");
      return;
    }
    setBusy(true);
    setProblem("");
    try {
      const { data, error } = await supabase.rpc("get_org_public_info" as never, { p_slug: slug } as never);
      if (error) throw error;
      const found = data as { slug?: string } | null;
      if (!found?.slug) {
        setProblem(`No organisation found with the code “${slug}”. Check the spelling with the shop owner.`);
        return;
      }
      const next = storeOrgSlug(found.slug) ?? slug;
      // A full load, so nothing of the previous shop (logo, name, cached lists) stays on screen.
      window.location.assign(`/${next}${fieldSales ? "/field-sales" : ""}`);
    } catch {
      setProblem("Could not check the code. Check your internet connection and try again.");
    } finally {
      setBusy(false);
    }
  };

  return (
    <DialogPrimitive.Root
      open={open}
      onOpenChange={(next) => {
        setOpen(next);
        if (!next) {
          setCode("");
          setProblem("");
        }
      }}
    >
      <DialogPrimitive.Trigger asChild>
        <button
          type="button"
          className={cn("inline-flex min-h-9 items-center gap-1.5 rounded-full px-3 text-[14px] font-semibold hover:underline", tone, className)}
          data-testid="change-organization"
        >
          <Building2 className="h-4 w-4 shrink-0" />
          Change organisation
        </button>
      </DialogPrimitive.Trigger>
      <DialogPrimitive.Portal>
        <DialogPrimitive.Overlay className="fixed inset-0 z-[100] bg-black/50" />
        <DialogPrimitive.Content
          aria-describedby={undefined}
          data-testid="change-organization-dialog"
          className="fixed inset-x-0 bottom-0 z-[100] rounded-t-3xl bg-white p-5 text-slate-900 shadow-2xl outline-none sm:inset-x-auto sm:bottom-auto sm:left-1/2 sm:top-1/2 sm:w-[420px] sm:-translate-x-1/2 sm:-translate-y-1/2 sm:rounded-2xl"
          style={{ paddingBottom: "calc(env(safe-area-inset-bottom, 0px) + 20px)" }}
        >
          <div className="flex items-start gap-3">
            <div className="min-w-0 flex-1">
              <DialogPrimitive.Title className="text-lg font-bold leading-tight">Change organisation</DialogPrimitive.Title>
              <p className="mt-1 text-sm leading-snug text-slate-500">
                {currentName ? (
                  <>
                    You are on <span className="font-semibold text-slate-700">{currentName}</span>. Enter the code of the
                    organisation you want to sign in to.
                  </>
                ) : (
                  "Enter the code of the organisation you want to sign in to."
                )}
              </p>
            </div>
            <DialogPrimitive.Close
              className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full text-slate-500 hover:bg-slate-100"
              aria-label="Close"
            >
              <X className="h-5 w-5" />
            </DialogPrimitive.Close>
          </div>

          <form onSubmit={submit} className="mt-4 space-y-3">
            <label className="block text-sm font-semibold text-slate-700" htmlFor="change-org-code">
              Organisation code
            </label>
            <input
              id="change-org-code"
              value={code}
              onChange={(e) => {
                setCode(e.target.value);
                setProblem("");
              }}
              placeholder="e.g. demo"
              autoFocus
              autoCapitalize="none"
              autoCorrect="off"
              spellCheck={false}
              enterKeyHint="go"
              className={cn(
                "no-uppercase h-12 w-full rounded-xl border border-slate-300 bg-white px-3.5 text-base text-slate-900 outline-none placeholder:text-slate-400 focus:ring-2",
                ring,
              )}
            />
            <p className="text-xs leading-snug text-slate-500">
              It is the last part of the shop's link, e.g. app.inventoryshop.in/<span className="font-semibold">demo</span>
            </p>
            {problem ? (
              <p className="rounded-xl border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700" role="alert" data-testid="change-organization-error">
                {problem}
              </p>
            ) : null}
            <button
              type="submit"
              disabled={busy || !code.trim()}
              className={cn(
                "flex h-12 w-full items-center justify-center gap-2 rounded-xl text-base font-semibold text-white shadow-md disabled:opacity-50",
                solid,
              )}
            >
              {busy ? <Loader2 className="h-5 w-5 animate-spin" /> : null}
              {busy ? "Checking…" : "Open login"}
              {busy ? null : <ArrowRight className="h-5 w-5" />}
            </button>
          </form>
        </DialogPrimitive.Content>
      </DialogPrimitive.Portal>
    </DialogPrimitive.Root>
  );
}
