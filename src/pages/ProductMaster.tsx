import { useMemo, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Boxes, Pencil, Plus, Search, Trash2 } from "lucide-react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { useOrganization } from "@/contexts/OrganizationContext";
import { BackToDashboard } from "@/components/BackToDashboard";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Checkbox } from "@/components/ui/checkbox";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { ProductMasterGrid } from "@/components/products/ProductMasterGrid";
import {
  PRODUCT_ATTRIBUTE_KINDS,
  addAttributeValue,
  deleteAttributeValue,
  fetchAttributeRows,
  productAttributeRowsKey,
  renameAttributeValue,
  type AttributeListsDb,
  type AttributeRow,
  type ProductAttributeKind,
} from "@/lib/data/productAttributeLists";

/**
 * Master → Product Master (Nov 2026). Shops that set their items up before buying:
 *  - field lists: product names, brands, categories, styles, colours, HSN codes, each added
 *    one by one; Add Product and Purchase then suggest them;
 *  - Create products: a sheet to type items row by row, no Add New Product window.
 * Values typed anywhere else join the lists by themselves.
 */
const db = supabase as unknown as AttributeListsDb;

function FieldList({
  kind,
  label,
  rows,
  organizationId,
  missingTable,
}: {
  kind: ProductAttributeKind;
  label: string;
  rows: AttributeRow[];
  organizationId: string;
  missingTable: boolean;
}) {
  const queryClient = useQueryClient();
  const [draft, setDraft] = useState("");
  const [search, setSearch] = useState("");
  const [busy, setBusy] = useState(false);
  const [renaming, setRenaming] = useState<AttributeRow | null>(null);
  const [newName, setNewName] = useState("");
  const [applyToItems, setApplyToItems] = useState(true);
  const refresh = () => queryClient.invalidateQueries({ queryKey: productAttributeRowsKey(organizationId) });

  const shown = useMemo(() => {
    const q = search.trim().toLowerCase();
    return q ? rows.filter((r) => r.value.toLowerCase().includes(q)) : rows;
  }, [rows, search]);

  const add = async () => {
    if (!draft.trim()) return;
    setBusy(true);
    try {
      await addAttributeValue(db, organizationId, kind, draft);
      setDraft("");
      await refresh();
    } catch (e) {
      toast.error("Not added", { description: e instanceof Error ? e.message : undefined });
    } finally {
      setBusy(false);
    }
  };

  const remove = async (row: AttributeRow) => {
    setBusy(true);
    try {
      await deleteAttributeValue(db, organizationId, row.id);
      await refresh();
    } catch (e) {
      toast.error("Not removed", { description: e instanceof Error ? e.message : undefined });
    } finally {
      setBusy(false);
    }
  };

  const saveRename = async () => {
    if (!renaming) return;
    setBusy(true);
    try {
      const res = await renameAttributeValue(db, organizationId, kind, renaming.value, newName, applyToItems);
      toast.success("Renamed", {
        description: res.itemsChanged > 0 ? `${res.itemsChanged} item(s) changed too.` : undefined,
      });
      setRenaming(null);
      await refresh();
      void queryClient.invalidateQueries({ queryKey: ["product-catalog"] });
    } catch (e) {
      toast.error("Not renamed", { description: e instanceof Error ? e.message : undefined });
    } finally {
      setBusy(false);
    }
  };

  return (
    <Card className="p-3 space-y-3">
      <div className="flex flex-wrap gap-2">
        <Input
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter") {
              e.preventDefault();
              void add();
            }
          }}
          placeholder={`New ${label.toLowerCase()}`}
          aria-label={`New ${label.toLowerCase()}`}
          className="max-w-sm"
          disabled={busy || missingTable}
        />
        <Button type="button" onClick={() => void add()} disabled={busy || missingTable || !draft.trim()}>
          <Plus className="h-4 w-4 mr-1" /> Add
        </Button>
        <div className="relative ml-auto">
          <Search className="absolute left-2 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
          <Input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Search" className="pl-8 w-56" />
        </div>
      </div>
      <div className="text-xs text-muted-foreground">{rows.length} in the list</div>
      <div className="max-h-[60vh] overflow-y-auto rounded-md border divide-y" data-testid={`product-master-list-${kind}`}>
        {shown.length === 0 ? (
          <div className="p-4 text-sm text-muted-foreground">Nothing here yet.</div>
        ) : (
          shown.map((r) => (
            <div key={r.id} className="flex items-center gap-2 px-3 py-1.5 text-sm">
              <span className="flex-1 truncate">{r.value}</span>
              <Button
                type="button"
                variant="ghost"
                size="icon"
                className="h-7 w-7"
                aria-label={`Rename ${r.value}`}
                onClick={() => {
                  setRenaming(r);
                  setNewName(r.value);
                  setApplyToItems(kind !== "product_name");
                }}
              >
                <Pencil className="h-3.5 w-3.5" />
              </Button>
              <Button
                type="button"
                variant="ghost"
                size="icon"
                className="h-7 w-7 text-destructive"
                aria-label={`Remove ${r.value}`}
                disabled={busy}
                onClick={() => void remove(r)}
              >
                <Trash2 className="h-3.5 w-3.5" />
              </Button>
            </div>
          ))
        )}
      </div>

      <Dialog open={!!renaming} onOpenChange={(o) => !o && setRenaming(null)}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>Rename {label.toLowerCase()}</DialogTitle>
            <DialogDescription>{renaming?.value}</DialogDescription>
          </DialogHeader>
          <div className="space-y-3">
            <div className="space-y-1.5">
              <Label htmlFor="pm-rename">New name</Label>
              <Input id="pm-rename" value={newName} onChange={(e) => setNewName(e.target.value)} />
            </div>
            {kind !== "product_name" ? (
              <label className="flex items-center gap-2 text-sm">
                <Checkbox checked={applyToItems} onCheckedChange={(c) => setApplyToItems(c === true)} />
                Also rename it on the items that use it
              </label>
            ) : (
              <p className="text-xs text-muted-foreground">Renames the list entry only; items keep their own names.</p>
            )}
          </div>
          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => setRenaming(null)}>
              Cancel
            </Button>
            <Button type="button" disabled={busy || !newName.trim()} onClick={() => void saveRename()}>
              Rename
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </Card>
  );
}

