import { useMemo } from "react";
import { format } from "date-fns";
import { CartesianGrid, Line, LineChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import type { BulkCampaign } from "./bulkWhatsAppApi";

/** Delivered is sky and Read is emerald, the same as the report tiles (checked for colour-blind separation). */
const SERIES = [
  { key: "delivered", label: "Delivered", color: "#0284c7" },
  { key: "read", label: "Read", color: "#059669" },
] as const;
const SHOWN = 12;

interface Point {
  id: string;
  name: string;
  short: string;
  date: string;
  sent: number;
  delivered: number;
  read: number;
}

const rate = (part: number, whole: number) => (whole > 0 ? Math.round((part / whole) * 100) : 0);

/**
 * Delivered % and Read % (of messages sent) for the latest finished campaigns, oldest on the left,
 * so a shop sees whether its offers are reaching and being opened more or less over time.
 */
export default function BulkWhatsAppTrend({ campaigns }: { campaigns: BulkCampaign[] }) {
  const points = useMemo<Point[]>(
    () =>
      campaigns
        .filter((c) => (c.status === "completed" || c.status === "stopped") && c.sent_count > 0)
        .sort((a, b) => b.created_at.localeCompare(a.created_at))
        .slice(0, SHOWN)
        .reverse()
        .map((c) => ({
          id: c.id,
          name: c.name,
          short: c.name.length > 12 ? `${c.name.slice(0, 11)}…` : c.name,
          date: format(new Date(c.created_at), "dd MMM"),
          sent: c.sent_count,
          delivered: rate(c.delivered_count, c.sent_count),
          read: rate(c.read_count, c.sent_count),
        })),
    [campaigns],
  );
  if (points.length < 2) return null;
  const last = points[points.length - 1];

  return (
    <div className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
      <div className="flex flex-wrap items-start justify-between gap-2">
        <div>
          <div className="text-base font-semibold text-slate-900">How your campaigns did</div>
          <div className="text-xs text-slate-500">Delivered and read, as % of messages sent, last {points.length} campaigns</div>
        </div>
        <div className="flex items-center gap-3 text-xs text-slate-600">
          {SERIES.map((s) => (
            <span key={s.key} className="flex items-center gap-1.5">
              <span className="h-2 w-2 rounded-full" style={{ backgroundColor: s.color }} />
              {s.label} <b className="tabular-nums text-slate-800">{last[s.key]}%</b>
            </span>
          ))}
          <span className="text-slate-400">latest</span>
        </div>
      </div>
      <div className="mt-3 h-56">
        <ResponsiveContainer width="100%" height="100%">
          <LineChart data={points} margin={{ top: 8, right: 12, bottom: 0, left: -12 }}>
            <CartesianGrid stroke="#e2e8f0" strokeDasharray="3 3" vertical={false} />
            <XAxis dataKey="short" tick={{ fontSize: 11, fill: "#64748b" }} tickLine={false} axisLine={{ stroke: "#e2e8f0" }} interval="preserveStartEnd" />
            <YAxis domain={[0, 100]} ticks={[0, 25, 50, 75, 100]} tickFormatter={(v: number) => `${v}%`} tick={{ fontSize: 11, fill: "#64748b" }} tickLine={false} axisLine={false} />
            <Tooltip
              cursor={{ stroke: "#94a3b8", strokeWidth: 1 }}
              content={({ active, payload }) => {
                const p = active ? (payload?.[0]?.payload as Point | undefined) : undefined;
                if (!p) return null;
                return (
                  <div className="rounded-lg border border-slate-200 bg-white px-3 py-2 text-xs shadow-md">
                    <div className="font-semibold text-slate-800">{p.name}</div>
                    <div className="mb-1 text-slate-500">
                      {p.date} · {p.sent.toLocaleString("en-IN")} sent
                    </div>
                    {SERIES.map((s) => (
                      <div key={s.key} className="flex items-center gap-1.5 text-slate-700">
                        <span className="h-2 w-2 rounded-full" style={{ backgroundColor: s.color }} />
                        {s.label} <b className="ml-auto pl-3 tabular-nums">{p[s.key]}%</b>
                      </div>
                    ))}
                  </div>
                );
              }}
            />
            {SERIES.map((s) => (
              <Line
                key={s.key}
                type="monotone"
                dataKey={s.key}
                name={s.label}
                stroke={s.color}
                strokeWidth={2}
                dot={{ r: 4, fill: s.color, stroke: "#fff", strokeWidth: 2 }}
                activeDot={{ r: 5, stroke: "#fff", strokeWidth: 2 }}
                isAnimationActive={false}
              />
            ))}
          </LineChart>
        </ResponsiveContainer>
      </div>
    </div>
  );
}
