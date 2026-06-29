import { FullScreenLayout } from "@/components/FullScreenLayout";
import { OwnerDashboard } from "@/components/mobile/OwnerDashboard";

/** Native / mobile business overview — default home after org login (Scan + Purchase + Stock nav). */
export default function MobileDashboardPage() {
  return (
    <FullScreenLayout>
      <OwnerDashboard />
    </FullScreenLayout>
  );
}
