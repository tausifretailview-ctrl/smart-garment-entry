import type { ComponentProps, ComponentType } from "react";
import { LazyChunkGate } from "@/components/LazyChunkGate";

type SizeStockProps = ComponentProps<typeof import("@/components/SizeStockDialog").SizeStockDialog>;
type PaymentsProps = ComponentProps<typeof import("@/components/FloatingPayments").FloatingPayments>;
type CashTallyProps = ComponentProps<typeof import("@/components/FloatingCashTally").FloatingCashTally>;
type StockReportProps = ComponentProps<
  typeof import("@/components/FloatingPOSReports").FloatingStockReport
>;
type SaleReportProps = ComponentProps<typeof import("@/components/FloatingPOSReports").FloatingSaleReport>;

type OpenProps = { open: boolean; onOpenChange: (open: boolean) => void };

const loadSizeStockDialog = () =>
  import("@/components/SizeStockDialog").then((m) => ({ default: m.SizeStockDialog }));

const loadFloatingPayments = () =>
  import("@/components/FloatingPayments").then((m) => ({ default: m.FloatingPayments }));

const loadFloatingCashTally = () =>
  import("@/components/FloatingCashTally").then((m) => ({ default: m.FloatingCashTally }));

const loadFloatingStockReport = () =>
  import("@/components/FloatingPOSReports").then((m) => ({ default: m.FloatingStockReport }));

const loadFloatingSaleReport = () =>
  import("@/components/FloatingPOSReports").then((m) => ({ default: m.FloatingSaleReport }));

const loadFloatingChatButton = () =>
  import("@/components/AIChatbot/FloatingChatButton").then((m) => ({ default: m.FloatingChatButton }));

const WIDGET_ERROR =
  "This can happen after an app update. Retry to download the panel again, or refresh the app.";

function OpenDialogGate<P extends OpenProps>({
  open,
  loader,
  title,
  loadingMessage,
  errorTitle,
  componentProps,
}: {
  open: boolean;
  loader: () => Promise<{ default: ComponentType<P> }>;
  title: string;
  loadingMessage: string;
  errorTitle: string;
  componentProps: P;
}) {
  if (!open) return null;
  return (
    <LazyChunkGate
      variant="dialog"
      loader={loader}
      componentProps={componentProps}
      title={title}
      loadingMessage={loadingMessage}
      errorTitle={errorTitle}
      errorDescription={WIDGET_ERROR}
      onDismiss={() => componentProps.onOpenChange(false)}
    />
  );
}

export function LazySizeStockDialog(props: SizeStockProps) {
  return (
    <OpenDialogGate
      open={props.open}
      loader={loadSizeStockDialog}
      title="Size-wise stock"
      loadingMessage="Loading size stock…"
      errorTitle="Could not open size stock"
      componentProps={props}
    />
  );
}

export function LazyFloatingPayments(props: PaymentsProps) {
  return (
    <OpenDialogGate
      open={props.open}
      loader={loadFloatingPayments}
      title="Payments"
      loadingMessage="Loading payments…"
      errorTitle="Could not open payments"
      componentProps={props}
    />
  );
}

export function LazyFloatingCashTally(props: CashTallyProps) {
  return (
    <OpenDialogGate
      open={props.open}
      loader={loadFloatingCashTally}
      title="Cash tally"
      loadingMessage="Loading cash tally…"
      errorTitle="Could not open cash tally"
      componentProps={props}
    />
  );
}

export function LazyFloatingStockReport(props: StockReportProps) {
  return (
    <OpenDialogGate
      open={props.open}
      loader={loadFloatingStockReport}
      title="Quick stock"
      loadingMessage="Loading stock report…"
      errorTitle="Could not open stock report"
      componentProps={props}
    />
  );
}

export function LazyFloatingSaleReport(props: SaleReportProps) {
  return (
    <OpenDialogGate
      open={props.open}
      loader={loadFloatingSaleReport}
      title="Quick sale lookup"
      loadingMessage="Loading sale lookup…"
      errorTitle="Could not open sale lookup"
      componentProps={props}
    />
  );
}

/** Idle-mounted chat chrome — loading + Retry so a stale chunk is not a silent blank. */
export function LazyFloatingChatButton() {
  return (
    <LazyChunkGate
      variant="corner"
      loader={loadFloatingChatButton}
      componentProps={{}}
      title="Chat"
      loadingMessage="Loading chat…"
      errorTitle="Could not load chat"
      errorDescription={WIDGET_ERROR}
    />
  );
}
