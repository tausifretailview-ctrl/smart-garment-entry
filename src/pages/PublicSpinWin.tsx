import { useEffect, useMemo, useRef, useState } from "react";
import { useParams } from "react-router-dom";
import { Check, Copy, Download, Gift, Loader2, Sparkles } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { SpinWheel } from "@/components/spin/SpinWheel";
import { applyForceDesktopViewAttribute } from "@/lib/desktopViewPreference";
import { hideAppBootSplash } from "@/lib/appBootSplash";
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

const PHONE_VIEWPORT = "width=device-width, initial-scale=1.0, maximum-scale=1.0, user-scalable=no, viewport-fit=cover";

/**
 * A customer page is always phone width: the shop's "desktop view" switch (a 1280px page on a
 * phone) must not shrink it when the owner opens a link on the same phone.
 */
function usePhoneViewport() {
  useEffect(() => {
    const meta = document.querySelector('meta[name="viewport"]');
    const before = meta?.getAttribute("content");
    meta?.setAttribute("content", PHONE_VIEWPORT);
    return () => {
      if (meta && before) meta.setAttribute("content", before);
      else applyForceDesktopViewAttribute();
    };
  }, []);
}

function fmtDate(iso: string | null): string {
  if (!iso) return "";
  const d = new Date(iso);
  return Number.isNaN(d.getTime()) ? "" : d.toLocaleDateString("en-IN", { day: "2-digit", month: "short", year: "numeric" });
}

const PAGE_BG = "radial-gradient(120% 80% at 50% 0%, #4C1D95 0%, #2E1065 38%, #160B2E 72%, #0B0618 100%)";

/** Confetti burst on a win (pure CSS, no library). */
function Confetti() {
  const pieces = useMemo(
    () =>
      Array.from({ length: 36 }, (_, i) => ({
        left: (i * 37) % 100,
        delay: (i % 9) * 0.12,
        dur: 2.4 + ((i * 7) % 10) / 10,
        color: ["#FDE047", "#F97316", "#22D3EE", "#F472B6", "#A3E635", "#FFFFFF"][i % 6],
        rot: (i * 47) % 360,
      })),
    [],
  );
  return (
    <div className="pointer-events-none fixed inset-0 z-20 overflow-hidden" aria-hidden>
      <style>{`@keyframes sw-fall { 0% { transform: translateY(-10vh) rotate(0deg); opacity: 1 } 100% { transform: translateY(105vh) rotate(720deg); opacity: 0.9 } }`}</style>
      {pieces.map((p, i) => (
        <span
          key={i}
          className="absolute top-0 block h-3 w-2 rounded-sm"
          style={{
            left: `${p.left}%`,
            background: p.color,
            transform: `rotate(${p.rot}deg)`,
            animation: `sw-fall ${p.dur}s ${p.delay}s cubic-bezier(0.25, 0.6, 0.4, 1) forwards`,
          }}
        />
      ))}
    </div>
  );
}

