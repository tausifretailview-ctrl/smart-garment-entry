import { useEffect, useState, type ReactNode } from "react";
import { Search } from "lucide-react";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { cn } from "@/lib/utils";
import {
  accountsHistoryCardClass,
  accountsHistoryFooterClass,
  accountsHistorySearchInputClass,
  accountsHistorySearchWrapClass,
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
  /** Right-aligned actions on the search row (Excel / PDF, etc.). */
  actions?: ReactNode;
  footer?: ReactNode;
  children: ReactNode;
  className?: string;
  /** Skip max-height scroll wrapper (e.g. mobile card list). */
  disableTableScroll?: boolean;
}

const SEARCH_DEBOUNCE_MS = 200;

export function AccountsHistoryPanel({
  title,
  toolbar,
  searchPlaceholder,
  searchValue,
  onSearchChange,
  filters,
  actions,
  footer,
  children,
  className,
  disableTableScroll,
}: AccountsHistoryPanelProps) {
  const showSearchRow = onSearchChange != null || filters || actions;
  const [draftSearch, setDraftSearch] = useState(searchValue ?? "");

  useEffect(() => {
    setDraftSearch(searchValue ?? "");
  }, [searchValue]);

  useEffect(() => {
    if (!onSearchChange || draftSearch === (searchValue ?? "")) return;
    const timer = setTimeout(() => onSearchChange(draftSearch), SEARCH_DEBOUNCE_MS);
    return () => clearTimeout(timer);
  }, [draftSearch, searchValue, onSearchChange]);

  return (
    <Card className={cn(accountsHistoryCardClass, className)}>
      <div className={accountsHistoryTitleBarClass}>
        <h3 className="text-sm font-semibold text-slate-800">{title}</h3>
        {toolbar ? <div className="flex flex-wrap items-center gap-2">{toolbar}</div> : null}
      </div>

      {showSearchRow ? (
        <div className={accountsHistoryToolbarClass}>
          {onSearchChange != null ? (
            <div className={accountsHistorySearchWrapClass}>
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground pointer-events-none" />
              <Input
                placeholder={searchPlaceholder ?? "Search…"}
                value={draftSearch}
                onChange={(e) => setDraftSearch(e.target.value)}
                className={accountsHistorySearchInputClass}
              />
            </div>
          ) : null}
          {filters}
          {actions ? <div className="flex items-center gap-1.5 shrink-0 sm:ml-auto">{actions}</div> : null}
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
