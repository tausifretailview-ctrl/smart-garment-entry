import { useEffect, useState } from "react";
import type { ComponentProps, ComponentType } from "react";
import { LazyChunkGate } from "@/components/LazyChunkGate";
import { useChat } from "@/contexts/ChatContext";

type PaymentsProps = ComponentProps<typeof import("@/components/FloatingPayments").FloatingPayments>;
type CashTallyProps = ComponentProps<typeof import("@/components/FloatingCashTally").FloatingCashTally>;
type SaleReportProps = ComponentProps<typeof import("@/components/FloatingPOSReports").FloatingSaleReport>;

type OpenProps = { open: boolean; onOpenChange: (open: boolean) => void };

const loadFloatingPayments = () =>
  import("@/components/FloatingPayments").then((m) => ({ default: m.FloatingPayments }));

const loadFloatingCashTally = () =>
  import("@/components/FloatingCashTally").then((m) => ({ default: m.FloatingCashTally }));

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

/**
 * Deferred chat chrome — the actual open/close button lives in the sidebar
 * (AppSidebar.tsx, via useChat().setIsOpen). This component's only job is
 * to lazily mount the chat panel's code. It used to start that download
 * eagerly on every page load ("idle-mounted"), which on a slow connection
 * meant a "Loading chat…" card could silently compete for bandwidth and
 * then pop in on whatever page the user had since navigated to.
 * Now it only starts loading once the user actually opens the chat from
 * the sidebar (isOpen becomes true for the first time), and stays mounted
 * after that so closing/reopening doesn't reload it.
 */
export function LazyFloatingChatButton() {
  const { isOpen } = useChat();
  const [hasEverOpened, setHasEverOpened] = useState(false);

  useEffect(() => {
    if (isOpen) setHasEverOpened(true);
  }, [isOpen]);

  if (!hasEverOpened) return null;

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