/** Ticket-style coupon the customer keeps (copy the code, or save it as a picture). */
function PrizeCard({ view, result }: { view: PublicSpinView; result: PublicSpinResult }) {
  const [copied, setCopied] = useState(false);
  const won = result.status !== "lost" && !!result.code;
  const prizeText = spinPrizeDescription({ ...result, prize_type: result.type });

  const copy = async () => {
    try {
      await navigator.clipboard.writeText(result.code ?? "");
      setCopied(true);
      window.setTimeout(() => setCopied(false), 2000);
    } catch {
      /* clipboard blocked: the code is on screen */
    }
  };

  const save = () => {
    const c = document.createElement("canvas");
    c.width = 900;
    c.height = 500;
    const g = c.getContext("2d");
    if (!g) return;
    const bg = g.createLinearGradient(0, 0, 900, 500);
    bg.addColorStop(0, "#2E1065");
    bg.addColorStop(1, "#4C1D95");
    g.fillStyle = bg;
    g.fillRect(0, 0, 900, 500);
    g.strokeStyle = "#FCD34D";
    g.lineWidth = 6;
    g.setLineDash([16, 10]);
    g.strokeRect(24, 24, 852, 452);
    g.setLineDash([]);
    g.textAlign = "center";
    g.fillStyle = "#FDE68A";
    g.font = "600 30px Arial";
    g.fillText(view.shopName.toUpperCase(), 450, 92);
    g.fillStyle = "#FFFFFF";
    g.font = "bold 58px Arial";
    g.fillText(prizeText, 450, 190);
    g.fillStyle = "#FCD34D";
    g.fillRect(250, 235, 400, 96);
    g.fillStyle = "#2E1065";
    g.font = "bold 60px monospace";
    g.fillText(result.code ?? "", 450, 304);
    g.fillStyle = "#E9D5FF";
    g.font = "26px Arial";
    g.fillText(`Valid till ${fmtDate(result.expires_at)}  ·  Show this code at the counter`, 450, 400);
    const a = document.createElement("a");
    a.href = c.toDataURL("image/png");
    a.download = `${result.code}.png`;
    a.click();
  };

  if (!won) {
    return (
      <div className="rounded-3xl border border-white/15 bg-white/10 p-6 text-center backdrop-blur-md" data-testid="spin-result">
        <p className="text-2xl font-extrabold text-white">{result.label}</p>
        <p className="mt-2 text-sm leading-relaxed text-violet-100/90">
          Thank you for shopping with {view.shopName}. Better luck on your next bill!
        </p>
      </div>
    );
  }

  return (
    <div className="relative overflow-hidden rounded-3xl bg-gradient-to-b from-amber-200 via-amber-300 to-amber-500 p-[2px] shadow-[0_20px_60px_-15px_rgba(251,191,36,0.55)]" data-testid="spin-result">
      <div className="relative rounded-[22px] bg-gradient-to-b from-[#2E1065] to-[#1E0B45] px-5 pb-5 pt-6 text-center">
        {/* ticket notches */}
        <span className="absolute -left-3 top-[118px] h-6 w-6 rounded-full bg-[#160B2E]" aria-hidden />
        <span className="absolute -right-3 top-[118px] h-6 w-6 rounded-full bg-[#160B2E]" aria-hidden />
        <p className="flex items-center justify-center gap-1.5 text-xs font-bold uppercase tracking-[0.25em] text-amber-300">
          <Sparkles className="h-4 w-4" /> Congratulations
        </p>
        <p className="mt-2 text-[28px] font-black leading-tight text-white">{prizeText}</p>
        <div className="mx-2 my-4 border-t border-dashed border-amber-300/50" />
        <p className="text-[11px] font-semibold uppercase tracking-[0.3em] text-violet-200/80">Your code</p>
        <button
          type="button"
          onClick={() => void copy()}
          className="mx-auto mt-2 flex items-center gap-3 rounded-2xl border-2 border-dashed border-amber-300/80 bg-amber-300/10 px-5 py-3 active:scale-[0.98]"
          aria-label="Copy code"
        >
          <span className="font-mono text-[30px] font-black tracking-[0.18em] text-amber-300" data-testid="spin-code">
            {result.code}
          </span>
          {copied ? <Check className="h-5 w-5 text-emerald-300" /> : <Copy className="h-5 w-5 text-amber-200/80" />}
        </button>
        <p className="mt-3 text-sm leading-relaxed text-violet-100/90">
          Show this code at the counter on your next bill
          {result.expires_at ? (
            <>
              <br />
              <span className="font-semibold text-white">Valid till {fmtDate(result.expires_at)}</span>
            </>
          ) : null}
        </p>
        {result.status === "redeemed" ? (
          <p className="mt-3 rounded-full bg-emerald-400/15 py-1.5 text-sm font-semibold text-emerald-300">Already used. Thank you!</p>
        ) : (
          <button
            type="button"
            onClick={save}
            className="mt-4 inline-flex w-full items-center justify-center gap-2 rounded-full bg-gradient-to-r from-amber-300 to-amber-500 py-3 text-[15px] font-extrabold text-[#2E1065] shadow-lg shadow-amber-500/30 active:scale-[0.98]"
          >
            <Download className="h-5 w-5" /> Save coupon
          </button>
        )}
      </div>
    </div>
  );
}

/**
 * /spin/<bill id>: the customer's Spin & Win page from the POS bill's WhatsApp message.
 * The server decides the prize (spin_for_sale); the wheel only turns to it.
 */
