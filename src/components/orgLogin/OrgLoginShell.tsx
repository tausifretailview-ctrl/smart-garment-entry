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
      style={{ background: "#0f2744" }}
    >
      <div
        className="pointer-events-none absolute inset-0 opacity-[0.07]"
        style={{
          backgroundImage:
            "linear-gradient(#85B7EB 1px, transparent 1px), linear-gradient(90deg, #85B7EB 1px, transparent 1px)",
          backgroundSize: "48px 48px",
        }}
      />
      <div
        className="pointer-events-none absolute -bottom-32 -right-32 h-[420px] w-[420px] rounded-full opacity-20"
        style={{ background: "radial-gradient(circle, #378ADD 0%, transparent 70%)" }}
      />

      <div className="relative z-10 flex h-full flex-col justify-between px-12 py-10 lg:px-16 lg:py-12">
        <EzzyBrandRow large />

        <div className="my-6 flex flex-1 flex-col justify-center space-y-8 lg:space-y-10">
          <div className="max-w-xl">
            <h2
              className="font-semibold leading-[1.15] text-white"
              style={{ fontSize: "clamp(2rem, 3.2vw, 2.75rem)", letterSpacing: "-0.75px" }}
            >
              Run your retail business <span style={{ color: "#378ADD" }}>smarter.</span>
            </h2>
            <p
              className="mt-5 max-w-lg leading-relaxed"
              style={{ fontSize: "clamp(1rem, 1.4vw, 1.125rem)", color: "#85B7EB" }}
            >
              Complete billing, inventory & accounting for Indian retail businesses.
            </p>
          </div>

          <div className="max-w-lg space-y-3">
            {LEFT_FEATURE_CARDS.map(({ icon: Icon, title, desc }) => (
              <div
                key={title}
                className="flex gap-3.5 rounded-xl px-4 py-4"
                style={{
                  background: "#0C447C",
                  border: "0.5px solid #185FA5",
                }}
              >
                <Icon className="mt-0.5 h-5 w-5 shrink-0" style={{ color: "#85B7EB" }} />
                <div>
                  <p className="font-semibold text-white" style={{ fontSize: 15 }}>
                    {title}
                  </p>
                  <p className="mt-1" style={{ fontSize: 13, color: "#85B7EB" }}>
                    {desc}
                  </p>
                </div>
              </div>
            ))}
          </div>
        </div>

        <div className="pt-6" style={{ borderTop: "0.5px solid #185FA5" }}>
          <div className="flex justify-around">
            {[
              ["500+", "Businesses"],
              ["10L+", "Invoices"],
              ["99.9%", "Uptime"],
            ].map(([value, label]) => (
              <div key={label} className="text-center">
                <p className="font-semibold text-white" style={{ fontSize: "clamp(1.5rem, 2vw, 1.875rem)" }}>
                  {value}
                </p>
                <p
                  className="mt-1.5 uppercase tracking-wide"
                  style={{ fontSize: 12, color: "#85B7EB", letterSpacing: "0.4px" }}
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
    <div className="flex flex-wrap items-center justify-center gap-5 pt-2">
      <div className="flex items-center gap-2 text-sm text-muted-foreground">
        <ShieldCheck className="h-4 w-4 text-green-600" />
        ISO 27001
      </div>
      <div className="flex items-center gap-2 text-sm text-muted-foreground">
        <ShieldCheck className="h-4 w-4 text-green-600" />
        SOC 2 Type II
      </div>
      <div className="flex items-center gap-2 text-sm text-muted-foreground">
        <MapPin className="h-4 w-4 text-blue-600" />
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
    <div className="flex h-screen w-full overflow-hidden bg-background">
      <OrgLoginMarketingPanel hidden={compactLogin} />

      <div
        className={cn(
          "flex h-dvh min-h-0 w-full flex-1 flex-col overflow-y-auto bg-card",
          !compactLogin && "md:w-1/2",
        )}
      >
        <div
          className={cn(
            "mx-auto flex w-full max-w-lg flex-1 flex-col justify-center",
            compactLogin
              ? "px-5 py-8 pt-[max(2rem,env(safe-area-inset-top))] pb-[max(2rem,env(safe-area-inset-bottom))]"
              : "px-8 py-10 md:px-12 lg:px-16",
          )}
        >
          {compactLogin && (
            <div className="mb-6">
              <EzzyBrandRow centered onLightBackground large />
            </div>
          )}

          <div className="space-y-8">
            <div className="text-center">
              <h1 className="text-3xl font-semibold tracking-tight text-card-foreground md:text-4xl">{title}</h1>
              <p className="mt-2 text-base text-muted-foreground md:text-lg">{subtitle}</p>
            </div>

            {children}
          </div>
        </div>
      </div>
    </div>
  );
}
