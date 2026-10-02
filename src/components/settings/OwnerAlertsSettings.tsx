import { useCallback, useEffect, useState } from "react";
import { toast } from "sonner";
import { useOrganization } from "@/contexts/OrganizationContext";
import { useAuth } from "@/contexts/AuthContext";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Switch } from "@/components/ui/switch";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { SettingsRow, SettingsSection } from "@/components/settings/settingsLayout";
import {
  clearOwnerInvoiceAlertCache,
  disableOwnerAlertsOnThisPhone,
  enableOwnerAlertsOnThisPhone,
  isOwnerPushSupported,
  ownerAlertsDb,
  sendOwnerTestAlert,
  ownerAlertErrorText,
  thisPhoneHasOwnerAlerts,
} from "@/lib/ownerPush";

type InvoiceMode = "off" | "all" | "above";

interface AlertSettings {
  enabled: boolean;
  cashier_enabled: boolean;
  cashier_every_hours: number;
  shop_open: string;
  shop_close: string;
  low_stock_enabled: boolean;
  low_stock_times: string[];
  low_stock_threshold: number;
  invoice_mode: InvoiceMode;
  invoice_min_amount: number;
  day_end_enabled: boolean;
  day_end_time: string;
}

const DEFAULTS: AlertSettings = {
  enabled: false,
  cashier_enabled: true,
  cashier_every_hours: 2,
  shop_open: "10:00",
  shop_close: "22:00",
  low_stock_enabled: true,
  low_stock_times: ["10:30", "17:00"],
  low_stock_threshold: 5,
  invoice_mode: "off",
  invoice_min_amount: 0,
  day_end_enabled: true,
  day_end_time: "22:15",
};

interface Device {
  id: string;
  user_id: string;
  platform: string;
  status: string;
  last_seen_at: string;
}

