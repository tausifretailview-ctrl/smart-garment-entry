import { Link } from "react-router-dom";
import { BookOpen, ChevronDown, Landmark, Receipt, Scale, Wallet } from "lucide-react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";
import { cn } from "@/lib/utils";
import { useOrgNavigation } from "@/hooks/useOrgNavigation";

type AccountingEntriesGuideProps = {
  /** Shorter layout for Accounts → Expenses tab */
  compact?: boolean;
  className?: string;
};

const assetRows = [
  { code: "1000", name: "Cash in Hand", when: "Cash sales, cash expenses, cash receipts" },
  { code: "1010", name: "Bank Account", when: "UPI / card / bank sales and payments" },
  { code: "1200", name: "Accounts Receivable", when: "Credit sales and unpaid customer balances" },
  { code: "1300", name: "Stock-in-Hand", when: "Purchase bills (reduced when goods are sold)" },
  { code: "1400–1420", name: "Input GST", when: "GST paid on purchases (input tax credit)" },
];

const expenseRows = [
  { code: "5000", name: "Cost of Goods Sold", when: "Automatic on every sale (stock cost)" },
  { code: "6000", name: "General Expenses", when: "Shop expenses (default if category unmapped)" },
  { code: "6100", name: "Salaries & Wages", when: "Employee salary vouchers" },
  { code: "6050", name: "Settlement Discounts Given", when: "Discount on customer receipt" },
  { code: "6900", name: "Round Off", when: "Small balancing differences on invoices" },
];

const autoPostRows = [
  { action: "POS / sales invoice", entry: "Sale", effect: "Revenue + cash/AR; COGS + stock" },
  { action: "Purchase bill", entry: "Purchase", effect: "Stock + input GST; cash/AP" },
  { action: "Shop expense (this tab)", entry: "ExpenseVoucher", effect: "Expense ↑, cash/bank ↓" },
  { action: "Employee salary", entry: "SalaryVoucher", effect: "Salaries expense ↑" },
  { action: "Customer payment", entry: "CustomerReceipt", effect: "Cash/bank ↑, receivable ↓" },
  { action: "Supplier payment", entry: "SupplierPayment", effect: "Payable ↓, cash/bank ↓" },
];

