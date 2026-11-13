/**
 * Every page the router loads on demand (code splitting). Moved out of App.tsx
 * (Plan Phase 4, S3) so the shell file only wires providers.
 */
import { lazyWithRetry } from "@/lib/chunkLoadRetry";

export const OAuthConsent = lazyWithRetry(() => import("@/pages/OAuthConsent"));
export const OrganizationManagement = lazyWithRetry(() => import("@/pages/OrganizationManagement"));
export const Index = lazyWithRetry(() => import("@/pages/Index"));
export const ProductDashboard = lazyWithRetry(() => import("@/pages/ProductDashboard"));
export const ProductEntry = lazyWithRetry(() => import("@/pages/ProductEntry"));
export const PurchaseEntry = lazyWithRetry(() => import("@/pages/PurchaseEntry"));
export const PurchaseBillDashboard = lazyWithRetry(() => import("@/pages/PurchaseBillDashboard"));
export const PurchaseReturnDashboard = lazyWithRetry(() => import("@/pages/PurchaseReturnDashboard"));
export const PurchaseReturnEntry = lazyWithRetry(() => import("@/pages/PurchaseReturnEntry"));
export const BarcodePrinting = lazyWithRetry(() => import("@/pages/BarcodePrinting"));
export const StockReport = lazyWithRetry(() => import("@/pages/StockReport"));
export const StockSummary = lazyWithRetry(() => import("@/pages/StockSummary"));
export const Settings = lazyWithRetry(() => import("@/pages/Settings"));
export const Manufacturing = lazyWithRetry(() => import("@/pages/Manufacturing"));
export const Profile = lazyWithRetry(() => import("@/pages/Profile"));
export const POSSales = lazyWithRetry(() => import("@/pages/POSSales"));
export const PosDeliveryChallan = lazyWithRetry(() => import("@/pages/PosDeliveryChallan"));
export const POSDashboard = lazyWithRetry(() => import("@/pages/POSDashboard"));
export const SalesInvoice = lazyWithRetry(() => import("@/pages/SalesInvoice"));
export const SalesInvoiceDashboard = lazyWithRetry(() => import("@/pages/SalesInvoiceDashboard"));
export const SaleReturnEntry = lazyWithRetry(() => import("@/pages/SaleReturnEntry"));
export const SaleReturnDashboard = lazyWithRetry(() => import("@/pages/SaleReturnDashboard"));
export const QuotationEntry = lazyWithRetry(() => import("@/pages/QuotationEntry"));
export const QuotationDashboard = lazyWithRetry(() => import("@/pages/QuotationDashboard"));
export const SaleOrderEntry = lazyWithRetry(() => import("@/pages/SaleOrderEntry"));
export const SaleOrderDashboard = lazyWithRetry(() => import("@/pages/SaleOrderDashboard"));
export const PurchaseOrderEntry = lazyWithRetry(() => import("@/pages/PurchaseOrderEntry"));
export const PurchaseOrderDashboard = lazyWithRetry(() => import("@/pages/PurchaseOrderDashboard"));
export const CustomerMaster = lazyWithRetry(() => import("@/pages/CustomerMaster"));
export const CustomerAccountPage = lazyWithRetry(() => import("@/pages/CustomerAccountPage"));
export const SupplierMaster = lazyWithRetry(() => import("@/pages/SupplierMaster"));
export const EmployeeMaster = lazyWithRetry(() => import("@/pages/EmployeeMaster"));
export const PurchaseReportBySupplier = lazyWithRetry(() => import("@/pages/PurchaseReportBySupplier"));
export const SalesReportByCustomer = lazyWithRetry(() => import("@/pages/SalesReportByCustomer"));
export const ProductTrackingReport = lazyWithRetry(() => import("@/pages/ProductTrackingReport"));
export const DailyCashierReport = lazyWithRetry(() => import("@/pages/DailyCashierReport"));
export const DailyTallyDashboard = lazyWithRetry(() => import("@/pages/DailyTallyDashboard"));
export const DailyAccountTally = lazyWithRetry(() => import("@/pages/DailyAccountTally"));
export const AuditLog = lazyWithRetry(() => import("@/pages/AuditLog"));
export const Accounts = lazyWithRetry(() => import("@/pages/Accounts"));
export const ChartOfAccounts = lazyWithRetry(() => import("@/pages/accounts/ChartOfAccounts"));
export const JournalVouchers = lazyWithRetry(() => import("@/pages/accounts/JournalVouchers"));
export const ManualJournalEntry = lazyWithRetry(() => import("@/pages/accounts/ManualJournalEntry"));
export const ThirdPartyVoucherEntry = lazyWithRetry(() => import("@/pages/accounts/ThirdPartyVoucherEntry"));
export const ThirdPartyBalancesPage = lazyWithRetry(() => import("@/pages/accounts/ThirdPartyBalancesPage"));
export const BankStatementPage = lazyWithRetry(() => import("@/pages/accounts/BankStatementPage"));
export const LedgerOpeningBalances = lazyWithRetry(() => import("@/pages/accounts/LedgerOpeningBalances"));
export const DeliveryDashboard = lazyWithRetry(() => import("@/pages/DeliveryDashboard"));
export const PaymentsDashboard = lazyWithRetry(() => import("@/pages/PaymentsDashboard"));
export const UserRights = lazyWithRetry(() => import("@/pages/UserRights"));
export const Auth = lazyWithRetry(() => import("@/pages/Auth"));
export const ResetPassword = lazyWithRetry(() => import("@/pages/ResetPassword"));
export const OrgAuth = lazyWithRetry(() => import("@/pages/OrgAuth"));
export const FieldSalesAuth = lazyWithRetry(() => import("@/pages/FieldSalesAuth"));
export const NotFound = lazyWithRetry(() => import("@/pages/NotFound"));
export const PlatformAdmin = lazyWithRetry(() => import("@/pages/PlatformAdmin"));
export const PlatformDataIntegrity = lazyWithRetry(() => import("@/pages/PlatformDataIntegrity"));
export const PublicInvoiceView = lazyWithRetry(() => import("@/pages/PublicInvoiceView"));
export const OwnerAlertBill = lazyWithRetry(() =>
  import("@/pages/OwnerAlertView").then((m) => ({ default: m.OwnerAlertBill })),
);
export const OwnerAlertReport = lazyWithRetry(() =>
  import("@/pages/OwnerAlertView").then((m) => ({ default: m.OwnerAlertReport })),
);
export const PublicPaymentPage = lazyWithRetry(() => import("@/pages/PublicPaymentPage"));
export const PaymentStatusPage = lazyWithRetry(() => import("@/pages/PaymentStatusPage"));
export const ItemWiseSalesReport = lazyWithRetry(() => import("@/pages/ItemWiseSalesReport"));
export const ItemWiseStockReport = lazyWithRetry(() => import("@/pages/ItemWiseStockReport"));
export const PriceHistoryReport = lazyWithRetry(() => import("@/pages/PriceHistoryReport"));
export const GSTSalePurchaseRegister = lazyWithRetry(() => import("@/pages/GSTSalePurchaseRegister"));
export const GSTReports = lazyWithRetry(() => import("@/pages/GSTReports"));
export const GSTAnalysis = lazyWithRetry(() => import("@/pages/GSTAnalysis"));
export const GSTReadiness = lazyWithRetry(() => import("@/pages/GSTReadiness"));
export const GSTFiling = lazyWithRetry(() => import("@/pages/GSTFiling"));
export const TallyExport = lazyWithRetry(() => import("@/pages/TallyExport"));
export const SalesAnalyticsDashboard = lazyWithRetry(() => import("@/pages/SalesAnalyticsDashboard"));
export const AccountingReports = lazyWithRetry(() => import("@/pages/AccountingReports"));
export const ExpenseSalaryReport = lazyWithRetry(() => import("@/pages/ExpenseSalaryReport"));
export const NetProfitAnalysis = lazyWithRetry(() => import("@/pages/NetProfitAnalysis"));
export const HourlySalesAnalysis = lazyWithRetry(() => import("@/pages/HourlySalesAnalysis"));
export const RecycleBin = lazyWithRetry(() => import("@/pages/RecycleBin"));
export const ListSkeletonSpotCheck = import.meta.env.DEV
  ? lazyWithRetry(() => import("@/pages/dev/ListSkeletonSpotCheck"))
  : null;
