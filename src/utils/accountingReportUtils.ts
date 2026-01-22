import { supabase } from "@/integrations/supabase/client";
import { fetchAllSaleItems } from "@/utils/fetchAllRows";
import { format, subDays } from "date-fns";

export interface TrialBalanceEntry {
  accountName: string;
  accountType: string;
  debit: number;
  credit: number;
}

export interface ExpenseCategory {
  category: string;
  amount: number;
}

export interface ProfitLossData {
  // Revenue
  grossSales: number;
  salesReturns: number;
  netSales: number;
  
  // COGS (GST-exclusive)
  openingStock: number;
  purchases: number;
  purchasesGST: number; // For reference only
  purchaseReturns: number;
  closingStock: number;
  cogs: number;
  
  // Gross Profit
  grossProfit: number;
  isGrossLoss: boolean;
  
  // Expenses by Category
  expensesByCategory: ExpenseCategory[];
  totalExpenses: number;
  
  // Net Profit
  netProfit: number;
  isNetLoss: boolean;
  profitMargin: number;
  
  // Metadata
  warnings: string[];
  generatedAt: string;
  periodLabel: string;
}

export interface BalanceSheetData {
  assets: {
    cashBank: number;
    accountsReceivable: number;
    inventory: number;
    totalAssets: number;
  };
  liabilities: {
    accountsPayable: number;
    gstPayable: number;
    totalLiabilities: number;
  };
  equity: {
    openingCapital: number;
    netProfit: number;
    closingCapital: number;
  };
}

export interface NetProfitSummary {
  // Revenue Section
  totalSales: number;
  salesReturns: number;
  netRevenue: number;
  
  // COGS Section (from actual sold items)
  cogsFromSaleItems: number;
  
  // Gross Profit
  grossProfit: number;
  isGrossLoss: boolean;
  
  // GST Section
  outputGST: number;
  inputGST: number;
  netGSTLiability: number;
  
  // Expenses
  totalExpenses: number;
  
  // Final Calculation
  netProfit: number;
  isNetLoss: boolean;
  profitMarginPercent: number;
  
  // Period info
  periodLabel: string;
  generatedAt: string;
}

