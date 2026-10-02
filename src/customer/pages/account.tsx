import { useCallback, useEffect, useState } from "react";
import { Link, NavLink, useNavigate, useParams } from "react-router-dom";
import InvoiceCard from "../components/InvoiceCard";
import LoginCard from "../components/LoginCard";
import {
  AccountError,
  accountErrorMessage,
  fetchBill,
  fetchBills,
  fetchOffers,
  fetchReturns,
  fetchSummary,
  fetchTransactions,
  getSessionToken,
  logout,
  type AccountSummary,
  type BillListRow,
  type BillSale,
  type OfferRow,
  type ReturnRow,
  type TxnRow,
} from "../lib/account";
import { formatDate, formatINR } from "../lib/format";
import {
  enableAccountPush,
  isFirebaseConfigured,
  isIos,
  isIosStandalone,
  isPushSupportedBrowser,
  repairAccountPush,
  wasPushOptedIn,
} from "../lib/notify";
import { pushFailureMessage } from "../lib/pushFailureMessage";

/** Load data for a logged-in page; shows login when there is no (or an expired) session. */
function useAccountData<T>(load: () => Promise<T>, deps: unknown[] = []) {
  const [data, setData] = useState<T | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [needLogin, setNeedLogin] = useState(!getSessionToken());
  const [tick, setTick] = useState(0);

  useEffect(() => {
    if (!getSessionToken()) {
      setNeedLogin(true);
      return;
    }
    let cancelled = false;
    setNeedLogin(false);
    setError(null);
    load()
      .then((d) => !cancelled && setData(d))
      .catch((e: unknown) => {
        if (cancelled) return;
        if (e instanceof AccountError && e.code === "session_expired") setNeedLogin(true);
        else setError(accountErrorMessage(e));
      });
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tick, ...deps]);

  const reload = useCallback(() => setTick((t) => t + 1), []);
  return { data, error, needLogin, reload };
}

function AccountNav() {
  const tabs: Array<[string, string]> = [
    ["/account", "Home"],
    ["/bills", "Bills"],
    ["/returns", "Returns"],
    ["/transactions", "History"],
    ["/offers", "Offers"],
  ];
  return (
    <nav className="c-nav no-print">
      {tabs.map(([to, label]) => (
        <NavLink key={to} to={to} end className={({ isActive }) => (isActive ? "on" : "")}>
          {label}
        </NavLink>
      ))}
    </nav>
  );
}

function Shell({
  state,
  children,
}: {
  state: { error: string | null; needLogin: boolean; reload: () => void; loading: boolean };
  children: React.ReactNode;
}) {
  return (
    <div className="c-wrap">
      <AccountNav />
      {state.needLogin ? (
        <LoginCard onDone={state.reload} />
      ) : state.error ? (
        <div className="c-err">{state.error}</div>
      ) : state.loading ? (
        <div className="c-loading">Loading…</div>
      ) : (
        children
      )}
    </div>
  );
}

function PushCard() {
  const [state, setState] = useState<"idle" | "working" | "done">(wasPushOptedIn() ? "done" : "idle");
  const [msg, setMsg] = useState<string | null>(null);
  useEffect(() => {
    void repairAccountPush();
  }, []);
  if (state === "done" || !isFirebaseConfigured()) return null;
  const iosHint = isIos() && !isIosStandalone();
  if (!iosHint && !isPushSupportedBrowser()) return null;
  return (
    <div className="c-card no-print">
      <b>Get bill & offer notifications</b>
      {iosHint ? (
        <p className="c-hint">
          On iPhone: tap <b>Share → Add to Home Screen</b>, open the app from your home screen, then turn on
          notifications here.
        </p>
      ) : (
        <button
          type="button"
          className="c-btn"
          disabled={state === "working"}
          onClick={() => {
            setState("working");
            setMsg(null);
            void enableAccountPush().then((res) => {
              setState(res.ok ? "done" : "idle");
              if (!res.ok) setMsg(pushFailureMessage(res.reason));
            });
          }}
        >
          {state === "working" ? "Turning on…" : "Turn on notifications"}
        </button>
      )}
      {msg ? <p className="c-hint">{msg}</p> : null}
    </div>
  );
}

