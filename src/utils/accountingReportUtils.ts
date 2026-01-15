import { supabase } from "@/integrations/supabase/client";

export interface TrialBalanceEntry {
  accountName: string;
  accountType: string;
  debit: number;
  credit: number;
}

export interface ProfitLossData {
  grossSales: number;
  salesReturns: number;
  netSales: number;
  openingStock: number;
  purchases: number;
  purchaseReturns: number;
  closingStock: number;
  cogs: number;
  grossProfit: number;
  expenses: number;
  netProfit: number;
  profitMargin: number;
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
  totalRevenue: number;
  totalExpenses: number;
  grossProfit: number;
  netProfit: number;
  profitMarginPercent: number;
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

// Calculate Stock Value
export async function calculateStockValue(organizationId: string): Promise<number> {
  const { data: variants } = await supabase
    .from("product_variants")
    .select("stock_qty, pur_price")
    .eq("organization_id", organizationId)
    .is("deleted_at", null);

  if (!variants) return 0;
  return variants.reduce((sum, v) => sum + ((v.stock_qty || 0) * (v.pur_price || 0)), 0);
}

// Calculate Profit & Loss
export async function calculateProfitLoss(
  organizationId: string,
  fromDate: string,
  toDate: string
): Promise<ProfitLossData> {
  const { data: sales } = await supabase
    .from("sales")
    .select("net_amount")
    .eq("organization_id", organizationId)
    .gte("invoice_date", fromDate)
    .lte("invoice_date", toDate)
    .is("deleted_at", null);
  const grossSales = sales?.reduce((sum, s) => sum + (s.net_amount || 0), 0) || 0;

  const { data: saleReturns } = await supabase
    .from("sale_returns")
    .select("net_amount")
    .eq("organization_id", organizationId)
    .gte("return_date", fromDate)
    .lte("return_date", toDate)
    .is("deleted_at", null);
  const salesReturns = saleReturns?.reduce((sum, sr) => sum + (sr.net_amount || 0), 0) || 0;

  const netSales = grossSales - salesReturns;

  const { data: purchases } = await supabase
    .from("purchase_bills")
    .select("net_amount")
    .eq("organization_id", organizationId)
    .gte("bill_date", fromDate)
    .lte("bill_date", toDate)
    .is("deleted_at", null);
  const purchasesAmount = purchases?.reduce((sum, p) => sum + (p.net_amount || 0), 0) || 0;

  const { data: purchaseReturns } = await supabase
    .from("purchase_returns")
    .select("net_amount")
    .eq("organization_id", organizationId)
    .gte("return_date", fromDate)
    .lte("return_date", toDate)
    .is("deleted_at", null);
  const purchaseReturnsAmount = purchaseReturns?.reduce((sum, pr) => sum + (pr.net_amount || 0), 0) || 0;

  const closingStock = await calculateStockValue(organizationId);
  const openingStock = Math.max(0, closingStock - purchasesAmount + purchaseReturnsAmount);
  const cogs = Math.max(0, openingStock + purchasesAmount - purchaseReturnsAmount - closingStock);
  const grossProfit = netSales - cogs;
  const expenses = 0; // Simplified - no separate expense tracking
  const netProfit = grossProfit - expenses;
  const profitMargin = netSales > 0 ? (netProfit / netSales) * 100 : 0;

  return {
    grossSales,
    salesReturns,
    netSales,
    openingStock,
    purchases: purchasesAmount,
    purchaseReturns: purchaseReturnsAmount,
    closingStock,
    cogs,
    grossProfit,
    expenses,
    netProfit,
    profitMargin,
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

// Calculate Net Profit Summary
export async function calculateNetProfitSummary(
  organizationId: string,
  fromDate: string,
  toDate: string
): Promise<NetProfitSummary> {
  const plData = await calculateProfitLoss(organizationId, fromDate, toDate);
  return {
    totalRevenue: plData.netSales,
    totalExpenses: plData.cogs + plData.expenses,
    grossProfit: plData.grossProfit,
    netProfit: plData.netProfit,
    profitMarginPercent: plData.profitMargin,
  };
}
