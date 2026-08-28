import { useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Loader2, Plus, Trash2 } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Table, TableBody, TableCell, TableRow } from "@/components/ui/table";
import {
  INSIGHTS_BODY_CELL,
  INSIGHTS_BODY_ROW,
  INSIGHTS_TAB_SHELL,
  InsightsPanel,
  InsightsStaticTh,
  InsightsTableHeader,
} from "@/components/business-insights/insightsLayout";
import { STALE_FREQUENT } from "@/lib/queryStaleTimes";
import { coerceToArray } from "@/lib/coerceToMap";
import { websiteFrom } from "@/lib/websiteDb";
import { cn } from "@/lib/utils";
import type { WebsiteMenu } from "@/lib/websiteTypes";

export function WebsiteMenusPanel({ orgId }: { orgId?: string }) {
  const queryClient = useQueryClient();
  const [newLabel, setNewLabel] = useState("");
  const [newCategory, setNewCategory] = useState("");
  const [newParentId, setNewParentId] = useState<string>("");

  const menusQuery = useQuery({
    queryKey: ["website_menus", orgId],
    enabled: !!orgId,
    staleTime: STALE_FREQUENT,
    queryFn: async () => {
      const { data, error } = await websiteFrom("website_menus")
        .select("*")
        .eq("organization_id", orgId!)
        .order("display_order", { ascending: true });
      if (error) throw error;
      return (data || []) as WebsiteMenu[];
    },
  });

  const menus = coerceToArray<WebsiteMenu>(menusQuery.data);
  const topLevel = useMemo(() => menus.filter((m) => !m.parent_id), [menus]);

  const invalidate = () => queryClient.invalidateQueries({ queryKey: ["website_menus", orgId] });

  const addMenu = useMutation({
    mutationFn: async () => {
      if (!orgId) throw new Error("No organization");
      const label = newLabel.trim();
      if (!label) throw new Error("Enter a menu label");
      const siblings = menus.filter((m) => (m.parent_id ?? null) === (newParentId || null));
      const maxOrder = siblings.reduce((m, row) => Math.max(m, row.display_order || 0), 0);
      const { error } = await websiteFrom("website_menus").insert({
        organization_id: orgId,
        parent_id: newParentId || null,
        label,
        category_filter: newCategory.trim() || null,
        display_order: maxOrder + 1,
        is_active: true,
      });
      if (error) throw error;
    },
    onSuccess: () => {
      toast.success(newParentId ? "Submenu added" : "Menu added");
      setNewLabel("");
      setNewCategory("");
      invalidate();
    },
    onError: (err: Error) => toast.error(err.message || "Could not add menu"),
  });

  const updateMenu = useMutation({
    mutationFn: async (patch: Partial<WebsiteMenu> & { id: string }) => {
      if (!orgId) throw new Error("No organization");
      const { id, ...values } = patch;
      const { error } = await websiteFrom("website_menus")
        .update(values)
        .eq("id", id)
        .eq("organization_id", orgId);
      if (error) throw error;
    },
    onSuccess: invalidate,
    onError: (err: Error) => toast.error(err.message || "Could not update menu"),
  });

  const deleteMenu = useMutation({
    mutationFn: async (id: string) => {
      if (!orgId) throw new Error("No organization");
      const { error } = await websiteFrom("website_menus").delete().eq("id", id).eq("organization_id", orgId);
      if (error) throw error;
    },
    onSuccess: () => {
      toast.success("Menu removed");
      invalidate();
    },
    onError: (err: Error) => toast.error(err.message || "Could not delete menu"),
  });

  const renderRow = (menu: WebsiteMenu, depth: 0 | 1) => (
    <TableRow key={menu.id} className={INSIGHTS_BODY_ROW}>
      <TableCell className={cn(INSIGHTS_BODY_CELL, depth === 1 && "pl-8")}>
        <Input
          defaultValue={menu.label}
          className="h-8 text-sm border-slate-200 bg-white"
          onBlur={(e) => {
            const label = e.target.value.trim();
            if (label && label !== menu.label) updateMenu.mutate({ id: menu.id, label });
          }}
        />
      </TableCell>
      <TableCell className={INSIGHTS_BODY_CELL}>
        <Input
          defaultValue={menu.category_filter ?? ""}
          placeholder="Category filter (optional)"
          className="h-8 text-sm border-slate-200 bg-white"
          onBlur={(e) => {
            const category_filter = e.target.value.trim() || null;
            if (category_filter !== (menu.category_filter ?? null)) {
              updateMenu.mutate({ id: menu.id, category_filter });
            }
          }}
        />
      </TableCell>
      <TableCell className={cn(INSIGHTS_BODY_CELL, "text-center")}>
        <Switch
          checked={menu.is_active}
          onCheckedChange={(checked) => updateMenu.mutate({ id: menu.id, is_active: checked })}
        />
      </TableCell>
      <TableCell className={INSIGHTS_BODY_CELL}>
        <Button
          type="button"
          variant="ghost"
          size="icon"
          className="h-8 w-8 text-destructive"
          onClick={() => deleteMenu.mutate(menu.id)}
        >
          <Trash2 className="h-4 w-4" />
        </Button>
      </TableCell>
    </TableRow>
  );

  return (
    <div className={INSIGHTS_TAB_SHELL}>
      <InsightsPanel
        title="Store menus"
        subtitle="Create top-level menus and submenus. Optional category filter shows matching products on the public store."
        className="flex-1 min-h-0"
        toolbar={
          <div className="flex flex-wrap items-end gap-2 ml-auto">
            <div className="space-y-1">
              <Label className="text-[10px] uppercase tracking-wide text-slate-500">Parent menu</Label>
              <select
                value={newParentId}
                onChange={(e) => setNewParentId(e.target.value)}
                className="h-9 rounded-md border border-slate-200 bg-white px-2 text-sm min-w-[140px]"
              >
                <option value="">Top level</option>
                {topLevel.map((m) => (
                  <option key={m.id} value={m.id}>
                    {m.label}
                  </option>
                ))}
              </select>
            </div>
            <div className="space-y-1">
              <Label className="text-[10px] uppercase tracking-wide text-slate-500">Label</Label>
              <Input
                value={newLabel}
                onChange={(e) => setNewLabel(e.target.value)}
                placeholder="e.g. Men, Women"
                className="h-9 w-40 text-sm border-slate-200 bg-white"
              />
            </div>
            <div className="space-y-1">
              <Label className="text-[10px] uppercase tracking-wide text-slate-500">Category filter</Label>
              <Input
                value={newCategory}
                onChange={(e) => setNewCategory(e.target.value)}
                placeholder="Optional ERP category"
                className="h-9 w-44 text-sm border-slate-200 bg-white"
              />
            </div>
            <Button
              type="button"
              className="h-9 text-sm"
              onClick={() => addMenu.mutate()}
              disabled={addMenu.isPending || !newLabel.trim()}
            >
              {addMenu.isPending ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Plus className="mr-2 h-4 w-4" />}
              Add menu
            </Button>
          </div>
        }
        footer={
          <span className="text-xs text-muted-foreground">
            {menus.length} menu item{menus.length === 1 ? "" : "s"}
          </span>
        }
      >
        {menusQuery.isLoading ? (
          <p className="p-4 text-sm text-muted-foreground">Loading menus…</p>
        ) : menus.length === 0 ? (
          <p className="p-4 text-sm text-muted-foreground">
            No menus yet. Add a top-level menu or submenu to organize your public store.
          </p>
        ) : (
          <Table className="w-full min-w-max">
            <InsightsTableHeader>
              <InsightsStaticTh label="Menu label" />
              <InsightsStaticTh label="Category filter" />
              <InsightsStaticTh label="Active" className="w-20 text-center" />
              <InsightsStaticTh label="" className="w-12" />
            </InsightsTableHeader>
            <TableBody>
              {topLevel.flatMap((parent) => [
                renderRow(parent, 0),
                ...menus.filter((m) => m.parent_id === parent.id).map((child) => renderRow(child, 1)),
              ])}
            </TableBody>
          </Table>
        )}
      </InsightsPanel>
    </div>
  );
}
