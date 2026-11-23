import { useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { Check, Search } from "lucide-react";
import { cn } from "@/lib/utils";
import { onWheelScrollContainer } from "@/lib/scrollWheel";
import { Input } from "@/components/ui/input";
import { capMatches, cappedListNote } from "@/lib/longOptionList";

export type CustomerOption = { id: string; customer_name: string; phone?: string | null };

/**
 * The customer list inside a picker popover: a search box and at most 100 rows. The search
 * looks through every customer (name and phone, words in any order).
 *
 * Replaces the cmdk list these pickers used, which drew and scored one row per customer on
 * every open and every key: seconds of freeze with a few thousand customers (item S6).
 * Arrow keys move, Enter picks, as before.
 */
export function CustomerOptionList<T extends CustomerOption>({
  customers,
  selectedId,
  onPick,
  placeholder = "Search by name or phone...",
  emptyText = "No customers found.",
  renderDetail,
}: {
  customers: readonly T[] | null | undefined;
  selectedId: string | null | undefined;
  onPick: (customer: T) => void;
  placeholder?: string;
  emptyText?: string;
  /** Extra line under the name (balances and the like). */
  renderDetail?: (customer: T) => ReactNode;
}) {
  const [search, setSearch] = useState("");
  const [activeIndex, setActiveIndex] = useState(0);
  const inputRef = useRef<HTMLInputElement>(null);
  const listRef = useRef<HTMLDivElement>(null);

  const all = useMemo(() => customers ?? [], [customers]);
  const haystacks = useMemo(
    () => all.map((c) => `${c.customer_name ?? ""} ${c.phone ?? ""}`.toLowerCase()),
    [all],
  );
  const pinnedIndex = useMemo(
    () => (selectedId ? all.findIndex((c) => c.id === selectedId) : -1),
    [all, selectedId],
  );
  const { shown, total } = useMemo(
    () => capMatches(all, haystacks, search, undefined, pinnedIndex),
    [all, haystacks, search, pinnedIndex],
  );
  const note = cappedListNote(shown.length, total);

  useEffect(() => {
    const id = window.requestAnimationFrame(() => inputRef.current?.focus());
    return () => window.cancelAnimationFrame(id);
  }, []);

  useEffect(() => setActiveIndex(0), [search]);

  useEffect(() => {
    listRef.current?.querySelector<HTMLElement>(`[data-option-index="${activeIndex}"]`)?.scrollIntoView({ block: "nearest" });
  }, [activeIndex]);

  const onKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === "ArrowDown") {
      e.preventDefault();
      setActiveIndex((i) => Math.min(i + 1, Math.max(0, shown.length - 1)));
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      setActiveIndex((i) => Math.max(i - 1, 0));
    } else if (e.key === "Enter") {
      const picked = shown[activeIndex];
      if (picked) {
        e.preventDefault();
        onPick(picked);
      }
    }
  };

  return (
    <div data-testid="customer-option-list">
      <div className="flex items-center border-b px-3">
        <Search className="mr-2 h-4 w-4 shrink-0 opacity-50" aria-hidden />
        <Input
          ref={inputRef}
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          onKeyDown={onKeyDown}
          placeholder={placeholder}
          autoComplete="off"
          className="h-10 border-0 px-0 shadow-none focus-visible:ring-0 focus-visible:ring-offset-0"
        />
      </div>
      <div
        ref={listRef}
        role="listbox"
        className="max-h-[300px] overflow-y-auto overscroll-contain p-1"
        onWheel={onWheelScrollContainer}
      >
        {shown.length === 0 ? (
          <p className="py-6 text-center text-sm text-muted-foreground">{emptyText}</p>
        ) : (
          shown.map((c, index) => (
            <button
              key={c.id}
              type="button"
              role="option"
              aria-selected={selectedId === c.id}
              data-option-index={index}
              className={cn(
                "flex w-full cursor-pointer items-center rounded-sm px-2 py-1.5 text-left text-sm outline-none hover:bg-accent",
                index === activeIndex && "bg-accent text-accent-foreground",
              )}
              onMouseDown={(e) => e.preventDefault()}
              onMouseEnter={() => setActiveIndex(index)}
              onClick={() => onPick(c)}
            >
              <Check className={cn("mr-2 h-4 w-4 shrink-0", selectedId === c.id ? "opacity-100" : "opacity-0")} />
              <div className="min-w-0 flex-1">
                <div className="flex items-center gap-2">
                  <span className="truncate">{c.customer_name}</span>
                  {c.phone ? <span className="shrink-0 text-xs text-muted-foreground">{c.phone}</span> : null}
                </div>
                {renderDetail?.(c)}
              </div>
            </button>
          ))
        )}
        {note ? <p className="px-2 py-1.5 text-xs text-muted-foreground">{note}</p> : null}
      </div>
    </div>
  );
}
