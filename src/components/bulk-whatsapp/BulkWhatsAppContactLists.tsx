import { useMemo, useState } from "react";
import { format } from "date-fns";
import { useQueryClient } from "@tanstack/react-query";
import { Check, Loader2, Pencil, RefreshCw, Search, Trash2, X } from "lucide-react";
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
import { cn } from "@/lib/utils";
import {
  createContactList,
  deleteContactList,
  fetchContactListNumbers,
  fetchOptedOutPhones,
  updateContactList,
  useContactLists,
  type BulkContactList,
  type BulkSavedContact,
} from "./bulkWhatsAppApi";

/** WhatsApp checks saved with a list are trusted this long; older lists are checked again on use. */
const CHECK_TRUST_DAYS = 30;

export interface PickedContactList {
  name: string;
  contacts: BulkSavedContact[];
  /** Numbers checked on WhatsApp recently enough to skip the check. */
  verified: string[];
  /** Numbers in the list that replied STOP since it was saved; left out. */
  unsubscribed: number;
}

/**
 * Saved number lists for Step 2: "Save list" keeps the numbers on the page under a name, "Saved
 * lists" adds one back without importing again. Shared by everyone in the shop; unsubscribed
 * numbers are dropped when saving and when using a list.
 */
export function BulkWhatsAppContactLists({
  organizationId,
  listsOpen,
  onListsOpenChange,
  saveOpen,
  onSaveOpenChange,
  current,
  onPick,
}: {
  organizationId: string;
  listsOpen: boolean;
  onListsOpenChange: (open: boolean) => void;
  saveOpen: boolean;
  onSaveOpenChange: (open: boolean) => void;
  /** The numbers on the page now, for Save list and Update. */
  current: BulkSavedContact[];
  onPick: (picked: PickedContactList) => void;
}) {
  const queryClient = useQueryClient();
  const lists = useContactLists(organizationId);
  const all = lists.data ?? [];
  const [search, setSearch] = useState("");
  const [busy, setBusy] = useState<string | null>(null);
  const [renaming, setRenaming] = useState<{ id: string; name: string } | null>(null);
  const [saveName, setSaveName] = useState("");
  /** "" = save as a new list, else the id of the list whose numbers are replaced. */
  const [replaceId, setReplaceId] = useState("");
  const [saving, setSaving] = useState(false);

  const shown = useMemo(() => {
    const q = search.trim().toLowerCase();
    return q ? all.filter((l) => l.name.toLowerCase().includes(q)) : all;
  }, [all, search]);
  const refresh = () => queryClient.invalidateQueries({ queryKey: ["bulk-whatsapp-contact-lists", organizationId] });

  /** The page's numbers minus anyone who replied STOP. */
  const currentWithoutOptOuts = async () => {
    const stopped = await fetchOptedOutPhones(organizationId, current.map((c) => c.phone));
    return { contacts: current.filter((c) => !stopped.has(c.phone)), stopped: stopped.size };
  };
  const optOutNote = (n: number) => (n ? ` · ${n} unsubscribed left out` : "");

  const save = async () => {
    const name = saveName.trim();
    const target = all.find((l) => l.id === replaceId);
    if ((!target && !name) || !current.length) return;
    if (target && !window.confirm(`Replace the ${target.contact_count} numbers in "${target.name}" with these ${current.length}?`)) return;
    setSaving(true);
    try {
      const { contacts, stopped } = await currentWithoutOptOuts();
      if (target) {
        if (!(await updateContactList(target.id, { contacts }))) {
          toast.error("Only the person who saved it or an admin can update this list");
          return;
        }
      } else {
        await createContactList(organizationId, name, contacts);
      }
      await refresh();
      toast.success(`${contacts.length.toLocaleString("en-IN")} numbers saved in "${target?.name ?? name}"${optOutNote(stopped)}`);
      onSaveOpenChange(false);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Could not save the list");
    } finally {
      setSaving(false);
    }
  };

  const use = async (l: BulkContactList) => {
    setBusy(l.id);
    try {
      const saved = await fetchContactListNumbers(l.id);
      const stopped = await fetchOptedOutPhones(organizationId, saved.map((c) => c.phone));
      const contacts = saved.filter((c) => !stopped.has(c.phone));
      const fresh = Date.now() - new Date(l.updated_at).getTime() < CHECK_TRUST_DAYS * 86_400_000;
      onPick({
        name: l.name,
        contacts,
        verified: fresh ? contacts.filter((c) => c.wa).map((c) => c.phone) : [],
        unsubscribed: stopped.size,
      });
      onListsOpenChange(false);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Could not open the list");
    } finally {
      setBusy(null);
    }
  };

  const replace = async (l: BulkContactList) => {
    if (!window.confirm(`Replace the ${l.contact_count} numbers in "${l.name}" with the ${current.length} numbers on the page now?`)) return;
    setBusy(l.id);
    try {
      const { contacts, stopped } = await currentWithoutOptOuts();
      if (await updateContactList(l.id, { contacts })) {
        await refresh();
        toast.success(`"${l.name}" updated: ${contacts.length.toLocaleString("en-IN")} numbers${optOutNote(stopped)}`);
      } else {
        toast.error("Only the person who saved it or an admin can update this list");
      }
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Could not update the list");
    } finally {
      setBusy(null);
    }
  };

  const rename = async () => {
    if (!renaming) return;
    const name = renaming.name.trim();
    const l = all.find((x) => x.id === renaming.id);
    if (!name || !l || name === l.name) {
      setRenaming(null);
      return;
    }
    setBusy(l.id);
    try {
      if (await updateContactList(l.id, { name })) {
        await refresh();
        toast.success(`Renamed to "${name}"`);
        setRenaming(null);
      } else {
        toast.error("Only the person who saved it or an admin can rename this list");
      }
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Could not rename the list");
    } finally {
      setBusy(null);
    }
  };

  const remove = async (l: BulkContactList) => {
    if (!window.confirm(`Delete the list "${l.name}"? The numbers on this page stay.`)) return;
    setBusy(l.id);
    try {
      if (await deleteContactList(l.id)) {
        await refresh();
        toast.success("List deleted");
      } else {
        toast.error("Only the person who saved it or an admin can delete this list");
      }
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Could not delete the list");
    } finally {
      setBusy(null);
    }
  };

  const notReady = lists.data === null;
  const nameTaken = !replaceId && all.some((l) => l.name.trim().toLowerCase() === saveName.trim().toLowerCase());

  return (
    <>
      <Dialog
        open={saveOpen}
        onOpenChange={(o) => {
          if (saving) return;
          if (o) {
            setSaveName("");
            setReplaceId("");
          }
          onSaveOpenChange(o);
        }}
      >
        <DialogContent className="max-w-sm">
          <DialogHeader>
            <DialogTitle>Save numbers as a list</DialogTitle>
            <DialogDescription>
              {current.length.toLocaleString("en-IN")} numbers with their names. Pick the list next time from Saved lists, no import needed.
            </DialogDescription>
          </DialogHeader>
          {notReady ? (
            <p className="rounded-lg bg-amber-50 px-3 py-2 text-sm text-amber-800">
              Saved lists are almost ready: the contact lists SQL from the update still needs to be run.
            </p>
          ) : (
            <div className="space-y-3">
              <Input
                autoFocus
                value={saveName}
                maxLength={80}
                disabled={Boolean(replaceId)}
                placeholder="List name, e.g. Regular customers"
                className="no-uppercase"
                onChange={(e) => setSaveName(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter" && !nameTaken) void save();
                }}
              />
              {nameTaken && <p className="text-xs text-amber-700">A list with this name already exists. Pick it below to update it.</p>}
              {all.length > 0 && (
                <label className="block space-y-1 text-xs text-slate-600">
                  <span>Or update an existing list (its numbers are replaced)</span>
                  <select
                    value={replaceId}
                    onChange={(e) => setReplaceId(e.target.value)}
                    className="h-9 w-full rounded-md border border-input bg-background px-2 text-sm"
                  >
                    <option value="">New list</option>
                    {all.map((l) => (
                      <option key={l.id} value={l.id}>
                        {l.name} ({l.contact_count})
                      </option>
                    ))}
                  </select>
                </label>
              )}
            </div>
          )}
          <DialogFooter>
            <Button type="button" variant="outline" disabled={saving} onClick={() => onSaveOpenChange(false)}>
              Cancel
            </Button>
            <Button
              type="button"
              disabled={saving || notReady || !current.length || (!replaceId && (!saveName.trim() || nameTaken))}
              onClick={() => void save()}
            >
              {saving && <Loader2 className="mr-1.5 h-4 w-4 animate-spin" />}
              {replaceId ? "Update list" : "Save list"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog
        open={listsOpen}
        onOpenChange={(o) => {
          if (!o) setRenaming(null);
          onListsOpenChange(o);
        }}
      >
        <DialogContent className="flex max-h-[90dvh] max-w-xl flex-col gap-3">
          <DialogHeader>
            <DialogTitle>Saved lists</DialogTitle>
            <DialogDescription>Use adds the list's numbers to this message. Unsubscribed customers are always left out.</DialogDescription>
          </DialogHeader>
          {notReady ? (
            <p className="rounded-lg bg-amber-50 px-3 py-2 text-sm text-amber-800">
              Saved lists are almost ready: the contact lists SQL from the update still needs to be run.
            </p>
          ) : lists.isLoading ? (
            <div className="flex justify-center py-10">
              <Loader2 className="h-5 w-5 animate-spin text-slate-400" />
            </div>
          ) : !all.length ? (
            <p className="py-10 text-center text-sm text-slate-500">
              No saved lists yet. Import Excel or type numbers, then press Save list.
            </p>
          ) : (
            <>
              {all.length > 6 && (
                <div className="relative">
                  <Search className="pointer-events-none absolute left-2.5 top-2.5 h-4 w-4 text-slate-400" />
                  <Input
                    value={search}
                    onChange={(e) => setSearch(e.target.value)}
                    placeholder="Search lists"
                    className="no-uppercase h-9 pl-8"
                  />
                </div>
              )}
              <div className="min-h-0 flex-1 space-y-2 overflow-y-auto">
                {shown.map((l) => {
                  const editing = renaming?.id === l.id;
                  const rowBusy = busy === l.id;
                  return (
                    <div key={l.id} className="flex flex-wrap items-center gap-2 rounded-lg border border-slate-200 bg-white p-2.5">
                      <div className="min-w-0 flex-1">
                        {editing ? (
                          <div className="flex items-center gap-1">
                            <Input
                              autoFocus
                              value={renaming.name}
                              maxLength={80}
                              className="no-uppercase h-8 text-sm"
                              onChange={(e) => setRenaming({ id: l.id, name: e.target.value })}
                              onKeyDown={(e) => {
                                if (e.key === "Enter") void rename();
                                if (e.key === "Escape") setRenaming(null);
                              }}
                            />
                            <Button type="button" size="icon" variant="ghost" className="h-8 w-8" title="Save name" disabled={rowBusy} onClick={() => void rename()}>
                              <Check className="h-4 w-4 text-emerald-600" />
                            </Button>
                            <Button type="button" size="icon" variant="ghost" className="h-8 w-8" title="Cancel" onClick={() => setRenaming(null)}>
                              <X className="h-4 w-4" />
                            </Button>
                          </div>
                        ) : (
                          <div className="truncate text-sm font-semibold text-slate-800">{l.name}</div>
                        )}
                        <div className="text-[11px] text-slate-500">
                          <span className="tabular-nums">{l.contact_count.toLocaleString("en-IN")}</span> numbers · updated{" "}
                          {format(new Date(l.updated_at), "dd MMM yyyy")}
                        </div>
                      </div>
                      <div className={cn("flex items-center gap-1", editing && "hidden")}>
                        <Button
                          type="button"
                          size="icon"
                          variant="ghost"
                          className="h-7 w-7 text-slate-400"
                          title="Rename"
                          disabled={rowBusy}
                          onClick={() => setRenaming({ id: l.id, name: l.name })}
                        >
                          <Pencil className="h-3.5 w-3.5" />
                        </Button>
                        <Button
                          type="button"
                          size="icon"
                          variant="ghost"
                          className="h-7 w-7 text-slate-400"
                          title={current.length ? `Replace its numbers with the ${current.length} on the page now` : "Add numbers on the page first to update this list"}
                          disabled={rowBusy || !current.length}
                          onClick={() => void replace(l)}
                        >
                          <RefreshCw className="h-3.5 w-3.5" />
                        </Button>
                        <Button
                          type="button"
                          size="icon"
                          variant="ghost"
                          className="h-7 w-7 text-slate-400 hover:text-destructive"
                          title="Delete"
                          disabled={rowBusy}
                          onClick={() => void remove(l)}
                        >
                          <Trash2 className="h-3.5 w-3.5" />
                        </Button>
                        <Button
                          type="button"
                          size="sm"
                          className="h-7 bg-emerald-600 text-xs text-white hover:bg-emerald-700"
                          disabled={rowBusy}
                          onClick={() => void use(l)}
                        >
                          {rowBusy && <Loader2 className="mr-1 h-3.5 w-3.5 animate-spin" />}
                          Use
                        </Button>
                      </div>
                    </div>
                  );
                })}
                {!shown.length && <p className="py-6 text-center text-sm text-slate-500">No list matches</p>}
              </div>
            </>
          )}
        </DialogContent>
      </Dialog>
    </>
  );
}
