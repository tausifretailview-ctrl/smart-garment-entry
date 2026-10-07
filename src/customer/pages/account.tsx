import { useCallback, useEffect, useState } from "react";
import { Link, useNavigate, useParams } from "react-router-dom";
import { BottomNav, PoweredBy, ShopHeader, Skeleton, SuccessTick } from "../components/AppChrome";
import { useCountUp } from "../lib/useCountUp";
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
  readCache,
  writeCache,
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

/**
 * Load data for a logged-in page; shows login when there is no (or an expired) session.
 * With a cacheKey the last answer shows at once and is refreshed in the background.
 */
function useAccountData<T>(load: () => Promise<T>, deps: unknown[] = [], cacheKey?: string) {
  const [data, setData] = useState<T | null>(() =>
    cacheKey && getSessionToken() ? readCache<T>(cacheKey) : null,
  );
  const [error, setError] = useState<string | null>(null);
  const [needLogin, setNeedLogin] = useState(!getSessionToken());
  const [tick, setTick] = useState(0);

  useEffect(() => {
    if (!getSessionToken()) {
      setNeedLogin(true);
      return;
    }
    let cancelled = false;
    const fetchedWith = getSessionToken();
    setNeedLogin(false);
    setError(null);
    load()
      .then((d) => {
        if (cancelled) return;
        if (cacheKey) writeCache(cacheKey, d, fetchedWith);
        setData(d);
      })
      .catch((e: unknown) => {
        if (cancelled) return;
        if (e instanceof AccountError && e.code === "session_expired") setNeedLogin(true);
        // Keep showing cached data on a network blip; only show the error with nothing to show.
        else if (!(cacheKey && readCache(cacheKey))) setError(accountErrorMessage(e));
      });
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tick, ...deps]);

  const reload = useCallback(() => setTick((t) => t + 1), []);
  return { data, error, needLogin, reload };
}

/** Warm the other tabs in the background so they open instantly. */
function prefetchTabs() {
  const fetchedWith = getSessionToken();
  if (!fetchedWith) return;
  // writeCache drops the answer if this customer logged out / someone else logged in meanwhile.
  const warm = <T,>(key: string, load: () => Promise<T>) =>
    load()
      .then((d) => writeCache(key, d, fetchedWith))
      .catch(() => undefined);
  void warm("bills:0", () => fetchBills(0));
  void warm("offers", fetchOffers);
  void warm("transactions", fetchTransactions);
  void warm("returns", fetchReturns);
}

function Shell({
  state,
  title,
  skeleton,
  children,
}: {
  state: { error: string | null; needLogin: boolean; reload: () => void; loading: boolean };
  title?: string;
  skeleton?: React.ReactNode;
  children: React.ReactNode;
}) {
  return (
    <>
      <ShopHeader />
      <div className={state.needLogin ? "c-wrap" : "c-wrap c-wrap-tabs"}>
        {title && !state.needLogin ? <h1 className="c-page-title">{title}</h1> : null}
        {state.needLogin ? (
          <LoginCard onDone={state.reload} />
        ) : state.error ? (
          <div className="c-err">
            {state.error}
            <button type="button" className="c-btn c-btn-ghost" onClick={state.reload}>
              Try again
            </button>
          </div>
        ) : state.loading ? (
          (skeleton ?? <Skeleton />)
        ) : (
          <div className="c-enter">{children}</div>
        )}
      </div>
      {state.needLogin ? null : <BottomNav />}
    </>
  );
}

