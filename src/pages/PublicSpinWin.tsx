import { useEffect, useMemo, useRef, useState } from "react";
import { useParams } from "react-router-dom";
import { Download, Gift, Loader2, PartyPopper } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { SpinWheel } from "@/components/spin/SpinWheel";
import {
  parsePublicSpin,
  parseSpinOutcome,
  spinPrizeDescription,
  spinTargetRotation,
  type PublicSpinResult,
  type PublicSpinView,
} from "@/lib/spinAndWin";

type RpcClient = { rpc: (fn: string, args: Record<string, unknown>) => PromiseLike<{ data: unknown; error: { message: string } | null }> };
const rpc = supabase as unknown as RpcClient;

function fmtDate(iso: string | null): string {
  if (!iso) return "";
  const d = new Date(iso);
  return Number.isNaN(d.getTime()) ? "" : d.toLocaleDateString("en-IN", { day: "2-digit", month: "short", year: "numeric" });
}

/** Coupon card the customer keeps (and can save as a picture). */
function PrizeCard({ view, result }: { view: PublicSpinView; result: PublicSpinResult }) {
  const won = result.status !== "lost" && !!result.code;
  const save = () => {
    const c = document.createElement("canvas");
    c.width = 720;
    c.height = 400;
    const g = c.getContext("2d");
    if (!g) return;
    g.fillStyle = "#FFF7ED";
    g.fillRect(0, 0, 720, 400);
    g.strokeStyle = "#F97316";
    g.lineWidth = 8;
    g.setLineDash([18, 10]);
    g.strokeRect(16, 16, 688, 368);
    g.fillStyle = "#9A3412";
    g.font = "bold 34px Arial";
    g.textAlign = "center";
    g.fillText(view.shopName, 360, 80);
    g.fillStyle = "#111827";
    g.font = "bold 44px Arial";
    g.fillText(spinPrizeDescription({ ...result, prize_type: result.type }), 360, 160);
    g.font = "bold 56px monospace";
    g.fillStyle = "#EA580C";
    g.fillText(result.code ?? "", 360, 250);
    g.font = "24px Arial";
    g.fillStyle = "#374151";
    g.fillText(`Valid till ${fmtDate(result.expires_at)} · Show this code at the counter`, 360, 320);
    const a = document.createElement("a");
    a.href = c.toDataURL("image/png");
    a.download = `${result.code}.png`;
    a.click();
  };
  if (!won) {
    return (
      <div className="rounded-2xl bg-white/90 p-5 text-center shadow" data-testid="spin-result">
        <p className="text-xl font-bold text-slate-800">{result.label}</p>
        <p className="mt-1 text-sm text-slate-600">Thank you for shopping with {view.shopName}. Better luck on your next bill!</p>
      </div>
    );
  }
  return (
    <div className="rounded-2xl border-4 border-dashed border-orange-400 bg-orange-50 p-5 text-center shadow-lg" data-testid="spin-result">
      <p className="flex items-center justify-center gap-2 text-sm font-semibold text-orange-700">
        <PartyPopper className="h-5 w-5" /> You won
      </p>
      <p className="mt-1 text-2xl font-extrabold text-slate-900">{spinPrizeDescription({ ...result, prize_type: result.type })}</p>
      <p className="mt-3 text-xs uppercase tracking-wider text-slate-500">Your code</p>
      <p className="font-mono text-3xl font-black tracking-widest text-orange-600" data-testid="spin-code">{result.code}</p>
      <p className="mt-2 text-sm text-slate-700">
        Show this code at the counter on your next bill{result.expires_at ? ` · valid till ${fmtDate(result.expires_at)}` : ""}.
      </p>
      {result.status === "redeemed" ? <p className="mt-2 text-sm font-semibold text-green-700">Already used. Thank you!</p> : null}
      <button
        type="button"
        onClick={save}
        className="mt-4 inline-flex items-center gap-2 rounded-full bg-orange-500 px-5 py-2.5 text-sm font-bold text-white active:bg-orange-600"
      >
        <Download className="h-4 w-4" /> Save coupon
      </button>
    </div>
  );
}

/**
 * /spin/<bill id>: the customer's Spin & Win page from the POS bill's WhatsApp message.
 * The server decides the prize (spin_for_sale); the wheel only turns to it.
 */
