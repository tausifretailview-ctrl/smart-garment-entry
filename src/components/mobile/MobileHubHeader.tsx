import type { ReactNode } from "react";
import { cn } from "@/lib/utils";
import { useMobileUiTheme } from "@/hooks/useMobileUiTheme";
import { FIELD_SALES_SAFE_TOP } from "@/hooks/useFieldSalesShell";

/**
 * Title band of a main mobile screen (Sales, Reports, Menu, Accounts).
 * App look: the same blue gradient band as Home, POS and Purchase. Classic look: the white bar.
 * Clears the phone's status bar in both.
 */
export function MobileHubHeader({
  title,
  subtitle,
  right,
  children,
}: {
  title: string;
  subtitle?: string;
  /** Action on the right of the title (e.g. New bill). */
  right?: ReactNode;
  /** Extra row inside the band (e.g. a search field). */
  children?: ReactNode;
}) {
  const premium = useMobileUiTheme() === "premium";
  return (
    <div
      className={cn(
        "sticky top-0 z-10 px-4 pb-3.5",
        premium
          ? "ez-shell rounded-b-[22px] shadow-[0_8px_20px_-12px_rgba(30,64,175,0.7)]"
          : "border-b border-border bg-background/95 backdrop-blur-md",
      )}
      style={{ paddingTop: `calc(${FIELD_SALES_SAFE_TOP} + 0.75rem)` }}
    >
      <div className="flex items-center justify-between gap-3">
        <div className="min-w-0">
          <h1 className={cn("truncate text-[19px] font-bold leading-tight", !premium && "text-foreground")}>{title}</h1>
          {subtitle ? (
            <p className={cn("mt-0.5 truncate text-xs", premium ? "text-white/80" : "text-muted-foreground")}>{subtitle}</p>
          ) : null}
        </div>
        {right}
      </div>
      {children}
    </div>
  );
}
