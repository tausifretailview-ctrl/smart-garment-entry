import { ReactNode } from "react";
import { cn } from "@/lib/utils";

export interface MobileListCardProps {
  title: ReactNode;
  subtitle?: ReactNode;
  badge?: ReactNode;
  amount?: ReactNode;
  amountClassName?: string;
  meta?: ReactNode;
  footer?: ReactNode;
  onClick?: () => void;
  className?: string;
  muted?: boolean;
}

export function MobileListCard({
  title,
  subtitle,
  badge,
  amount,
  amountClassName,
  meta,
  footer,
  onClick,
  className,
  muted,
}: MobileListCardProps) {
  return (
    <div
      className={cn(
        "bg-card rounded-2xl border border-border/40 shadow-sm overflow-hidden",
        muted && "opacity-60",
        className
      )}
    >
      <div
        className={cn(
          "p-3.5",
          onClick && "active:bg-muted/30 transition-colors touch-manipulation cursor-pointer"
        )}
        onClick={onClick}
        role={onClick ? "button" : undefined}
        tabIndex={onClick ? 0 : undefined}
        onKeyDown={
          onClick
            ? (e) => {
                if (e.key === "Enter" || e.key === " ") {
                  e.preventDefault();
                  onClick();
                }
              }
            : undefined
        }
      >
        <div className="flex items-start justify-between gap-2">
          <div className="min-w-0 flex-1">
            <div className="flex items-center gap-2 flex-wrap">
              <span className="font-semibold text-sm text-foreground truncate">{title}</span>
              {badge}
            </div>
            {subtitle ? (
              <p className="text-xs text-muted-foreground mt-0.5 truncate">{subtitle}</p>
            ) : null}
            {meta ? <div className="mt-2 text-xs text-muted-foreground space-y-0.5">{meta}</div> : null}
          </div>
          {amount != null ? (
            <div className={cn("text-right shrink-0", amountClassName)}>
              {amount}
            </div>
          ) : null}
        </div>
      </div>
      {footer ? (
        <div className="flex border-t border-border/40 divide-x divide-border/40">{footer}</div>
      ) : null}
    </div>
  );
}

export function MobileListCardSkeleton({ className }: { className?: string }) {
  return <div className={cn("h-20 bg-card rounded-2xl animate-pulse border border-border/40", className)} />;
}
