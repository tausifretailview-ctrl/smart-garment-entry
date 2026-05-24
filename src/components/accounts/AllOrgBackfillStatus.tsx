import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Progress } from "@/components/ui/progress";
import { CheckCircle2, AlertTriangle, Loader2, X } from "lucide-react";
import type {
  AllOrganizationsBackfillResult,
  AllOrgsBackfillProgress,
} from "@/utils/accounting/historicalMigration";
import { formatHistoricalBackfillSummary } from "@/utils/accounting/historicalMigration";

type AllOrgBackfillStatusProps = {
  running: boolean;
  progress: AllOrgsBackfillProgress | null;
  result: AllOrganizationsBackfillResult | null;
  error: string | null;
  onDismiss: () => void;
};

export function AllOrgBackfillStatus({
  running,
  progress,
  result,
  error,
  onDismiss,
}: AllOrgBackfillStatusProps) {
  if (!running && !result && !error) return null;

  if (running && progress) {
    const pct = progress.total > 0 ? Math.round((progress.currentIndex / progress.total) * 100) : 0;
    return (
      <Alert className="border-blue-200 bg-blue-50/80">
        <Loader2 className="h-4 w-4 animate-spin text-blue-700" />
        <AlertTitle className="text-blue-900">Backfill in progress — keep this tab open</AlertTitle>
        <AlertDescription className="text-blue-900/90 text-xs space-y-2">
          <p>
            Organization <strong>{progress.currentIndex}</strong> of <strong>{progress.total}</strong>
            : <span className="font-medium">{progress.organizationName}</span>
          </p>
          <Progress value={pct} className="h-2" />
          <p className="opacity-90">This can take several minutes per organization. Do not close or refresh until finished.</p>
        </AlertDescription>
      </Alert>
    );
  }

  if (running) {
    return (
      <Alert className="border-blue-200 bg-blue-50/80">
        <Loader2 className="h-4 w-4 animate-spin text-blue-700" />
        <AlertTitle className="text-blue-900">Starting all-organization backfill…</AlertTitle>
        <AlertDescription className="text-xs">Loading organization list. Keep this tab open.</AlertDescription>
      </Alert>
    );
  }

  if (error) {
    return (
      <Alert variant="destructive" className="relative pr-10">
        <AlertTriangle className="h-4 w-4" />
        <AlertTitle>All-organization backfill failed</AlertTitle>
        <AlertDescription className="text-sm">{error}</AlertDescription>
        <Button
          type="button"
          variant="ghost"
          size="icon"
          className="absolute right-2 top-2 h-7 w-7"
          onClick={onDismiss}
          aria-label="Dismiss"
        >
          <X className="h-4 w-4" />
        </Button>
      </Alert>
    );
  }

  if (!result) return null;

  const failedRows = result.rows.filter((r) => r.error);
  const hasFailures = result.organizationsFailed > 0;

  return (
    <Alert
      className={
        hasFailures
          ? "border-amber-200 bg-amber-50/90 relative pr-10"
          : "border-emerald-200 bg-emerald-50/90 relative pr-10"
      }
    >
      {hasFailures ? (
        <AlertTriangle className="h-4 w-4 text-amber-700" />
      ) : (
        <CheckCircle2 className="h-4 w-4 text-emerald-700" />
      )}
      <AlertTitle className={hasFailures ? "text-amber-900" : "text-emerald-900"}>
        All-organization backfill finished
      </AlertTitle>
      <AlertDescription className="text-xs space-y-2">
        <p>
          <strong>{result.rows.length}</strong> org(s) · <strong>{result.organizationsProcessed}</strong> GL processed ·{" "}
          <strong>{result.organizationsSkipped}</strong> engine off · <strong>{result.organizationsFailed}</strong> failed
        </p>
        {failedRows.length > 0 && (
          <ul className="list-disc pl-4 space-y-0.5 max-h-28 overflow-y-auto">
            {failedRows.map((r) => (
              <li key={r.organizationId}>
                {r.organizationName}: {r.error}
              </li>
            ))}
          </ul>
        )}
        <details className="text-[11px] opacity-90">
          <summary className="cursor-pointer font-medium">Per-organization detail</summary>
          <ul className="mt-1 space-y-1 max-h-40 overflow-y-auto">
            {result.rows.map((r) => (
              <li key={r.organizationId}>
                <span className="font-medium">{r.organizationName}:</span>{" "}
                {r.error ? r.error : formatHistoricalBackfillSummary(r.summary)}
              </li>
            ))}
          </ul>
        </details>
      </AlertDescription>
      <Button
        type="button"
        variant="ghost"
        size="icon"
        className="absolute right-2 top-2 h-7 w-7"
        onClick={onDismiss}
        aria-label="Dismiss"
      >
        <X className="h-4 w-4" />
      </Button>
    </Alert>
  );
}
