export type QuotationStatus =
  | "draft"
  | "sent"
  | "confirmed"
  | "hold"
  | "cancelled"
  | "expired";

export type QuotationStatusConfig = {
  value: QuotationStatus;
  label: string;
  className: string;
  dotClassName: string;
};

export const QUOTATION_STATUS_CONFIG: Record<QuotationStatus, QuotationStatusConfig> = {
  draft: {
    value: "draft",
    label: "Draft",
    className: "min-w-[80px] justify-center bg-gray-400 hover:bg-gray-500 text-white",
    dotClassName: "bg-gray-400",
  },
  sent: {
    value: "sent",
    label: "Sent",
    className: "min-w-[80px] justify-center bg-blue-500 hover:bg-blue-600 text-white",
    dotClassName: "bg-blue-500",
  },
  confirmed: {
    value: "confirmed",
    label: "Confirmed",
    className: "min-w-[80px] justify-center bg-green-500 hover:bg-green-600 text-white",
    dotClassName: "bg-green-500",
  },
  hold: {
    value: "hold",
    label: "Hold",
    className: "min-w-[80px] justify-center bg-amber-500 hover:bg-amber-600 text-white",
    dotClassName: "bg-amber-500",
  },
  cancelled: {
    value: "cancelled",
    label: "Cancelled",
    className: "min-w-[80px] justify-center bg-pink-400 hover:bg-pink-500 text-white",
    dotClassName: "bg-pink-400",
  },
  expired: {
    value: "expired",
    label: "Expired",
    className: "min-w-[80px] justify-center bg-red-500 hover:bg-red-600 text-white",
    dotClassName: "bg-red-500",
  },
};

/** Statuses users can pick from the dashboard dropdown (excludes expired — system-driven). */
export const QUOTATION_UPDATABLE_STATUSES: QuotationStatus[] = [
  "draft",
  "sent",
  "confirmed",
  "hold",
  "cancelled",
];

export function getQuotationStatusConfig(status: string): QuotationStatusConfig {
  return (
    QUOTATION_STATUS_CONFIG[status as QuotationStatus] ?? {
      value: status as QuotationStatus,
      label: status.charAt(0).toUpperCase() + status.slice(1),
      className: "min-w-[80px] justify-center bg-gray-400 text-white",
      dotClassName: "bg-gray-400",
    }
  );
}

export function getQuotationStatusLabel(status: string): string {
  return getQuotationStatusConfig(status).label;
}
