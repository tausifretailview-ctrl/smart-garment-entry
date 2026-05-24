import type { ReactNode } from "react";
import { Search } from "lucide-react";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { cn } from "@/lib/utils";
import {
  accountsHistoryCardClass,
  accountsHistoryFooterClass,
  accountsHistorySearchInputClass,
  accountsHistoryTableWrapClass,
  accountsHistoryTitleBarClass,
  accountsHistoryToolbarClass,
} from "@/components/accounts/accountsHistoryUi";

interface AccountsHistoryPanelProps {
  title: string;
  toolbar?: ReactNode;
  /** When set, renders search row (desktop-style toolbar). */
  searchPlaceholder?: string;
  searchValue?: string;
  onSearchChange?: (value: string) => void;
  /** Extra filters beside search (dates, selects, etc.) */
  filters?: ReactNode;
  footer?: ReactNode;
  children: ReactNode;
  className?: string;
  /** Skip max-height scroll wrapper (e.g. mobile card list). */
  disableTableScroll?: boolean;
}

export function AccountsHistoryPanel({
  title,
  toolbar,
  searchPlaceholder,
  searchValue,
  onSearchChange,
  filters,
  footer,
  children,
  className,
  disableTableScroll,
}: AccountsHistoryPanelProps) {
  const showSearchRow = onSearchChange != null || filters;

  return (
    <Card className={cn(accountsHistoryCardClass, className)}>
      <div className={accountsHistoryTitleBarClass}>
        <h3 className="text-sm font-semibold text-slate-800">{title}</h3>
        {toolbar ? <div className="flex flex-wrap items-center gap-2">{toolbar}</div> : null}
      </div>

      {showSearchRow ? (
        <div className={accountsHistoryToolbarClass}>
          {onSearchChange != null ? (
            <div className="relative flex-1 min-w-[180px]">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground pointer-events-none" />
              <Input
                placeholder={searchPlaceholder ?? "Search…"}
                value={searchValue ?? ""}
                onChange={(e) => onSearchChange(e.target.value)}
                className={accountsHistorySearchInputClass}
              />
            </div>
          ) : null}
          {filters}
        </div>
      ) : null}

      {disableTableScroll ? (
        <div className="p-3">{children}</div>
      ) : (
        <div className={accountsHistoryTableWrapClass}>{children}</div>
      )}

      {footer ? <div className={accountsHistoryFooterClass}>{footer}</div> : null}
    </Card>
  );
}