// Calculate Trial Balance
export async function calculateTrialBalance(
  organizationId: string,
  asOfDate: string
): Promise<TrialBalanceEntry[]> {
  const entries: TrialBalanceEntry[] = [];

  // 1. Get customer balances (Debtors)
  const { data: customers } = await supabase
    .from("customers")
    .select("id, customer_name, opening_balance")
    .eq("organization_id", organizationId)
    .is("deleted_at", null);

  const { data: sales } = await supabase
    .from("sales")
    .select("customer_id, net_amount, paid_amount")
    .eq("organization_id", organizationId)
    .lte("invoice_date", asOfDate)
    .is("deleted_at", null);

  let totalDebtors = 0;
  if (customers) {
    for (const customer of customers) {
      const openingBal = customer.opening_balance || 0;
      const customerSales = sales?.filter(s => s.customer_id === customer.id) || [];
      const totalSales = customerSales.reduce((sum, s) => sum + (s.net_amount || 0), 0);
      const paidAmount = customerSales.reduce((sum, s) => sum + (s.paid_amount || 0), 0);
      totalDebtors += openingBal + totalSales - paidAmount;
    }
  }

  // 2. Get supplier balances (Creditors)
  const { data: suppliers } = await supabase
    .from("suppliers")
    .select("id, supplier_name, opening_balance")
    .eq("organization_id", organizationId)
    .is("deleted_at", null);

  const { data: purchases } = await supabase
    .from("purchase_bills")
    .select("supplier_id, net_amount, paid_amount")
    .eq("organization_id", organizationId)
    .lte("bill_date", asOfDate)
    .is("deleted_at", null);

  let totalCreditors = 0;
  if (suppliers) {
    for (const supplier of suppliers) {
      const openingBal = supplier.opening_balance || 0;
      const supplierPurchases = purchases?.filter(p => p.supplier_id === supplier.id) || [];
      const totalPurchases = supplierPurchases.reduce((sum, p) => sum + (p.net_amount || 0), 0);
      const paidAmount = supplierPurchases.reduce((sum, p) => sum + (p.paid_amount || 0), 0);
      totalCreditors += openingBal + totalPurchases - paidAmount;
    }
  }

  // Get total sales
  const totalSalesRevenue = sales?.reduce((sum, s) => sum + (s.net_amount || 0), 0) || 0;
  const totalPurchasesAmount = purchases?.reduce((sum, p) => sum + (p.net_amount || 0), 0) || 0;

  // Get sale returns
  const { data: saleReturns } = await supabase
    .from("sale_returns")
    .select("net_amount")
    .eq("organization_id", organizationId)
    .lte("return_date", asOfDate)
    .is("deleted_at", null);
  const totalSaleReturns = saleReturns?.reduce((sum, sr) => sum + (sr.net_amount || 0), 0) || 0;

  // Get purchase returns
  const { data: purchaseReturns } = await supabase
    .from("purchase_returns")
    .select("net_amount")
    .eq("organization_id", organizationId)
    .lte("return_date", asOfDate)
    .is("deleted_at", null);
  const totalPurchaseReturns = purchaseReturns?.reduce((sum, pr) => sum + (pr.net_amount || 0), 0) || 0;

  // Calculate cash from paid amounts
  const cashFromSales = sales?.reduce((sum, s) => sum + (s.paid_amount || 0), 0) || 0;
  const cashToPurchases = purchases?.reduce((sum, p) => sum + (p.paid_amount || 0), 0) || 0;
  const cashBalance = cashFromSales - cashToPurchases;

  // Get stock value
  const stockValue = await calculateStockValue(organizationId);

  // Build trial balance entries
  if (cashBalance !== 0) {
    entries.push({
      accountName: "Cash & Bank",
      accountType: "Asset",
      debit: cashBalance > 0 ? cashBalance : 0,
      credit: cashBalance < 0 ? Math.abs(cashBalance) : 0,
    });
  }

  if (totalDebtors !== 0) {
    entries.push({
      accountName: "Accounts Receivable (Debtors)",
      accountType: "Asset",
      debit: totalDebtors > 0 ? totalDebtors : 0,
      credit: totalDebtors < 0 ? Math.abs(totalDebtors) : 0,
    });
  }

  if (stockValue > 0) {
    entries.push({ accountName: "Inventory (Stock)", accountType: "Asset", debit: stockValue, credit: 0 });
  }

  if (totalCreditors !== 0) {
    entries.push({
      accountName: "Accounts Payable (Creditors)",
      accountType: "Liability",
      debit: totalCreditors < 0 ? Math.abs(totalCreditors) : 0,
      credit: totalCreditors > 0 ? totalCreditors : 0,
    });
  }

  if (totalSalesRevenue > 0) {
    entries.push({ accountName: "Sales Revenue", accountType: "Revenue", debit: 0, credit: totalSalesRevenue });
  }

  if (totalSaleReturns > 0) {
    entries.push({ accountName: "Sales Returns", accountType: "Revenue", debit: totalSaleReturns, credit: 0 });
  }

  if (totalPurchasesAmount > 0) {
    entries.push({ accountName: "Purchases", accountType: "Expense", debit: totalPurchasesAmount, credit: 0 });
  }

  if (totalPurchaseReturns > 0) {
    entries.push({ accountName: "Purchase Returns", accountType: "Expense", debit: 0, credit: totalPurchaseReturns });
  }

  return entries;
}

// Calculate Stock Value at current date
export async function calculateStockValue(organizationId: string): Promise<number> {
  const { data: variants } = await supabase
    .from("product_variants")
    .select("stock_qty, pur_price")
    .eq("organization_id", organizationId)
    .is("deleted_at", null);

  if (!variants) return 0;
  return variants.reduce((sum, v) => sum + ((v.stock_qty || 0) * (v.pur_price || 0)), 0);
}

