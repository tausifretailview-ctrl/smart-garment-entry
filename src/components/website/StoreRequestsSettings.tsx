import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { STALE_SETTINGS } from "@/lib/queryStaleTimes";
import { loadStorefrontRequestSwitches, saveStorefrontRequestSwitches } from "@/lib/storefrontThemeIo";
import type { StorefrontRequestKind, StorefrontRequests } from "@/lib/storefrontRequests";

const ROWS: Array<{ kind: StorefrontRequestKind; title: string; text: string; name: string }> = [
  {
    kind: "reserve",
    name: "Reserve & try",
    title: "Reserve & try in store (Street theme)",
    text:
      "On an in-stock size the customer can ask you to keep a piece aside for 24 hours and come to try it. " +
      "It appears in Website → Enquiries with the size, barcode and the time it is held till. Nothing is billed.",
  },
  {
    kind: "restock",
    name: "Back-in-stock requests",
    title: "Tell me when it's back (Street theme)",
    text:
      "On a sold-out size the customer can leave their number. Website → Enquiries shows who is waiting, and when " +
      "the size is in stock again it shows a button to message them on WhatsApp.",
  },
];

/** Website → Theme: switches for the two store requests that land in Website → Enquiries. */
export function StoreRequestsSettings({ orgId }: { orgId?: string }) {
  const queryClient = useQueryClient();
  const key = ["website_request_switches", orgId];
  const query = useQuery({
    queryKey: key,
    enabled: !!orgId,
    staleTime: STALE_SETTINGS,
    queryFn: () => loadStorefrontRequestSwitches(orgId!),
  });
  const switches: StorefrontRequests = query.data ?? { reserve: true, restock: true };

  const save = useMutation({
    mutationFn: async (next: StorefrontRequests) => {
      await saveStorefrontRequestSwitches(orgId!, next);
      return next;
    },
    onSuccess: (next) => {
      queryClient.setQueryData<StorefrontRequests>(key, next);
      toast.success("Saved. Reload the store to see it.");
    },
    onError: (err: unknown) => toast.error(err instanceof Error ? err.message : "Could not save the setting"),
  });

  return (
    <>
      {ROWS.map((row) => {
        const on = switches[row.kind];
        return (
          <div key={row.kind} className="flex flex-wrap items-center justify-between gap-3 border-t border-slate-200 pt-4">
            <div className="max-w-2xl">
              <h3 className="text-sm font-semibold text-slate-900">{row.title}</h3>
              <p className="text-sm text-muted-foreground">{row.text}</p>
            </div>
            <Button
              variant={on ? "default" : "outline"}
              size="sm"
              className="h-9"
              disabled={!orgId || !query.isSuccess || save.isPending}
              onClick={() => save.mutate({ ...switches, [row.kind]: !on })}
            >
              {save.isPending ? "Saving…" : on ? `${row.name}: on — turn off` : `${row.name}: off — turn on`}
            </Button>
          </div>
        );
      })}
    </>
  );
}
