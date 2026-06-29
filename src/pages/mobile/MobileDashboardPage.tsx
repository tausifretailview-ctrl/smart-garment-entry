import { FullScreenLayout } from "@/components/FullScreenLayout";
import { OwnerDashboard } from "@/components/mobile/OwnerDashboard";

/** Native / mobile home — transaction summaries & reports (read-only on mobile). */
export default function MobileDashboardPage() {
  return (
    <FullScreenLayout>
      <OwnerDashboard />
    </FullScreenLayout>
  );
}
