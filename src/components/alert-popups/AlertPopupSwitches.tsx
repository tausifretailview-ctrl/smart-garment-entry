import { useEffect, useState } from "react";
import { Switch } from "@/components/ui/switch";
import {
  ALERT_POPUP_KINDS,
  ALERT_POPUP_LABELS,
  loadAlertPopupPrefs,
  onAlertPopupPrefsChange,
  saveAlertPopupPrefs,
  type AlertPopupPrefs,
} from "@/lib/alertPopups";

/** Per-device on/off switches for the small alert pop-ups (all off by default). */
export function AlertPopupSwitches({ orgId, userId }: { orgId: string; userId: string }) {
  const [prefs, setPrefs] = useState<AlertPopupPrefs>(() => loadAlertPopupPrefs(orgId, userId));

  useEffect(() => {
    setPrefs(loadAlertPopupPrefs(orgId, userId));
    return onAlertPopupPrefsChange(() => setPrefs(loadAlertPopupPrefs(orgId, userId)));
  }, [orgId, userId]);

  return (
    <div className="p-3 space-y-1">
      <p className="text-[12px] text-muted-foreground px-1 pb-2">
        Off by default: these alerts are always listed on the Notifications page. Turn one on to
        also get a small pop-up at the bottom right (top on phones), at most once a day and never on
        POS or billing screens. Saved on this device.
      </p>
      {ALERT_POPUP_KINDS.map((kind) => (
        <label
          key={kind}
          className="flex items-center justify-between gap-3 rounded-lg px-2 py-2 hover:bg-muted/60 cursor-pointer"
        >
          <span className="text-[13px] font-medium">{ALERT_POPUP_LABELS[kind]}</span>
          <Switch
            checked={prefs[kind]}
            onCheckedChange={(checked) => {
              const next = { ...prefs, [kind]: checked };
              setPrefs(next);
              saveAlertPopupPrefs(orgId, userId, next);
            }}
          />
        </label>
      ))}
    </div>
  );
}
