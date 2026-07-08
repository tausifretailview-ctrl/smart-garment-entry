import type { ReactNode } from "react";
import { Receipt, Package, BarChart3, ShieldCheck, MapPin, Store } from "lucide-react";
import { useCompactLoginLayout } from "@/hooks/use-mobile";
import { cn } from "@/lib/utils";

const LEFT_FEATURE_CARDS = [
  { icon: Receipt, title: "POS & Sales Billing", desc: "Fast billing, GST invoices" },
  { icon: Package, title: "Inventory Management", desc: "Size-wise stock control" },
  { icon: BarChart3, title: "Accounts & Ledgers", desc: "Payments & outstanding" },
] as const;

export function EzzyBrandRow({
  centered = false,
  onLightBackground = false,
  large = false,
}: {
  centered?: boolean;
  onLightBackground?: boolean;
  large?: boolean;
}) {
  const iconSize = large ? "h-11 w-11" : "h-[34px] w-[34px]";
  const storeIcon = large ? "h-5 w-5" : "h-4 w-4";
  const titleSize = large ? 20 : 16;
  const tagSize = large ? 12 : 10;

  return (
    <div className={`flex items-center gap-3 ${centered ? "justify-center" : ""}`}>
      <div
        className={`flex ${iconSize} shrink-0 items-center justify-center rounded-lg`}
        style={{ background: "#378ADD" }}
      >
        <Store className={`${storeIcon} text-white`} />
      </div>
      <div className={centered ? "text-left" : undefined}>
        <p
          className={`font-semibold leading-tight ${onLightBackground ? "text-card-foreground" : "text-white"}`}
          style={{ fontSize: titleSize }}
        >
          EzzyERP
        </p>
        <p className="leading-tight" style={{ fontSize: tagSize, color: onLightBackground ? "#185FA5" : "#85B7EB" }}>
          Easy Billing, Smart Business
        </p>
      </div>
    </div>
  );
}

