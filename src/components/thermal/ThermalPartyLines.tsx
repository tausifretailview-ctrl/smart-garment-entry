import React from "react";

/** Prev Bal / Advance rows Trendzo already prints. Same labels on every thermal. */
export function ThermalPartyLines({
  previousBalance = 0,
  unusedAdvance = 0,
  formatMoney,
}: {
  previousBalance?: number;
  unusedAdvance?: number;
  formatMoney: (amount: number) => string;
}) {
  const prev = Number(previousBalance) || 0;
  const adv = Number(unusedAdvance) || 0;
  if (prev <= 0.5 && adv <= 0.5) return null;
  const row: React.CSSProperties = {
    display: "flex",
    justifyContent: "space-between",
    gap: 8,
    fontWeight: 700,
  };
  return (
    <>
      {prev > 0.5 ? (
        <div style={row}>
          <span>Prev Bal</span>
          <span>{formatMoney(prev)}</span>
        </div>
      ) : null}
      {adv > 0.5 ? (
        <div style={row}>
          <span>Advance</span>
          <span>{formatMoney(adv)}</span>
        </div>
      ) : null}
    </>
  );
}
