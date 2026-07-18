import {
  Menubar,
  MenubarContent,
  MenubarItem,
  MenubarMenu,
  MenubarSeparator,
  MenubarShortcut,
  MenubarTrigger,
} from "@/components/ui/menubar";
import {
  BarChart3,
  BoxIcon,
  FileSpreadsheet,
  FileText,
  LayoutGrid,
  Package,
  Plus,
  Scale,
  ShoppingCart,
  TrendingUp,
  Truck,
} from "lucide-react";
import { toast } from "sonner";
import { cn } from "@/lib/utils";

export type HeaderMenubarProps = {
  can: (menuId: string) => boolean;
  canAccessReportsHub: boolean;
  canQuickSaleLookup: boolean;
  hasSpecialPermission: (id: string) => boolean;
  orgNavigate: (path: string, options?: { state?: Record<string, unknown> }) => void;
  openPosSales: () => void;
  onRefresh: () => void;
  className?: string;
};

export function HeaderMenubar({
  can,
  canAccessReportsHub,
  canQuickSaleLookup,
  hasSpecialPermission,
  orgNavigate,
  openPosSales,
  onRefresh,
  className,
}: HeaderMenubarProps) {
  const showFile =
    can("pos_sales") ||
    can("sales_invoice") ||
    can("purchase_bill") ||
    can("quotation_entry") ||
    can("product_entry") ||
    can("settings_view") ||
    can("tally_export");

  const showView =
    can("main_dashboard") ||
    can("pos_dashboard") ||
    can("sales_invoice_dashboard") ||
    can("purchase_dashboard") ||
    can("delivery_dashboard") ||
    can("payments_dashboard") ||
    can("accounts_dashboard") ||
    can("customer_ledger");

  const showSales =
    can("pos_sales") ||
    can("sales_invoice") ||
    can("sale_return_entry") ||
    can("sales_invoice_dashboard") ||
    can("quotation_entry");

  const showPurchase =
    can("purchase_bill") ||
    can("purchase_dashboard") ||
    can("purchase_return") ||
    can("purchase_order_dashboard");

  const showTools =
    can("barcode_printing") ||
    can("stock_adjustment") ||
    can("stock_settlement") ||
    can("bulk_product_update") ||
    can("tally_export") ||
    can("recycle_bin") ||
    can("user_rights") ||
    hasSpecialPermission("audit_logs") ||
    can("whatsapp_inbox");

  if (!showFile && !showView && !showSales && !showPurchase && !canAccessReportsHub && !showTools && !can("settings_view")) {
    return null;
  }

  return (
    <Menubar className={cn("erp-menubar h-auto border-0 bg-transparent p-0 shadow-none", className)}>
      {showFile && (
        <MenubarMenu>
          <MenubarTrigger className="erp-menubar-trigger">File</MenubarTrigger>
          <MenubarContent className="min-w-[12rem]">
            {can("pos_sales") && (
              <MenubarItem onClick={openPosSales}>
                <ShoppingCart className="h-3.5 w-3.5 mr-2 opacity-60" />
                New POS Sale
                <MenubarShortcut>Alt+P</MenubarShortcut>
              </MenubarItem>
            )}
            {can("sales_invoice") && (
              <MenubarItem onClick={() => orgNavigate("/sales-invoice")}>
                <Plus className="h-3.5 w-3.5 mr-2 opacity-60" />
                New Invoice
                <MenubarShortcut>Alt+N</MenubarShortcut>
              </MenubarItem>
            )}
            {can("purchase_bill") && (
              <MenubarItem onClick={() => orgNavigate("/purchase-entry", { state: { newBill: true } })}>
                <Package className="h-3.5 w-3.5 mr-2 opacity-60" />
                New Purchase
                <MenubarShortcut>Alt+B</MenubarShortcut>
              </MenubarItem>
            )}
            {can("quotation_entry") && (
              <MenubarItem onClick={() => orgNavigate("/quotation-entry")}>
                <TrendingUp className="h-3.5 w-3.5 mr-2 opacity-60" />
                New Quotation
              </MenubarItem>
            )}
            {can("product_entry") && (
              <MenubarItem onClick={() => orgNavigate("/product-entry")}>
                <BoxIcon className="h-3.5 w-3.5 mr-2 opacity-60" />
                New Product
              </MenubarItem>
            )}
            {(can("sales_invoice") || can("purchase_bill")) && (
              <>
                <MenubarSeparator />
                <MenubarItem
                  onClick={() => toast("Print", { description: "Use Print on the current bill or Ctrl+P where available." })}
                >
                  Print…
                  <MenubarShortcut>Ctrl+P</MenubarShortcut>
                </MenubarItem>
              </>
            )}
            {can("tally_export") && (
              <MenubarItem onClick={() => orgNavigate("/tally-export")}>Export (Tally)…</MenubarItem>
            )}
            {can("settings_view") && (
              <>
                <MenubarSeparator />
                <MenubarItem onClick={() => orgNavigate("/settings")}>Settings</MenubarItem>
              </>
            )}
          </MenubarContent>
        </MenubarMenu>
      )}

      <MenubarMenu>
        <MenubarTrigger className="erp-menubar-trigger">Edit</MenubarTrigger>
        <MenubarContent>
          <MenubarItem onClick={onRefresh}>
            Refresh App
            <MenubarShortcut>F5</MenubarShortcut>
          </MenubarItem>
        </MenubarContent>
      </MenubarMenu>

      {showView && (
        <MenubarMenu>
          <MenubarTrigger className="erp-menubar-trigger">View</MenubarTrigger>
          <MenubarContent className="min-w-[12rem]">
            {can("main_dashboard") && (
              <MenubarItem onClick={() => orgNavigate("/")}>
                <LayoutGrid className="h-3.5 w-3.5 mr-2 opacity-60" />
                Dashboard
                <MenubarShortcut>Alt+D</MenubarShortcut>
              </MenubarItem>
            )}
            {can("pos_dashboard") && (
              <MenubarItem onClick={() => orgNavigate("/pos-dashboard")}>
                <ShoppingCart className="h-3.5 w-3.5 mr-2 opacity-60" />
                POS Dashboard
              </MenubarItem>
            )}
            {can("sales_invoice_dashboard") && (
              <MenubarItem onClick={() => orgNavigate("/sales-invoice-dashboard")}>
                <TrendingUp className="h-3.5 w-3.5 mr-2 opacity-60" />
                Invoice Dashboard
              </MenubarItem>
            )}
            {can("purchase_dashboard") && (
              <MenubarItem onClick={() => orgNavigate("/purchase-bills")}>
                <Package className="h-3.5 w-3.5 mr-2 opacity-60" />
                Purchase Dashboard
              </MenubarItem>
            )}
            {can("delivery_dashboard") && (
              <MenubarItem onClick={() => orgNavigate("/delivery-dashboard")}>Delivery Dashboard</MenubarItem>
            )}
            {can("payments_dashboard") && (
              <MenubarItem onClick={() => orgNavigate("/payments-dashboard")}>Payments Dashboard</MenubarItem>
            )}
            {can("accounts_dashboard") && (
              <MenubarItem onClick={() => orgNavigate("/accounts")}>Accounts & Ledger</MenubarItem>
            )}
            {can("customer_ledger") && (
              <MenubarItem onClick={() => orgNavigate("/customer-ledger-report")}>Customer Ledger</MenubarItem>
            )}
          </MenubarContent>
        </MenubarMenu>
      )}

      {showSales && (
        <MenubarMenu>
          <MenubarTrigger className="erp-menubar-trigger">Sales</MenubarTrigger>
          <MenubarContent>
            {can("sales_invoice") && (
              <MenubarItem onClick={() => orgNavigate("/sales-invoice")}>New Invoice</MenubarItem>
            )}
            {can("pos_sales") && (
              <MenubarItem onClick={openPosSales}>POS / Counter</MenubarItem>
            )}
            {can("sale_return_entry") && (
              <MenubarItem onClick={() => orgNavigate("/sale-return-entry")}>Sale Return</MenubarItem>
            )}
            {can("sales_invoice_dashboard") && (
              <MenubarItem onClick={() => orgNavigate("/sales-invoice-dashboard")}>Sales Dashboard</MenubarItem>
            )}
            {canQuickSaleLookup && (
              <MenubarItem onClick={() => orgNavigate("/sales-report")}>Sales Report</MenubarItem>
            )}
          </MenubarContent>
        </MenubarMenu>
      )}

      {showPurchase && (
        <MenubarMenu>
          <MenubarTrigger className="erp-menubar-trigger">Purchase</MenubarTrigger>
          <MenubarContent>
            {can("purchase_bill") && (
              <MenubarItem onClick={() => orgNavigate("/purchase-entry", { state: { newBill: true } })}>
                New Purchase Bill
              </MenubarItem>
            )}
            {can("purchase_dashboard") && (
              <MenubarItem onClick={() => orgNavigate("/purchase-bills")}>Purchase Dashboard</MenubarItem>
            )}
            {can("purchase_return") && (
              <MenubarItem onClick={() => orgNavigate("/purchase-returns")}>Purchase Returns</MenubarItem>
            )}
          </MenubarContent>
        </MenubarMenu>
      )}

      {canAccessReportsHub && (
        <MenubarMenu>
          <MenubarTrigger className="erp-menubar-trigger">Reports</MenubarTrigger>
          <MenubarContent className="min-w-[12rem]">
            <MenubarItem onClick={() => orgNavigate("/reports")}>
              <BarChart3 className="h-3.5 w-3.5 mr-2 opacity-60" />
              Reports Hub
            </MenubarItem>
            {can("accounting_reports_view") && (
              <MenubarItem onClick={() => orgNavigate("/accounting-reports")}>
                <FileSpreadsheet className="h-3.5 w-3.5 mr-2 opacity-60" />
                Accounting Reports
              </MenubarItem>
            )}
            {can("customer_ledger") && (
              <>
                <MenubarSeparator />
                <MenubarItem onClick={() => orgNavigate("/customer-party-balances")}>
                  <Scale className="h-3.5 w-3.5 mr-2 opacity-60" />
                  Customer Balances
                </MenubarItem>
                <MenubarItem onClick={() => orgNavigate("/customer-ledger-report")}>
                  <FileText className="h-3.5 w-3.5 mr-2 opacity-60" />
                  Customer Ledger
                </MenubarItem>
              </>
            )}
            {(can("accounts_dashboard") || can("purchase_dashboard")) && (
              <MenubarItem onClick={() => orgNavigate("/supplier-party-balances")}>
                <Truck className="h-3.5 w-3.5 mr-2 opacity-60" />
                Supplier Balances
              </MenubarItem>
            )}
            {can("stock_report") && (
              <MenubarItem onClick={() => orgNavigate("/stock-report")}>
                <Package className="h-3.5 w-3.5 mr-2 opacity-60" />
                Stock Report
                <MenubarShortcut>Alt+S</MenubarShortcut>
              </MenubarItem>
            )}
            {can("sales_invoice_dashboard") && (
              <MenubarItem onClick={() => orgNavigate("/sales-invoice-dashboard")}>Sales Dashboard</MenubarItem>
            )}
          </MenubarContent>
        </MenubarMenu>
      )}

      {showTools && (
        <MenubarMenu>
          <MenubarTrigger className="erp-menubar-trigger">Tools</MenubarTrigger>
          <MenubarContent className="min-w-[12rem]">
            {can("barcode_printing") && (
              <MenubarItem onClick={() => orgNavigate("/barcode-printing")}>Barcode Printing</MenubarItem>
            )}
            {can("stock_adjustment") && (
              <MenubarItem onClick={() => orgNavigate("/stock-adjustment")}>Stock Adjustment</MenubarItem>
            )}
            {can("stock_settlement") && (
              <MenubarItem onClick={() => orgNavigate("/stock-settlement")}>Stock Settlement</MenubarItem>
            )}
            {can("bulk_product_update") && (
              <MenubarItem onClick={() => orgNavigate("/bulk-product-update")}>Bulk Product Update</MenubarItem>
            )}
            {can("tally_export") && (
              <MenubarItem onClick={() => orgNavigate("/tally-export")}>Tally Export</MenubarItem>
            )}
            {can("recycle_bin") && (
              <MenubarItem onClick={() => orgNavigate("/recycle-bin")}>Recycle Bin</MenubarItem>
            )}
            {can("user_rights") && (
              <MenubarItem onClick={() => orgNavigate("/user-rights")}>User Rights</MenubarItem>
            )}
            {hasSpecialPermission("audit_logs") && (
              <MenubarItem onClick={() => orgNavigate("/audit-log")}>Audit Log</MenubarItem>
            )}
            {can("whatsapp_inbox") && (
              <MenubarItem onClick={() => orgNavigate("/whatsapp-inbox", { state: { openUnread: true } })}>
                WhatsApp Inbox
              </MenubarItem>
            )}
          </MenubarContent>
        </MenubarMenu>
      )}

      {can("settings_view") && (
        <MenubarMenu>
          <MenubarTrigger className="erp-menubar-trigger">Help</MenubarTrigger>
          <MenubarContent>
            <MenubarItem onClick={() => orgNavigate("/settings")}>App Settings</MenubarItem>
            <MenubarSeparator />
            <MenubarItem onClick={() => window.open("https://wa.me/your-support-number", "_blank")}>
              WhatsApp Support
            </MenubarItem>
            <MenubarItem
              onClick={() => toast("About EzzyERP", { description: "EzzyERP v2.0 · Smart Inventory & Billing" })}
            >
              About EzzyERP
            </MenubarItem>
          </MenubarContent>
        </MenubarMenu>
      )}
    </Menubar>
  );
}
