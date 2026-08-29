import { Suspense, type ReactNode } from "react";
import { lazyWithRetry } from "@/lib/chunkLoadRetry";
import { FormPageSkeleton } from "@/components/skeletons/FormPageSkeleton";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import {
  resolvePosInvoiceTemplate,
  resolvePosThermalPaper,
  resolveSaleInvoiceTemplate,
} from "@/utils/invoicePrintFormat";
import { resolvePosDefaultTaxType, resolveSaleDefaultTaxType } from "@/utils/gstRegisterUtils";

const LazyInvoiceWrapper = lazyWithRetry(() =>
  import("@/components/InvoiceWrapper").then((m) => ({ default: m.InvoiceWrapper })),
) as unknown as React.ComponentType<
  React.ComponentProps<typeof import("@/components/InvoiceWrapper").InvoiceWrapper>
>;

export type SettingsInvoicePreviewChannel = "sale" | "pos";

export type SettingsInvoicePreviewSample = {
  billNo: string;
  date: Date;
  customerName: string;
  customerAddress: string;
  customerMobile: string;
  gstin?: string;
  items: React.ComponentProps<typeof import("@/components/InvoiceWrapper").InvoiceWrapper>["items"];
  subTotal: number;
  discount: number;
  grandTotal: number;
  tenderAmount?: number;
  cashPaid?: number;
  refundCash?: number;
  upiPaid?: number;
};

type SaleLike = {
  invoice_template?: string;
  pos_invoice_template?: string;
  pos_bill_format?: string;
  invoice_paper_format?: string;
  sales_bill_format?: string;
  default_tax_type?: string;
  default_pos_tax_type?: string;
  invoice_color_scheme?: string;
  show_hsn_code?: boolean;
  show_barcode?: boolean;
  show_gst_breakdown?: boolean;
  show_bank_details?: boolean;
  show_mrp_column?: boolean;
  show_discount_on_rate?: boolean;
  min_item_rows?: number;
  show_total_quantity?: boolean;
  amount_with_decimal?: boolean;
  show_received_amount?: boolean;
  show_balance_amount?: boolean;
  show_party_balance?: boolean;
  show_tax_details?: boolean;
  show_you_saved?: boolean;
  amount_with_grouping?: boolean;
  invoice_header_text?: string;
  invoice_footer_text?: string;
  invoice_document_title?: string;
  logo_placement?: "left" | "center" | "right";
  font_family?: string;
  declaration_text?: string;
  terms_list?: string[];
  size_display_format?: string;
  show_product_color?: boolean;
  show_product_brand?: boolean;
  show_product_style?: boolean;
};

type SettingsLike = {
  sale_settings?: SaleLike;
  bill_barcode_settings?: { direct_print_pos_paper?: string };
};

type SettingsInvoicePreviewProps = {
  settings: SettingsLike;
  setSettings: (next: SettingsLike) => void;
  invoicePreviewChannel: SettingsInvoicePreviewChannel;
  setInvoicePreviewChannel: (ch: SettingsInvoicePreviewChannel) => void;
  sampleInvoiceData: SettingsInvoicePreviewSample;
  showChannelSwitch?: boolean;
};

function PreviewFallback() {
  return <FormPageSkeleton groups={1} fieldsPerGroup={4} className="p-4" />;
}

function LazyPanel({ children }: { children: ReactNode }) {
  return <Suspense fallback={<PreviewFallback />}>{children}</Suspense>;
}