export function AccountPage() {
  const navigate = useNavigate();
  const { data, error, needLogin, reload } = useAccountData<AccountSummary>(fetchSummary);
  const due = data ? data.balance.outstanding - data.balance.advance : 0;
  return (
    <Shell state={{ error, needLogin, reload, loading: !data }}>
      {data ? (
        <>
          <div className="c-card">
            <div className="c-muted" style={{ fontSize: 12 }}>
              {data.shop}
            </div>
            <h2 style={{ margin: "4px 0 2px", fontSize: 19 }}>Hello, {data.customer.name || "Customer"}</h2>
            <div className="c-muted">{data.customer.phone}</div>
          </div>
          <div className="c-card">
            <div className="c-stats">
              <div className="c-stat">
                <span>Total shopping</span>
                <b>{formatINR(data.totals.shopping)}</b>
              </div>
              <div className="c-stat">
                <span>Bills</span>
                <b>{data.totals.bills}</b>
              </div>
              <div className="c-stat">
                <span>Items bought</span>
                <b>{data.totals.items}</b>
              </div>
              <div className="c-stat">
                <span>Returns</span>
                <b>
                  {data.totals.returns} · {formatINR(data.totals.returnAmount)}
                </b>
              </div>
            </div>
          </div>
          <div className="c-card">
            <div className="c-totals">
              <div className="row">
                <span>Outstanding</span>
                <span>{formatINR(data.balance.outstanding)}</span>
              </div>
              <div className="row">
                <span>Advance</span>
                <span>{formatINR(data.balance.advance)}</span>
              </div>
              {data.balance.creditNotes > 0 ? (
                <div className="row">
                  <span>Credit note balance</span>
                  <span>{formatINR(data.balance.creditNotes)}</span>
                </div>
              ) : null}
              {data.customer.points > 0 ? (
                <div className="row">
                  <span>Reward points</span>
                  <span>{data.customer.points}</span>
                </div>
              ) : null}
              <div className="row grand">
                <span>{due >= 0 ? "Total due" : "Your advance"}</span>
                <span>{formatINR(Math.abs(due))}</span>
              </div>
            </div>
          </div>
          <PushCard />
          <button
            type="button"
            className="c-btn c-btn-ghost no-print"
            onClick={() => void logout().then(() => navigate("/"))}
          >
            Log out
          </button>
        </>
      ) : null}
    </Shell>
  );
}

export function BillsPage() {
  const [page, setPage] = useState(0);
  const [rows, setRows] = useState<BillListRow[]>([]);
  const { data, error, needLogin, reload } = useAccountData(() => fetchBills(page), [page]);
  useEffect(() => {
    if (data) setRows((prev) => (page === 0 ? data.bills : [...prev, ...data.bills]));
  }, [data, page]);
  return (
    <Shell state={{ error, needLogin, reload, loading: !data && rows.length === 0 }}>
      <div className="c-card c-list">
        {rows.length === 0 ? <p className="c-muted">No bills yet.</p> : null}
        {rows.map((b) => {
          const due = Math.max(0, b.net_amount - b.paid_amount);
          return (
            <Link key={b.id} to={`/bills/${b.id}`}>
              <span>
                <b>{b.sale_number}</b>
                <div className="c-muted">
                  {formatDate(b.sale_date)} · {b.total_qty} item{b.total_qty === 1 ? "" : "s"}
                </div>
              </span>
              <span style={{ textAlign: "right" }}>
                <b>{formatINR(b.net_amount)}</b>
                <div className={due > 0 ? "c-due" : "c-muted"}>{due > 0 ? `${formatINR(due)} due` : "Paid"}</div>
              </span>
            </Link>
          );
        })}
      </div>
      {data?.hasMore ? (
        <button type="button" className="c-btn c-btn-ghost" onClick={() => setPage((p) => p + 1)}>
          Show more
        </button>
      ) : null}
    </Shell>
  );
}

function downloadPdf(): void {
  document.body.classList.add("print-invoice");
  try {
    window.print();
  } finally {
    window.setTimeout(() => document.body.classList.remove("print-invoice"), 500);
  }
}

