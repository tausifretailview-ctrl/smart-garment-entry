import { useEffect, useMemo, useRef, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { CheckCircle2, Expand, ImagePlus, Images, Loader2, RefreshCw, Search, Trash2, UploadCloud, XCircle } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { cn } from "@/lib/utils";
import {
  colorKey,
  fetchColorCards,
  findCardForGuess,
  importNameGuesses,
  removeColorPhoto,
  saveColorPhoto,
  type ColorCard,
} from "@/lib/data/productColorImages";

/**
 * Product Master → Photos (Nov 2026): one photo per product colour — not per size or MRP —
 * for taking orders from pictures (Field Sales shows them). Drop a photo on a card, or import
 * many named "<article> <colour>.jpg".
 */
const PAGE = 60;

/** A swatch for common colour names; others get a neutral chip. */
const SWATCHES: Record<string, string> = {
  BLACK: "#111827", BK: "#111827", BLK: "#111827", WHITE: "#ffffff", WH: "#ffffff", WHT: "#ffffff", RED: "#dc2626",
  MAROON: "#7f1d1d", BLUE: "#2563eb", NAVY: "#1e3a8a", "NAVY BLUE": "#1e3a8a", "SKY BLUE": "#38bdf8", GREEN: "#16a34a",
  OLIVE: "#4d7c0f", BROWN: "#7c4a1e", TAN: "#c08552", BEIGE: "#e7d8bd", CREAM: "#f5ecd7", GREY: "#9ca3af", GRAY: "#9ca3af",
  YELLOW: "#facc15", MUSTARD: "#ca8a04", ORANGE: "#f97316", PINK: "#ec4899", PEACH: "#fdba74", PURPLE: "#9333ea",
  WINE: "#7f1d3a", KHAKI: "#bdb76b", SILVER: "#c0c0c0", GOLD: "#d4af37", CAMEL: "#c19a6b", SKIN: "#f1c27d",
};
const swatchFor = (c: string) => SWATCHES[c.trim().toUpperCase()] ?? null;

function ColorChip({ color }: { color: string }) {
  const sw = swatchFor(color);
  return (
    <span className="inline-flex max-w-full items-center gap-1.5 rounded-full border bg-white px-2 py-0.5 text-[11px] font-semibold uppercase tracking-wide text-slate-700">
      <span
        className="h-2.5 w-2.5 shrink-0 rounded-full border border-slate-300"
        style={{ background: sw ?? "conic-gradient(#f87171,#facc15,#4ade80,#60a5fa,#c084fc,#f87171)" }}
      />
      <span className="truncate">{color || "No colour"}</span>
    </span>
  );
}

function PhotoCard({
  card,
  busy,
  onFile,
  onRemove,
  onView,
}: {
  card: ColorCard;
  busy: boolean;
  onFile: (f: File) => void;
  onRemove: () => void;
  onView: () => void;
}) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [over, setOver] = useState(false);
  const label = `${card.product_name}${card.color ? ` ${card.color}` : ""}`;
  return (
    <div
      data-testid="color-photo-card"
      className={cn(
        "group flex flex-col overflow-hidden rounded-2xl border bg-white shadow-sm transition-all hover:-translate-y-0.5 hover:shadow-lg",
        over && "ring-2 ring-primary ring-offset-2",
      )}
      onDragOver={(e) => {
        e.preventDefault();
        setOver(true);
      }}
      onDragLeave={() => setOver(false)}
      onDrop={(e) => {
        e.preventDefault();
        setOver(false);
        const f = e.dataTransfer.files?.[0];
        if (f) onFile(f);
      }}
    >
      <div className="relative aspect-[4/5] bg-gradient-to-br from-slate-50 to-slate-100">
        {card.image_url ? (
          <>
            <img src={card.image_url} alt={label} loading="lazy" className="h-full w-full object-cover" />
            <div className="absolute inset-0 flex items-end justify-center gap-2 bg-gradient-to-t from-black/60 via-black/0 to-transparent p-3 opacity-0 transition-opacity group-hover:opacity-100 focus-within:opacity-100">
              {[
                { icon: Expand, label: "View", onClick: onView, cls: "" },
                { icon: RefreshCw, label: "Replace", onClick: () => inputRef.current?.click(), cls: "" },
                { icon: Trash2, label: "Remove", onClick: onRemove, cls: "text-red-600" },
              ].map(({ icon: Icon, label: what, onClick, cls }) => (
                <button
                  key={what}
                  type="button"
                  onClick={onClick}
                  title={`${what} photo`}
                  aria-label={`${what} photo ${label}`}
                  className={cn(
                    "flex h-9 w-9 items-center justify-center rounded-full bg-white/95 text-slate-800 shadow-md transition-transform hover:scale-110",
                    cls,
                  )}
                >
                  <Icon className="h-4 w-4" />
                </button>
              ))}
            </div>
          </>
        ) : (
          <button
            type="button"
            onClick={() => inputRef.current?.click()}
            className="absolute inset-3 flex flex-col items-center justify-center gap-2 rounded-xl border-2 border-dashed border-slate-300 text-slate-500 transition-colors hover:border-primary hover:bg-primary/5 hover:text-primary"
            aria-label={`Add photo ${label}`}
          >
            <ImagePlus className="h-8 w-8" />
            <span className="text-sm font-semibold">Add photo</span>
            <span className="text-[11px]">or drop it here</span>
          </button>
        )}
        {busy ? (
          <div className="absolute inset-0 flex items-center justify-center bg-white/70 backdrop-blur-[1px]">
            <Loader2 className="h-7 w-7 animate-spin text-primary" />
          </div>
        ) : null}
        {card.image_url ? (
          <span className="absolute left-2 top-2 inline-flex items-center gap-1 rounded-full bg-emerald-600/90 px-2 py-0.5 text-[10px] font-bold uppercase tracking-wide text-white shadow">
            <CheckCircle2 className="h-3 w-3" /> Photo
          </span>
        ) : null}
        <input
          ref={inputRef}
          type="file"
          accept="image/*"
          className="hidden"
          aria-label={`Photo file ${label}`}
          onChange={(e) => {
            const f = e.target.files?.[0];
            e.target.value = "";
            if (f) onFile(f);
          }}
        />
      </div>
      <div className="flex flex-1 flex-col gap-1.5 p-3">
        <div className="truncate text-[15px] font-bold leading-tight text-slate-900" title={card.product_name}>
          {card.product_name}
        </div>
        <div className="truncate text-xs text-slate-500">
          {[card.brand, card.category].filter(Boolean).join(" · ") || " "}
        </div>
        <div className="mt-auto flex items-center justify-between gap-2 pt-1">
          <ColorChip color={card.color} />
          {card.stock_qty > 0 ? <span className="shrink-0 text-[11px] font-medium text-slate-500">Stock {card.stock_qty}</span> : null}
        </div>
      </div>
    </div>
  );
}