// Calculate Stock Value at a specific date (for opening stock)
export async function calculateStockValueAtDate(
  organizationId: string,
  asOfDate: string
): Promise<number> {
  // Get current stock value
  const currentStock = await calculateStockValue(organizationId);
  
  // Get all stock movements after the date to calculate what stock was at that point
  // This is a simplified approach - in production, you'd track stock movements explicitly
  
  // Get purchases after the date
  const { data: purchasesAfter } = await supabase
    .from("purchase_items")
    .select(`
      qty, pur_price,
      purchase_bills!inner(bill_date, organization_id, deleted_at)
    `)
    .eq("purchase_bills.organization_id", organizationId)
    .gt("purchase_bills.bill_date", asOfDate)
    .is("purchase_bills.deleted_at", null)
    .is("deleted_at", null);
  
  const purchasesValueAfter = purchasesAfter?.reduce(
    (sum, p) => sum + ((p.qty || 0) * (p.pur_price || 0)), 0
  ) || 0;
  
  // Get sales after the date - fetch sale IDs first, then use paginated fetch
  const { data: salesAfterList } = await supabase
    .from("sales")
    .select("id")
    .eq("organization_id", organizationId)
    .gt("invoice_date", asOfDate)
    .is("deleted_at", null);
  
  const saleIdsAfter = salesAfterList?.map(s => s.id) || [];
  let salesValueAfter = 0;
  
  if (saleIdsAfter.length > 0) {
    const saleItemsAfter = await fetchAllSaleItems(saleIdsAfter);
    salesValueAfter = saleItemsAfter.reduce(
      (sum, s) => sum + ((s.quantity || 0) * (s.unit_price || 0)), 0
    );
  }
  
  // Stock at date = Current stock - Purchases after date + Sales after date
  // (Simplified - actual implementation would use FIFO/LIFO/Weighted Average)
  return Math.max(0, currentStock - purchasesValueAfter + salesValueAfter);
}

