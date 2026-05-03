import { supabase } from "@/integrations/supabase/client";
import { fetchAllSaleItems, fetchVariantsByIds } from "@/utils/fetchAllRows";
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

export interface GlTrialBalanceEntry {
  accountId: string;
  accountCode: string;
  accountName: string;
  accountType: string;
  movementDebit: number;
  movementCredit: number;
  debit: number;
  credit: number;
}

/** Cumulative GL trial balance from journal_lines through as-of date (posted journals only). */
export async function calculateGlTrialBalance(
  organizationId: string,
  asOfDate: string
): Promise<GlTrialBalanceEntry[]> {
  const { data, error } = await supabase.rpc("get_gl_trial_balance", {
    p_org_id: organizationId,
    p_as_of_date: asOfDate,
  });
  if (error) throw error;
  const rows = (data ?? []) as Record<string, unknown>[];
  return rows.map((r) => ({
    accountId: String(r.account_id ?? ""),
    accountCode: String(r.account_code ?? ""),
    accountName: String(r.account_name ?? ""),
    accountType: String(r.account_type ?? ""),
    movementDebit: Number(r.movement_debit ?? 0),
    movementCredit: Number(r.movement_credit ?? 0),
    debit: Number(r.trial_debit ?? 0),
    credit: Number(r.trial_credit ?? 0),
  }));
}

