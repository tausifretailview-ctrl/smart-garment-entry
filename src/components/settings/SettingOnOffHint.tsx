type SettingOnOffHintProps = {
  on: string;
  off: string;
  active: "on" | "off";
};

/** Staff-facing On/Off effect lines. Does not change saved values. */
export function SettingOnOffHint({ on, off, active }: SettingOnOffHintProps) {
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
