import { useAuth } from "@/contexts/AuthContext";
import { useOrganization } from "@/contexts/OrganizationContext";
import { BulkWhatsAppWorkspace } from "@/components/bulk-whatsapp/BulkWhatsAppWorkspace";

/** Full view: the top menu and window tabs are hidden here (entryPageLayout), so the page scrolls itself. */
export default function BulkWhatsApp() {
  const { user } = useAuth();
  const { currentOrganization } = useOrganization();
  if (!currentOrganization?.id) return null;
  return (
    <div className="h-full min-h-0 w-full overflow-y-auto">
      <BulkWhatsAppWorkspace organizationId={currentOrganization.id} userId={user?.id} previewTopClass="lg:top-3" />
    </div>
  );
}