function OrgLoginMarketingPanel({ hidden }: { hidden: boolean }) {
  return (
    <div
      className={cn("relative flex-col overflow-hidden", hidden ? "hidden" : "hidden md:flex md:w-1/2")}
      style={{ background: "linear-gradient(160deg, #0B1B3A 0%, #13294f 55%, #1e3a8a 100%)" }}
    >
      {/* Faint grid texture */}
      <div
        className="pointer-events-none absolute inset-0"
        style={{
          opacity: 0.06,
          backgroundImage:
            "linear-gradient(#85B7EB 1px, transparent 1px), linear-gradient(90deg, #85B7EB 1px, transparent 1px)",
          backgroundSize: "48px 48px",
        }}
      />
      {/* Soft accent glow, top-right */}
      <div
        className="pointer-events-none absolute -right-40 -top-40 h-[600px] w-[600px] rounded-full"
        style={{ background: "radial-gradient(circle, rgba(56,189,248,0.08) 0%, transparent 70%)" }}
      />

      <div className="relative z-10 flex h-full flex-col justify-between px-12 py-10 lg:px-16 lg:py-12">
        <EzzyBrandRow large />

        <div className="my-6 flex flex-1 flex-col justify-center space-y-8 lg:space-y-10">
          <div className="max-w-xl">
            <h2
              className="font-semibold leading-[1.15] text-white"
              style={{ fontSize: "clamp(2rem, 3.2vw, 2.75rem)", letterSpacing: "-0.01em" }}
            >
              Run your retail business <span style={{ color: "#38bdf8" }}>smarter.</span>
            </h2>
            <div className="mt-4 h-0.5 w-10 rounded-full" style={{ background: "#38bdf8" }} />
            <p
              className="mt-5 max-w-lg leading-relaxed"
              style={{ fontSize: "clamp(1rem, 1.4vw, 1.125rem)", color: "rgba(255,255,255,0.65)" }}
            >
              Complete billing, inventory & accounting for Indian retail businesses.
            </p>
          </div>

          <div className="max-w-lg space-y-4">
            {LEFT_FEATURE_CARDS.map(({ icon: Icon, title, desc }) => (
              <div
                key={title}
                className="login-feature flex items-center gap-3.5 px-4 py-3.5 backdrop-blur-sm"
                style={{
                  background: "rgba(255,255,255,0.05)",
                  border: "1px solid rgba(255,255,255,0.10)",
                  borderRadius: 14,
                }}
              >
                <div
                  className="flex h-9 w-9 shrink-0 items-center justify-center"
                  style={{ background: "rgba(56,189,248,0.15)", borderRadius: 8 }}
                >
                  <Icon className="h-[18px] w-[18px]" style={{ color: "#38bdf8" }} />
                </div>
                <div>
                  <p className="font-semibold text-white" style={{ fontSize: 15 }}>
                    {title}
                  </p>
                  <p style={{ fontSize: 13, color: "rgba(255,255,255,0.65)" }}>
                    {desc}
                  </p>
                </div>
              </div>
            ))}
          </div>
        </div>

        <div className="pt-6" style={{ borderTop: "1px solid rgba(255,255,255,0.14)" }}>
          <div className="flex items-stretch">
            {[
              ["500+", "Businesses"],
              ["10L+", "Invoices"],
              ["99.9%", "Uptime"],
            ].map(([value, label], i) => (
              <div
                key={label}
                className="flex-1 text-center"
                style={i > 0 ? { borderLeft: "1px solid rgba(255,255,255,0.14)" } : undefined}
              >
                <p className="font-bold text-white" style={{ fontSize: "clamp(1.5rem, 2vw, 1.875rem)" }}>
                  {value}
                </p>
                <p
                  className="mt-1.5 uppercase"
                  style={{ fontSize: 11, color: "rgba(255,255,255,0.55)", letterSpacing: "0.06em" }}
                >
                  {label}
                </p>
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}

export function OrgLoginTrustBadges() {
  return (
    <div className="mt-5 flex flex-wrap items-center justify-center gap-5 pt-5" style={{ borderTop: "1px solid #e2e8f0" }}>
      <div className="flex items-center gap-1.5 text-xs" style={{ color: "#64748b" }}>
        <ShieldCheck className="h-3.5 w-3.5 text-green-600" />
        ISO 27001
      </div>
      <div className="flex items-center gap-1.5 text-xs" style={{ color: "#64748b" }}>
        <ShieldCheck className="h-3.5 w-3.5 text-green-600" />
        SOC 2 Type II
      </div>
      <div className="flex items-center gap-1.5 text-xs" style={{ color: "#64748b" }}>
        <MapPin className="h-3.5 w-3.5 text-blue-600" />
        Data in India
      </div>
    </div>
  );
}

export function OrgLoginShell({
  title,
  subtitle,
  children,
  compactLogin: compactLoginProp,
}: {
  title: string;
  subtitle: string;
  children: ReactNode;
  compactLogin?: boolean;
}) {
  const compactFromHook = useCompactLoginLayout();
  const compactLogin = compactLoginProp ?? compactFromHook;

  return (
    <div className="login-page flex h-screen w-full overflow-hidden bg-background">
      <OrgLoginMarketingPanel hidden={compactLogin} />

      <div
        className={cn(
          "flex h-dvh min-h-0 w-full flex-1 flex-col overflow-y-auto bg-card",
          !compactLogin && "md:w-1/2",
        )}
      >
        <div
          className={cn(
            "login-form-col mx-auto flex w-full max-w-[500px] flex-1 flex-col justify-center",
            compactLogin
              ? "px-6 py-8 pt-[max(2rem,env(safe-area-inset-top))] pb-[max(2rem,env(safe-area-inset-bottom))]"
              : "px-6 py-10 md:px-10",
          )}
        >
          {compactLogin && (
            <div className="mb-6">
              <EzzyBrandRow centered onLightBackground large />
            </div>
          )}

          <div className="space-y-6">
            <div className="text-center">
              <h1 className="font-bold" style={{ fontSize: 28, letterSpacing: "-0.01em", color: "#0f172a" }}>
                {title}
              </h1>
              <p className="mt-1.5" style={{ fontSize: 14, color: "#64748b" }}>
                {subtitle}
              </p>
            </div>

            {children}
          </div>
        </div>
      </div>
    </div>
  );
}
