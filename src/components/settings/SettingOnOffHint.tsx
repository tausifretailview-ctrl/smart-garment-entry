type SettingOnOffHintProps = {
  on: string;
  off: string;
  active: "on" | "off";
  /** Only the line for the current state (used in compact switch cards). */
  compact?: boolean;
};

/** Staff-facing On/Off effect lines. Does not change saved values. */
export function SettingOnOffHint({ on, off, active, compact }: SettingOnOffHintProps) {
  if (compact) {
    return (
      <p className={active === "on" ? "mt-1 text-xs leading-snug text-blue-700" : "mt-1 text-xs leading-snug text-slate-500"}>
        <span className="font-semibold">{active === "on" ? "On:" : "Off:"}</span> {active === "on" ? on : off}
      </p>
    );
  }
  return (
    <div className="mt-1.5 space-y-0.5 text-xs leading-snug">
      <p className={active === "on" ? "text-blue-600 font-medium" : "text-muted-foreground"}>
        <span className="font-semibold">On:</span> {on}
      </p>
      <p className={active === "off" ? "text-green-700 font-medium" : "text-muted-foreground"}>
        <span className="font-semibold">Off:</span> {off}
      </p>
    </div>
  );
}