/** Settings → POS: owner phone alerts (Android app). Saved on its own button, not the page Save. */
export function OwnerAlertsSettings() {
  const { currentOrganization, organizationRole } = useOrganization();
  const { user } = useAuth();
  const orgId = currentOrganization?.id;
  const isAdmin = organizationRole === "admin";
  const [form, setForm] = useState<AlertSettings>(DEFAULTS);
  const [devices, setDevices] = useState<Device[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [phoneBusy, setPhoneBusy] = useState(false);
  const [phoneOn, setPhoneOn] = useState(thisPhoneHasOwnerAlerts());
  const nativeApp = isOwnerPushSupported();

  const load = useCallback(async () => {
    if (!orgId) return;
    setLoading(true);
    try {
      const [{ data: row }, { data: devs }] = await Promise.all([
        ownerAlertsDb.from("owner_alert_settings").select("*").eq("organization_id", orgId).maybeSingle(),
        ownerAlertsDb
          .from("owner_push_devices")
          .select("id, user_id, platform, status, last_seen_at")
          .eq("organization_id", orgId)
          .order("last_seen_at", { ascending: false }),
      ]);
      if (row) {
        setForm({
          ...DEFAULTS,
          ...row,
          invoice_mode: (["off", "all", "above"].includes(row.invoice_mode) ? row.invoice_mode : "off") as InvoiceMode,
          invoice_min_amount: Number(row.invoice_min_amount) || 0,
        });
      }
      setDevices((devs ?? []) as Device[]);
    } finally {
      setLoading(false);
    }
  }, [orgId]);

  useEffect(() => {
    void load();
  }, [load]);

  const set = <K extends keyof AlertSettings>(key: K, value: AlertSettings[K]) =>
    setForm((f) => ({ ...f, [key]: value }));

  const save = async () => {
    if (!orgId) return;
    setSaving(true);
    try {
      const { error } = await ownerAlertsDb.from("owner_alert_settings").upsert({
        organization_id: orgId,
        ...form,
        low_stock_times: form.low_stock_times.filter((t) => /^\d{2}:\d{2}$/.test(t)),
        updated_at: new Date().toISOString(),
        updated_by: user?.id ?? null,
      });
      if (error) throw error;
      clearOwnerInvoiceAlertCache(orgId);
      toast.success("Owner alerts saved");
    } catch (e) {
      toast.error("Could not save owner alerts", { description: e instanceof Error ? e.message : String(e) });
    } finally {
      setSaving(false);
    }
  };

  const turnOnThisPhone = async () => {
    if (!orgId || !user?.id) return;
    setPhoneBusy(true);
    try {
      await enableOwnerAlertsOnThisPhone(orgId, user.id);
      setPhoneOn(true);
      toast.success("This phone will get owner alerts");
      void load();
    } catch (e) {
      toast.error("Could not turn on alerts", { description: e instanceof Error ? e.message : String(e) });
    } finally {
      setPhoneBusy(false);
    }
  };

  const turnOffThisPhone = async () => {
    if (!orgId) return;
    setPhoneBusy(true);
    try {
      await disableOwnerAlertsOnThisPhone(orgId);
      setPhoneOn(false);
      void load();
    } finally {
      setPhoneBusy(false);
    }
  };

  const removeDevice = async (id: string) => {
    await ownerAlertsDb.from("owner_push_devices").delete().eq("id", id);
    void load();
  };

  const test = async () => {
    if (!orgId) return;
    if (activeDevices.length === 0) {
      toast.warning("No phone added yet", {
        description:
          "On the owner's phone, open the EzzyERP Android app, log in, go to Settings → POS → Owner alerts and tap \"Turn on alerts on this phone\".",
      });
      return;
    }
    try {
      const r = await sendOwnerTestAlert(orgId);
      if (r.sent > 0) toast.success(`Test alert sent to ${r.sent} phone${r.sent === 1 ? "" : "s"}`);
      else toast.warning("No phone received it", { description: "Turn on alerts in the EzzyERP Android app first." });
    } catch (e) {
      toast.error("Test alert failed", { description: ownerAlertErrorText(e) });
    }
  };

  const disabled = !isAdmin || loading;
  const activeDevices = devices.filter((d) => d.status === "active");

  return (
    <SettingsSection title="Owner alerts (mobile app)" subtitle="Cashier report, low stock, bills and day-end on the owner's phone">
      <SettingsRow label="This phone" description={nativeApp ? "Get alerts on this phone, even when the app is closed." : "Open EzzyERP in the Android app on the owner's phone to turn alerts on there."}>
        {nativeApp ? (
          phoneOn ? (
            <Button size="sm" variant="outline" disabled={phoneBusy} onClick={() => void turnOffThisPhone()}>
              Turn off on this phone
            </Button>
          ) : (
            <Button size="sm" disabled={phoneBusy} onClick={() => void turnOnThisPhone()}>
              Turn on alerts on this phone
            </Button>
          )
        ) : (
          <span className="text-xs text-muted-foreground">Android app only</span>
        )}
      </SettingsRow>

      <SettingsRow label="Phones receiving alerts" description={activeDevices.length ? undefined : "No phone yet."}>
        <div className="flex flex-col items-end gap-1">
          {activeDevices.map((d) => (
            <div key={d.id} className="flex items-center gap-2 text-xs">
              <span>
                {d.platform} · {d.user_id === user?.id ? "you" : "staff"} · seen {new Date(d.last_seen_at).toLocaleDateString("en-IN")}
              </span>
              {(isAdmin || d.user_id === user?.id) && (
                <Button size="sm" variant="ghost" className="h-6 px-2" onClick={() => void removeDevice(d.id)}>
                  Remove
                </Button>
              )}
            </div>
          ))}
          <Button size="sm" variant="outline" className="h-7" onClick={() => void test()}>
            Send test alert
          </Button>
        </div>
      </SettingsRow>

      <SettingsRow label="Owner alerts" description={isAdmin ? "Master switch for this shop." : "Only an admin can change these."}>
        <Switch checked={form.enabled} disabled={disabled} onCheckedChange={(v) => set("enabled", v)} />
      </SettingsRow>

      <SettingsRow label="Cashier report" description="Sales, cash, UPI, card, due and returns so far today.">
        <div className="flex items-center gap-2">
          <Select
            value={String(form.cashier_every_hours)}
            disabled={disabled}
            onValueChange={(v) => set("cashier_every_hours", Number(v))}
          >
            <SelectTrigger className="h-8 w-[130px]">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="2">Every 2 hours</SelectItem>
              <SelectItem value="3">Every 3 hours</SelectItem>
            </SelectContent>
          </Select>
          <Switch checked={form.cashier_enabled} disabled={disabled} onCheckedChange={(v) => set("cashier_enabled", v)} />
        </div>
      </SettingsRow>

      <SettingsRow label="Shop hours" description="Cashier reports are sent only between these times (IST).">
        <div className="flex items-center gap-1">
          <Input type="time" className="h-8 w-[110px]" value={form.shop_open} disabled={disabled} onChange={(e) => set("shop_open", e.target.value)} />
          <span className="text-xs">to</span>
          <Input type="time" className="h-8 w-[110px]" value={form.shop_close} disabled={disabled} onChange={(e) => set("shop_close", e.target.value)} />
        </div>
      </SettingsRow>

      <SettingsRow label="Low stock alert" description="Products at or below this stock, at these times.">
        <div className="flex items-center gap-1">
          <Input
            type="number"
            min={0}
            className="h-8 w-[70px]"
            value={form.low_stock_threshold}
            disabled={disabled}
            onChange={(e) => set("low_stock_threshold", Math.max(0, Number(e.target.value) || 0))}
          />
          {[0, 1].map((i) => (
            <Input
              key={i}
              type="time"
              className="h-8 w-[110px]"
              value={form.low_stock_times[i] ?? ""}
              disabled={disabled}
              onChange={(e) => {
                const next = [...form.low_stock_times];
                next[i] = e.target.value;
                set("low_stock_times", next.filter(Boolean));
              }}
            />
          ))}
          <Switch checked={form.low_stock_enabled} disabled={disabled} onCheckedChange={(v) => set("low_stock_enabled", v)} />
        </div>
      </SettingsRow>

      <SettingsRow label="Bill alert" description="A message for each new bill, or only big ones.">
        <div className="flex items-center gap-1">
          <Select value={form.invoice_mode} disabled={disabled} onValueChange={(v) => set("invoice_mode", v as InvoiceMode)}>
            <SelectTrigger className="h-8 w-[140px]">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="off">Off</SelectItem>
              <SelectItem value="all">Every bill</SelectItem>
              <SelectItem value="above">Bills above ₹</SelectItem>
            </SelectContent>
          </Select>
          {form.invoice_mode === "above" && (
            <Input
              type="number"
              min={0}
              className="h-8 w-[100px]"
              value={form.invoice_min_amount}
              disabled={disabled}
              onChange={(e) => set("invoice_min_amount", Math.max(0, Number(e.target.value) || 0))}
            />
          )}
        </div>
      </SettingsRow>

      <SettingsRow label="Day-end summary" description="The full day's totals at this time (IST).">
        <div className="flex items-center gap-2">
          <Input type="time" className="h-8 w-[110px]" value={form.day_end_time} disabled={disabled} onChange={(e) => set("day_end_time", e.target.value)} />
          <Switch checked={form.day_end_enabled} disabled={disabled} onCheckedChange={(v) => set("day_end_enabled", v)} />
        </div>
      </SettingsRow>

      {isAdmin && (
        <div className="flex justify-end px-3 py-2">
          <Button size="sm" disabled={saving || loading} onClick={() => void save()}>
            Save owner alerts
          </Button>
        </div>
      )}
    </SettingsSection>
  );
}