export default function PublicSpinWin() {
  const { saleId = "" } = useParams<{ saleId: string }>();
  const [view, setView] = useState<PublicSpinView | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [rotation, setRotation] = useState(0);
  const [spinning, setSpinning] = useState(false);
  const [result, setResult] = useState<PublicSpinResult | null>(null);
  const [showResult, setShowResult] = useState(false);
  const busy = useRef(false);

  useEffect(() => {
    let cancelled = false;
    void rpc.rpc("get_public_spin", { p_sale_id: saleId }).then(({ data, error: e }) => {
      if (cancelled) return;
      if (e) {
        setError("This link is not valid.");
        return;
      }
      const v = parsePublicSpin(data);
      if ("error" in v) setError(v.error);
      else {
        setView(v);
        if (v.result) {
          setResult(v.result);
          setShowResult(true);
          const i = v.prizes.findIndex((p) => p.id === v.result?.prize_id);
          if (i >= 0) setRotation(spinTargetRotation(i, v.prizes.length, 0));
        }
      }
    });
    return () => {
      cancelled = true;
    };
  }, [saleId]);

  const slices = useMemo(() => view?.prizes ?? [], [view]);

  const spin = async () => {
    if (!view || busy.current || result) return;
    busy.current = true;
    const { data, error: e } = await rpc.rpc("spin_for_sale", { p_sale_id: saleId });
    const out = e ? { error: "Could not spin. Please try again." } : parseSpinOutcome(data);
    if ("error" in out) {
      setError(out.error);
      busy.current = false;
      return;
    }
    const i = Math.max(0, slices.findIndex((p) => p.id === out.prize_id));
    setResult(out);
    setSpinning(true);
    setRotation(spinTargetRotation(i, slices.length));
  };

  if (error && !view) {
    return (
      <div className="flex min-h-[100dvh] items-center justify-center bg-gradient-to-b from-orange-500 to-rose-600 p-6 text-center text-white">
        <div>
          <Gift className="mx-auto h-12 w-12 opacity-80" />
          <p className="mt-3 text-lg font-bold" data-testid="spin-error">{error}</p>
        </div>
      </div>
    );
  }
  if (!view) {
    return (
      <div className="flex min-h-[100dvh] items-center justify-center bg-gradient-to-b from-orange-500 to-rose-600 text-white">
        <Loader2 className="h-8 w-8 animate-spin" />
      </div>
    );
  }

  const canSpin = !view.blocked && !result && !spinning;
  return (
    <div className="min-h-[100dvh] bg-gradient-to-b from-orange-500 via-orange-500 to-rose-600 px-4 pb-10 pt-6 text-white" data-testid="public-spin-page">
      <div className="mx-auto max-w-md text-center">
        {view.logoUrl ? <img src={view.logoUrl} alt="" className="mx-auto h-14 w-14 rounded-full bg-white object-contain p-1" /> : null}
        <p className="mt-2 text-sm font-semibold opacity-90">{view.shopName}</p>
        <h1 className="mt-1 text-3xl font-black tracking-tight drop-shadow">{view.title}</h1>
        <p className="text-xs opacity-80">Bill {view.saleNumber}</p>

        <div className="mt-6">
          <SpinWheel
            slices={slices}
            rotation={rotation}
            spinning={spinning}
            size={Math.min(320, typeof window !== "undefined" ? window.innerWidth - 40 : 320)}
            onSpinEnd={() => {
              setSpinning(false);
              setShowResult(true);
              busy.current = false;
            }}
          />
        </div>

        <div className="mt-6">
          {showResult && result ? (
            <PrizeCard view={view} result={result} />
          ) : view.blocked ? (
            <p className="rounded-2xl bg-white/15 p-4 text-sm font-semibold" data-testid="spin-blocked">{view.blocked}</p>
          ) : (
            <button
              type="button"
              onClick={() => void spin()}
              disabled={!canSpin}
              className="w-full rounded-full bg-yellow-300 py-4 text-xl font-black text-orange-800 shadow-lg shadow-orange-900/30 active:scale-[0.98] disabled:opacity-70"
              data-testid="spin-button"
            >
              {spinning ? "Spinning…" : "SPIN"}
            </button>
          )}
          {error && view ? <p className="mt-3 text-sm font-semibold">{error}</p> : null}
        </div>

        {view.terms ? <p className="mt-6 text-[11px] leading-snug opacity-80">{view.terms}</p> : null}
      </div>
    </div>
  );
}