export function AccountingEntriesGuide({ compact = false, className }: AccountingEntriesGuideProps) {
  const { getOrgPath } = useOrgNavigation();
  const reportsHref = getOrgPath("/accounting-reports");
  const journalHref = getOrgPath("/journal-vouchers");
  const chartHref = getOrgPath("/chart-of-accounts");

  const tableClass = "w-full text-xs border-collapse";
  const thClass = "text-left font-semibold text-foreground border-b border-border py-1.5 pr-2";
  const tdClass = "py-1.5 pr-2 align-top text-muted-foreground border-b border-border/60";

  const body = (
    <div className={cn("space-y-4 text-sm text-muted-foreground", compact && "space-y-3")}>
      <p>
        Every transaction can post a <span className="font-medium text-foreground">double-entry journal</span> (debit
        and credit lines) to ledgers in your{" "}
        <Link to={chartHref} className="font-medium text-primary hover:underline">
          Chart of Accounts
        </Link>
        . Asset accounts track what the organisation owns; expense accounts track money spent.
      </p>

      <div className="grid gap-4 md:grid-cols-2">
        <div>
          <h4 className="text-xs font-semibold text-foreground flex items-center gap-1.5 mb-2">
            <Wallet className="h-3.5 w-3.5 text-emerald-600" />
            Asset entries (balance sheet)
          </h4>
          <table className={tableClass}>
            <thead>
              <tr>
                <th className={thClass}>Ledger</th>
                <th className={thClass}>Increases when</th>
              </tr>
            </thead>
            <tbody>
              {assetRows.map((r) => (
                <tr key={r.code}>
                  <td className={tdClass}>
                    <span className="font-mono text-[10px] text-foreground">{r.code}</span> {r.name}
                  </td>
                  <td className={tdClass}>{r.when}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        <div>
          <h4 className="text-xs font-semibold text-foreground flex items-center gap-1.5 mb-2">
            <Receipt className="h-3.5 w-3.5 text-rose-600" />
            Expense entries (P&amp;L)
          </h4>
          <table className={tableClass}>
            <thead>
              <tr>
                <th className={thClass}>Ledger</th>
                <th className={thClass}>Posted when</th>
              </tr>
            </thead>
            <tbody>
              {expenseRows.map((r) => (
                <tr key={r.code}>
                  <td className={tdClass}>
                    <span className="font-mono text-[10px] text-foreground">{r.code}</span> {r.name}
                  </td>
                  <td className={tdClass}>{r.when}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      <div>
        <h4 className="text-xs font-semibold text-foreground flex items-center gap-1.5 mb-2">
          <BookOpen className="h-3.5 w-3.5 text-blue-600" />
          What builds journal entries automatically
        </h4>
        <table className={tableClass}>
          <thead>
            <tr>
              <th className={thClass}>You record</th>
              <th className={thClass}>Journal type</th>
              <th className={thClass}>GL effect</th>
            </tr>
          </thead>
          <tbody>
            {autoPostRows.map((r) => (
              <tr key={r.entry}>
                <td className={tdClass}>{r.action}</td>
                <td className={cn(tdClass, "font-mono text-[10px]")}>{r.entry}</td>
                <td className={tdClass}>{r.effect}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <div className="rounded-lg border border-slate-200 bg-slate-50/80 px-3 py-2.5 space-y-1.5">
        <h4 className="text-xs font-semibold text-foreground flex items-center gap-1.5">
          <Scale className="h-3.5 w-3.5" />
          Where to view balances
        </h4>
        <ul className="text-xs list-disc pl-4 space-y-1">
          <li>
            <Link to={reportsHref} className="font-medium text-primary hover:underline">
              P&amp;L / Balance Sheet
            </Link>{" "}
            → <span className="text-foreground">GL P&amp;L</span> for expense totals,{" "}
            <span className="text-foreground">GL Balance Sheet</span> for asset totals (posted journals only).
          </li>
          <li>
            <Link to={journalHref} className="font-medium text-primary hover:underline">
              Journal vouchers
            </Link>{" "}
            — every debit/credit line; filter by <span className="font-mono">ExpenseVoucher</span>,{" "}
            <span className="font-mono">Sale</span>, etc.
          </li>
          <li>
            Accounts → Expenses: map each category to an expense ledger; unmapped categories post to{" "}
            <span className="font-mono">6000</span> General Expenses.
          </li>
          <li>
            Older data may need a one-time GL backfill from Accounts → Accounting migration (admin).
          </li>
        </ul>
      </div>
    </div>
  );

  if (compact) {
    return (
      <Collapsible className={cn("group/guide", className)}>
        <Card className="border-dashed border-slate-300 bg-slate-50/50">
          <CollapsibleTrigger className="w-full text-left">
            <CardHeader className="py-3 px-4 flex flex-row items-center justify-between gap-2">
              <div className="min-w-0">
                <CardTitle className="text-sm flex items-center gap-2">
                  <Landmark className="h-4 w-4 text-blue-600 shrink-0" />
                  How asset &amp; expense entries are posted
                </CardTitle>
                <CardDescription className="text-xs mt-0.5">
                  Tap to see which ledgers move when you record expenses, sales, and payments
                </CardDescription>
              </div>
              <ChevronDown className="h-4 w-4 shrink-0 text-muted-foreground transition-transform group-data-[state=open]/guide:rotate-180" />
            </CardHeader>
          </CollapsibleTrigger>
          <CollapsibleContent>
            <CardContent className="pt-0 px-4 pb-4">{body}</CardContent>
          </CollapsibleContent>
        </Card>
      </Collapsible>
    );
  }

  return (
    <Collapsible defaultOpen={false} className={cn("group/guide", className)}>
      <Card className="print:hidden shadow-sm rounded-xl border-slate-200">
        <CollapsibleTrigger className="w-full text-left">
          <CardHeader className="pb-2 flex flex-row items-start justify-between gap-3">
            <div>
              <CardTitle className="text-lg flex items-center gap-2 text-blue-700">
                <Landmark className="h-5 w-5" />
                Assets &amp; expenses — how entries are built
              </CardTitle>
              <CardDescription>
                Double-entry journals link daily actions (sales, purchases, expenses, receipts) to chart-of-accounts
                ledgers
              </CardDescription>
            </div>
            <ChevronDown className="h-5 w-5 shrink-0 text-muted-foreground mt-1 transition-transform group-data-[state=open]/guide:rotate-180" />
          </CardHeader>
        </CollapsibleTrigger>
        <CollapsibleContent>
          <CardContent className="pt-0">{body}</CardContent>
        </CollapsibleContent>
      </Card>
    </Collapsible>
  );
}
