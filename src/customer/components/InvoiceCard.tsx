import type { CustomerPageGet } from "../lib/client";
import { formatDate, formatINR } from "../lib/format";

type Sale = NonNullable<NonNullable<CustomerPageGet["sale"]>>;

export default function InvoiceCard({
  sale,
  id,
}: {
  sale: Sale;
  id?: string;
}) {
  const paid = Number(sale.paid_amount ?? 0);
  const due = Math.max(0, Number(sale.net_amount ?? 0) - paid);
  return (
    <div className="c-card print-area" id={id}>
      <div className="c-billhead">
        <div>
          <span className="c-muted">Invoice</span>
          <b>{sale.sale_number}</b>
        </div>
        <div style={{ textAlign: "right" }}>
          <span className="c-muted">{formatDate(sale.sale_date)}</span>
          <b>{formatINR(sale.net_amount)}</b>
        </div>
      </div>
      <div className="c-muted" style={{ marginBottom: 8 }}>
        Billed to <b style={{ color: "var(--ink)" }}>{sale.customer_name}</b>
        {sale.salesman ? ` · Assisted by ${sale.salesman}` : ""}
      </div>
      <table className="c-items">
        <thead>
          <tr>
            <th>Item</th>
            <th className="c-num">Qty</th>
            <th className="c-num">Amount</th>
          </tr>
        </thead>
        <tbody>
          {sale.items.map((it, i) => (
            <tr key={i}>
              <td>
                <div>{it.name}</div>
                <div className="c-muted">
                  {it.size}
                  {it.colour ? ` · ${it.colour}` : ""} · {formatINR(it.rate)}
                  {it.gst_percent ? ` · GST ${it.gst_percent}%` : ""}
                </div>
              </td>
              <td className="c-num">{it.qty}</td>
              <td className="c-num">{formatINR(it.amount)}</td>
            </tr>
          ))}
        </tbody>
      </table>
      <div className="c-totals">
        <div className="row">
          <span>Taxable value</span>
          <span>{formatINR(sale.taxable_value)}</span>
        </div>
        <div className="row">
          <span>Tax (GST)</span>
          <span>{formatINR(sale.tax_total)}</span>
        </div>
        {Number(sale.discount_amount) > 0 ? (
          <div className="row">
            <span>Bill discount</span>
            <span>− {formatINR(sale.discount_amount)}</span>
          </div>
        ) : null}
        {Number(sale.round_off) !== 0 ? (
          <div className="row">
            <span>Round off</span>
            <span>{formatINR(sale.round_off)}</span>
          </div>
        ) : null}
        <div className="row grand">
          <span>Total</span>
          <span>{formatINR(sale.net_amount)}</span>
        </div>
        <div className="row" style={{ marginTop: 6 }}>
          <span>
            {sale.payment_status === "completed" ? (
              <span className="c-paid">Paid</span>
            ) : sale.payment_status === "partial" ? (
              <span className="c-due">Partly paid</span>
            ) : (
              <span className="c-due">Pay later</span>
            )}
          </span>
          <span className="c-muted">
            {sale.payment_method} · {due > 0 ? `${formatINR(due)} due` : "settled"}
          </span>
        </div>
      </div>
    </div>
  );
}