// Calculate Profit & Loss (Enhanced GST-Compliant)
export async function calculateProfitLoss(
  organizationId: string,
  fromDate: string,
  toDate: string
): Promise<ProfitLossData> {
  const warnings: string[] = [];
  
  // REVENUE SECTION
  // Gross Sales - use gross_amount (before GST) for GST-exclusive reporting
  const { data: sales } = await supabase
    .from("sales")
    .select("gross_amount, net_amount")
    .eq("organization_id", organizationId)
    .gte("sale_date", fromDate)
    .lte("sale_date", toDate)
    .is("deleted_at", null);
  
  // Use gross_amount (before GST) for GST-exclusive reporting
  const grossSales = sales?.reduce((sum, s) => sum + (s.gross_amount || s.net_amount || 0), 0) || 0;

  // Sales Returns
  const { data: saleReturns } = await supabase
    .from("sale_returns")
    .select("gross_amount, net_amount")
    .eq("organization_id", organizationId)
    .gte("return_date", fromDate)
    .lte("return_date", toDate)
    .is("deleted_at", null);
  const salesReturns = saleReturns?.reduce((sum, sr) => sum + (sr.gross_amount || sr.net_amount || 0), 0) || 0;

  const netSales = grossSales - salesReturns;

  // COGS SECTION (GST-Exclusive)
  // Opening Stock = Stock value at the start of the period
  const openingStockDate = format(subDays(new Date(fromDate), 1), "yyyy-MM-dd");
  const openingStock = await calculateStockValueAtDate(organizationId, openingStockDate);
  
  // Purchases (GST-Exclusive - use gross_amount)
  const { data: purchases } = await supabase
    .from("purchase_bills")
    .select("gross_amount, gst_amount, net_amount")
    .eq("organization_id", organizationId)
    .gte("bill_date", fromDate)
    .lte("bill_date", toDate)
    .is("deleted_at", null);
  
  // gross_amount is the amount BEFORE GST (GST-exclusive)
  const purchasesAmount = purchases?.reduce((sum, p) => sum + (p.gross_amount || 0), 0) || 0;
  const purchasesGST = purchases?.reduce((sum, p) => sum + (p.gst_amount || 0), 0) || 0;

  // Purchase Returns (GST-Exclusive)
  const { data: purchaseReturns } = await supabase
    .from("purchase_returns")
    .select("gross_amount, net_amount")
    .eq("organization_id", organizationId)
    .gte("return_date", fromDate)
    .lte("return_date", toDate)
    .is("deleted_at", null);
  const purchaseReturnsAmount = purchaseReturns?.reduce((sum, pr) => sum + (pr.gross_amount || pr.net_amount || 0), 0) || 0;

  // Closing Stock (current stock value)
  const closingStock = await calculateStockValue(organizationId);
  
  // Validate closing stock
  if (closingStock < 0) {
    warnings.push("Warning: Negative closing stock detected. Please verify stock entries.");
  }

  // COGS = Opening Stock + Purchases - Purchase Returns - Closing Stock
  const cogs = Math.max(0, openingStock + purchasesAmount - purchaseReturnsAmount - closingStock);

  // Gross Profit
  const grossProfit = netSales - cogs;
  const isGrossLoss = grossProfit < 0;

  // EXPENSES SECTION (from voucher_entries)
  const { data: expenseVouchers } = await supabase
    .from("voucher_entries")
    .select("category, total_amount")
    .eq("organization_id", organizationId)
    .eq("voucher_type", "expense")
    .gte("voucher_date", fromDate)
    .lte("voucher_date", toDate)
    .is("deleted_at", null);

  // Group expenses by category
  const expenseMap = new Map<string, number>();
  expenseVouchers?.forEach(v => {
    const category = v.category || "Miscellaneous";
    const current = expenseMap.get(category) || 0;
    expenseMap.set(category, current + (v.total_amount || 0));
  });

  const expensesByCategory: ExpenseCategory[] = Array.from(expenseMap.entries())
    .map(([category, amount]) => ({ category, amount }))
    .sort((a, b) => b.amount - a.amount);

  const totalExpenses = expensesByCategory.reduce((sum, e) => sum + e.amount, 0);

  // Net Profit
  const netProfit = grossProfit - totalExpenses;
  const isNetLoss = netProfit < 0;
  const profitMargin = netSales > 0 ? (netProfit / netSales) * 100 : 0;

  // Edge case warnings
  if (netSales === 0 && cogs > 0) {
    warnings.push("No sales recorded for this period, but cost of goods exists.");
  }
  
  if (netSales === 0 && totalExpenses === 0 && cogs === 0) {
    warnings.push("No transactions recorded for this period.");
  }

  // Generate period label
  const fromFormatted = format(new Date(fromDate), "dd MMM yyyy");
  const toFormatted = format(new Date(toDate), "dd MMM yyyy");
  const periodLabel = `${fromFormatted} to ${toFormatted}`;

  return {
    grossSales,
    salesReturns,
    netSales,
    openingStock,
    purchases: purchasesAmount,
    purchasesGST,
    purchaseReturns: purchaseReturnsAmount,
    closingStock,
    cogs,
    grossProfit,
    isGrossLoss,
    expensesByCategory,
    totalExpenses,
    netProfit,
    isNetLoss,
    profitMargin,
    warnings,
    generatedAt: format(new Date(), "dd MMM yyyy, hh:mm a"),
    periodLabel,
  };
}