/** Shared Sale/POS live preview — writes the same paper-format keys as Settings → Sale/POS. */
export function SettingsInvoicePreview({
  settings,
  setSettings,
  invoicePreviewChannel,
  setInvoicePreviewChannel,
  sampleInvoiceData,
  showChannelSwitch = true,
}: SettingsInvoicePreviewProps) {
  const sale = settings.sale_settings;
  const previewTemplate =
    invoicePreviewChannel === "pos"
      ? resolvePosInvoiceTemplate(sale)
      : resolveSaleInvoiceTemplate(sale);
  const previewPaperRaw =
    invoicePreviewChannel === "pos"
      ? sale?.pos_bill_format || "thermal"
      : sale?.invoice_paper_format ||
        (sale?.sales_bill_format === "a5" ? "a5-vertical" : undefined) ||
        "a4";
  const previewPaper = previewPaperRaw === "a5" ? "a5-vertical" : previewPaperRaw;
  const previewFormat =
    previewPaper === "thermal" || previewTemplate === "kids-80mm"
      ? "thermal"
      : previewTemplate === "real-tast" ||
          previewTemplate === "gift_tally" ||
          previewTemplate === "a4-gst-classic"
        ? "a4"
        : (previewPaper as "a4" | "a5-vertical" | "a5-horizontal" | "thermal");
  const previewScale =
    previewFormat === "thermal" || previewTemplate === "kids-80mm"
      ? "scale(0.9)"
      : previewFormat === "a4"
        ? "scale(0.6)"
        : "scale(0.72)";

  return (
    <Card className="sticky top-2 h-fit">
      <CardHeader className="pb-2">
        <div className="flex flex-col gap-2">
          <div className="flex items-center justify-between gap-2">
            <div className="min-w-0">
              <CardTitle className="text-sm flex items-center gap-2">
                <span className="relative flex h-2 w-2">
                  <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-emerald-400 opacity-75 motion-reduce:animate-none" />
                  <span className="relative inline-flex h-2 w-2 rounded-full bg-emerald-500" />
                </span>
                Live Invoice Preview
              </CardTitle>
              <CardDescription className="text-[11px] mt-0.5">
                {invoicePreviewChannel === "pos" ? "POS bill design" : "Sale invoice design"} — updates as you change
                settings
              </CardDescription>
            </div>
            {showChannelSwitch ? (
              <div className="flex gap-1 shrink-0 rounded-md border border-slate-200 p-0.5 bg-white">
                {(["sale", "pos"] as const).map((ch) => (
                  <button
                    key={ch}
                    type="button"
                    onClick={() => setInvoicePreviewChannel(ch)}
                    className={`px-2.5 py-1 text-[10px] font-semibold rounded transition-colors duration-200 ${
                      invoicePreviewChannel === ch
                        ? "bg-slate-700 text-white shadow-sm"
                        : "text-slate-600 hover:text-slate-900"
                    }`}
                  >
                    {ch === "sale" ? "Sale" : "POS"}
                  </button>
                ))}
              </div>
            ) : null}
          </div>
          <div className="flex flex-wrap gap-1">
            {(["a4", "a5-vertical", "a5-horizontal", "thermal"] as const).map((fmt) => (
              <button
                key={fmt}
                type="button"
                onClick={() => {
                  if (invoicePreviewChannel === "pos") {
                    setSettings({
                      ...settings,
                      sale_settings: {
                        ...settings.sale_settings,
                        pos_bill_format: fmt,
                      },
                    });
                  } else {
                    setSettings({
                      ...settings,
                      sale_settings: {
                        ...settings.sale_settings,
                        invoice_paper_format: fmt,
                        sales_bill_format:
                          fmt === "thermal" ? "thermal" : fmt === "a5-vertical" ? "a5" : "a4",
                      },
                    });
                  }
                }}
                className={`px-2 py-1 text-[10px] font-semibold rounded border transition-colors duration-200
                  ${
                    previewPaper === fmt
                      ? "bg-slate-700 text-white border-slate-700"
                      : "bg-white text-slate-600 border-slate-200 hover:border-slate-400"
                  }`}
              >
                {fmt === "a5-vertical"
                  ? "A5↑"
                  : fmt === "a5-horizontal"
                    ? "A5→"
                    : fmt === "thermal"
                      ? "80mm"
                      : "A4"}
              </button>
            ))}
          </div>
          <p className="text-[10px] text-muted-foreground truncate">
            Template: <span className="font-medium text-foreground">{previewTemplate}</span>
          </p>
        </div>
      </CardHeader>
      <CardContent>
        <div className="border rounded-lg p-4 bg-muted/50 overflow-auto max-h-[calc(100vh-200px)]">
          <div
            className="flex justify-center origin-top"
            style={{
              transform: previewScale,
              transformOrigin: "top center",
            }}
          >
            <LazyPanel>
              <LazyInvoiceWrapper
                orgSettings={settings as unknown as Record<string, unknown>}
                billNo={invoicePreviewChannel === "pos" ? "POS/25-26/0001" : sampleInvoiceData.billNo}
                date={sampleInvoiceData.date}
                customerName={sampleInvoiceData.customerName}
                customerAddress={sampleInvoiceData.customerAddress}
                customerMobile={sampleInvoiceData.customerMobile}
                customerGSTIN={sampleInvoiceData.gstin}
                items={sampleInvoiceData.items}
                subTotal={sampleInvoiceData.subTotal}
                discount={sampleInvoiceData.discount}
                grandTotal={sampleInvoiceData.grandTotal}
                tenderAmount={sampleInvoiceData.tenderAmount}
                cashPaid={sampleInvoiceData.cashPaid}
                refundCash={sampleInvoiceData.refundCash}
                upiPaid={sampleInvoiceData.upiPaid}
                paymentMethod="cash"
                taxType={
                  invoicePreviewChannel === "pos"
                    ? resolvePosDefaultTaxType(sale)
                    : resolveSaleDefaultTaxType(sale)
                }
                template={previewTemplate}
                documentType={
                  invoicePreviewChannel === "pos" || previewTemplate === "kids-80mm" ? "pos" : undefined
                }
                salesman={
                  previewTemplate === "kids-80mm" || invoicePreviewChannel === "pos"
                    ? "SAMPLE SALES"
                    : undefined
                }
                thermalPaper={resolvePosThermalPaper(settings.bill_barcode_settings?.direct_print_pos_paper)}
                colorScheme={sale?.invoice_color_scheme}
                format={previewFormat}
                showHSN={sale?.show_hsn_code ?? true}
                showBarcode={sale?.show_barcode ?? true}
                showGSTBreakdown={sale?.show_gst_breakdown ?? true}
                showBankDetails={sale?.show_bank_details ?? false}
                showMRP={sale?.show_mrp_column ?? false}
                showDiscountOnRate={sale?.show_discount_on_rate !== false}
                minItemRows={sale?.min_item_rows}
                showTotalQuantity={sale?.show_total_quantity}
                amountWithDecimal={sale?.amount_with_decimal}
                showReceivedAmount={sale?.show_received_amount}
                showBalanceAmount={sale?.show_balance_amount}
                showPartyBalance={sale?.show_party_balance}
                showTaxDetails={sale?.show_tax_details}
                showYouSaved={sale?.show_you_saved}
                amountWithGrouping={sale?.amount_with_grouping}
                customHeaderText={sale?.invoice_header_text}
                customFooterText={sale?.invoice_footer_text}
                documentTitle={sale?.invoice_document_title}
                logoPlacement={sale?.logo_placement}
                fontFamily={sale?.font_family as React.ComponentProps<typeof LazyInvoiceWrapper>["fontFamily"]}
                declarationText={sale?.declaration_text}
                termsConditions={sale?.terms_list}
                enableWholesaleMode={previewTemplate === "modern-wholesale"}
                sizeDisplayFormat={sale?.size_display_format as "size/qty" | "size×qty" | undefined}
                showProductColor={sale?.show_product_color}
                showProductBrand={sale?.show_product_brand}
                showProductStyle={sale?.show_product_style}
              />
            </LazyPanel>
          </div>
        </div>
      </CardContent>
    </Card>
  );
}
