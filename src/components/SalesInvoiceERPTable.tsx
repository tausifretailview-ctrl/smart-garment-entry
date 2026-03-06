import { useMemo, useCallback } from "react";
import { ColumnDef } from "@tanstack/react-table";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { ERPTable } from "@/components/erp-table";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger, DropdownMenuSeparator } from "@/components/ui/dropdown-menu";
import { Printer, Edit, Trash2, Loader2, MessageCircle, Link2, Package, IndianRupee, Send, Download, Percent, Zap, FileDown, Lock, CheckCircle2, MoreHorizontal } from "lucide-react";
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
  pageTotals: { qty: number; discount: number; amount: number; balance: number };
  showItemBrand: boolean;
  showItemColor: boolean;
  showItemStyle: boolean;
  showItemBarcode: boolean;
  showItemHsn: boolean;
  showItemMrp: boolean;
  productsById: Record<string, any> | undefined;
  deliveryHistory: Record<string, any[]>;
  saleReturns: Record<string, any[]>;
  cnAdjustedMap: Record<string, any[]>;
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
  pageTotals,
  showItemBrand,
  showItemColor,
  showItemStyle,
  showItemBarcode,
  showItemHsn,
  showItemMrp,
  productsById,
  deliveryHistory,
  saleReturns,
  cnAdjustedMap,
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
        size: 40,
      });
    }

    cols.push({
        accessorKey: "sale_number",
        header: "Invoice No",
        cell: ({ row }) => {
          const invoice = row.original;
          return (
            <div className="flex flex-col">
              <div className="flex items-center gap-1.5 font-medium">
                {invoice.sale_number}
                {invoice.payment_status === 'completed' && (
                  <span title="Invoice is locked (Fully Paid)">
                    <Lock className="h-3.5 w-3.5 text-green-600" />
                  </span>
                )}
              </div>
              <span className="text-xs text-foreground/70">
                {invoice.sale_date ? format(new Date(invoice.sale_date), 'hh:mm a') : ''}
              </span>
            </div>
          );
        },
        size: 140,
      },
      {
        accessorKey: "customer_name",
        header: "Customer",
        cell: ({ row }) => {
          const invoice = row.original;
          return (
            <span
              className="cursor-pointer text-blue-600 hover:underline"
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
        size: 180,
      });

    if (columnSettings.phone) {
      cols.push({
        accessorKey: "customer_phone",
        header: "Phone",
        cell: ({ row }) => row.original.customer_phone || '-',
        size: 120,
      });
    }

    cols.push(
      {
        accessorKey: "sale_date",
        header: "Date",
        cell: ({ row }) => row.original.sale_date ? format(new Date(row.original.sale_date), 'dd/MM/yyyy') : '-',
        size: 100,
      },
      {
        id: "qty",
        header: "Qty",
        cell: ({ row }) => (
          <span className="text-center block">
            {row.original.sale_items?.reduce((sum: number, item: any) => sum + (item.quantity || 0), 0) || 0}
          </span>
        ),
        size: 60,
      },
      {
        id: "discount",
        header: "Discount",
        cell: ({ row }) => {
          const invoice = row.original;
          return (
            <div className="text-right">
              ₹{Math.round((invoice.discount_amount || 0) + (invoice.flat_discount_amount || 0)).toLocaleString('en-IN')}
              {(invoice.sale_return_adjust || 0) > 0 && (
                <span className="block text-xs text-amber-600">+S/R: ₹{Math.round(invoice.sale_return_adjust).toLocaleString('en-IN')}</span>
              )}
            </div>
          );
        },
        size: 100,
      },
      {
        accessorKey: "net_amount",
        header: "Amount",
        cell: ({ row }) => <span className="tabular-nums">₹{Math.round(row.original.net_amount).toLocaleString('en-IN')}</span>,
        size: 110,
      }
    );

    if (columnSettings.status) {
      cols.push(
        {
          id: "pay_status",
          header: "Pay Status",
          cell: ({ row }) => {
            const invoice = row.original;
            const cnAdjusted = cnAdjustedMap[invoice.id];
            const effectiveStatus = invoice.payment_status === 'hold' ? 'hold'
              : (invoice.paid_amount || 0) >= invoice.net_amount ? 'completed'
              : (invoice.paid_amount || 0) > 0 ? 'partial' : 'pending';
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
                    className="bg-purple-50 text-purple-700 border-purple-300 text-[10px] px-1.5 py-0 block dark:bg-purple-950 dark:text-purple-300 dark:border-purple-700"
                  >
                    CN Adjusted
                  </Badge>
                )}
              </div>
            );
          },
          size: 100,
        },
        {
          id: "balance",
          header: "Balance",
          cell: ({ row }) => (
            <span className="text-right block tabular-nums">
              ₹{Math.round((row.original.net_amount || 0) - (row.original.paid_amount || 0)).toLocaleString('en-IN')}
            </span>
          ),
          size: 100,
        }
      );
    }

    if (columnSettings.delivery) {
      cols.push({
        id: "delivery",
        header: "Delivery",
        cell: ({ row }) => {
          const invoice = row.original;
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
      });
    }

    cols.push({
      id: "actions",
      header: "Actions",
      cell: ({ row }) => {
        const invoice = row.original;
        return (
          <div onClick={(e) => e.stopPropagation()}>
            {/* Desktop */}
            <div className="hidden lg:flex justify-end gap-1">
              {isEInvoiceEnabled && invoice.customers?.gst_number && (
                <>
                  <Button variant="ghost" size="icon" onClick={() => handleGenerateEInvoice(invoice)} title={invoice.irn ? `IRN: ${invoice.irn.substring(0, 20)}...` : "Generate E-Invoice"} disabled={isGeneratingEInvoice === invoice.id} className={invoice.irn ? "text-green-600" : "text-orange-600"}>
                    {isGeneratingEInvoice === invoice.id ? <Loader2 className="h-4 w-4 animate-spin" /> : invoice.irn ? <CheckCircle2 className="h-4 w-4" /> : <Zap className="h-4 w-4" />}
                  </Button>
                  {invoice.irn && (
                    <Button variant="ghost" size="icon" onClick={() => handleDownloadEInvoicePDF(invoice)} title="Download E-Invoice PDF" disabled={isDownloadingEInvoice === invoice.id} className="text-teal-600">
                      {isDownloadingEInvoice === invoice.id ? <Loader2 className="h-4 w-4 animate-spin" /> : <FileDown className="h-4 w-4" />}
                    </Button>
                  )}
                </>
              )}
              {invoice.payment_status !== 'completed' && (
                <Button variant="ghost" size="icon" onClick={() => openPaymentDialog(invoice)} title="Record Payment">
                  <IndianRupee className="h-4 w-4 text-purple-600" />
                </Button>
              )}
              {columnSettings.copyLink && (
                <Button variant="ghost" size="icon" onClick={() => handleCopyLink(invoice)} title="Copy Invoice Link">
                  <Link2 className="h-4 w-4 text-blue-600" />
                </Button>
              )}
              {columnSettings.whatsapp && (
                <Button variant="ghost" size="icon" onClick={() => handleWhatsAppShare(invoice)} title="Share on WhatsApp" disabled={!invoice.customer_phone}>
                  <MessageCircle className="h-4 w-4 text-green-600" />
                </Button>
              )}
              {whatsAppAPISettings?.is_active && (
                <Button variant="ghost" size="icon" onClick={() => handleResendWhatsAppAPI(invoice)} title="Resend via WhatsApp API" disabled={!invoice.customer_phone || isSendingWhatsAppAPI}>
                  <Send className="h-4 w-4 text-teal-600" />
                </Button>
              )}
              {invoice.payment_status !== 'completed' && (
                <Button variant="ghost" size="icon" onClick={() => handlePaymentReminder(invoice)} title="Send Payment Reminder" disabled={!invoice.customer_phone}>
                  <MessageCircle className="h-4 w-4 text-orange-600" />
                </Button>
              )}
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
              {columnSettings.modify && (
                invoice.payment_status === 'completed' && !hasSpecialPermission('edit_paid_invoices') ? (
                  <Button variant="ghost" size="icon" disabled title="Invoice is locked (Fully Paid)">
                    <Lock className="h-4 w-4 text-muted-foreground" />
                  </Button>
                ) : (
                  <Button variant="ghost" size="icon" onClick={() => navigate('/sales-invoice', { state: { invoiceData: invoice } })}>
                    <Edit className="h-4 w-4" />
                  </Button>
                )
              )}
              {columnSettings.delete && (
                invoice.payment_status === 'completed' && !hasSpecialPermission('edit_paid_invoices') ? (
                  <Button variant="ghost" size="icon" disabled title="Invoice is locked (Fully Paid)">
                    <Lock className="h-4 w-4 text-muted-foreground" />
                  </Button>
                ) : (
                  <Button variant="ghost" size="icon" onClick={() => setInvoiceToDelete(invoice)}>
                    <Trash2 className="h-4 w-4 text-destructive" />
                  </Button>
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
                        <DropdownMenuItem onClick={() => handleDownloadEInvoicePDF(invoice)} disabled={isDownloadingEInvoice === invoice.id}>
                          <FileDown className="h-4 w-4 mr-2 text-teal-600" /> Download E-Invoice
                        </DropdownMenuItem>
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
                      <DropdownMenuItem onClick={() => navigate('/sales-invoice', { state: { invoiceData: invoice } })}>
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
                      <DropdownMenuItem onClick={() => setInvoiceToDelete(invoice)} className="text-destructive">
                        <Trash2 className="h-4 w-4 mr-2" /> Delete Invoice
                      </DropdownMenuItem>
                    )
                  )}
                </DropdownMenuContent>
              </DropdownMenu>
            </div>
          </div>
        );
      },
      size: 280,
    });

    return cols;
  }, [selectedInvoices, invoicesData, toggleSelectAll, toggleSelectInvoice, columnSettings, isEInvoiceEnabled, isGeneratingEInvoice, isDownloadingEInvoice, whatsAppAPISettings, isSendingWhatsAppAPI, hasSpecialPermission]);

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
              {invoice.sale_items?.map((item: any) => {
                const itemGrossTotal = item.unit_price * item.quantity;
                const itemDiscount = item.discount_percent > 0 ? (itemGrossTotal * item.discount_percent / 100) : 0;
                const itemAfterDiscount = itemGrossTotal - itemDiscount;
                return (
                  <TableRow key={item.id}>
                    <TableCell>{item.product_name}</TableCell>
                    {showItemBrand && <TableCell>{productsById?.[item.product_id]?.brand || '-'}</TableCell>}
                    {showItemColor && <TableCell>{item.color || productsById?.[item.product_id]?.color || '-'}</TableCell>}
                    {showItemStyle && <TableCell>{productsById?.[item.product_id]?.style || '-'}</TableCell>}
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
  }, [showItemBrand, showItemColor, showItemStyle, showItemBarcode, showItemHsn, showItemMrp, productsById, deliveryHistory, saleReturns, getDeliveryBadgeClass, getDeliveryLabel]);

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

  return (
    <ERPTable
      tableId="sales_invoice"
      columns={columns}
      data={paginatedInvoices}
      stickyFirstColumn={false}
      isLoading={isLoading}
      emptyMessage="No invoices found"
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