function PushCard() {
  const [state, setState] = useState<"idle" | "working" | "done" | "just-done">(wasPushOptedIn() ? "done" : "idle");
  const [msg, setMsg] = useState<string | null>(null);
  useEffect(() => {
    void repairAccountPush();
  }, []);
  if (state === "just-done") {
    return (
      <div className="c-card c-success no-print">
        <SuccessTick />
        <div>
          <b>Notifications are on</b>
          <p className="c-hint" style={{ marginTop: 2 }}>You'll get your bills and offers on this phone.</p>
        </div>
      </div>
    );
  }
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
              setState(res.ok ? "just-done" : "idle");
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
  const { data, error, needLogin, reload } = useAccountData<AccountSummary>(fetchSummary, [], "summary");
  const due = data ? data.balance.outstanding - data.balance.advance : 0;
  useEffect(() => {
    if (getSessionToken()) prefetchTabs();
  }, [needLogin]);
  const firstName = (data?.customer.name || "").trim().split(/\s+/)[0] || "Customer";
  const shownDue = useCountUp(Math.abs(due));
  return (
    <Shell state={{ error, needLogin, reload, loading: !data }} skeleton={<Skeleton hero rows={3} />}>
      {data ? (
        <>
          <div className="c-hero">
            <div className="c-hero-hi">Hello, {firstName}</div>
            <div className="c-hero-phone">{data.customer.phone}</div>
            <div className="c-hero-amt">
              <span>{due > 0 ? "Amount due" : due < 0 ? "Your advance" : "All paid up"}</span>
              <b>{formatINR(shownDue)}</b>
            </div>
            {data.customer.points > 0 ? <div className="c-hero-pts">★ {data.customer.points} reward points</div> : null}
          </div>

          <div className="c-stats c-stagger">
            <Link to="/bills" className="c-stat">
              <span>Total shopping</span>
              <b>{formatINR(data.totals.shopping)}</b>
            </Link>
            <Link to="/bills" className="c-stat">
              <span>Bills</span>
              <b>{data.totals.bills}</b>
            </Link>
            <div className="c-stat">
              <span>Items bought</span>
              <b>{data.totals.items}</b>
            </div>
            <Link to="/returns" className="c-stat">
              <span>Returns</span>
              <b>
                {data.totals.returns}
                {data.totals.returnAmount ? <small> · {formatINR(data.totals.returnAmount)}</small> : null}
              </b>
            </Link>
          </div>

          <div className="c-card">
            <div className="c-section">Balance</div>
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
            </div>
          </div>
          <PushCard />
          <button
            type="button"
            className="c-btn c-btn-ghost no-print"
            onClick={() => {
              logout();
              navigate("/");
            }}
          >
            Log out
          </button>
          <PoweredBy />
        </>
      ) : null}
    </Shell>
  );
}

export function BillsPage() {
  const [page, setPage] = useState(0);
  const [rows, setRows] = useState<BillListRow[]>([]);
  const { data, error, needLogin, reload } = useAccountData(
    () => fetchBills(page),
    [page],
    page === 0 ? "bills:0" : undefined,
  );
  useEffect(() => {
    if (data) setRows((prev) => (page === 0 ? data.bills : [...prev, ...data.bills]));
  }, [data, page]);
  return (
    <Shell title="Your bills" state={{ error, needLogin, reload, loading: !data && rows.length === 0 }}>
      <div className="c-card c-list c-stagger">
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
                <div className={due > 0 ? "c-due" : "c-paid"}>{due > 0 ? `${formatINR(due)} due` : "Paid"}</div>
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
  if (!data) return <Skeleton rows={5} />;
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
    <>
      <ShopHeader />
      <div className="c-wrap c-wrap-tabs">
        <BillView saleId={saleId} />
      </div>
      <BottomNav />
    </>
  );
}

export function ReturnsPage() {
  const { data, error, needLogin, reload } = useAccountData<{ returns: ReturnRow[] }>(fetchReturns, [], "returns");
  return (
    <Shell title="Returns" state={{ error, needLogin, reload, loading: !data }}>
      <div className="c-card c-list c-stagger">
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
  const { data, error, needLogin, reload } = useAccountData<{ transactions: TxnRow[] }>(fetchTransactions, [], "transactions");
  return (
    <Shell title="History" state={{ error, needLogin, reload, loading: !data }}>
      <div className="c-card c-list c-stagger">
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
                  <div className={t.due ? "c-due" : "c-paid"}>{t.due ? `${formatINR(t.due)} due` : "Paid"}</div>
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
  const { data, error, needLogin, reload } = useAccountData<{ offers: OfferRow[] }>(fetchOffers, [], "offers");
  return (
    <Shell title="Offers" state={{ error, needLogin, reload, loading: !data }} skeleton={<Skeleton rows={2} />}>
      {data && data.offers.length === 0 ? (
        <div className="c-card c-center c-muted">No offers right now. We'll notify you about new ones.</div>
      ) : null}
      {data?.offers.map((o) => (
        <div className="c-card c-offer" key={o.id}>
          {o.image_url ? <img src={o.image_url} alt="" loading="lazy" /> : null}
          <b style={{ fontSize: 16 }}>
            {o.title}
            {Date.now() - new Date(o.created_at).getTime() < 86_400_000 ? <span className="c-new">NEW</span> : null}
          </b>
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