export const DialogA11ySpotCheck = import.meta.env.DEV
  ? lazyWithRetry(() => import("@/pages/dev/DialogA11ySpotCheck"))
  : null;
export const StockAdjustment = lazyWithRetry(() => import("@/pages/StockAdjustment"));
export const DuplicatePurchaseBills = lazyWithRetry(() => import("@/pages/DuplicatePurchaseBills"));
export const StockTransfer = lazyWithRetry(() => import("@/pages/StockTransfer"));
export const StockTransferEntry = lazyWithRetry(() => import("@/pages/StockTransferEntry"));
export const Godowns = lazyWithRetry(() => import("@/pages/Godowns"));
export const GodownTransfers = lazyWithRetry(() => import("@/pages/GodownTransfers"));
export const GodownTransferEntry = lazyWithRetry(() => import("@/pages/GodownTransferEntry"));
export const StockAnalysis = lazyWithRetry(() => import("@/pages/StockAnalysis"));
export const StockAgeingReport = lazyWithRetry(() => import("@/pages/StockAgeingReport"));
export const StockSettlement = lazyWithRetry(() => import("@/pages/StockSettlement"));
export const DailySaleAnalysis = lazyWithRetry(() => import("@/pages/DailySaleAnalysis"));
export const EInvoiceReport = lazyWithRetry(() => import("@/pages/EInvoiceReport"));
export const ReportsHub = lazyWithRetry(() => import("@/pages/ReportsHub"));
export const BusinessInsights = lazyWithRetry(() => import("@/pages/BusinessInsights"));
export const CustomerLedgerPage = lazyWithRetry(() => import("@/pages/CustomerLedgerPage"));
export const CustomerAuditReport = lazyWithRetry(() => import("@/pages/CustomerAuditReport"));
export const CreditNoteSrAdjustmentRegister = lazyWithRetry(
  () => import("@/pages/CreditNoteSrAdjustmentRegister"),
);
export const CustomerReviews = lazyWithRetry(() => import("@/pages/CustomerReviews"));
export const OwnerNotifications = lazyWithRetry(() => import("@/pages/OwnerNotifications"));
export const CustomerNotifications = lazyWithRetry(() => import("@/pages/CustomerNotifications"));
export const CustomerLedgerReport = lazyWithRetry(() => import("@/pages/CustomerLedgerReport"));
export const CustomerPointsReport = lazyWithRetry(() => import("@/pages/CustomerPointsReport"));
export const CustomerAccountStatementAuditPage = lazyWithRetry(
  () => import("@/pages/CustomerAccountStatementAuditPage"),
);
export const CustomerBalanceActivityPage = lazyWithRetry(() => import("@/pages/CustomerBalanceActivityPage"));
export const CustomerPartyBalancesPage = lazyWithRetry(() => import("@/pages/CustomerPartyBalancesPage"));
export const CustomerOutstandingReport = lazyWithRetry(() => import("@/pages/CustomerOutstandingReport"));
export const AccountsPaymentsPage = lazyWithRetry(() => import("@/pages/AccountsPaymentsPage"));
export const SupplierPartyBalancesPage = lazyWithRetry(() => import("@/pages/SupplierPartyBalancesPage"));
export const PartyPaymentFlowPage = lazyWithRetry(() => import("@/pages/PartyPaymentFlowPage"));
export const OrphanedProductsPage = lazyWithRetry(() => import("@/pages/OrphanedProductsPage"));
export const CustomerReconciliation = lazyWithRetry(() => import("@/pages/CustomerReconciliation"));
export const StockReconciliationReport = lazyWithRetry(() => import("@/pages/StockReconciliationReport"));
export const BulkProductUpdate = lazyWithRetry(() => import("@/pages/BulkProductUpdate"));
export const DeliveryChallanEntry = lazyWithRetry(() => import("@/pages/DeliveryChallanEntry"));
export const DeliveryChallanDashboard = lazyWithRetry(() => import("@/pages/DeliveryChallanDashboard"));
export const DebitNoteDashboard = lazyWithRetry(() => import("@/pages/DebitNoteDashboard"));
export const EwayBillRegister = lazyWithRetry(() => import("@/pages/EwayBillRegister"));
export const AdvanceBookingDashboard = lazyWithRetry(() => import("@/pages/AdvanceBookingDashboard"));
export const DiscountSchemeDashboard = lazyWithRetry(() => import("@/pages/DiscountSchemeDashboard"));
export const SalesmanLayout = lazyWithRetry(() => import("@/layouts/SalesmanLayout"));
export const SalesmanDashboard = lazyWithRetry(() => import("@/pages/salesman/SalesmanDashboard"));
export const SalesmanCustomers = lazyWithRetry(() => import("@/pages/salesman/SalesmanCustomers"));
export const SalesmanOrderEntry = lazyWithRetry(() => import("@/pages/salesman/SalesmanOrderEntry"));
export const SalesmanOrderView = lazyWithRetry(() => import("@/pages/salesman/SalesmanOrderView"));
export const SalesmanCustomerAccount = lazyWithRetry(() => import("@/pages/salesman/SalesmanCustomerAccount"));
export const SalesmanOrders = lazyWithRetry(() => import("@/pages/salesman/SalesmanOrders"));
export const SalesmanOutstanding = lazyWithRetry(() => import("@/pages/salesman/SalesmanOutstanding"));
export const WhatsAppLogs = lazyWithRetry(() => import("@/pages/WhatsAppLogs"));
export const WhatsAppInbox = lazyWithRetry(() => import("@/pages/WhatsAppInbox"));
export const BulkWhatsApp = lazyWithRetry(() => import("@/pages/BulkWhatsApp"));
export const MobileMoreMenu = lazyWithRetry(() => import("@/pages/mobile/MobileMoreMenu"));
export const MobileReportsHub = lazyWithRetry(() => import("@/pages/mobile/MobileReportsHub"));
export const MobileSalesHub = lazyWithRetry(() => import("@/pages/mobile/MobileSalesHub"));
export const MobilePosBilling = lazyWithRetry(() => import("@/pages/mobile/MobilePosBilling"));
export const MobilePurchaseEntry = lazyWithRetry(() => import("@/pages/mobile/MobilePurchaseEntry"));
export const MobileDashboardPage = lazyWithRetry(() => import("@/pages/mobile/MobileDashboardPage"));
export const MobileAccountsPage = lazyWithRetry(() => import("@/pages/mobile/MobileAccountsPage"));
export const OwnerSalesScreen = lazyWithRetry(() =>
  import("@/components/mobile/OwnerSalesScreen").then((m) => ({ default: m.OwnerSalesScreen })),
);
export const OwnerPurchaseScreen = lazyWithRetry(() =>
  import("@/components/mobile/OwnerPurchaseScreen").then((m) => ({ default: m.OwnerPurchaseScreen })),
);
export const OwnerStockScreen = lazyWithRetry(() =>
  import("@/components/mobile/OwnerStockScreen").then((m) => ({ default: m.OwnerStockScreen })),
);
export const OwnerReportsHub = lazyWithRetry(() =>
  import("@/components/mobile/OwnerReportsHub").then((m) => ({ default: m.OwnerReportsHub })),
);
export const StudentMaster = lazyWithRetry(() => import("@/pages/school/StudentMaster"));
export const StudentEntry = lazyWithRetry(() => import("@/pages/school/StudentEntry"));
export const AcademicYearSetup = lazyWithRetry(() => import("@/pages/school/AcademicYearSetup"));
export const ClassSectionSetup = lazyWithRetry(() => import("@/pages/school/ClassSectionSetup"));
export const FeeHeadsSetup = lazyWithRetry(() => import("@/pages/school/FeeHeadsSetup"));
export const FeeCollection = lazyWithRetry(() => import("@/pages/school/FeeCollection"));
export const FeeStructureSetup = lazyWithRetry(() => import("@/pages/school/FeeStructureSetup"));
export const TeacherMaster = lazyWithRetry(() => import("@/pages/school/TeacherMaster"));
export const StudentReports = lazyWithRetry(() => import("@/pages/school/StudentReports"));
export const StudentPromotion = lazyWithRetry(() => import("@/pages/school/StudentPromotion"));
export const StudentLedger = lazyWithRetry(() => import("@/pages/school/StudentLedger"));
export const PortalLogin = lazyWithRetry(() => import("@/pages/portal/PortalLogin"));
export const PortalHome = lazyWithRetry(() => import("@/pages/portal/PortalHome"));
export const PortalCatalogue = lazyWithRetry(() => import("@/pages/portal/PortalCatalogue"));
export const PortalOrders = lazyWithRetry(() => import("@/pages/portal/PortalOrders"));
export const PortalInvoices = lazyWithRetry(() => import("@/pages/portal/PortalInvoices"));
export const PortalAccount = lazyWithRetry(() => import("@/pages/portal/PortalAccount"));
export const PublicStorefront = lazyWithRetry(() => import("@/pages/PublicStorefront"));
export const WebsiteSettings = lazyWithRetry(() => import("@/pages/WebsiteSettings"));
export const AmazonSync = lazyWithRetry(() => import("@/pages/AmazonSync"));
export const BackupSettingsPage = lazyWithRetry(() => import("@/pages/BackupSettingsPage"));
export const SalesmanCommission = lazyWithRetry(() => import("@/pages/SalesmanCommission"));
export const AdminHealth = lazyWithRetry(() => import("@/pages/AdminHealth"));