// Calculate Trial Balance — uses server-side RPC
export async function calculateTrialBalance(
  organizationId: string,
  asOfDate: string
): Promise<TrialBalanceEntry[]> {
  const entries: TrialBalanceEntry[] = [];

  // Single RPC replaces 6+ client-side queries with .reduce()
  const { data: agg, error } = await supabase.rpc('get_trial_balance_aggregates', {
    p_org_id: organizationId,
    p_as_of_date: asOfDate,
  });

  if (error) throw error;

  const aggData = agg as any;
  const totalDebtors = aggData?.total_debtors || 0;
  const totalCreditors = aggData?.total_creditors || 0;
  const totalSalesRevenue = aggData?.total_sales || 0;
  const totalPurchasesAmount = aggData?.total_purchases || 0;
  const totalSaleReturns = aggData?.total_sale_returns || 0;
  const totalPurchaseReturns = aggData?.total_purchase_returns || 0;

  // Fetch expense vouchers for cash calculation
  const { data: expenseVouchers } = await supabase
    .from("voucher_entries")
    .select("total_amount")
    .eq("organization_id", organizationId)
    .eq("voucher_type", "expense")
    .lte("voucher_date", asOfDate)
    .is("deleted_at", null);
  const totalExpensesPaid = expenseVouchers?.reduce((sum, v) => sum + ((v as any).total_amount || 0), 0) || 0;

  const cashBalance = (aggData?.cash_balance || 0) - totalExpensesPaid;

  // Get stock value via RPC
  const { data: stockValue } = await supabase.rpc('get_stock_value', { p_org_id: organizationId });

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

  if ((stockValue || 0) > 0) {
    entries.push({ accountName: "Inventory (Stock)", accountType: "Asset", debit: stockValue || 0, credit: 0 });
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

  if (totalExpensesPaid > 0) {
    entries.push({ accountName: "Operating Expenses", accountType: "Expense", debit: totalExpensesPaid, credit: 0 });
  }

  return entries;
}

// Calculate Stock Value at current date — uses server-side RPC
export async function calculateStockValue(organizationId: string): Promise<number> {
  const { data, error } = await supabase.rpc('get_stock_value', { p_org_id: organizationId });
  if (error) {
    console.error("Error fetching stock value:", error);
    return 0;
  }
  return Number(data) || 0;
}

// Calculate Stock Value at a specific date (for opening stock)
export async function calculateStockValueAtDate(
  organizationId: string,
  asOfDate: string
): Promise<number> {
  // Get current stock value
  const currentStock = await calculateStockValue(organizationId);
  
  // Get all stock movements after the date to calculate what stock was at that point
  
  // Get purchases after the date (value at purchase price)
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
  
  // Get sales after the date with variant purchase prices
  const { data: saleItemsAfter } = await supabase
    .from("sale_items")
    .select(`
      quantity, variant_id,
      sales!inner(id, organization_id, sale_date, deleted_at),
      product_variants(pur_price)
    `)
    .eq("sales.organization_id", organizationId)
    .gt("sales.sale_date", asOfDate)
    .is("sales.deleted_at", null)
    .is("deleted_at", null);
  
  // Calculate sales value at PURCHASE PRICE (cost), not selling price
  const salesCostAfter = (saleItemsAfter ?? []).reduce((sum, s: any) => {
    const purPrice = s.product_variants?.pur_price || 0;
    return sum + ((s.quantity || 0) * purPrice);
  }, 0);
  
  // Get sale returns after the date (items returned to stock at cost)
  const { data: returnItemsAfter } = await supabase
    .from("sale_return_items")
    .select(`
      quantity, variant_id,
      sale_returns!inner(id, organization_id, return_date, deleted_at),
      product_variants(pur_price)
    `)
    .eq("sale_returns.organization_id", organizationId)
    .gt("sale_returns.return_date", asOfDate)
    .is("sale_returns.deleted_at", null)
    .is("deleted_at", null);
  
  const returnsValueAfter = (returnItemsAfter ?? []).reduce((sum, r: any) => {
    const purPrice = r.product_variants?.pur_price || 0;
    return sum + ((r.quantity || 0) * purPrice);
  }, 0);
  
  // Get purchase returns after the date (items returned to supplier at cost)
  const { data: purchaseReturnsAfter } = await supabase
    .from("purchase_return_items")
    .select(`
      qty, pur_price,
      purchase_returns!inner(id, organization_id, return_date, deleted_at)
    `)
    .eq("purchase_returns.organization_id", organizationId)
    .gt("purchase_returns.return_date", asOfDate)
    .is("purchase_returns.deleted_at", null)
    .is("deleted_at", null);
  
  const purchaseReturnsValueAfter = purchaseReturnsAfter?.reduce(
    (sum, p) => sum + ((p.qty || 0) * (p.pur_price || 0)), 0
  ) || 0;
  
  // Stock at date = Current stock 
  //                 - Purchases after date (added to stock)
  //                 + Sales after date (sold from stock, at cost)
  //                 - Sale Returns after date (returned to stock, at cost)
  //                 + Purchase Returns after date (returned to supplier)
  const stockAtDate = currentStock 
    - purchasesValueAfter 
    + salesCostAfter 
    - returnsValueAfter 
    + purchaseReturnsValueAfter;
  
  return Math.max(0, stockAtDate);
}

// Calculate Profit & Loss (Enhanced GST-Compliant)
export async function calculateProfitLoss(
  organizationId: string,
  fromDate: string,
  toDate: string
): Promise<ProfitLossData> {
  const warnings: string[] = [];
  
  // Single RPC replaces 5 separate queries + client-side reduces
  const { data: pnlAgg, error: pnlError } = await supabase.rpc('get_pnl_aggregates', {
    p_org_id: organizationId,
    p_from_date: fromDate,
    p_to_date: toDate,
  });
  if (pnlError) throw pnlError;

  const pnl = pnlAgg as any;
  const grossSales = pnl?.gross_sales || 0;
  const salesReturns = pnl?.sales_returns || 0;
  const netSales = grossSales - salesReturns;
  const purchasesAmount = pnl?.purchases_gross || 0;
  const purchasesGST = pnl?.purchases_gst || 0;
  const purchaseReturnsAmount = pnl?.purchase_returns || 0;

  // COGS SECTION (GST-Exclusive)
  const openingStockDate = format(subDays(new Date(fromDate), 1), "yyyy-MM-dd");
  const openingStock = await calculateStockValueAtDate(organizationId, openingStockDate);
  
  // Closing Stock at period end (not live stock)
  const closingStock = await calculateStockValueAtDate(organizationId, toDate);
  
  if (closingStock < 0) {
    warnings.push("Warning: Negative closing stock detected. Please verify stock entries.");
  }

  const cogs = Math.max(0, openingStock + purchasesAmount - purchaseReturnsAmount - closingStock);
  const grossProfit = netSales - cogs;
  const isGrossLoss = grossProfit < 0;

  // Expenses by category via RPC
  const { data: expenseCatData, error: expError } = await supabase.rpc('get_expense_by_category', {
    p_org_id: organizationId,
    p_from_date: fromDate,
    p_to_date: toDate,
  });
  if (expError) throw expError;

  const expensesByCategory: ExpenseCategory[] = ((expenseCatData as any) || []).map((e: any) => ({
    category: e.category,
    amount: Number(e.amount) || 0,
  }));

  const totalExpenses = expensesByCategory.reduce((sum, e) => sum + e.amount, 0);

  const netProfit = grossProfit - totalExpenses;
  const isNetLoss = netProfit < 0;
  const profitMargin = netSales > 0 ? (netProfit / netSales) * 100 : 0;

  if (netSales === 0 && cogs > 0) {
    warnings.push("No sales recorded for this period, but cost of goods exists.");
  }
  
  if (netSales === 0 && totalExpenses === 0 && cogs === 0) {
    warnings.push("No transactions recorded for this period.");
  }

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

// Calculate Balance Sheet — uses server-side RPC
export async function calculateBalanceSheet(
  organizationId: string,
  asOfDate: string
): Promise<BalanceSheetData> {
  // Single RPC replaces 4 queries + client-side loops
  const { data: agg, error } = await supabase.rpc('get_trial_balance_aggregates', {
    p_org_id: organizationId,
    p_as_of_date: asOfDate,
  });
  if (error) throw error;

  const aggData = agg as any;
  const cashBank = aggData?.cash_balance || 0;
  const accountsReceivable = aggData?.accounts_receivable || 0;
  const accountsPayable = aggData?.accounts_payable || 0;

  const inventory = await calculateStockValue(organizationId);

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
  // Use RPC for simple aggregates (total_sales, returns, expenses, input_gst)
  const { data: npAgg, error: npError } = await supabase.rpc('get_net_profit_aggregates', {
    p_org_id: organizationId,
    p_from_date: fromDate,
    p_to_date: toDate,
  });
  if (npError) throw npError;

  const np = npAgg as any;
  const totalSales = np?.total_sales || 0;
  const salesReturnsTotal = np?.sales_returns || 0;
  const netRevenue = totalSales - salesReturnsTotal;
  const inputGST = np?.input_gst || 0;
  const totalExpenses = np?.total_expenses || 0;
  
  // COGS still needs per-item calculation (pur_price × quantity from sale_items)
  // We still need sale IDs to fetch sale_items for COGS
  const { data: saleIdRows } = await supabase
    .from("sales")
    .select("id")
    .eq("organization_id", organizationId)
    .gte("sale_date", fromDate)
    .lte("sale_date", toDate)
    .is("deleted_at", null);
  
  const saleIds = saleIdRows?.map(s => s.id) || [];
  
  let cogsFromSaleItems = 0;
  let outputGST = 0;
  
  if (saleIds.length > 0) {
    const saleItems = await fetchAllSaleItems(saleIds);
    
    if (saleItems && saleItems.length > 0) {
      const variantIds = [...new Set(saleItems.map(item => item.variant_id).filter(Boolean))];
      const variants = await fetchVariantsByIds(variantIds, "id, pur_price");
      const variantPriceMap = new Map(variants?.map((v: any) => [v.id, v.pur_price || 0]) || []);
      
      saleItems.forEach(item => {
        const qty = item.quantity || 0;
        const purPrice = variantPriceMap.get(item.variant_id) || 0;
        cogsFromSaleItems += qty * purPrice;
        
        const lineTotal = item.line_total || 0;
        const gstPer = item.gst_percent || 0;
        if (gstPer > 0) {
          outputGST += (lineTotal * gstPer) / (100 + gstPer);
        }
      });
    }
  }
  
  const grossProfit = netRevenue - cogsFromSaleItems;
  const isGrossLoss = grossProfit < 0;
  const netGSTLiability = outputGST - inputGST;
  const netProfit = grossProfit - totalExpenses; // GST is pass-through, not deducted
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

// Get quarter dates (calendar quarters - kept for backward compat)
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

// Get India FY Quarters (Apr-Jun Q1, Jul-Sep Q2, Oct-Dec Q3, Jan-Mar Q4)
export function getAllIndiaFYQuarters(): Array<{ fromDate: string; toDate: string; label: string; isCurrent: boolean }> {
  const today = new Date();
  const month = today.getMonth();
  const fyYear = month >= 3 ? today.getFullYear() : today.getFullYear() - 1;
  const currentQIdx = month >= 3 && month <= 5 ? 0 : month >= 6 && month <= 8 ? 1 : month >= 9 ? 2 : 3;
  const quarters = [
    { label: `Q1 Apr-Jun ${fyYear}`, from: new Date(fyYear, 3, 1), to: new Date(fyYear, 5, 30) },
    { label: `Q2 Jul-Sep ${fyYear}`, from: new Date(fyYear, 6, 1), to: new Date(fyYear, 8, 30) },
    { label: `Q3 Oct-Dec ${fyYear}`, from: new Date(fyYear, 9, 1), to: new Date(fyYear, 11, 31) },
    { label: `Q4 Jan-Mar ${fyYear + 1}`, from: new Date(fyYear + 1, 0, 1), to: new Date(fyYear + 1, 2, 31) },
  ];
  return quarters.map((q, i) => ({
    fromDate: format(q.from, "yyyy-MM-dd"),
    toDate: format(q.to, "yyyy-MM-dd"),
    label: q.label,
    isCurrent: i === currentQIdx,
  }));
}
