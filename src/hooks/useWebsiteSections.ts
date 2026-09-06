import { useQuery } from "@tanstack/react-query";
import { STALE_FREQUENT } from "@/lib/queryStaleTimes";
import { coerceToArray } from "@/lib/coerceToMap";
import { websiteFrom } from "@/lib/websiteDb";
import {
  defaultNewArrivalSection,
  isNewArrivalSlug,
  sortSectionsNewArrivalFirst,
  type WebsiteSection,
} from "@/lib/websiteSections";

function isMissingSectionsTable(message: string): boolean {
  return /website_sections|schema cache|PGRST205|PGRST202/i.test(message);
}

export function useWebsiteSections(orgId?: string) {
  return useQuery({
    queryKey: ["website_sections", orgId],
    enabled: !!orgId,
    staleTime: STALE_FREQUENT,
    queryFn: async () => {
      const { data, error } = await websiteFrom("website_sections")
        .select("*")
        .eq("organization_id", orgId!)
        .order("display_order", { ascending: true });
      if (error) {
        if (isMissingSectionsTable(error.message)) return [] as WebsiteSection[];
        throw error;
      }
      let rows = coerceToArray<WebsiteSection>(data);
      if (orgId && !rows.some((s) => isNewArrivalSlug(s.slug))) {
        const { error: insertError } = await websiteFrom("website_sections").insert(
          defaultNewArrivalSection(orgId),
        );
        if (insertError) {
          if (isMissingSectionsTable(insertError.message)) return rows;
          throw insertError;
        }
        const refreshed = await websiteFrom("website_sections")
          .select("*")
          .eq("organization_id", orgId)
          .order("display_order", { ascending: true });
        if (!refreshed.error) rows = coerceToArray<WebsiteSection>(refreshed.data);
      }
      return sortSectionsNewArrivalFirst(rows);
    },
  });
}
