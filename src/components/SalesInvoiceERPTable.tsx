import { useMemo, useCallback } from "react";
import { ColumnDef } from "@tanstack/react-table";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { ERPTable } from "@/components/erp-table";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger, DropdownMenuSeparator } from "@/components/ui/dropdown-menu";
import { Printer, Edit, Trash2, Loader2, MessageCircle, Link2, Package, IndianRupee, Send, Download, Percent, Zap, FileDown, Lock, CheckCircle2, MoreHorizontal, Ban } from "lucide-react";
import { format } from "date-fns";

interface SalesInvoiceERPTableProps {
  paginatedInvoices: any[];
  expandedRows: Set<string>;
  toggleExpanded: (id: string, saleNumber?: string) => void;
  selectedInvoices: Set<string>;
  toggleSelectAll: () => void;
  toggleSelectInvoice: (id: string) => void;
  columnSettings: Record<string, boolean>;
  currentPage: number;
  itemsPerPage: number;
  invoicesData: any[] | undefined;
  isLoading: boolean;
  handleRowContextMenu: (e: React.MouseEvent, invoice: any) => void;
  setSelectedCustomerForHistory: (val: { id: string | null; name: string } | null) => void;
  setShowCustomerHistory: (val: boolean) => void;
  getDeliveryBadgeClass: (status: string) => string;
  getDeliveryLabel: (status: string) => string;
  openStatusDialog: (invoice: any) => void;
  isEInvoiceEnabled: boolean;
  handleGenerateEInvoice: (invoice: any) => void;
  isGeneratingEInvoice: string | null;
  handleDownloadEInvoicePDF: (invoice: any) => void;
  isDownloadingEInvoice: string | null;
  handleCancelIRN?: (invoice: any) => void;
  isCancellingIRN?: string | null;
  openPaymentDialog: (invoice: any) => void;
  handleCopyLink: (invoice: any) => void;
  handleWhatsAppShare: (invoice: any) => void;
  whatsAppAPISettings: any;
  handleResendWhatsAppAPI: (invoice: any) => void;
  isSendingWhatsAppAPI: boolean;
  handlePaymentReminder: (invoice: any) => void;
  handlePrintInvoice: (invoice: any) => void;
  handleDownloadPDF: (invoice: any) => void;
  hasSpecialPermission: (permission: string) => boolean;
  navigate: (path: string, options?: any) => void;
  setInvoiceToDelete: (invoice: any) => void;
  setInvoiceToCancel?: (invoice: any) => void;
  setInvoiceToHardDelete?: (invoice: any) => void;
  pageTotals: { qty: number; discount: number; amount: number; balance: number };
  showItemBrand: boolean;
  showItemColor: boolean;
  showItemStyle: boolean;
  showItemBarcode: boolean;
  showItemHsn: boolean;
  showItemMrp: boolean;
  deliveryHistory: Record<string, any[]>;
  saleReturns: Record<string, any[]>;
  cnAdjustedMap: Record<string, any[]>;
  loadedItems?: Record<string, any[]>;
  copiedBillNo?: string | null;
  onCopyBillNo?: (billNo: string) => void;
  renderToolbar?: (toolbar: React.ReactNode) => React.ReactNode;
}

