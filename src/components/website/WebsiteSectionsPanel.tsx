import { useState } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
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
import { useWebsiteSections } from "@/hooks/useWebsiteSections";
import { websiteFrom } from "@/lib/websiteDb";
import {
  isMissingWebsiteSectionsSchema,
  buildSettingsSection,
} from "@/lib/websiteSectionStore";
import { saveWebsiteSections } from "@/lib/websiteSectionIo";
import {
  isNewArrivalSlug,
  slugifySectionLabel,
  type WebsiteSection,
} from "@/lib/websiteSections";
import { cn } from "@/lib/utils";

export function WebsiteSectionsPanel({ orgId }: { orgId?: string }) {
  const queryClient = useQueryClient();
  const [newLabel, setNewLabel] = useState("");
  const sectionsQuery = useWebsiteSections(orgId);
  const sections = sectionsQuery.data?.sections ?? [];
  const storage = sectionsQuery.data?.storage ?? "settings";
  const productSections = sectionsQuery.data?.productSections ?? {};

  const invalidate = () => queryClient.invalidateQueries({ queryKey: ["website_sections", orgId] });

  const persistSettings = async (next: WebsiteSection[]) => {
    if (!orgId) throw new Error("No organization");
    await saveWebsiteSections(orgId, "settings", next, productSections);
  };

  const addSection = useMutation({
    mutationFn: async () => {
      if (!orgId) throw new Error("No organization");
      const label = newLabel.trim();
      if (!label) throw new Error("Enter a section name");
      const slug = slugifySectionLabel(label);
      if (sections.some((s) => s.slug === slug)) throw new Error("That section already exists");
      const maxOrder = sections.reduce((m, row) => Math.max(m, row.display_order || 0), 0);
      const row = {
        organization_id: orgId,
        slug,
        label,
        display_order: maxOrder + 1,
        is_active: true,
      };
      if (storage === "table") {
        const { error } = await websiteFrom("website_sections").insert(row);
        if (error) {
          if (!isMissingWebsiteSectionsSchema(error.message)) throw error;
          await persistSettings([
            ...sections,
            buildSettingsSection(orgId, { ...row, label, slug }),
          ]);
          return;
        }
        return;
      }
      await persistSettings([...sections, buildSettingsSection(orgId, { ...row, label, slug })]);
    },
    onSuccess: () => {
      toast.success("Section added");
      setNewLabel("");
      invalidate();
    },
    onError: (err: Error) => toast.error(err.message || "Could not add section"),
  });

  const updateSection = useMutation({
    mutationFn: async (patch: Partial<WebsiteSection> & { id: string }) => {
      if (!orgId) throw new Error("No organization");
      if (storage === "table") {
        const { id, ...values } = patch;
        const { error } = await websiteFrom("website_sections")
          .update(values)
          .eq("id", id)
          .eq("organization_id", orgId);
        if (error) {
          if (!isMissingWebsiteSectionsSchema(error.message)) throw error;
        } else {
          return;
        }
      }
      await persistSettings(
        sections.map((s) => (s.id === patch.id ? { ...s, ...patch } : s)),
      );
    },
    onSuccess: invalidate,
    onError: (err: Error) => toast.error(err.message || "Could not update section"),
  });

  const deleteSection = useMutation({
    mutationFn: async (section: WebsiteSection) => {
      if (!orgId) throw new Error("No organization");
      if (isNewArrivalSlug(section.slug)) throw new Error("New Arrival cannot be deleted");
      if (storage === "table") {
        const { error } = await websiteFrom("website_sections")
          .delete()
          .eq("id", section.id)
          .eq("organization_id", orgId);
        if (error) {
          if (!isMissingWebsiteSectionsSchema(error.message)) throw error;
        } else {
          return;
        }
      }
      const nextMap = { ...productSections };
      for (const [productId, slug] of Object.entries(nextMap)) {
        if (slug === section.slug) delete nextMap[productId];
      }
      await saveWebsiteSections(
        orgId,
        "settings",
        sections.filter((s) => s.id !== section.id),
        nextMap,
      );
    },
    onSuccess: () => {
      toast.success("Section removed");
      invalidate();
    },
    onError: (err: Error) => toast.error(err.message || "Could not delete section"),
  });

  return (
    <div className={INSIGHTS_TAB_SHELL}>
      <InsightsPanel
        title="Store sections"
        subtitle="New Arrival shows first on the public store. Add sections such as Eid Collection or Exhibition Collection, then pick one when you publish a product."
        className="flex-1 min-h-0"
        toolbar={
          <div className="flex flex-wrap items-end gap-2 ml-auto">
            <div className="space-y-1">
              <Label className="text-[10px] uppercase tracking-wide text-slate-500">Section name</Label>
              <Input
                value={newLabel}
                onChange={(e) => setNewLabel(e.target.value)}
                placeholder="e.g. Eid Collection"
                className="h-9 w-52 text-sm border-slate-200 bg-white"
              />
            </div>
            <Button
              type="button"
              className="h-9 text-sm"
              onClick={() => addSection.mutate()}
              disabled={addSection.isPending || !newLabel.trim()}
            >
              {addSection.isPending ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Plus className="mr-2 h-4 w-4" />}
              Add section
            </Button>
          </div>
        }
        footer={
          <span className="text-xs text-muted-foreground">
            {sections.length} section{sections.length === 1 ? "" : "s"}
          </span>
        }
      >
        {sectionsQuery.isLoading ? (
          <p className="p-4 text-sm text-muted-foreground">Loading sections…</p>
        ) : sectionsQuery.isError ? (
          <p className="p-4 text-sm text-destructive">
            {sectionsQuery.error instanceof Error
              ? sectionsQuery.error.message
              : "Could not load sections"}
          </p>
        ) : sections.length === 0 ? (
          <p className="p-4 text-sm text-muted-foreground">
            No sections yet. Add New Arrival or a custom collection such as Eid Collection.
          </p>
        ) : (
          <Table className="w-full min-w-max">
            <InsightsTableHeader>
              <InsightsStaticTh label="Section" />
              <InsightsStaticTh label="Active" className="w-20 text-center" />
              <InsightsStaticTh label="" className="w-12" />
            </InsightsTableHeader>
            <TableBody>
              {sections.map((section) => (
                <TableRow key={section.id} className={INSIGHTS_BODY_ROW}>
                  <TableCell className={INSIGHTS_BODY_CELL}>
                    <Input
                      defaultValue={section.label}
                      className="h-8 text-sm border-slate-200 bg-white"
                      onBlur={(e) => {
                        const label = e.target.value.trim();
                        if (label && label !== section.label) updateSection.mutate({ id: section.id, label });
                      }}
                    />
                  </TableCell>
                  <TableCell className={cn(INSIGHTS_BODY_CELL, "text-center")}>
                    <Switch
                      checked={section.is_active}
                      onCheckedChange={(checked) =>
                        updateSection.mutate({ id: section.id, is_active: checked })
                      }
                      disabled={isNewArrivalSlug(section.slug)}
                    />
                  </TableCell>
                  <TableCell className={INSIGHTS_BODY_CELL}>
                    <Button
                      type="button"
                      variant="ghost"
                      size="icon"
                      className="h-8 w-8 text-destructive"
                      disabled={isNewArrivalSlug(section.slug)}
                      onClick={() => deleteSection.mutate(section)}
                    >
                      <Trash2 className="h-4 w-4" />
                    </Button>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        )}
      </InsightsPanel>
    </div>
  );
}
