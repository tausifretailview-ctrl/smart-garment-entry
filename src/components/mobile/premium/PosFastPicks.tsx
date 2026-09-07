/**
 * PosFastPicks — "FAST PICKS · TOP SELLERS" 2-up grid above the bill lines.
 * Path: src/components/mobile/premium/PosFastPicks.tsx
 *
 * Feed it either the live search hits (when searchTerm is set) or the
 * top-seller list. Both are plain arrays — no new query is required:
 * for top sellers reuse the existing `sale_items` aggregation the owner
 * dashboard already runs ("owner-top-selling") or a variant list ordered
 * by stock_qty, mapped to this shape.
 */
import { SectionHead } from "./index";

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
  const title = searchTerm?.trim()
    ? `Matches · ${searchTerm.trim()}`
    : "Fast picks · top sellers";

  return (
    <>
      <SectionHead
        title={title}
        right={<p className="text-[10px] font-medium text-[var(--ez-muted)]">{loading ? "searching…" : "tap to add"}</p>}
      />
      <div className="grid grid-cols-2 border-t border-[var(--ez-rule-thin)]">
        {items.map((p) => (
          <button
            key={p.id}
            type="button"
            onClick={p.onAdd}
            className="border-b border-r border-[var(--ez-rule-thin)] bg-[var(--ez-ground)] px-2.5 pb-2.5 pt-2.5 text-left active:bg-[var(--ez-tint)]"
          >
            <p className="truncate text-[12px] font-bold leading-[1.25]">{p.name}</p>
            <p className="mt-[3px] text-[9.5px] font-medium uppercase leading-none tracking-[0.06em] text-[var(--ez-muted)]">
              {p.meta}
            </p>
            <p className="num mt-1.5 text-[15px] font-extrabold leading-none text-[var(--ez-accent-600)]">{p.price}</p>
          </button>
        ))}
        {items.length === 0 ? (
          <p className="col-span-2 border-b border-[var(--ez-rule-thin)] px-3.5 py-4 text-[12px] font-medium text-[var(--ez-muted)]">
            {loading ? "Searching…" : "No products found"}
          </p>
        ) : null}
      </div>
    </>
  );
}