// Calculate Balance Sheet
export async function calculateBalanceSheet(
  organizationId: string,
  asOfDate: string
): Promise<BalanceSheetData> {
  const { data: sales } = await supabase
    .from("sales")
    .select("customer_id, net_amount, paid_amount")
    .eq("organization_id", organizationId)
    .lte("invoice_date", asOfDate)
    .is("deleted_at", null);

  const cashFromSales = sales?.reduce((sum, s) => sum + (s.paid_amount || 0), 0) || 0;

  const { data: purchases } = await supabase
    .from("purchase_bills")
    .select("supplier_id, net_amount, paid_amount")
    .eq("organization_id", organizationId)
    .lte("bill_date", asOfDate)
    .is("deleted_at", null);

  const cashToPurchases = purchases?.reduce((sum, p) => sum + (p.paid_amount || 0), 0) || 0;
  const cashBank = cashFromSales - cashToPurchases;

  // Accounts Receivable
  const { data: customers } = await supabase
    .from("customers")
    .select("id, opening_balance")
    .eq("organization_id", organizationId)
    .is("deleted_at", null);

  let accountsReceivable = 0;
  if (customers) {
    for (const customer of customers) {
      const openingBal = customer.opening_balance || 0;
      const customerSales = sales?.filter(s => s.customer_id === customer.id) || [];
      const totalSales = customerSales.reduce((sum, s) => sum + (s.net_amount || 0), 0);
      const paidAmount = customerSales.reduce((sum, s) => sum + (s.paid_amount || 0), 0);
      accountsReceivable += openingBal + totalSales - paidAmount;
    }
  }

  const inventory = await calculateStockValue(organizationId);

  // Accounts Payable
  const { data: suppliers } = await supabase
    .from("suppliers")
    .select("id, opening_balance")
    .eq("organization_id", organizationId)
    .is("deleted_at", null);

  let accountsPayable = 0;
  if (suppliers) {
    for (const supplier of suppliers) {
      const openingBal = supplier.opening_balance || 0;
      const supplierPurchases = purchases?.filter(p => p.supplier_id === supplier.id) || [];
      const totalPurchases = supplierPurchases.reduce((sum, p) => sum + (p.net_amount || 0), 0);
      const paidAmount = supplierPurchases.reduce((sum, p) => sum + (p.paid_amount || 0), 0);
      accountsPayable += openingBal + totalPurchases - paidAmount;
    }
  }

  const totalAssets = Math.max(0, cashBank) + Math.max(0, accountsReceivable) + inventory;
  const totalLiabilities = Math.max(0, accountsPayable);
  const closingCapital = totalAssets - totalLiabilities;

  return {
    assets: {
      cashBank: Math.max(0, cashBank),
      accountsReceivable: Math.max(0, accountsReceivable),
      inventory,
      totalAssets,
    },
    liabilities: {
      accountsPayable: Math.max(0, accountsPayable),
      gstPayable: 0,
      totalLiabilities,
    },
    equity: {
      openingCapital: 0,
      netProfit: closingCapital,
      closingCapital,
    },
  };
}

