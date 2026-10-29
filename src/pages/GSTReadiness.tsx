import { useEffect, useMemo, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { AlertTriangle, ArrowLeft, CheckCircle2, ChevronDown, ClipboardCheck, RefreshCw, XCircle } from "lucide-react";
import { cn } from "@/lib/utils";
import { useOrganization } from "@/contexts/OrganizationContext";
import { useOrgNavigation } from "@/hooks/useOrgNavigation";
import { useToast } from "@/hooks/use-toast";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";
import { loadGstReadiness } from "@/utils/gstReadinessData";
import {
  checkGstReadiness,
  withGstFilingPrefs,
  type GstFilingPrefs,
  type GstFilingScheme,
  type ReadinessLevel,
  type ReadinessSection,
} from "@/utils/gstReadiness";

// Same look as GST Analysis: coloured summary band, white cards.
const CARD = "rounded-lg border border-slate-200 bg-white shadow-sm";
const CARD_TITLE = "text-base font-bold text-slate-800 leading-tight flex items-center gap-2";

const LEVEL_STYLE: Record<ReadinessLevel, { band: string; pill: string; label: string; Icon: typeof CheckCircle2 }> = {
  ok: { band: "bg-gradient-to-br from-emerald-600 to-teal-600", pill: "bg-emerald-100 text-emerald-800 border-emerald-200", label: "OK", Icon: CheckCircle2 },
  warn: { band: "bg-gradient-to-br from-amber-500 to-orange-600", pill: "bg-amber-100 text-amber-900 border-amber-200", label: "Check", Icon: AlertTriangle },
  block: { band: "bg-gradient-to-br from-rose-600 to-red-700", pill: "bg-rose-100 text-rose-800 border-rose-200", label: "Fix first", Icon: XCircle },
};

const SCHEME_OPTIONS: Array<{ value: GstFilingScheme; title: string; help: string }> = [
  { value: "regular", title: "Regular (monthly)", help: "GSTR-1 by the 11th, GSTR-3B by the 20th of every month." },
  { value: "qrmp", title: "QRMP (quarterly)", help: "Turnover up to ₹5 crore. Returns every quarter, tax paid monthly by the 25th." },
  { value: "composition", title: "Composition", help: "CMP-08 every quarter and GSTR-4 yearly. No GSTR-1 / 3B." },
];

function LevelPill({ level }: { level: ReadinessLevel }) {
  const s = LEVEL_STYLE[level];
  return (
    <span className={cn("inline-flex items-center gap-1 rounded-full border px-2 py-0.5 text-xs font-bold", s.pill)}>
      <s.Icon className="h-3.5 w-3.5" />
      {s.label}
    </span>
  );
}

function SectionCard({ section, onFix }: { section: ReadinessSection; onFix: (path: string) => void }) {
  const [open, setOpen] = useState(false);
  return (
    <Card className={cn(CARD, section.level === "block" && "border-rose-200", section.level === "warn" && "border-amber-200")}>
      <CardHeader className="px-4 py-3 space-y-1">
        <div className="flex flex-wrap items-start justify-between gap-2">
          <CardTitle className={CARD_TITLE}>
            {section.title}
            <LevelPill level={section.level} />
          </CardTitle>
          {section.fixPath && section.level !== "ok" && (
            <Button size="sm" variant="outline" className="h-8" onClick={() => onFix(section.fixPath!)}>
              {section.fixLabel || "Fix"}
            </Button>
          )}
        </div>
        <CardDescription className="text-sm text-slate-700">{section.summary}</CardDescription>
        {section.detail && <p className="text-xs text-slate-500">{section.detail}</p>}
      </CardHeader>
      {section.items.length > 0 && (
        <CardContent className="px-4 pb-3 pt-0">
          <Collapsible open={open} onOpenChange={setOpen}>
            <CollapsibleTrigger asChild>
              <button type="button" className="flex items-center gap-1 text-xs font-semibold text-teal-700 hover:underline">
                <ChevronDown className={cn("h-3.5 w-3.5 transition-transform", open && "rotate-180")} />
                {open ? "Hide list" : `Show list (${section.items.length}${section.items.length >= 300 ? "+" : ""})`}
              </button>
            </CollapsibleTrigger>
            <CollapsibleContent>
              <ul className="mt-2 max-h-64 overflow-y-auto divide-y divide-slate-100 rounded-md border border-slate-200 text-sm">
                {section.items.map((item, i) => (
                  <li key={`${item.label}-${i}`} className="flex flex-wrap justify-between gap-x-3 px-3 py-1.5">
                    <span className="font-medium text-slate-800 break-words">{item.label}</span>
                    {item.note && <span className="text-xs text-slate-500">{item.note}</span>}
                  </li>
                ))}
              </ul>
            </CollapsibleContent>
          </Collapsible>
        </CardContent>
      )}
    </Card>
  );
}

const GSTReadiness = () => {
  const { currentOrganization } = useOrganization();
  const { orgNavigate } = useOrgNavigation();
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const orgId = currentOrganization?.id;

  const query = useQuery({
    queryKey: ["gst-readiness", orgId],
    queryFn: () => loadGstReadiness(orgId!),
    enabled: !!orgId,
    staleTime: 60_000,
    refetchOnWindowFocus: false,
  });
  const data = query.data;

  const [prefs, setPrefs] = useState<GstFilingPrefs | null>(null);
  const [saving, setSaving] = useState(false);
  useEffect(() => {
    if (data) setPrefs(data.prefs);
  }, [data]);

  const readiness = useMemo(
    () => (data && prefs ? checkGstReadiness({ ...data, prefs }) : null),
    [data, prefs],
  );

  const handleBack = () => {
    if (typeof window !== "undefined" && window.history.length > 1) window.history.back();
    else orgNavigate("/reports");
  };

  const savePrefs = async () => {
    if (!orgId || !prefs || !data) return;
    setSaving(true);
    try {
      const { error } = await supabase
        .from("settings")
        .update({ report_settings: withGstFilingPrefs(data.reportSettings, prefs) as any })
        .eq("organization_id", orgId);
      if (error) throw error;
      void queryClient.invalidateQueries({ queryKey: ["org-settings", orgId] });
      void queryClient.invalidateQueries({ queryKey: ["gst-readiness", orgId] });
      toast({ title: "Saved", description: "GST filing preferences updated." });
    } catch (error) {
      const message = (error as { message?: string } | null)?.message || String(error);
      toast({ title: "Could not save", description: message, variant: "destructive" });
    } finally {
      setSaving(false);
    }
  };

  const prefsDirty = !!data && !!prefs && JSON.stringify(prefs) !== JSON.stringify(data.prefs);
  const band = readiness ? LEVEL_STYLE[readiness.level] : LEVEL_STYLE.ok;
  const headline = !readiness
    ? "Checking…"
    : readiness.level === "block"
      ? `${readiness.blockers} thing${readiness.blockers === 1 ? "" : "s"} to fix before this shop can file`
      : readiness.level === "warn"
        ? `Ready to file, with ${readiness.warnings} thing${readiness.warnings === 1 ? "" : "s"} to check`
        : "Ready to file GST returns from Ezzy ERP";

  return (
    <div className="business-insights-workspace flex flex-col bg-slate-50 px-2 sm:px-3 py-2 min-h-0 h-full overflow-hidden w-full">
      <div className="w-full min-w-0 flex flex-col flex-1 min-h-0 gap-2 overflow-y-auto">
        <div className="flex flex-wrap items-center justify-between gap-2 shrink-0">
          <div className="flex items-center gap-2 min-w-0">
            <Button variant="outline" size="sm" className="h-9 px-3 text-sm shrink-0" onClick={handleBack}>
              <ArrowLeft className="h-4 w-4 mr-1" />
              Back
            </Button>
            <div className="min-w-0">
              <h1 className="text-xl font-bold text-teal-700 tracking-tight leading-none flex items-center gap-2">
                <ClipboardCheck className="h-5 w-5 shrink-0" />
                GST Readiness
              </h1>
              <p className="text-sm text-muted-foreground mt-1 truncate">
                Is this shop's data complete enough to file GSTR-1 and GSTR-3B without an accountant?
              </p>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <Button variant="outline" size="sm" className="h-9 gap-2" onClick={() => orgNavigate("/gst-reports")}>
              GST Reports
            </Button>
            <Button variant="outline" size="sm" className="h-9 gap-2" onClick={() => { void query.refetch(); }} disabled={query.isFetching}>
              <RefreshCw className={cn("h-4 w-4", query.isFetching && "animate-spin")} />
              Re-check
            </Button>
          </div>
        </div>

        {query.error && (
          <div className="rounded-lg border border-rose-200 bg-rose-50 px-3 py-2 text-sm text-rose-800 shrink-0">
            Could not load the check: {(query.error as { message?: string }).message || String(query.error)}
          </div>
        )}

        <div className={cn("rounded-lg px-4 py-3 text-white shadow-sm shrink-0", band.band)}>
          <p className="text-xs font-medium text-white/80">{data?.businessName || currentOrganization?.name || "This shop"}</p>
          <p className="text-lg sm:text-xl font-black leading-tight mt-0.5">{headline}</p>
          {readiness && (
            <p className="text-xs text-white/80 mt-1">
              {readiness.sections.filter((s) => s.level === "ok").length} of {readiness.sections.length} checks pass. Fix the red
              items, re-check, then download the GSTR-1 file from GST Reports.
            </p>
          )}
        </div>

        <Card className={cn(CARD, "shrink-0")}>
          <CardHeader className="px-4 py-3 space-y-1">
            <CardTitle className={CARD_TITLE}>Filing preferences</CardTitle>
            <CardDescription className="text-xs">
              Saved per shop. They set the GSTR-1 file period, the HSN rule and who gets the OTP.
            </CardDescription>
          </CardHeader>
          <CardContent className="px-4 pb-4 pt-0 space-y-4">
            {prefs ? (
              <>
                <div className="space-y-2">
                  <Label className="text-xs font-semibold uppercase tracking-wide text-slate-500">How does this shop file GST?</Label>
                  <RadioGroup
                    value={prefs.scheme ?? ""}
                    onValueChange={(v) => setPrefs({ ...prefs, scheme: v as GstFilingScheme })}
                    className="grid gap-2 sm:grid-cols-3"
                  >
                    {SCHEME_OPTIONS.map((opt) => (
                      <label
                        key={opt.value}
                        htmlFor={`gst-scheme-${opt.value}`}
                        className={cn(
                          "flex items-start gap-2 rounded-md border px-3 py-2 cursor-pointer",
                          prefs.scheme === opt.value ? "border-teal-500 bg-teal-50" : "border-slate-200 hover:bg-slate-50",
                        )}
                      >
                        <RadioGroupItem id={`gst-scheme-${opt.value}`} value={opt.value} className="mt-0.5" />
                        <span>
                          <span className="block text-sm font-semibold text-slate-800">{opt.title}</span>
                          <span className="block text-xs text-slate-500">{opt.help}</span>
                        </span>
                      </label>
                    ))}
                  </RadioGroup>
                </div>

                <div className="grid gap-3 sm:grid-cols-2">
                  <label htmlFor="gst-under-5cr" className="flex items-start justify-between gap-3 rounded-md border border-slate-200 px-3 py-2 cursor-pointer">
                    <span>
                      <span className="block text-sm font-semibold text-slate-800">Turnover under ₹5 crore</span>
                      <span className="block text-xs text-slate-500">4-digit HSN is enough and HSN is optional on retail bills. Switch off above ₹5 crore (6-digit HSN everywhere, e-invoicing).</span>
                    </span>
                    <Switch
                      id="gst-under-5cr"
                      checked={prefs.turnoverUnder5Cr}
                      onCheckedChange={(v) => setPrefs({ ...prefs, turnoverUnder5Cr: v })}
                    />
                  </label>
                  <div className="space-y-1">
                    <Label htmlFor="gst-signatory" className="text-sm font-semibold text-slate-800">Who files (authorised signatory)</Label>
                    <Input
                      id="gst-signatory"
                      value={prefs.signatoryName}
                      onChange={(e) => setPrefs({ ...prefs, signatoryName: e.target.value })}
                      placeholder="Name whose mobile / email gets the OTP"
                      className="h-9"
                    />
                  </div>
                </div>

                <div className="flex justify-end">
                  <Button onClick={() => { void savePrefs(); }} disabled={!prefsDirty || saving} className="bg-teal-600 hover:bg-teal-700 text-white">
                    {saving ? "Saving…" : "Save preferences"}
                  </Button>
                </div>
              </>
            ) : (
              <p className="text-sm text-muted-foreground">Loading…</p>
            )}
          </CardContent>
        </Card>

        {readiness && (
          <div className="grid gap-2 lg:grid-cols-2 pb-2">
            {readiness.sections.map((section) => (
              <SectionCard key={section.key} section={section} onFix={(path) => orgNavigate(path)} />
            ))}
          </div>
        )}
        {!readiness && !query.error && (
          <p className="text-sm text-muted-foreground px-1">Loading products, customers, suppliers and last month's bills…</p>
        )}
      </div>
    </div>
  );
};

export default GSTReadiness;
