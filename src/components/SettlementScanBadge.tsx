import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";
import type { OpenSettlementScanInfo } from "@/utils/stockSettlementScans";
import { resolveScannerLabel } from "@/utils/stockSettlementScans";

interface SettlementScanBadgeProps {
  scan: OpenSettlementScanInfo;
  currentUserId?: string;
  currentUserEmail?: string;
  className?: string;
}

export function SettlementScanBadge({
  scan,
  currentUserId,
  currentUserEmail,
  className,
}: SettlementScanBadgeProps) {
  const date = new Date(scan.scanned_at).toLocaleDateString("en-IN", {
    day: "2-digit",
    month: "short",
    year: "numeric",
  });
  const by = resolveScannerLabel(scan.scanned_by, currentUserId, currentUserEmail);

  return (
    <Badge
      variant="outline"
      className={cn(
        "whitespace-normal text-left font-normal leading-snug",
        "border-sky-200 bg-sky-50 text-sky-800 hover:bg-sky-50",
        className,
      )}
    >
      ℹ️ Scanned in settlement — counted {scan.counted_qty} (system {scan.system_qty}), {date} by {by}
    </Badge>
  );
}