type ImportRow = { file: File; preview: string; card: ColorCard | null; status: "matching" | "ready" | "nomatch" | "done" | "failed"; error?: string };

function ImportDialog({
  orgId,
  open,
  onOpenChange,
  onDone,
}: {
  orgId: string;
  open: boolean;
  onOpenChange: (o: boolean) => void;
  onDone: () => void;
}) {
  const [rows, setRows] = useState<ImportRow[]>([]);
  const [uploading, setUploading] = useState(false);
  const [over, setOver] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);
  const searchCache = useRef(new Map<string, Promise<ColorCard[]>>());

  useEffect(() => {
    if (!open) {
      rows.forEach((r) => URL.revokeObjectURL(r.preview));
      setRows([]);
      searchCache.current.clear();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps -- reset only when the dialog closes
  }, [open]);

  const search = (article: string) => {
    const key = article.toLowerCase();
    let p = searchCache.current.get(key);
    if (!p) {
      p = fetchColorCards(orgId, { search: article, limit: 200 }).then((r) => r?.cards ?? []);
      searchCache.current.set(key, p);
    }
    return p;
  };

  const match = async (file: File): Promise<ColorCard | null> => {
    for (const guess of importNameGuesses(file.name)) {
      if (!guess.article) continue;
      const found = findCardForGuess(await search(guess.article), guess);
      if (found) return found;
    }
    return null;
  };

  const addFiles = async (files: FileList | File[]) => {
    const list = Array.from(files).filter((f) => f.type.startsWith("image/"));
    if (list.length === 0) return;
    const start = rows.length;
    setRows((prev) => [...prev, ...list.map((file) => ({ file, preview: URL.createObjectURL(file), card: null, status: "matching" as const }))]);
    // A few at a time.
    let next = 0;
    const worker = async () => {
      while (next < list.length) {
        const i = next++;
        const card = await match(list[i]).catch(() => null);
        setRows((prev) => prev.map((r, j) => (j === start + i ? { ...r, card, status: card ? "ready" : "nomatch" } : r)));
      }
    };
    await Promise.all([worker(), worker(), worker(), worker()]);
  };

  const ready = rows.filter((r) => r.status === "ready");
  const upload = async () => {
    setUploading(true);
    let ok = 0;
    for (let i = 0; i < rows.length; i += 1) {
      const r = rows[i];
      if (r.status !== "ready" || !r.card) continue;
      try {
        await saveColorPhoto(orgId, r.card, r.file);
        ok += 1;
        setRows((prev) => prev.map((x, j) => (j === i ? { ...x, status: "done" } : x)));
      } catch (e) {
        setRows((prev) => prev.map((x, j) => (j === i ? { ...x, status: "failed", error: e instanceof Error ? e.message : "Failed" } : x)));
      }
    }
    setUploading(false);
    if (ok > 0) {
      toast.success(`${ok} photo${ok === 1 ? "" : "s"} saved`);
      onDone();
    }
  };

  return (
    <Dialog open={open} onOpenChange={(o) => !uploading && onOpenChange(o)}>
      <DialogContent className="max-w-3xl">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Images className="h-5 w-5 text-primary" /> Import photos
          </DialogTitle>
          <DialogDescription>
            Name each photo with the article and colour, like <b>RC 5001 BROWN.jpg</b> (an article with one colour can
            be just <b>MR50.jpg</b>). Each photo is matched to its product colour; check the list, then upload.
          </DialogDescription>
        </DialogHeader>
        <div
          className={cn(
            "flex cursor-pointer flex-col items-center justify-center gap-1 rounded-xl border-2 border-dashed p-6 text-center transition-colors",
            over ? "border-primary bg-primary/5" : "border-slate-300 hover:border-primary/60",
          )}
          onClick={() => inputRef.current?.click()}
          onDragOver={(e) => {
            e.preventDefault();
            setOver(true);
          }}
          onDragLeave={() => setOver(false)}
          onDrop={(e) => {
            e.preventDefault();
            setOver(false);
            void addFiles(e.dataTransfer.files);
          }}
          data-testid="photo-import-drop"
        >
          <UploadCloud className="h-9 w-9 text-primary" />
          <div className="text-sm font-semibold">Drop photos here or click to choose</div>
          <div className="text-xs text-muted-foreground">JPG, PNG or WEBP. Large photos are made smaller before upload.</div>
          <input
            ref={inputRef}
            type="file"
            accept="image/*"
            multiple
            className="hidden"
            aria-label="Photo files"
            onChange={(e) => {
              if (e.target.files) void addFiles(e.target.files);
              e.target.value = "";
            }}
          />
        </div>
        {rows.length > 0 ? (
          <div className="max-h-[45vh] space-y-1.5 overflow-y-auto pr-1" data-testid="photo-import-list">
            {rows.map((r, i) => (
              <div key={i} className="flex items-center gap-3 rounded-lg border bg-white p-2" data-testid="photo-import-row">
                <img src={r.preview} alt="" className="h-12 w-10 shrink-0 rounded object-cover" />
                <div className="min-w-0 flex-1">
                  <div className="truncate text-sm font-medium">{r.file.name}</div>
                  <div className="text-xs">
                    {r.status === "matching" ? (
                      <span className="text-muted-foreground">Matching…</span>
                    ) : r.card ? (
                      <span className="font-semibold text-emerald-700">
                        → {r.card.product_name}
                        {r.card.color ? ` · ${r.card.color}` : ""}
                        {r.card.image_url && r.status === "ready" ? " (replaces the photo)" : ""}
                      </span>
                    ) : (
                      <span className="font-semibold text-amber-700">No product colour with this name</span>
                    )}
                    {r.error ? <span className="ml-1 text-red-600">{r.error}</span> : null}
                  </div>
                </div>
                {r.status === "done" ? <CheckCircle2 className="h-5 w-5 text-emerald-600" /> : null}
                {r.status === "failed" || r.status === "nomatch" ? <XCircle className="h-5 w-5 text-amber-600" /> : null}
              </div>
            ))}
          </div>
        ) : null}
        <DialogFooter className="gap-2 sm:justify-between">
          <span className="self-center text-xs text-muted-foreground">
            {rows.length > 0 ? `${ready.length} ready · ${rows.filter((r) => r.status === "nomatch").length} not matched` : ""}
          </span>
          <div className="flex gap-2">
            <Button type="button" variant="outline" disabled={uploading} onClick={() => onOpenChange(false)}>
              Close
            </Button>
            <Button type="button" disabled={uploading || ready.length === 0} onClick={() => void upload()}>
              {uploading ? <Loader2 className="mr-1 h-4 w-4 animate-spin" /> : <UploadCloud className="mr-1 h-4 w-4" />}
              Upload {ready.length} photo{ready.length === 1 ? "" : "s"}
            </Button>
          </div>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

export function ProductColorPhotos({ orgId }: { orgId: string }) {
  const queryClient = useQueryClient();
  const [searchText, setSearchText] = useState("");
  const [search, setSearch] = useState("");
  const [onlyMissing, setOnlyMissing] = useState(false);
  const [pages, setPages] = useState(1);
  const [busy, setBusy] = useState<Set<string>>(new Set());
  const [viewing, setViewing] = useState<ColorCard | null>(null);
  const [importOpen, setImportOpen] = useState(false);

  useEffect(() => {
    const t = window.setTimeout(() => {
      setSearch(searchText.trim());
      setPages(1);
    }, 300);
    return () => window.clearTimeout(t);
  }, [searchText]);

  const queryKey = ["product-color-cards", orgId, search, onlyMissing, pages] as const;
  const { data, isLoading, isFetching, error } = useQuery({
    queryKey,
    enabled: !!orgId,
    placeholderData: (prev) => prev,
    queryFn: () => fetchColorCards(orgId, { search, onlyMissing, limit: PAGE * pages }),
  });
  const missingSql = data === null;
  const cards = useMemo(() => data?.cards ?? [], [data]);
  const pct = data && data.all > 0 ? Math.round((data.withPhoto / data.all) * 100) : 0;

  const reload = () => void queryClient.invalidateQueries({ queryKey: ["product-color-cards", orgId] });

  const withBusy = async (card: ColorCard, work: () => Promise<unknown>, done: string) => {
    const key = colorKey(card.product_id, card.color);
    setBusy((s) => new Set(s).add(key));
    try {
      await work();
      toast.success(done);
      reload();
    } catch (e) {
      toast.error("Not saved", { description: e instanceof Error ? e.message : undefined });
    } finally {
      setBusy((s) => {
        const n = new Set(s);
        n.delete(key);
        return n;
      });
    }
  };

  return (
    <div className="space-y-4" data-testid="product-color-photos">
      <div className="overflow-hidden rounded-2xl border bg-gradient-to-r from-slate-900 via-slate-800 to-indigo-900 p-5 text-white shadow-sm">
        <div className="flex flex-wrap items-center gap-4">
          <div className="mr-auto">
            <h2 className="flex items-center gap-2 text-lg font-bold">
              <Images className="h-5 w-5" /> Photos by colour
            </h2>
            <p className="text-sm text-white/75">
              One photo for each colour of a product. Salesmen book orders from these photos in Field Sales.
            </p>
          </div>
          <Button type="button" onClick={() => setImportOpen(true)} className="bg-white text-slate-900 hover:bg-white/90" disabled={missingSql}>
            <UploadCloud className="mr-1.5 h-4 w-4" /> Import photos
          </Button>
        </div>
        {data && data.all > 0 ? (
          <div className="mt-4">
            <div className="flex items-baseline justify-between text-sm">
              <span data-testid="photo-progress-text">
                <b className="text-base">{data.withPhoto}</b> of {data.all} colours have a photo
              </span>
              <span className="font-semibold">{pct}%</span>
            </div>
            <div className="mt-1.5 h-2 overflow-hidden rounded-full bg-white/20">
              <div className="h-full rounded-full bg-gradient-to-r from-emerald-400 to-teal-300 transition-all" style={{ width: `${pct}%` }} />
            </div>
          </div>
        ) : null}
      </div>

      <div className="flex flex-wrap items-center gap-2">
        <div className="relative min-w-[220px] flex-1 sm:max-w-sm">
          <Search className="pointer-events-none absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
          <Input
            value={searchText}
            onChange={(e) => setSearchText(e.target.value)}
            placeholder="Search article, brand, colour or barcode"
            className="h-9 pl-8"
            aria-label="Search photos"
          />
        </div>
        <div className="inline-flex rounded-lg border bg-white p-0.5">
          {[
            { v: false, label: "All" },
            { v: true, label: "Missing photo" },
          ].map((o) => (
            <button
              key={o.label}
              type="button"
              onClick={() => {
                setOnlyMissing(o.v);
                setPages(1);
              }}
              className={cn(
                "rounded-md px-3 py-1.5 text-sm font-medium transition-colors",
                onlyMissing === o.v ? "bg-slate-900 text-white" : "text-slate-600 hover:bg-slate-100",
              )}
              aria-pressed={onlyMissing === o.v}
            >
              {o.label}
            </button>
          ))}
        </div>
        {isFetching && !isLoading ? <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" /> : null}
      </div>

      {missingSql ? (
        <p className="rounded-md border border-amber-200 bg-amber-50 p-3 text-sm text-amber-900">
          Run SQL 77 (colour photos) in the database first.
        </p>
      ) : null}
      {error ? <p className="text-sm text-destructive">{(error as Error).message}</p> : null}
      {isLoading ? (
        <div className="grid grid-cols-2 gap-4 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5 2xl:grid-cols-6">
          {Array.from({ length: 10 }, (_, i) => (
            <div key={i} className="aspect-[4/6] animate-pulse rounded-2xl bg-slate-100" />
          ))}
        </div>
      ) : null}
      {!isLoading && !missingSql && cards.length === 0 ? (
        <div className="rounded-2xl border border-dashed p-10 text-center text-sm text-muted-foreground">
          {onlyMissing ? "Every colour has a photo." : "No products found."}
        </div>
      ) : null}

      {cards.length > 0 ? (
        <div className="grid grid-cols-2 gap-4 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5 2xl:grid-cols-6">
          {cards.map((card) => (
            <PhotoCard
              key={colorKey(card.product_id, card.color)}
              card={card}
              busy={busy.has(colorKey(card.product_id, card.color))}
              onFile={(f) => void withBusy(card, () => saveColorPhoto(orgId, card, f), `Photo saved: ${card.product_name}${card.color ? ` ${card.color}` : ""}`)}
              onRemove={() => {
                if (!window.confirm(`Remove the photo of ${card.product_name}${card.color ? ` ${card.color}` : ""}?`)) return;
                void withBusy(card, () => removeColorPhoto(orgId, card), "Photo removed");
              }}
              onView={() => setViewing(card)}
            />
          ))}
        </div>
      ) : null}
      {data && cards.length < data.total ? (
        <div className="flex justify-center">
          <Button type="button" variant="outline" onClick={() => setPages((p) => p + 1)} disabled={isFetching}>
            Show more ({data.total - cards.length} more)
          </Button>
        </div>
      ) : null}

      <Dialog open={!!viewing} onOpenChange={(o) => !o && setViewing(null)}>
        <DialogContent className="max-w-3xl p-0 overflow-hidden">
          {viewing?.image_url ? (
            <div className="bg-slate-950">
              <img src={viewing.image_url} alt={viewing.product_name} className="mx-auto max-h-[80vh] w-auto object-contain" />
              <div className="flex items-center justify-between gap-2 bg-white px-4 py-3">
                <div>
                  <DialogTitle className="text-base">{viewing.product_name}</DialogTitle>
                  <DialogDescription>{[viewing.brand, viewing.category].filter(Boolean).join(" · ")}</DialogDescription>
                </div>
                <ColorChip color={viewing.color} />
              </div>
            </div>
          ) : null}
        </DialogContent>
      </Dialog>

      <ImportDialog orgId={orgId} open={importOpen} onOpenChange={setImportOpen} onDone={reload} />
    </div>
  );
}