const ProductMaster = () => {
  const { currentOrganization } = useOrganization();
  const orgId = currentOrganization?.id;
  const { data, isLoading, error } = useQuery({
    queryKey: productAttributeRowsKey(orgId),
    enabled: !!orgId,
    queryFn: () => fetchAttributeRows(db, orgId!),
  });
  const missingTable = data === null;
  const byKind = useMemo(() => {
    const out: Record<string, AttributeRow[]> = {};
    for (const r of data ?? []) (out[r.kind] ??= []).push(r);
    return out;
  }, [data]);

  return (
    <div className="flex h-full min-h-0 flex-col gap-3 p-3 overflow-y-auto">
      <div className="flex items-center gap-2">
        <BackToDashboard />
        <Boxes className="h-5 w-5 text-primary" />
        <h1 className="text-xl font-bold">Product Master</h1>
      </div>
      {missingTable ? (
        <p className="rounded-md border border-amber-200 bg-amber-50 p-2 text-sm text-amber-900">
          Run SQL 71 (product master lists) in the database first. Until then the lists cannot be saved.
        </p>
      ) : null}
      {error ? <p className="text-sm text-destructive">Could not load the lists: {(error as Error).message}</p> : null}
      {orgId ? (
        <Tabs defaultValue="brand">
          <TabsList className="flex flex-wrap h-auto">
            {PRODUCT_ATTRIBUTE_KINDS.map((k) => (
              <TabsTrigger key={k.kind} value={k.kind}>
                {k.plural}
                <span className="ml-1 text-xs text-muted-foreground">{(byKind[k.kind] ?? []).length}</span>
              </TabsTrigger>
            ))}
            <TabsTrigger value="create">Create products</TabsTrigger>
          </TabsList>
          {PRODUCT_ATTRIBUTE_KINDS.map((k) => (
            <TabsContent key={k.kind} value={k.kind}>
              {isLoading ? (
                <p className="p-3 text-sm text-muted-foreground">Loading…</p>
              ) : (
                <FieldList
                  kind={k.kind}
                  label={k.label}
                  rows={byKind[k.kind] ?? []}
                  organizationId={orgId}
                  missingTable={missingTable}
                />
              )}
            </TabsContent>
          ))}
          <TabsContent value="create">
            <ProductMasterGrid organizationId={orgId} />
          </TabsContent>
        </Tabs>
      ) : null}
    </div>
  );
};

export default ProductMaster;
