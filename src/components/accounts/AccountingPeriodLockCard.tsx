import { useEffect, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Lock } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { toast } from "sonner";
import { useOrganization } from "@/contexts/OrganizationContext";

/** Org admin: lock journals dated before the chosen date (admins can still post). */
export function AccountingPeriodLockCard() {
  const { currentOrganization } = useOrganization();
  const queryClient = useQueryClient();
  const [draftDate, setDraftDate] = useState("");

  const { data: settingsRow, isLoading } = useQuery({
    queryKey: ["settings-books-closed", currentOrganization?.id],
    enabled: !!currentOrganization?.id,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("settings")
        .select("id, books_closed_before_date")
        .eq("organization_id", currentOrganization!.id)
        .maybeSingle();
      if (error) throw error;
      return data as { id: string; books_closed_before_date: string | null } | null;
    },
  });

  useEffect(() => {
    setDraftDate(settingsRow?.books_closed_before_date ?? "");
  }, [settingsRow?.books_closed_before_date]);

  const saveMutation = useMutation({
    mutationFn: async (value: string | null) => {
      if (!currentOrganization?.id) throw new Error("Organization required");
      const payload = { books_closed_before_date: value };
      if (settingsRow?.id) {
        const { error } = await supabase.from("settings").update(payload).eq("id", settingsRow.id);
        if (error) throw error;
      } else {
        const { error } = await supabase.from("settings").insert({
          organization_id: currentOrganization.id,
          ...payload,
        });
        if (error) throw error;
      }
    },
    onSuccess: () => {
      toast.success("Books closed date saved");
      queryClient.invalidateQueries({ queryKey: ["settings-books-closed"] });
    },
    onError: (err: Error) => toast.error(err.message || "Could not save"),
  });

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2 text-base">
          <Lock className="h-4 w-4" />
          Accounting period lock
        </CardTitle>
        <CardDescription>
          Block new or edited journal vouchers with a date <strong>before</strong> the date you set. Organization admins and
          platform admins can still post into closed periods when needed.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-3">
        <div className="flex flex-col sm:flex-row sm:items-end gap-3">
          <div className="space-y-2 flex-1 max-w-xs">
            <Label>Books closed before (exclusive)</Label>
            <Input
              type="date"
              value={draftDate}
              disabled={isLoading || saveMutation.isPending}
              onChange={(e) => setDraftDate(e.target.value)}
            />
            <p className="text-xs text-muted-foreground">
              Leave empty to allow all dates. Example: set to 2025-04-01 to lock 31 Mar 2025 and earlier.
            </p>
          </div>
          <div className="flex gap-2">
            <Button
              type="button"
              disabled={saveMutation.isPending || isLoading}
              onClick={() => saveMutation.mutate(draftDate.trim() || null)}
            >
              Save lock date
            </Button>
            {draftDate && (
              <Button
                type="button"
                variant="outline"
                disabled={saveMutation.isPending}
                onClick={() => {
                  setDraftDate("");
                  saveMutation.mutate(null);
                }}
              >
                Clear lock
              </Button>
            )}
          </div>
        </div>
        {settingsRow?.books_closed_before_date && (
          <p className="text-sm text-amber-800 bg-amber-50 border border-amber-200 rounded-md px-3 py-2">
            Active lock: no journals before <strong>{settingsRow.books_closed_before_date}</strong> (except admins).
          </p>
        )}
      </CardContent>
    </Card>
  );
}
