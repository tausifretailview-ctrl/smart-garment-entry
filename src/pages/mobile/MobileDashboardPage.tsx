import { MobileBottomNav } from "@/components/mobile/MobileBottomNav";
import { MobileDashboard } from "@/components/mobile/MobileDashboard";

/** Native / mobile business overview — default home after org login. */
export default function MobileDashboardPage() {
  return (
    <>
      <MobileDashboard />
      <MobileBottomNav />
    </>
  );
}
