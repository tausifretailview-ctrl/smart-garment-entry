import { useCallback, useEffect, useState } from "react";
import { Link, useNavigate, useParams } from "react-router-dom";
import { BottomNav, PoweredBy, ShopHeader, ShopNowCard, Skeleton, SuccessTick, useShop } from "../components/AppChrome";
import { useCountUp } from "../lib/useCountUp";
import InvoiceCard from "../components/InvoiceCard";
import LoginCard from "../components/LoginCard";
import InstallAppCard from "../components/InstallApp";
import {
  AccountError,
  accountErrorMessage,
  fetchBill,
  fetchBills,
  fetchOffers,
  fetchPoints,
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
  type PointsData,
  type ReturnRow,
  type TxnRow,
} from "../lib/account";
import { formatDate, formatINR } from "../lib/format";
import {
  enableAccountPush,
  isFirebaseConfigured,
  isIos,
  isIosStandalone,
  isPushOn,
  isPushSupportedBrowser,
  pushPermission,
  repairAccountPush,
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

/** Shown when the browser has blocked notifications for this shop's site. */
export function PushBlockedHelp() {
  return (
    <ol className="c-steps">
      <li>
        Tap the <b>🔒 lock</b> (or <b>ⓘ</b>) next to the address bar.
      </li>
      <li>
        Open <b>Permissions → Notifications</b> and choose <b>Allow</b>.
      </li>
      <li>Come back here and tap the button again.</li>
      <li className="c-muted">
        Using the installed app? Long-press its icon → <b>App info → Notifications</b> → turn on.
      </li>
    </ol>
  );
}

function PushCard({ shopName }: { shopName?: string }) {
  const [state, setState] = useState<"idle" | "working" | "done" | "just-done">(isPushOn() ? "done" : "idle");
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
  const blocked = !iosHint && pushPermission() === "denied";
  return (
    <div className="c-card c-push no-print">
      <div className="c-push-row">
        <span className="c-push-bell" aria-hidden="true">
          🔔
        </span>
        <div>
          <b>{blocked ? "Notifications are blocked" : "Don't miss offers & new arrivals"}</b>
          <span>
            {blocked
              ? "Allow notifications to get your bills and offers instantly."
              : `Get your bill on this phone after every visit, plus sale alerts${shopName ? ` from ${shopName}` : ""}.`}
          </span>
        </div>
      </div>
      {iosHint ? (
        <p className="c-hint">
          On iPhone: tap <b>Share → Add to Home Screen</b>, open the app from your home screen, then turn on
          notifications here.
        </p>
      ) : (
        <>
          {blocked ? <PushBlockedHelp /> : null}
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
            {state === "working" ? "Turning on…" : "🔔 Turn on notifications"}
          </button>
        </>
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
  const shop = useShop();
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
            {data.customer.points > 0 || data.rewards?.enabled ? (
              <Link to="/rewards" className="c-hero-pts">
                ★ {data.customer.points} reward points
                {data.rewards?.pointValue && data.customer.points > 0
                  ? ` · worth ${formatINR(data.customer.points * data.rewards.pointValue)}`
                  : ""}{" "}
                ›
              </Link>
            ) : null}
          </div>

          <PushCard shopName={data.shop} />
          <ShopNowCard shop={shop} />
          <InstallAppCard shopName={data.shop} compact />

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
  const shop = useShop();
  const { data, error, needLogin, reload } = useAccountData<{ offers: OfferRow[] }>(fetchOffers, [], "offers");
  return (
    <Shell title="Offers" state={{ error, needLogin, reload, loading: !data }} skeleton={<Skeleton rows={2} />}>
      <ShopNowCard shop={shop} compact />
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

const POINTS_LABEL: Record<string, string> = {
  earned: "Earned",
  redeemed: "Used at billing",
  adjusted: "Adjusted by shop",
  expired: "Expired",
  gift_redeemed: "Gift",
};

/** Reward points: balance and its ₹ value, how to earn and use them, gifts, and history. */
export function RewardsPage() {
  const { data, error, needLogin, reload } = useAccountData<PointsData>(fetchPoints, [], "points");
  const shownPoints = useCountUp(data?.balance ?? 0);
  const rules = data?.rules;
  const worth = rules?.redemptionEnabled ? (data?.balance ?? 0) * rules.pointValue : 0;
  return (
    <Shell title="Reward points" state={{ error, needLogin, reload, loading: !data }} skeleton={<Skeleton hero rows={3} />}>
      {data && rules ? (
        <>
          <div className="c-hero c-hero-gold">
            <div className="c-hero-hi">Your reward points</div>
            <div className="c-hero-amt">
              <span>{worth > 0 ? `Worth ${formatINR(worth)} on your next bill` : "Points balance"}</span>
              <b>★ {Math.round(shownPoints)}</b>
            </div>
            <div className="c-hero-phone">
              Earned {data.earned} · Used {data.redeemed}
            </div>
          </div>

          {rules.enabled ? (
            <div className="c-card">
              <div className="c-section">How it works</div>
              <ul className="c-rules">
                <li>
                  🛍️ Every {formatINR(rules.earnPerAmount)} you spend earns <b>{rules.earnPoints} point{rules.earnPoints === 1 ? "" : "s"}</b>
                  {rules.minPurchaseForPoints > 0 ? ` (on bills over ${formatINR(rules.minPurchaseForPoints)})` : ""}.
                </li>
                {rules.redemptionEnabled ? (
                  <li>
                    💰 1 point = <b>{formatINR(rules.pointValue)}</b> off at billing
                    {rules.minPointsToRedeem > 1 ? ` once you have ${rules.minPointsToRedeem} points` : ""}, up to{" "}
                    {rules.maxRedeemPercent}% of a bill. Just tell the cashier.
                  </li>
                ) : null}
                {rules.expiryDays > 0 ? <li>⏳ Points expire {rules.expiryDays} days after you earn them.</li> : null}
              </ul>
            </div>
          ) : (
            <div className="c-card c-muted">The shop is not giving new points right now. Your balance is safe.</div>
          )}

          {data.gifts.length > 0 ? (
            <div className="c-card">
              <div className="c-section">Gifts you can get</div>
              <div className="c-gifts">
                {data.gifts.map((g) => {
                  const pct = Math.min(100, Math.round((data.balance / Math.max(1, g.points_required)) * 100));
                  const ready = data.balance >= g.points_required;
                  return (
                    <div className="c-gift" key={g.id}>
                      <div className="c-gift-row">
                        <b>🎁 {g.gift_name}</b>
                        <span className={ready ? "c-chip" : "c-chip c-chip-soft"}>
                          {ready ? "You can claim it!" : `${g.points_required - data.balance} more`}
                        </span>
                      </div>
                      {g.description ? <div className="c-muted">{g.description}</div> : null}
                      <div className="c-progress" aria-label={`${pct}%`}>
                        <span style={{ width: `${pct}%` }} />
                      </div>
                      <div className="c-muted">
                        {g.points_required} points{g.valid_until ? ` · till ${formatDate(g.valid_until)}` : ""}
                      </div>
                    </div>
                  );
                })}
              </div>
              <p className="c-hint">Ask at the counter to claim a gift with your points.</p>
            </div>
          ) : null}

          <div className="c-card c-list c-stagger">
            <div className="c-section">History</div>
            {data.history.length === 0 ? <p className="c-muted">No points yet. Shop to start earning.</p> : null}
            {data.history.map((h) => (
              <div className="c-li" key={h.id}>
                <span>
                  <b>{POINTS_LABEL[h.transaction_type] ?? h.transaction_type}</b>
                  <div className="c-muted">
                    {formatDate(h.created_at)}
                    {h.description ? ` · ${h.description}` : ""}
                  </div>
                </span>
                <b style={{ color: h.points > 0 ? "var(--accent)" : "var(--ink)", whiteSpace: "nowrap" }}>
                  {h.points > 0 ? "+" : h.points < 0 ? "−" : ""}
                  {Math.abs(h.points)}
                </b>
              </div>
            ))}
          </div>
        </>
      ) : null}
    </Shell>
  );
}