// Calculate Net Profit Summary - Income Statement Format
export async function calculateNetProfitSummary(
  organizationId: string,
  fromDate: string,
  toDate: string
): Promise<NetProfitSummary> {
  // 1. REVENUE: Total Sales
  const { data: sales } = await supabase
    .from("sales")
    .select("id, net_amount")
    .eq("organization_id", organizationId)
    .gte("sale_date", fromDate)
    .lte("sale_date", toDate)
    .is("deleted_at", null);
  
  const totalSales = sales?.reduce((sum, s) => sum + (s.net_amount || 0), 0) || 0;
  const saleIds = sales?.map(s => s.id) || [];
  
  // 2. Sale Returns
  const { data: saleReturns } = await supabase
    .from("sale_returns")
    .select("net_amount")
    .eq("organization_id", organizationId)
    .gte("return_date", fromDate)
    .lte("return_date", toDate)
    .is("deleted_at", null);
  
  const salesReturnsTotal = saleReturns?.reduce((sum, sr) => sum + (sr.net_amount || 0), 0) || 0;
  const netRevenue = totalSales - salesReturnsTotal;
  
  // 3. COGS: Calculate from actual sold items (pur_price × quantity)
  // Fetch sale items with their variant purchase prices
  let cogsFromSaleItems = 0;
  let outputGST = 0;
  
  if (saleIds.length > 0) {
    // Use paginated fetch to bypass 1000-row limit
    const saleItems = await fetchAllSaleItems(saleIds);
    
    if (saleItems && saleItems.length > 0) {
      // Get variant purchase prices
      const variantIds = [...new Set(saleItems.map(item => item.variant_id).filter(Boolean))];
      
      const { data: variants } = await supabase
        .from("product_variants")
        .select("id, pur_price")
        .in("id", variantIds);
      
      const variantPriceMap = new Map(variants?.map(v => [v.id, v.pur_price || 0]) || []);
      
      saleItems.forEach(item => {
        const qty = item.quantity || 0;
        const purPrice = variantPriceMap.get(item.variant_id) || 0;
        cogsFromSaleItems += qty * purPrice;
        
        // Output GST = line_total × gst_percent / (100 + gst_percent)
        const lineTotal = item.line_total || 0;
        const gstPer = item.gst_percent || 0;
        if (gstPer > 0) {
          outputGST += (lineTotal * gstPer) / (100 + gstPer);
        }
      });
    }
  }
  
  // 4. Gross Profit
  const grossProfit = netRevenue - cogsFromSaleItems;
  const isGrossLoss = grossProfit < 0;
  
  // 5. INPUT GST: From purchase bills
  const { data: purchases } = await supabase
    .from("purchase_bills")
    .select("gst_amount")
    .eq("organization_id", organizationId)
    .gte("bill_date", fromDate)
    .lte("bill_date", toDate)
    .is("deleted_at", null);
  
  const inputGST = purchases?.reduce((sum, p) => sum + (p.gst_amount || 0), 0) || 0;
  
  // 6. Net GST Liability
  const netGSTLiability = outputGST - inputGST;
  
  // 7. EXPENSES: From voucher_entries
  const { data: expenses } = await supabase
    .from("voucher_entries")
    .select("total_amount")
    .eq("organization_id", organizationId)
    .eq("voucher_type", "expense")
    .gte("voucher_date", fromDate)
    .lte("voucher_date", toDate)
    .is("deleted_at", null);
  
  const totalExpenses = expenses?.reduce((sum, e) => sum + (e.total_amount || 0), 0) || 0;
  
  // 8. NET PROFIT: Gross Profit - Net GST (if payable) - Expenses
  const gstDeduction = netGSTLiability > 0 ? netGSTLiability : 0;
  const netProfit = grossProfit - gstDeduction - totalExpenses;
  const isNetLoss = netProfit < 0;
  const profitMarginPercent = netRevenue > 0 ? (netProfit / netRevenue) * 100 : 0;
  
  return {
    totalSales,
    salesReturns: salesReturnsTotal,
    netRevenue,
    cogsFromSaleItems,
    grossProfit,
    isGrossLoss,
    outputGST,
    inputGST,
    netGSTLiability,
    totalExpenses,
    netProfit,
    isNetLoss,
    profitMarginPercent,
    periodLabel: `${format(new Date(fromDate), "dd MMM yyyy")} to ${format(new Date(toDate), "dd MMM yyyy")}`,
    generatedAt: format(new Date(), "dd MMM yyyy, hh:mm a"),
  };
}

// Get India Financial Year dates
export function getIndiaFinancialYear(offset: number = 0): { fromDate: string; toDate: string; label: string } {
  const today = new Date();
  let fyStartYear = today.getMonth() >= 3 ? today.getFullYear() : today.getFullYear() - 1;
  fyStartYear += offset;
  
  const fromDate = format(new Date(fyStartYear, 3, 1), "yyyy-MM-dd"); // April 1
  const toDate = format(new Date(fyStartYear + 1, 2, 31), "yyyy-MM-dd"); // March 31
  const label = `FY ${fyStartYear}-${(fyStartYear + 1).toString().slice(-2)}`;
  
  return { fromDate, toDate, label };
}

// Get quarter dates
export function getCurrentQuarter(): { fromDate: string; toDate: string; label: string } {
  const today = new Date();
  const quarter = Math.floor(today.getMonth() / 3);
  const quarterStart = new Date(today.getFullYear(), quarter * 3, 1);
  const quarterEnd = new Date(today.getFullYear(), quarter * 3 + 3, 0);
  
  const quarterNames = ["Q1", "Q2", "Q3", "Q4"];
  
  return {
    fromDate: format(quarterStart, "yyyy-MM-dd"),
    toDate: format(quarterEnd, "yyyy-MM-dd"),
    label: `${quarterNames[quarter]} ${today.getFullYear()}`,
  };
}
