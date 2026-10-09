import { useEffect, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { AlertCircle, ExternalLink, Loader2 } from "lucide-react";
import { useOrganization } from "@/contexts/OrganizationContext";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { websiteFrom } from "@/lib/websiteDb";
import { normalizeStoreDomain } from "@/lib/storefrontDomain";

type DomainRow = { custom_domain: string | null; is_published: boolean; slug: string } | null;

/** Settings → Website → Domain (website_settings.custom_domain). */
export function StoreDomainSettings() {
  const { currentOrganization, organizationRole } = useOrganization();
  const orgId = currentOrganization?.id;
  const canEdit = organizationRole === "admin" || organizationRole === "manager";
  const queryClient = useQueryClient();
  const [domain, setDomain] = useState("");
  const [saving, setSaving] = useState(false);

  const { data, isLoading } = useQuery({
    queryKey: ["store-domain-settings", orgId],
    enabled: !!orgId,
    queryFn: async () => {
      const { data, error } = await websiteFrom("website_settings")
        .select("custom_domain, is_published, slug")
        .eq("organization_id", orgId)
        .maybeSingle();
      if (error) throw error;
      return data as DomainRow;
    },
  });

  useEffect(() => {
    setDomain(data?.custom_domain || "");
  }, [data]);

  const saved = data?.custom_domain || null;

  const save = async (next: string | null) => {
    if (!orgId || saving) return;
    if (!data) {
      toast.error("Set up your store in Store profile first, then add the domain.");
      return;
    }
    let value: string | null = null;
    if (next && next.trim()) {
      value = normalizeStoreDomain(next);
      if (!value) {
        toast.error("Enter a domain like yourshop.in (without https:// or /store).");
        return;
      }
    }
    setSaving(true);
    const { error } = await websiteFrom("website_settings")
      .update({ custom_domain: value })
      .eq("organization_id", orgId);
    setSaving(false);
    if (error) {
      const msg = String(error.message || "");
      toast.error(
        /duplicate|unique/i.test(msg)
          ? "This domain is already used by another store."
          : "Could not save: only an admin or manager can change this.",
      );
      return;
    }
    setDomain(value || "");
    void queryClient.invalidateQueries({ queryKey: ["store-domain-settings", orgId] });
    toast.success(value ? "Domain saved" : "Domain removed");
  };

  if (isLoading) {
    return (
      <div className="flex items-center gap-2 text-sm text-muted-foreground py-2">
        <Loader2 className="h-4 w-4 animate-spin" /> Loading…
      </div>
    );
  }

  return (
    <div className="space-y-3">
      {!data && (
        <Alert>
          <AlertCircle className="h-4 w-4" />
          <AlertDescription>
            Your store website is not set up yet. Turn it on in the Store profile tab first.
          </AlertDescription>
        </Alert>
      )}
      {data && !data.is_published && (
        <Alert>
          <AlertCircle className="h-4 w-4" />
          <AlertDescription>The store is not published, so the domain will not open it yet.</AlertDescription>
        </Alert>
      )}
      <div className="space-y-1.5">
        <Label htmlFor="store-custom-domain">Your domain</Label>
        <div className="flex flex-wrap gap-2">
          <Input
            id="store-custom-domain"
            value={domain}
            onChange={(e) => setDomain(e.target.value)}
            placeholder="yourshop.in"
            disabled={!canEdit || !data || saving}
            className="h-9 max-w-xs text-sm"
            autoCapitalize="none"
            autoCorrect="off"
            spellCheck={false}
          />
          <Button size="sm" className="h-9" disabled={!canEdit || !data || saving} onClick={() => void save(domain)}>
            {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : "Save domain"}
          </Button>
          {saved && (
            <Button
              size="sm"
              variant="outline"
              className="h-9"
              disabled={!canEdit || saving}
              onClick={() => void save(null)}
            >
              Remove
            </Button>
          )}
        </div>
        <p className="text-xs text-muted-foreground">
          Both {saved || "yourshop.in"} and www.{saved || "yourshop.in"} will open your store.
        </p>
        {!canEdit && (
          <p className="text-xs text-muted-foreground">Only an admin or manager can change the domain.</p>
        )}
      </div>
      {saved && (
        <div className="rounded-md border bg-muted/40 p-3 text-xs space-y-1.5">
          <div className="font-semibold text-sm">Connect {saved}</div>
          <p>In your domain provider's DNS settings (GoDaddy, Hostinger, BigRock…), add these two records:</p>
          <table className="w-full text-left font-mono">
            <thead>
              <tr className="text-muted-foreground">
                <th className="pr-3 font-normal">Type</th>
                <th className="pr-3 font-normal">Name / Host</th>
                <th className="font-normal">Value</th>
              </tr>
            </thead>
            <tbody>
              <tr>
                <td className="pr-3">A</td>
                <td className="pr-3">@</td>
                <td>76.76.21.21</td>
              </tr>
              <tr>
                <td className="pr-3">CNAME</td>
                <td className="pr-3">www</td>
                <td>cname.vercel-dns.com</td>
              </tr>
            </tbody>
          </table>
          <p>
            Remove any other A or CNAME records for @ and www. Then ask EzzyERP support to activate the domain;
            the secure (https) certificate is issued automatically once DNS is live, usually within an hour.
          </p>
          <a
            href={`https://${saved}`}
            target="_blank"
            rel="noreferrer"
            className="inline-flex items-center gap-1 text-primary underline"
          >
            Open https://{saved} <ExternalLink className="h-3 w-3" />
          </a>
        </div>
      )}
    </div>
  );
}