export default function PublicSpinWin() {
  usePhoneViewport();
  const { saleId = "" } = useParams<{ saleId: string }>();
  const [view, setView] = useState<PublicSpinView | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [rotation, setRotation] = useState(0);
  const [spinning, setSpinning] = useState(false);
  const [result, setResult] = useState<PublicSpinResult | null>(null);
  const [showResult, setShowResult] = useState(false);
  const [celebrate, setCelebrate] = useState(false);
  const [wheelSize, setWheelSize] = useState(320);
  const busy = useRef(false);

  useEffect(() => {
    // A customer page has no sign-in step, so nothing else takes the loading splash away.
    hideAppBootSplash();
  }, []);

  useEffect(() => {
    const fit = () => setWheelSize(Math.max(240, Math.min(360, window.innerWidth - 36)));
    fit();
    window.addEventListener("resize", fit);
    return () => window.removeEventListener("resize", fit);
  }, []);

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
    setError(null);
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

  const shell = (children: React.ReactNode) => (
    <div className="min-h-[100dvh] overflow-x-hidden px-4 pb-10 text-white" style={{ background: PAGE_BG, fontFamily: "'Poppins', 'Segoe UI', Arial, sans-serif", fontSize: 16 }}>
      {children}
    </div>
  );

  if (error && !view) {
    return shell(
      <div className="flex min-h-[100dvh] items-center justify-center text-center">
        <div className="rounded-3xl border border-white/15 bg-white/10 p-8 backdrop-blur-md">
          <Gift className="mx-auto h-12 w-12 text-amber-300" />
          <p className="mt-3 text-lg font-bold" data-testid="spin-error">{error}</p>
        </div>
      </div>,
    );
  }
  if (!view) {
    return shell(
      <div className="flex min-h-[100dvh] items-center justify-center">
        <Loader2 className="h-9 w-9 animate-spin text-amber-300" />
      </div>,
    );
  }

  const canSpin = !view.blocked && !result && !spinning;
  return shell(
    <div className="mx-auto max-w-md pt-[max(1.25rem,env(safe-area-inset-top))] text-center" data-testid="public-spin-page">
      {celebrate ? <Confetti /> : null}

      {/* Shop */}
      <div className="flex items-center justify-center gap-2.5">
        {view.logoUrl ? (
          <img src={view.logoUrl} alt="" className="h-11 w-11 rounded-full bg-white object-contain p-1 ring-2 ring-amber-300/80" />
        ) : null}
        <p className="text-sm font-semibold uppercase tracking-[0.2em] text-violet-100/90">{view.shopName}</p>
      </div>

      {/* Title */}
      <h1 className="mt-4 bg-gradient-to-b from-amber-100 via-amber-300 to-amber-500 bg-clip-text text-[40px] font-black leading-none tracking-tight text-transparent drop-shadow-[0_2px_12px_rgba(251,191,36,0.35)]">
        {view.title}
      </h1>
      <p className="mt-2 text-sm text-violet-200/80">A reward for your bill {view.saleNumber}</p>

      {/* Wheel */}
      <div className="relative mt-7">
        <div
          className="pointer-events-none absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 rounded-full"
          style={{ width: wheelSize * 1.15, height: wheelSize * 1.15, background: "radial-gradient(circle, rgba(251,191,36,0.35) 0%, rgba(168,85,247,0.15) 45%, transparent 70%)" }}
          aria-hidden
        />
        <SpinWheel
          slices={slices}
          rotation={rotation}
          spinning={spinning}
          size={wheelSize}
          onSpinEnd={() => {
            setSpinning(false);
            setShowResult(true);
            busy.current = false;
            if (result && result.status !== "lost" && result.code) setCelebrate(true);
          }}
        />
      </div>

      {/* Action / result */}
      <div className="mt-8">
        {showResult && result ? (
          <PrizeCard view={view} result={result} />
        ) : view.blocked ? (
          <div className="rounded-3xl border border-white/15 bg-white/10 px-5 py-4 backdrop-blur-md" data-testid="spin-blocked">
            <p className="text-[15px] font-semibold">{view.blocked}</p>
          </div>
        ) : (
          <button
            type="button"
            onClick={() => void spin()}
            disabled={!canSpin}
            className="relative w-full overflow-hidden rounded-full bg-gradient-to-b from-amber-200 via-amber-400 to-amber-600 py-4 text-xl font-black uppercase tracking-[0.2em] text-[#3B0764] shadow-[0_12px_36px_-8px_rgba(251,191,36,0.75)] active:scale-[0.98] disabled:opacity-80"
            data-testid="spin-button"
          >
            {spinning ? "Good luck…" : "Spin now"}
          </button>
        )}
        {error ? <p className="mt-3 text-sm font-semibold text-rose-300">{error}</p> : null}
        {!showResult && !view.blocked && !spinning ? (
          <p className="mt-3 text-xs text-violet-200/70">One spin per bill · Your prize is saved with your bill</p>
        ) : null}
      </div>

      {view.terms ? <p className="mx-auto mt-8 max-w-xs text-[11px] leading-relaxed text-violet-200/60">{view.terms}</p> : null}
    </div>,
  );
}