export function SalesInvoiceERPTable({
  paginatedInvoices,
  expandedRows,
  toggleExpanded,
  selectedInvoices,
  toggleSelectAll,
  toggleSelectInvoice,
  columnSettings,
  currentPage,
  itemsPerPage,
  invoicesData,
  isLoading,
  handleRowContextMenu,
  setSelectedCustomerForHistory,
  setShowCustomerHistory,
  getDeliveryBadgeClass,
  getDeliveryLabel,
  openStatusDialog,
  isEInvoiceEnabled,
  handleGenerateEInvoice,
  isGeneratingEInvoice,
  handleDownloadEInvoicePDF,
  isDownloadingEInvoice,
  handleCancelIRN,
  isCancellingIRN,
  openPaymentDialog,
  handleCopyLink,
  handleWhatsAppShare,
  whatsAppAPISettings,
  handleResendWhatsAppAPI,
  isSendingWhatsAppAPI,
  handlePaymentReminder,
  handlePrintInvoice,
  handleDownloadPDF,
  hasSpecialPermission,
  navigate,
  setInvoiceToDelete,
  setInvoiceToCancel,
  setInvoiceToHardDelete,
  pageTotals,
  showItemBrand,
  showItemColor,
  showItemStyle,
  showItemBarcode,
  showItemHsn,
  showItemMrp,
  deliveryHistory,
  saleReturns,
  cnAdjustedMap,
  loadedItems,
  copiedBillNo,
  onCopyBillNo,
  renderToolbar,
}: SalesInvoiceERPTableProps) {
  const columns = useMemo<ColumnDef<any, any>[]>(() => {
    const canDelete = hasSpecialPermission('delete_records');
    const cols: ColumnDef<any, any>[] = [];

    if (canDelete) {
      cols.push({
        id: "select",
        header: () => (
          <Checkbox
            checked={selectedInvoices.size === (invoicesData?.length || 0) && invoicesData && invoicesData.length > 0}
            onCheckedChange={toggleSelectAll}
          />
        ),
        cell: ({ row }) => (
          <div onClick={(e) => e.stopPropagation()}>
            <Checkbox
              checked={selectedInvoices.has(row.original.id)}
              onCheckedChange={() => toggleSelectInvoice(row.original.id)}
            />
          </div>
        ),
        size: 36,
      });
    }
    // Always show selection column so any user can pick invoices for bulk actions.
    // The bulk-cancel / bulk-delete buttons themselves remain permission-gated in the toolbar.
    if (!canDelete) {
      cols.push({
        id: "select",
        header: () => (
          <Checkbox
            checked={selectedInvoices.size === (invoicesData?.length || 0) && invoicesData && invoicesData.length > 0}
            onCheckedChange={toggleSelectAll}
          />
        ),
        cell: ({ row }) => (
          <div onClick={(e) => e.stopPropagation()}>
            <Checkbox
              checked={selectedInvoices.has(row.original.id)}
              onCheckedChange={() => toggleSelectInvoice(row.original.id)}
            />
          </div>
        ),
        size: 36,
      });
    }

    cols.push({
        accessorKey: "sale_number",
        header: "Invoice No",
        cell: ({ row }) => {
          const invoice = row.original;
          return (
            <div className="flex flex-col">
              <div className="flex items-center gap-1.5 font-medium text-[17px]">
                <span
                  className={invoice.is_cancelled ? "line-through decoration-red-500/70 cursor-pointer" : "cursor-pointer"}
                  title="Click to copy"
                  onClick={(e) => {
                    e.stopPropagation();
                    onCopyBillNo?.(invoice.sale_number);
                  }}
                >
                  {invoice.sale_number}
                </span>
                {copiedBillNo === invoice.sale_number && <span className="text-emerald-600 text-xs font-bold">✓</span>}
                {invoice.is_cancelled && (
                  <Badge className="no-line-through text-xs px-1.5 py-0 h-4 bg-red-700 hover:bg-red-800 text-white no-underline" style={{ textDecoration: 'none' }}>CANCELLED</Badge>
                )}
                {!invoice.is_cancelled && invoice.payment_status === 'completed' && (
                  <span title="Invoice is locked (Fully Paid)">
                    <Lock className="h-3.5 w-3.5 text-green-600" />
                  </span>
                )}
              </div>
              <span className="text-[14px] text-foreground/70">
                {invoice.sale_date ? format(new Date(invoice.sale_date), 'hh:mm a') : ''}
              </span>
            </div>
          );
        },
        size: 130,
        minSize: 110,
      },
      {
        accessorKey: "customer_name",
        header: "Customer",
        cell: ({ row }) => {
          const invoice = row.original;
          return (
            <span
              className="cursor-pointer text-blue-600 hover:underline whitespace-nowrap block truncate max-w-[200px] text-[17px] font-medium"
              onClick={(e) => {
                e.stopPropagation();
                setSelectedCustomerForHistory({
                  id: invoice.customer_id || null,
                  name: invoice.customer_name,
                });
                setShowCustomerHistory(true);
              }}
            >
              {invoice.customer_name?.toUpperCase()}
            </span>
          );
        },
        size: 170,
        minSize: 120,
      });

    if (columnSettings.phone) {
      cols.push({
        accessorKey: "customer_phone",
        header: "Phone",
        cell: ({ row }) => <span className="text-[17px]">{row.original.customer_phone || '-'}</span>,
        size: 115,
        minSize: 100,
      });
    }

    cols.push(
      {
        accessorKey: "sale_date",
        header: "Date",
        cell: ({ row }) => <span className="text-[17px]">{row.original.sale_date ? format(new Date(row.original.sale_date), 'dd/MM/yyyy') : '-'}</span>,
        size: 95,
        minSize: 85,
      },
      {
        id: "qty",
        header: "QTY",
        cell: ({ row }) => (
          <span className="text-center block text-[17px]">
            {row.original.total_qty || 0}
          </span>
        ),
        size: 55,
        minSize: 45,
      },
      {
        id: "discount",
        header: "Disc",
        cell: ({ row }) => {
          const invoice = row.original;
          return (
            <div className="text-right text-[17px]">
              ₹{Math.round((invoice.discount_amount || 0) + (invoice.flat_discount_amount || 0)).toLocaleString('en-IN')}
              {(invoice.sale_return_adjust || 0) > 0 && (
                <span className="block text-[14px] text-amber-600">+S/R: ₹{Math.round(invoice.sale_return_adjust).toLocaleString('en-IN')}</span>
              )}
            </div>
          );
        },
        size: 90,
        minSize: 80,
      },
      {
        accessorKey: "net_amount",
        header: "Amount",
        cell: ({ row }) => <span className="tabular-nums text-[17px] font-medium">₹{Math.round(row.original.net_amount).toLocaleString('en-IN')}</span>,
        size: 100,
        minSize: 85,
      }
    );

    if (columnSettings.status) {
      cols.push(
        {
          id: "pay_status",
          header: "Status",
          cell: ({ row }) => {
            const invoice = row.original;
            const cnAdjusted = cnAdjustedMap[invoice.id];
            if (invoice.is_cancelled) {
              return (
                <div className="text-center">
                  <Badge className="min-w-[80px] justify-center whitespace-nowrap bg-red-700 hover:bg-red-800 text-white">
                    CANCELLED
                  </Badge>
                </div>
              );
            }
            const paidAmt = invoice.paid_amount || 0;
            const cnAdjust = invoice.sale_return_adjust || 0;
            const totalSettled = paidAmt + cnAdjust;
            const effectiveStatus = invoice.payment_status === 'hold' ? 'hold'
              : (totalSettled >= invoice.net_amount || Math.abs(totalSettled - invoice.net_amount) < 1) ? 'completed'
              : totalSettled > 0 ? 'partial' : 'pending';
            return (
              <div className="text-center space-y-1">
                <Badge
                  className={`min-w-[80px] justify-center whitespace-nowrap ${
                    effectiveStatus === 'completed'
                      ? 'bg-green-500 hover:bg-green-600 text-white'
                      : effectiveStatus === 'partial'
                        ? 'bg-orange-400 hover:bg-orange-500 text-white'
                        : 'bg-red-500 hover:bg-red-600 text-white'
                  }`}
                >
                  {effectiveStatus === 'completed' ? 'Paid' : effectiveStatus === 'partial' ? 'Partial' : 'Not Paid'}
                </Badge>
                {cnAdjusted && cnAdjusted.length > 0 && (
                  <Badge
                    variant="outline"
                    className="bg-purple-50 text-purple-700 border-purple-300 text-xs px-1.5 py-0 block dark:bg-purple-950 dark:text-purple-300 dark:border-purple-700"
                  >
                    CN Adjusted
                  </Badge>
                )}
              </div>
            );
          },
          size: 110,
          minSize: 95,
        },
        {
          id: "balance",
          header: "Balance",
          cell: ({ row }) => (
            <span className="text-right block tabular-nums text-[17px] font-medium">
              ₹{Math.max(0, Math.round((row.original.net_amount || 0) - (row.original.paid_amount || 0) - (row.original.sale_return_adjust || 0))).toLocaleString('en-IN')}
            </span>
          ),
          size: 110,
          minSize: 95,
        }
      );
    }

    if (columnSettings.delivery) {
      cols.push({
        id: "delivery",
        header: "Delivery",
        cell: ({ row }) => {
          const invoice = row.original;
          if (invoice.is_cancelled) {
            return <span className="text-xs text-muted-foreground">—</span>;
          }
          return (
            <div onClick={(e) => e.stopPropagation()}>
              <Badge
                className={`cursor-pointer ${getDeliveryBadgeClass(invoice.delivery_status || 'undelivered')}`}
                onClick={() => openStatusDialog(invoice)}
              >
                {getDeliveryLabel(invoice.delivery_status || 'undelivered')}
              </Badge>
            </div>
          );
        },
        size: 110,
        minSize: 95,
      });
    }

    cols.push({
      id: "actions",
      header: () => <div className="text-right pr-1">Actions</div>,
      meta: { stickyRight: true },
      cell: ({ row }) => {
        try {
        const invoice = row.original;
        if (invoice.is_cancelled) {
          return (
            <div onClick={(e) => e.stopPropagation()} className="flex justify-end gap-1">
              {columnSettings.print && (
                <Button variant="ghost" size="icon" onClick={() => handlePrintInvoice(invoice)} title="Print Invoice">
                  <Printer className="h-4 w-4" />
                </Button>
              )}
              {columnSettings.download && (
                <Button variant="ghost" size="icon" onClick={() => handleDownloadPDF(invoice)} title="Download PDF">
                  <Download className="h-4 w-4 text-blue-600" />
                </Button>
              )}
            </div>
          );
        }
        return (
          <div onClick={(e) => e.stopPropagation()}>
            {/* Desktop */}
            <div className="hidden lg:flex justify-end items-center gap-0.5">
              {isEInvoiceEnabled && invoice.customers?.gst_number && (
                <>
                  <Button variant="ghost" size="icon" className="h-7 w-7" onClick={() => handleGenerateEInvoice(invoice)} title={invoice.irn ? `IRN: ${invoice.irn.substring(0, 20)}...` : "Generate E-Invoice"} disabled={isGeneratingEInvoice === invoice.id}>
                    {isGeneratingEInvoice === invoice.id ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : invoice.irn ? <CheckCircle2 className="h-3.5 w-3.5 text-green-600" /> : <Zap className="h-3.5 w-3.5 text-orange-600" />}
                  </Button>
                  {invoice.irn && (
                    <Button variant="ghost" size="icon" className="h-7 w-7" onClick={() => handleDownloadEInvoicePDF(invoice)} title="Download E-Invoice PDF" disabled={isDownloadingEInvoice === invoice.id}>
                      {isDownloadingEInvoice === invoice.id ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <FileDown className="h-3.5 w-3.5 text-teal-600" />}
                    </Button>
                  )}
                </>
              )}
              {invoice.payment_status !== 'completed' && (
                <Button variant="ghost" size="icon" className="h-7 w-7" onClick={() => openPaymentDialog(invoice)} title="Record Payment">
                  <IndianRupee className="h-3.5 w-3.5 text-purple-600" />
                </Button>
              )}
              {columnSettings.copyLink && (
                <Button variant="ghost" size="icon" className="h-7 w-7" onClick={() => handleCopyLink(invoice)} title="Copy Invoice Link">
                  <Link2 className="h-3.5 w-3.5 text-blue-600" />
                </Button>
              )}
              {columnSettings.whatsapp && (
                <Button variant="ghost" size="icon" className="h-7 w-7" onClick={() => handleWhatsAppShare(invoice)} title="Share on WhatsApp" disabled={!invoice.customer_phone}>
                  <MessageCircle className="h-3.5 w-3.5 text-green-600" />
                </Button>
              )}
              {whatsAppAPISettings?.is_active && (
                <Button variant="ghost" size="icon" className="h-7 w-7" onClick={() => handleResendWhatsAppAPI(invoice)} title="Resend via WhatsApp API" disabled={!invoice.customer_phone || isSendingWhatsAppAPI}>
                  <Send className="h-3.5 w-3.5 text-teal-600" />
                </Button>
              )}
              {invoice.payment_status !== 'completed' && (
                <Button variant="ghost" size="icon" className="h-7 w-7" onClick={() => handlePaymentReminder(invoice)} title="Send Payment Reminder" disabled={!invoice.customer_phone}>
                  <MessageCircle className="h-3.5 w-3.5 text-orange-600" />
                </Button>
              )}
              {columnSettings.print && (
                <Button variant="ghost" size="icon" className="h-7 w-7" onClick={() => handlePrintInvoice(invoice)} title="Print Invoice">
                  <Printer className="h-3.5 w-3.5" />
                </Button>
              )}
              {columnSettings.download && (
                <Button variant="ghost" size="icon" className="h-7 w-7" onClick={() => handleDownloadPDF(invoice)} title="Download PDF">
                  <Download className="h-3.5 w-3.5 text-blue-600" />
                </Button>
              )}
              {columnSettings.modify && (
                invoice.payment_status === 'completed' && !hasSpecialPermission('edit_paid_invoices') ? (
                  <Button variant="ghost" size="icon" className="h-7 w-7" disabled title="Invoice is locked (Fully Paid)">
                    <Lock className="h-3.5 w-3.5 text-muted-foreground" />
                  </Button>
                ) : (
                  <Button variant="ghost" size="icon" className="h-7 w-7" onClick={() => navigate('/sales-invoice', { state: { editInvoiceId: invoice.id } })}>
                    <Edit className="h-3.5 w-3.5" />
                  </Button>
                )
              )}
              {columnSettings.delete && (
                invoice.payment_status === 'completed' && !hasSpecialPermission('edit_paid_invoices') ? (
                  <Button variant="ghost" size="icon" className="h-7 w-7" disabled title="Invoice is locked (Fully Paid)">
                    <Lock className="h-3.5 w-3.5 text-muted-foreground" />
                  </Button>
                ) : (
                  <DropdownMenu>
                    <DropdownMenuTrigger asChild>
                      <Button variant="ghost" size="icon" className="h-7 w-7" title="Cancel / Delete">
                        <Trash2 className="h-3.5 w-3.5 text-destructive" />
                      </Button>
                    </DropdownMenuTrigger>
                    <DropdownMenuContent align="end" className="bg-popover z-[60]">
                      <DropdownMenuItem
                        onClick={() => setInvoiceToCancel?.(invoice)}
                        disabled={invoice.is_cancelled}
                        className="text-orange-600"
                      >
                        <Ban className="h-4 w-4 mr-2" /> Cancel Invoice
                      </DropdownMenuItem>
                      <DropdownMenuItem
                        onClick={() => setInvoiceToHardDelete?.(invoice)}
                        className="text-destructive"
                      >
                        <Trash2 className="h-4 w-4 mr-2" /> Permanently Delete
                      </DropdownMenuItem>
                    </DropdownMenuContent>
                  </DropdownMenu>
                )
              )}
            </div>

            {/* Mobile */}
            <div className="flex lg:hidden justify-end items-center gap-1">
              {columnSettings.print && (
                <Button variant="ghost" size="icon" className="h-11 w-11 touch-manipulation" onClick={() => handlePrintInvoice(invoice)} title="Print">
                  <Printer className="h-5 w-5" />
                </Button>
              )}
              {columnSettings.download && (
                <Button variant="ghost" size="icon" className="h-11 w-11 touch-manipulation" onClick={() => handleDownloadPDF(invoice)} title="Download">
                  <Download className="h-5 w-5 text-blue-600" />
                </Button>
              )}
              <DropdownMenu>
                <DropdownMenuTrigger asChild>
                  <Button variant="ghost" size="icon" className="h-11 w-11 touch-manipulation">
                    <MoreHorizontal className="h-5 w-5" />
                  </Button>
                </DropdownMenuTrigger>
                <DropdownMenuContent align="end" className="bg-popover z-[60] min-w-[200px]">
                  {invoice.payment_status !== 'completed' && (
                    <DropdownMenuItem onClick={() => openPaymentDialog(invoice)}>
                      <IndianRupee className="h-4 w-4 mr-2 text-purple-600" /> Record Payment
                    </DropdownMenuItem>
                  )}
                  {columnSettings.whatsapp && (
                    <DropdownMenuItem onClick={() => handleWhatsAppShare(invoice)} disabled={!invoice.customer_phone}>
                      <MessageCircle className="h-4 w-4 mr-2 text-green-600" /> Share on WhatsApp
                    </DropdownMenuItem>
                  )}
                  {whatsAppAPISettings?.is_active && (
                    <DropdownMenuItem onClick={() => handleResendWhatsAppAPI(invoice)} disabled={!invoice.customer_phone || isSendingWhatsAppAPI}>
                      <Send className="h-4 w-4 mr-2 text-teal-600" /> Resend WhatsApp API
                    </DropdownMenuItem>
                  )}
                  {invoice.payment_status !== 'completed' && (
                    <DropdownMenuItem onClick={() => handlePaymentReminder(invoice)} disabled={!invoice.customer_phone}>
                      <MessageCircle className="h-4 w-4 mr-2 text-orange-600" /> Payment Reminder
                    </DropdownMenuItem>
                  )}
                  {columnSettings.copyLink && (
                    <DropdownMenuItem onClick={() => handleCopyLink(invoice)}>
                      <Link2 className="h-4 w-4 mr-2 text-blue-600" /> Copy Invoice Link
                    </DropdownMenuItem>
                  )}
                  {isEInvoiceEnabled && invoice.customers?.gst_number && (
                    <>
                      <DropdownMenuSeparator />
                      <DropdownMenuItem onClick={() => handleGenerateEInvoice(invoice)} disabled={isGeneratingEInvoice === invoice.id}>
                        <Zap className="h-4 w-4 mr-2" /> {invoice.irn ? "E-Invoice Generated" : "Generate E-Invoice"}
                      </DropdownMenuItem>
                      {invoice.irn && (
                        <>
                          <DropdownMenuItem onClick={() => handleDownloadEInvoicePDF(invoice)} disabled={isDownloadingEInvoice === invoice.id}>
                            <FileDown className="h-4 w-4 mr-2 text-teal-600" /> Download E-Invoice
                          </DropdownMenuItem>
                          {invoice.einvoice_status !== 'cancelled' && handleCancelIRN && (
                            <DropdownMenuItem onClick={() => handleCancelIRN(invoice)} disabled={isCancellingIRN === invoice.id} className="text-destructive">
                              <Ban className="h-4 w-4 mr-2" /> Cancel IRN
                            </DropdownMenuItem>
                          )}
                        </>
                      )}
                    </>
                  )}
                  <DropdownMenuSeparator />
                  {columnSettings.modify && (
                    invoice.payment_status === 'completed' && !hasSpecialPermission('edit_paid_invoices') ? (
                      <DropdownMenuItem disabled>
                        <Lock className="h-4 w-4 mr-2 text-muted-foreground" /> Edit (Locked)
                      </DropdownMenuItem>
                    ) : (
                      <DropdownMenuItem onClick={() => navigate('/sales-invoice', { state: { editInvoiceId: invoice.id } })}>
                        <Edit className="h-4 w-4 mr-2" /> Edit Invoice
                      </DropdownMenuItem>
                    )
                  )}
                  {columnSettings.delete && (
                    invoice.payment_status === 'completed' && !hasSpecialPermission('edit_paid_invoices') ? (
                      <DropdownMenuItem disabled>
                        <Lock className="h-4 w-4 mr-2 text-muted-foreground" /> Delete (Locked)
                      </DropdownMenuItem>
                    ) : (
                      <>
                        <DropdownMenuItem onClick={() => setInvoiceToCancel?.(invoice)} disabled={invoice.is_cancelled} className="text-orange-600">
                          <Ban className="h-4 w-4 mr-2" /> Cancel Invoice
                        </DropdownMenuItem>
                        <DropdownMenuItem onClick={() => setInvoiceToHardDelete?.(invoice)} className="text-destructive">
                          <Trash2 className="h-4 w-4 mr-2" /> Permanently Delete
                        </DropdownMenuItem>
                      </>
                    )
                  )}
                </DropdownMenuContent>
              </DropdownMenu>
            </div>
          </div>
        );
        } catch (e) {
          console.error('E-Invoice action cell render error:', e);
          return null;
        }
      },
      size: 160,
      minSize: 140,
    });

    return cols;
  }, [selectedInvoices, invoicesData, toggleSelectAll, toggleSelectInvoice, columnSettings, isEInvoiceEnabled, isGeneratingEInvoice, isDownloadingEInvoice, isCancellingIRN, whatsAppAPISettings, isSendingWhatsAppAPI, hasSpecialPermission]);

  const renderSubRow = useCallback((invoice: any) => {
    return (
      <div className="p-4 space-y-4">
        <div>
          <h4 className="font-semibold mb-2">Items:</h4>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Product</TableHead>
                {showItemBrand && <TableHead>Brand</TableHead>}
                {showItemColor && <TableHead>Color</TableHead>}
                {showItemStyle && <TableHead>Style</TableHead>}
                <TableHead>Size</TableHead>
                {showItemBarcode && <TableHead>Barcode</TableHead>}
                {showItemHsn && <TableHead>HSN</TableHead>}
                <TableHead>Qty</TableHead>
                {showItemMrp && <TableHead>MRP</TableHead>}
                <TableHead>Price</TableHead>
                <TableHead className="text-right">Discount</TableHead>
                <TableHead className="text-right">Total</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {(loadedItems?.[invoice.id] || invoice.sale_items || []).map((item: any) => {
                const itemGrossTotal = item.unit_price * item.quantity;
                const itemDiscount = item.discount_percent > 0 ? (itemGrossTotal * item.discount_percent / 100) : 0;
                const itemAfterDiscount = itemGrossTotal - itemDiscount;
                return (
                  <TableRow key={item.id}>
                    <TableCell>{item.product_name}</TableCell>
                    {showItemBrand && <TableCell>{'-'}</TableCell>}
                    {showItemColor && <TableCell>{item.color || '-'}</TableCell>}
                    {showItemStyle && <TableCell>{'-'}</TableCell>}
                    <TableCell>{item.size}</TableCell>
                    {showItemBarcode && <TableCell className="text-xs font-mono">{item.barcode || '-'}</TableCell>}
                    {showItemHsn && <TableCell className="text-xs">{item.hsn_code || '-'}</TableCell>}
                    <TableCell>{item.quantity}</TableCell>
                    {showItemMrp && <TableCell>₹{item.mrp ? Math.round(item.mrp).toLocaleString('en-IN') : '-'}</TableCell>}
                    <TableCell>₹{Math.round(itemGrossTotal).toLocaleString('en-IN')}</TableCell>
                    <TableCell className="text-right text-destructive">
                      {itemDiscount > 0 ? `₹${Math.round(itemDiscount).toLocaleString('en-IN')}` : '-'}
                    </TableCell>
                    <TableCell className="text-right font-medium">₹{Math.round(itemAfterDiscount).toLocaleString('en-IN')}</TableCell>
                  </TableRow>
                );
              })}
            </TableBody>
          </Table>
        </div>

        {deliveryHistory[invoice.id] && deliveryHistory[invoice.id].length > 0 && (
          <div className="border-t pt-3">
            <h4 className="font-semibold mb-2 flex items-center gap-2">
              <Package className="h-4 w-4" />
              Delivery History:
            </h4>
            <div className="space-y-1">
              {deliveryHistory[invoice.id].map((history: any, idx: number) => (
                <div key={idx} className="text-sm flex gap-3 p-2 bg-background rounded">
                  <span className="font-medium text-muted-foreground min-w-[90px]">
                    {history.status_date ? format(new Date(history.status_date), 'dd/MM/yyyy') : '-'}
                  </span>
                  <Badge className={`${getDeliveryBadgeClass(history.status)} text-xs`}>
                    {getDeliveryLabel(history.status)}
                  </Badge>
                  {history.narration && (
                    <span className="text-muted-foreground">- {history.narration}</span>
                  )}
                </div>
              ))}
            </div>
          </div>
        )}

        {saleReturns[invoice.id] && saleReturns[invoice.id].length > 0 && (
          <div className="border-t pt-3">
            <h4 className="font-semibold mb-2 text-orange-600">Linked Sale Returns:</h4>
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Return No</TableHead>
                  <TableHead>Return Date</TableHead>
                  <TableHead>Customer</TableHead>
                  <TableHead className="text-right">Amount</TableHead>
                  <TableHead>Notes</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {saleReturns[invoice.id].map((saleReturn: any) => (
                  <TableRow key={saleReturn.id}>
                    <TableCell>
                      <Badge variant="outline" className="text-orange-600">
                        {saleReturn.return_number || '-'}
                      </Badge>
                    </TableCell>
                    <TableCell>
                      {saleReturn.return_date ? format(new Date(saleReturn.return_date), 'dd/MM/yyyy') : '-'}
                    </TableCell>
                    <TableCell>{saleReturn.customer_name?.toUpperCase()}</TableCell>
                    <TableCell className="text-right text-orange-600">
                      -₹{Math.round(saleReturn.net_amount).toLocaleString('en-IN')}
                    </TableCell>
                    <TableCell className="text-muted-foreground">
                      {saleReturn.notes || '-'}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        )}
      </div>
    );
  }, [showItemBrand, showItemColor, showItemStyle, showItemBarcode, showItemHsn, showItemMrp, deliveryHistory, saleReturns, getDeliveryBadgeClass, getDeliveryLabel]);

  const footerRow = paginatedInvoices.length > 0 ? (
    <tr>
      <td colSpan={4} className="text-right px-3 py-2">Page Total:</td>
      {columnSettings.phone && <td></td>}
      <td></td>
      <td className="text-center px-3 py-2">{pageTotals.qty}</td>
      <td className="text-right px-3 py-2">₹{Math.round(pageTotals.discount).toLocaleString('en-IN')}</td>
      <td className="px-3 py-2">₹{Math.round(pageTotals.amount).toLocaleString('en-IN')}</td>
      {columnSettings.status && <td></td>}
      {columnSettings.status && <td className="text-right px-3 py-2">₹{Math.round(pageTotals.balance).toLocaleString('en-IN')}</td>}
      {columnSettings.delivery && <td></td>}
      <td></td>
    </tr>
  ) : undefined;

  const getRowClassName = useCallback((invoice: any) => {
    return invoice.is_cancelled ? "opacity-55 bg-red-50/30 dark:bg-red-900/10 [&_td]:line-through [&_td_.no-line-through]:no-underline [&_td_button]:no-underline decoration-red-500/60" : "";
  }, []);

  return (
    <ERPTable
      tableId="sales_invoice"
      columns={columns}
      data={paginatedInvoices}
      stickyFirstColumn={false}
      isLoading={isLoading}
      emptyMessage="No invoices found"
      getRowClassName={getRowClassName}
      renderSubRow={renderSubRow}
      expandedRows={expandedRows}
      onToggleExpand={(id) => {
        const invoice = paginatedInvoices.find((inv: any) => inv.id === id);
        toggleExpanded(id, invoice?.sale_number);
      }}
      getRowId={(invoice) => invoice.id}
      onRowContextMenu={handleRowContextMenu}
      footerRow={footerRow}
      showToolbar={!renderToolbar}
      renderToolbar={renderToolbar}
    />
  );
}
