import { Search, CalendarIcon } from "lucide-react";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Calendar } from "@/components/ui/calendar";
import { accountsHistorySearchInputClass, accountsHistoryToolbarClass } from "@/components/accounts/accountsHistoryUi";
import { cn } from "@/lib/utils";
import type { CustomerAccountTabFilters } from "@/components/customer-account/customerAccountTabFilters";
import { formatCustomFrom, formatCustomTo } from "@/components/customer-account/customerAccountTabFilters";

type Props = {
  activeTab: string;
  filters: CustomerAccountTabFilters;
  onChange: (patch: Partial<CustomerAccountTabFilters>) => void;
};

const STATUS_CHIPS: Record<string, Array<{ v: string; l: string }>> = {
  sales: [
    { v: "all", l: "All" },
    { v: "pending", l: "Pending" },
    { v: "partial", l: "Partial" },
    { v: "completed", l: "Paid" },
    { v: "cancelled", l: "Cancelled" },
  ],
  legacy: [
    { v: "all", l: "All" },
    { v: "paid", l: "Paid" },
    { v: "pending", l: "Pending" },
  ],
  "credit-notes": [
    { v: "all", l: "All" },
    { v: "active", l: "Active" },
    { v: "fully_used", l: "Used" },
    { v: "expired", l: "Expired" },
  ],
  advances: [
    { v: "all", l: "All" },
    { v: "active", l: "Active" },
    { v: "partially_used", l: "Partial" },
    { v: "fully_used", l: "Used" },
    { v: "refunded", l: "Refunded" },
  ],
};

const SEARCH_PLACEHOLDER: Record<string, string> = {
  sales: "Search invoice no, type…",
  legacy: "Search invoice no…",
  payments: "Search voucher, description…",
  returns: "Search return no, invoice…",
  "credit-notes": "Search credit note no…",
  refunds: "Search invoice no…",
  advances: "Search advance no, notes…",
  adjustments: "Search reason…",
};

export function CustomerAccountTabToolbar({ activeTab, filters, onChange }: Props) {
  const chips = STATUS_CHIPS[activeTab];
  const showTypeFilter = activeTab === "sales";

  return (
    <div className="border-b border-slate-100 shrink-0">
      <div className={cn(accountsHistoryToolbarClass, "overflow-x-auto")}>
        <div className="relative flex-1 min-w-[160px] max-w-md">
          <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <Input
            placeholder={SEARCH_PLACEHOLDER[activeTab] || "Search…"}
            value={filters.search}
            onChange={(e) => onChange({ search: e.target.value })}
            className={cn(accountsHistorySearchInputClass, "h-8 pl-8")}
          />
        </div>
        <Select value={filters.period} onValueChange={(v) => onChange({ period: v as CustomerAccountTabFilters["period"] })}>
          <SelectTrigger className="w-[120px] h-8 text-sm border-slate-200 bg-slate-50 hover:bg-white">
            <SelectValue placeholder="Period" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="weekly">Last 7 Days</SelectItem>
            <SelectItem value="monthly">This Month</SelectItem>
            <SelectItem value="yearly">This Year</SelectItem>
            <SelectItem value="all">All Time</SelectItem>
            <SelectItem value="custom">Custom</SelectItem>
          </SelectContent>
        </Select>
        {filters.period === "custom" && (
          <>
            <Popover>
              <PopoverTrigger asChild>
                <Button variant="outline" className="w-[120px] h-8 justify-start text-left font-normal text-sm border-slate-200 bg-slate-50 hover:bg-white">
                  <CalendarIcon className="mr-1.5 h-3.5 w-3.5" />
                  {formatCustomFrom(filters)}
                </Button>
              </PopoverTrigger>
              <PopoverContent className="w-auto p-0" align="start">
                <Calendar mode="single" selected={filters.dateFrom} onSelect={(d) => onChange({ dateFrom: d })} initialFocus />
              </PopoverContent>
            </Popover>
            <Popover>
              <PopoverTrigger asChild>
                <Button variant="outline" className="w-[120px] h-8 justify-start text-left font-normal text-sm border-slate-200 bg-slate-50 hover:bg-white">
                  <CalendarIcon className="mr-1.5 h-3.5 w-3.5" />
                  {formatCustomTo(filters)}
                </Button>
              </PopoverTrigger>
              <PopoverContent className="w-auto p-0" align="start">
                <Calendar mode="single" selected={filters.dateTo} onSelect={(d) => onChange({ dateTo: d })} initialFocus />
              </PopoverContent>
            </Popover>
          </>
        )}
        {showTypeFilter && (
          <Select value={filters.type} onValueChange={(v) => onChange({ type: v })}>
            <SelectTrigger className="w-[110px] h-8 text-sm border-slate-200 bg-slate-50 hover:bg-white">
              <SelectValue placeholder="Type" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All Types</SelectItem>
              <SelectItem value="pos">POS</SelectItem>
              <SelectItem value="invoice">Invoice</SelectItem>
            </SelectContent>
          </Select>
        )}
      </div>
      {chips && (
        <div className="flex gap-1.5 px-3 py-2 overflow-x-auto border-t border-slate-50">
          {chips.map((s) => (
            <button
              key={s.v}
              type="button"
              onClick={() => onChange({ status: s.v })}
              className={cn(
                "flex-shrink-0 px-3 py-1 rounded-full text-xs font-semibold border transition-all",
                filters.status === s.v
                  ? "bg-foreground text-background border-transparent"
                  : "bg-card text-muted-foreground border-border hover:bg-muted/50",
              )}
            >
              {s.l}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
