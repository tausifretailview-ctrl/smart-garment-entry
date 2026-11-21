/**
 * PosFastPicks — "Fast picks · top sellers" product tiles above the bill lines.
 * Path: src/components/mobile/premium/PosFastPicks.tsx
 *
 * Feed it either the live search hits (when searchTerm is set) or the
 * top-seller list. Both are plain arrays — no new query is required:
 * for top sellers reuse the existing `sale_items` aggregation the owner
 * dashboard already runs ("owner-top-selling") or a variant list ordered
 * by stock_qty, mapped to this shape.
 */
import { Plus } from "lucide-react";
import { EmptyNote, SectionHead } from "./index";

export type FastPick = {
  id: string;
  name: string;
  /** "M · 890012" — size then barcode */
  meta: string;
  /** already formatted, e.g. "₹1,299" */
  price: string;
  onAdd: () => void;
};

export function PosFastPicks({
  items,
  searchTerm,
  loading,
}: {
  items: FastPick[];
  searchTerm?: string;
  loading?: boolean;
}) {
  const title = searchTerm?.trim() ? `Matches · ${searchTerm.trim()}` : "Fast picks · top sellers";

  return (
    <>
      <SectionHead
        title={title}
        right={<p className="shrink-0 text-[12px] font-medium text-[var(--ez-muted)]">{loading ? "Searching…" : "Tap to add"}</p>}
      />
      {items.length === 0 ? (
        <div className="ez-card mx-3">
          <EmptyNote>{loading ? "Searching…" : "No products found"}</EmptyNote>
        </div>
      ) : (
        <div className="grid grid-cols-2 gap-2 px-3">
          {items.map((p) => (
            <button
              key={p.id}
              type="button"
              onClick={p.onAdd}
              className="ez-card ez-press ez-pop relative min-w-0 px-3 py-2.5 text-left active:bg-[var(--ez-tint)]"
            >
              <p className="truncate pr-6 text-[13.5px] font-semibold leading-[1.25]">{p.name}</p>
              <p className="mt-0.5 truncate text-[11.5px] font-medium leading-tight text-[var(--ez-muted)]">{p.meta}</p>
              <p className="num mt-1.5 text-[15px] font-bold leading-none text-[var(--ez-accent-600)]">{p.price}</p>
              <span
                className="absolute right-2 top-2 flex h-6 w-6 items-center justify-center rounded-full bg-[var(--ez-tint)] text-[var(--ez-accent)]"
                aria-hidden
              >
                <Plus className="h-3.5 w-3.5" strokeWidth={2.6} />
              </span>
            </button>
          ))}
        </div>
      )}
    </>
  );
}