/** Full bill for a logged-in customer (also used when a notification is tapped). */
export function BillView({ saleId }: { saleId: string }) {
  const { data, error, needLogin, reload } = useAccountData<{ sale: BillSale }>(() => fetchBill(saleId), [saleId]);
  if (needLogin) return <LoginCard title="Log in to see your full bill" onDone={reload} />;
  if (error) return <div className="c-err">{error}</div>;
  if (!data) return <div className="c-loading">Loading your bill…</div>;
  return (
    <>
      <InvoiceCard sale={data.sale} />
      <div className="c-row2 no-print">
        <button type="button" className="c-btn" onClick={downloadPdf}>
          Download PDF
        </button>
        <Link className="c-btn c-btn-ghost" style={{ textDecoration: "none", textAlign: "center" }} to="/bills">
          All bills
        </Link>
      </div>
    </>
  );
}

export function BillPage() {
  const { saleId = "" } = useParams();
  return (
    <div className="c-wrap">
      <AccountNav />
      <BillView saleId={saleId} />
    </div>
  );
}

export function ReturnsPage() {
  const { data, error, needLogin, reload } = useAccountData<{ returns: ReturnRow[] }>(fetchReturns);
  return (
    <Shell state={{ error, needLogin, reload, loading: !data }}>
      <div className="c-card c-list">
        {data && data.returns.length === 0 ? <p className="c-muted">No returns.</p> : null}
        {data?.returns.map((r) => (
          <div className="c-li" key={r.id}>
            <span>
              <b>{r.return_number || "Return"}</b>
              <div className="c-muted">
                {formatDate(r.return_date)}
                {r.original_sale_number ? ` · Bill ${r.original_sale_number}` : ""}
              </div>
            </span>
            <span style={{ textAlign: "right" }}>
              <b>{formatINR(r.net_amount)}</b>
              <div className="c-muted">{r.refund_type === "credit_note" ? "Credit note" : r.refund_type || ""}</div>
            </span>
          </div>
        ))}
      </div>
    </Shell>
  );
}

const TXN_LABEL: Record<TxnRow["kind"], string> = { bill: "Bill", payment: "Payment", return: "Return" };

export function TransactionsPage() {
  const { data, error, needLogin, reload } = useAccountData<{ transactions: TxnRow[] }>(fetchTransactions);
  return (
    <Shell state={{ error, needLogin, reload, loading: !data }}>
      <div className="c-card c-list">
        {data && data.transactions.length === 0 ? <p className="c-muted">No transactions yet.</p> : null}
        {data?.transactions.map((t, i) => {
          const inner = (
            <>
              <span>
                <b>
                  {TXN_LABEL[t.kind]} {t.ref}
                </b>
                <div className="c-muted">
                  {formatDate(t.date)}
                  {t.note ? ` · ${t.note}` : ""}
                </div>
              </span>
              <span style={{ textAlign: "right" }}>
                <b style={{ color: t.kind === "bill" ? "var(--ink)" : "var(--accent)" }}>
                  {t.kind === "bill" ? "" : "− "}
                  {formatINR(t.amount)}
                </b>
                {t.kind === "bill" ? (
                  <div className={t.due ? "c-due" : "c-muted"}>{t.due ? `${formatINR(t.due)} due` : "Paid"}</div>
                ) : null}
              </span>
            </>
          );
          return t.saleId ? (
            <Link key={i} to={`/bills/${t.saleId}`}>
              {inner}
            </Link>
          ) : (
            <div className="c-li" key={i}>
              {inner}
            </div>
          );
        })}
      </div>
    </Shell>
  );
}

export function OffersPage() {
  const { data, error, needLogin, reload } = useAccountData<{ offers: OfferRow[] }>(fetchOffers);
  return (
    <Shell state={{ error, needLogin, reload, loading: !data }}>
      {data && data.offers.length === 0 ? (
        <div className="c-card c-center c-muted">No offers right now. We'll notify you about new ones.</div>
      ) : null}
      {data?.offers.map((o) => (
        <div className="c-card c-offer" key={o.id}>
          {o.image_url ? <img src={o.image_url} alt="" loading="lazy" /> : null}
          <b style={{ fontSize: 16 }}>{o.title}</b>
          <p style={{ margin: "6px 0 0", lineHeight: 1.5, whiteSpace: "pre-line" }}>{o.body}</p>
          {o.offer_code ? <span className="c-code">{o.offer_code}</span> : null}
          <div className="c-muted" style={{ marginTop: 8, fontSize: 12 }}>
            {o.valid_till ? `Valid till ${formatDate(o.valid_till)}` : formatDate(o.created_at)}
          </div>
        </div>
      ))}
    </Shell>
  );
}
