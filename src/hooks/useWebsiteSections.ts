import { useQuery } from "@tanstack/react-query";
import { STALE_FREQUENT } from "@/lib/queryStaleTimes";
import { loadWebsiteSectionsState } from "@/lib/websiteSectionIo";
import type { WebsiteSectionsState } from "@/lib/websiteSectionStore";

export function useWebsiteSections(orgId?: string) {
  return useQuery<WebsiteSectionsState>({
    queryKey: ["website_sections", orgId],
    enabled: !!orgId,
    staleTime: STALE_FREQUENT,
    queryFn: async () => loadWebsiteSectionsState(orgId!),
  });
}
