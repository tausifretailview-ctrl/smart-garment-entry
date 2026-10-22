import { useMemo, useState } from "react";
import { format } from "date-fns";
import { useQueryClient } from "@tanstack/react-query";
import { BookmarkPlus, FileText, LayoutTemplate, Loader2, Search, Trash2, Video } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { deleteTemplate, useTemplates, type BulkTemplate } from "./bulkWhatsAppApi";

/**
 * Saved messages (text plus poster / video / PDF) for the send page: "Templates" picks one,
 * "Save as template" keeps the message being written. Shared by everyone in the shop.
 */
export function BulkWhatsAppTemplates({
  organizationId,
  canSave,
  defaultName,
  onSave,
  onPick,
}: {
  organizationId: string;
  /** There is text or a poster to save. */
  canSave: boolean;
  defaultName: string;
  onSave: (name: string) => Promise<void>;
  onPick: (t: BulkTemplate) => void;
}) {
  const queryClient = useQueryClient();
  const templates = useTemplates(organizationId);
  const [listOpen, setListOpen] = useState(false);
  const [saveOpen, setSaveOpen] = useState(false);
  const [name, setName] = useState("");
  const [saving, setSaving] = useState(false);
  const [search, setSearch] = useState("");
  const [deleting, setDeleting] = useState<string | null>(null);

  const list = templates.data ?? [];
  const shown = useMemo(() => {
    const q = search.trim().toLowerCase();
    return q ? list.filter((t) => t.name.toLowerCase().includes(q) || t.message.toLowerCase().includes(q)) : list;
  }, [list, search]);
  const refresh = () => queryClient.invalidateQueries({ queryKey: ["bulk-whatsapp-templates", organizationId] });

  const save = async () => {
    const n = name.trim();
    if (!n) return;
    setSaving(true);
    try {
      await onSave(n);
      await refresh();
      toast.success(`Template "${n}" saved`);
      setSaveOpen(false);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Could not save the template");
    } finally {
      setSaving(false);
    }
  };

  const remove = async (t: BulkTemplate) => {
    if (!window.confirm(`Delete template "${t.name}"?`)) return;
    setDeleting(t.id);
    try {
      if (await deleteTemplate(t.id)) {
        await refresh();
        toast.success("Template deleted");
      } else {
        toast.error("Only the person who saved it or an admin can delete this template");
      }
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Could not delete the template");
    } finally {
      setDeleting(null);
    }
  };

  return (
    <div className="flex items-center gap-1">
      <Button type="button" size="sm" variant="outline" className="h-7 text-xs" onClick={() => setListOpen(true)}>
        <LayoutTemplate className="mr-1 h-3.5 w-3.5" /> Templates{list.length ? ` (${list.length})` : ""}
      </Button>
      <Button
        type="button"
        size="sm"
        variant="outline"
        className="h-7 text-xs"
        disabled={!canSave}
        title={canSave ? "Save this text and poster to send again later" : "Write a message or attach a poster first"}
        onClick={() => {
          setName(defaultName.trim().slice(0, 80));
          setSaveOpen(true);
        }}
      >
        <BookmarkPlus className="mr-1 h-3.5 w-3.5" /> Save
      </Button>

      <Dialog open={saveOpen} onOpenChange={(o) => !saving && setSaveOpen(o)}>
        <DialogContent className="max-w-sm">
          <DialogHeader>
            <DialogTitle>Save as template</DialogTitle>
            <DialogDescription>The message text and poster are saved. Pick it later from Templates.</DialogDescription>
          </DialogHeader>
          <Input
            autoFocus
            value={name}
            maxLength={80}
            placeholder="Template name, e.g. Diwali offer"
            className="no-uppercase"
            onChange={(e) => setName(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter") void save();
            }}
          />
          <DialogFooter>
            <Button type="button" variant="outline" disabled={saving} onClick={() => setSaveOpen(false)}>
              Cancel
            </Button>
            <Button type="button" disabled={saving || !name.trim()} onClick={() => void save()}>
              {saving && <Loader2 className="mr-1.5 h-4 w-4 animate-spin" />}
              Save template
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={listOpen} onOpenChange={setListOpen}>
        <DialogContent className="flex max-h-[90dvh] max-w-3xl flex-col gap-3">
          <DialogHeader>
            <DialogTitle>Templates</DialogTitle>
            <DialogDescription>Pick one to fill the message and poster, then add numbers and send.</DialogDescription>
          </DialogHeader>
          {templates.data === null ? (
            <p className="rounded-lg bg-amber-50 px-3 py-2 text-sm text-amber-800">
              Templates are almost ready: the templates SQL from the update still needs to be run.
            </p>
          ) : templates.isLoading ? (
            <div className="flex justify-center py-10">
              <Loader2 className="h-5 w-5 animate-spin text-slate-400" />
            </div>
          ) : !list.length ? (
            <p className="py-10 text-center text-sm text-slate-500">
              No templates yet. Write a message, attach a poster or video, and press Save.
            </p>
          ) : (
            <>
              <div className="relative">
                <Search className="pointer-events-none absolute left-2.5 top-2.5 h-4 w-4 text-slate-400" />
                <Input
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                  placeholder="Search templates"
                  className="no-uppercase h-9 pl-8"
                />
              </div>
              <div className="grid min-h-0 flex-1 gap-2 overflow-y-auto sm:grid-cols-2">
                {shown.map((t) => (
                  <div key={t.id} className="flex gap-3 rounded-lg border border-slate-200 bg-white p-2.5">
                    <TemplateThumb t={t} />
                    <div className="flex min-w-0 flex-1 flex-col">
                      <div className="truncate text-sm font-semibold text-slate-800">{t.name}</div>
                      <p className="line-clamp-3 whitespace-pre-line text-xs text-slate-500">
                        {t.message || t.media_name || ""}
                      </p>
                      <div className="mt-auto flex items-center justify-between gap-2 pt-1.5">
                        <span className="text-[11px] text-slate-400">{format(new Date(t.created_at), "dd MMM yyyy")}</span>
                        <div className="flex items-center gap-1">
                          <Button
                            type="button"
                            size="icon"
                            variant="ghost"
                            className="h-7 w-7 text-slate-400 hover:text-destructive"
                            title="Delete"
                            disabled={deleting === t.id}
                            onClick={() => void remove(t)}
                          >
                            {deleting === t.id ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Trash2 className="h-3.5 w-3.5" />}
                          </Button>
                          <Button
                            type="button"
                            size="sm"
                            className="h-7 bg-emerald-600 text-xs text-white hover:bg-emerald-700"
                            onClick={() => {
                              onPick(t);
                              setListOpen(false);
                            }}
                          >
                            Use
                          </Button>
                        </div>
                      </div>
                    </div>
                  </div>
                ))}
                {!shown.length && <p className="py-6 text-center text-sm text-slate-500 sm:col-span-2">No template matches</p>}
              </div>
            </>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}

function TemplateThumb({ t }: { t: BulkTemplate }) {
  if (t.media_url && t.media_type?.startsWith("image/")) {
    return <img src={t.media_url} alt="" className="h-16 w-16 shrink-0 rounded-md bg-slate-100 object-cover" />;
  }
  const video = t.media_type?.startsWith("video/");
  return (
    <div className="flex h-16 w-16 shrink-0 flex-col items-center justify-center gap-0.5 rounded-md bg-slate-100 text-[10px] font-semibold text-slate-500">
      {video ? <Video className="h-5 w-5" /> : <FileText className="h-5 w-5" />}
      {video ? "Video" : t.media_url ? "PDF" : "Text"}
    </div>
  );
}
