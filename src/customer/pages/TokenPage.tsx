import { useCallback, useEffect, useRef, useState } from "react";
import { useParams } from "react-router-dom";
import {
  logEvent,
  pageGet,
  registerPush,
  resolveSubdomain,
  submitFeedback,
  type CustomerPageGet,
} from "../lib/client";
import {
  enablePush,
  isIos,
  isIosStandalone,
  isPushSupportedBrowser,
  markPushOptOut,
  repairPushRegistration,
  wasPushOptedIn,
} from "../lib/notify";
import InvoiceCard from "../components/InvoiceCard";
import { formatINR } from "../lib/format";

const RATING_TAGS = ["Quality", "Prices", "Staff", "Variety", "Billing speed"];

async function shareInvoice(saleNumber: string): Promise<void> {
  const url = window.location.href;
  const text = `Invoice ${saleNumber} — ${url}`;
  try {
    if (navigator.share) {
      await navigator.share({ title: `Invoice ${saleNumber}`, text, url });
      return;
    }
    throw new Error("no-share");
  } catch {
    try {
      await navigator.clipboard.writeText(text);
      alert("Invoice link copied.");
    } catch {
      alert(url);
    }
  }
}

function downloadPdf(): void {
  document.body.classList.add("print-invoice");
  try {
    window.print();
  } finally {
    window.setTimeout(() => document.body.classList.remove("print-invoice"), 500);
  }
}

export default function TokenPage() {
  const { token = "" } = useParams();
  const subdomain = resolveSubdomain();
  const [data, setData] = useState<CustomerPageGet | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [pushState, setPushState] = useState<"idle" | "working" | "done" | "off">(
    wasPushOptedIn() ? "done" : "idle",
  );
  const [pushMsg, setPushMsg] = useState<string | null>(null);
  const [rating, setRating] = useState(0);
  const [tags, setTags] = useState<string[]>([]);
  const [comment, setComment] = useState("");
  const [ratingDone, setRatingDone] = useState(false);
  const [ratingMsg, setRatingMsg] = useState<string | null>(null);
  const loggedOpen = useRef(false);

  useEffect(() => {
    if (!subdomain) {
      setError("This shop link needs a shop address. Please use the full link you received.");
      return;
    }
    if (!token) {
      setError("This link is incomplete.");
      return;
    }
    let cancelled = false;
    pageGet(subdomain, token)
      .then((res) => {
        if (cancelled) return;
        setData(res);
        if (res.feedback) setRatingDone(true);
        // Quietly repair rotated FCM tokens on visits with granted permission.
        void repairPushRegistration(subdomain, token);
        if (!loggedOpen.current) {
          loggedOpen.current = true;
          void logEvent(token, "page_open");
          if (res.sale) void logEvent(token, "invoice_view");
        }
      })
      .catch((e: unknown) => {
        if (!cancelled) setError(e instanceof Error ? e.message : "Could not open this link.");
      });
    return () => {
      cancelled = true;
    };
  }, [subdomain, token]);

  const onEnablePush = useCallback(async () => {
    setPushState("working");
    setPushMsg(null);
    const res = await enablePush(subdomain, token);
    if (res.ok) {
      setPushState("done");
      void logEvent(token, "push_opt_in");
    } else {
      setPushState("idle");
      setPushMsg(
        res.reason === "denied"
          ? "Notifications are blocked for this site. Allow them in your browser settings, then try again."
          : res.reason === "unsupported"
            ? "This browser cannot receive notifications. Try Chrome on Android."
            : "Could not turn on notifications. Please try again.",
      );
    }
  }, [subdomain, token]);

  const onNotNow = useCallback(() => {
    markPushOptOut();
    setPushState("off");
    void logEvent(token, "push_opt_out");
  }, [token]);

  const onSubmitRating = useCallback(async () => {
    if (!rating) {
      setRatingMsg("Please tap a star first.");
      return;
    }
    setRatingMsg(null);
    try {
      const res = await submitFeedback(token, rating, tags, comment.trim());
      if (!res.ok) {
        setRatingMsg(
          res.error === "whatsapp_rating_locked"
            ? "You already rated this bill on WhatsApp — thank you!"
            : res.error === "rating_window_expired"
              ? "This rating can no longer be changed."
              : (res.error ?? "Could not save your rating."),
        );
        return;
      }
      setRatingDone(true);
      void logEvent(token, "rating_submit");
    } catch {
      setRatingMsg("Could not save your rating. Please try again.");
    }
  }, [token, rating, tags, comment]);

  if (error) {
    return (
      <div className="c-wrap">
        <div className="c-err">{error}</div>
      </div>
    );
  }
  if (!data) {
    return (
      <div className="c-wrap">
        <div className="c-loading">Loading your bill…</div>
      </div>
    );
  }

  const org = data.org;
  const social = data.social;
  const sale = data.sale ?? null;
  const engage = data.engage_allowed !== false;

  // Sale absent (past the invoice window): clear expired state, never blank.
  if (!sale) {
    return (
      <div className="c-wrap">
        <div className="c-card c-center">
          <h2 style={{ margin: "0 0 8px" }}>{org?.business_name || org?.name || "Shop"}</h2>
          <p>This bill link has expired (bills stay viewable for 90 days).</p>
          <p className="c-muted">Your offers and ratings linked to this bill are no longer available.</p>
        </div>
      </div>
    );
  }

  const showIosHint = isIos() && !isIosStandalone();
  const showPushCard =
    engage &&
    pushState !== "done" &&
    pushState !== "off" &&
    (isPushSupportedBrowser() || showIosHint);

  return (
    <div className="c-wrap">
      <div className="c-card">
        <div className="c-shop">
          {org?.logo_url ? <img src={org.logo_url} alt="" /> : null}
          <div>
            <h1>{org?.business_name || org?.name}</h1>
            {org?.address ? <p>{org.address}</p> : null}
            <p>
              {[org?.mobile_number ? `📞 ${org.mobile_number}` : "", org?.gst_number ? `GSTIN ${org.gst_number}` : ""]
                .filter(Boolean)
                .join(" · ")}
            </p>
          </div>
        </div>
      </div>

      <InvoiceCard sale={sale} />
      <div className="c-row2 no-print">
        <button type="button" className="c-btn" onClick={downloadPdf}>
          Download PDF
        </button>
        <button type="button" className="c-btn c-btn-ghost" onClick={() => void shareInvoice(sale.sale_number)}>
          Share
        </button>
      </div>

      {showPushCard ? (
        <div className="c-card no-print" style={{ marginTop: 12 }}>
          <b>Get new arrival alerts</b>
          <p className="c-muted" style={{ margin: "6px 0 0" }}>
            Be the first to know about new stock and offers from {org?.business_name || org?.name}.
          </p>
          {showIosHint ? (
            <p className="c-hint">
              On iPhone: tap <b>Share → Add to Home Screen</b>, open the app from your home screen, then turn on
              notifications here.
            </p>
          ) : (
            <>
              <button type="button" className="c-btn" disabled={pushState === "working"} onClick={() => void onEnablePush()}>
                {pushState === "working" ? "Turning on…" : "Turn on notifications"}
              </button>
              <button type="button" className="c-btn c-btn-ghost" onClick={onNotNow}>
                Not now
              </button>
            </>
          )}
          {pushMsg ? <p className="c-hint">{pushMsg}</p> : null}
        </div>
      ) : null}

      {engage ? (
        <div className="c-card no-print" style={{ marginTop: 12 }}>
          {ratingDone || data.feedback ? (
            <div className="c-center">
              <b>Thanks for rating us{data.feedback ? ` ${"★".repeat(data.feedback.rating)}` : ""}!</b>
              <p className="c-muted">We appreciate your feedback.</p>
            </div>
          ) : (
            <>
              <b>How was your shopping?</b>
              <div className="c-stars" onClick={() => void logEvent(token, "rating_open")}>
                {[1, 2, 3, 4, 5].map((s) => (
                  <button
                    key={s}
                    type="button"
                    aria-label={`${s} star`}
                    className={s <= rating ? "on" : ""}
                    onClick={() => setRating(s)}
                  >
                    ★
                  </button>
                ))}
              </div>
              <div className="c-tags">
                {RATING_TAGS.map((t) => (
                  <button
                    key={t}
                    type="button"
                    className={tags.includes(t) ? "on" : ""}
                    onClick={() =>
                      setTags((prev) => (prev.includes(t) ? prev.filter((x) => x !== t) : [...prev, t]))
                    }
                  >
                    {t}
                  </button>
                ))}
              </div>
              <textarea
                className="c-input"
                rows={2}
                placeholder="Anything we should know? (optional)"
                value={comment}
                onChange={(e) => setComment(e.target.value)}
              />
              <button type="button" className="c-btn" onClick={() => void onSubmitRating()}>
                Submit rating
              </button>
              {ratingMsg ? <p className="c-hint">{ratingMsg}</p> : null}
            </>
          )}
          {social?.google_review ? (
            <a className="c-btn c-btn-ghost" style={{ textDecoration: "none", textAlign: "center" }} href={social.google_review} target="_blank" rel="noreferrer">
              ⭐ Review us on Google
            </a>
          ) : null}
        </div>
      ) : null}

      <div className="c-card no-print">
        <div className="c-social">
          {social?.instagram_url ? (
            <a href={social.instagram_url} target="_blank" rel="noreferrer">
              📸 Instagram
            </a>
          ) : null}
          {social?.facebook_url ? (
            <a href={social.facebook_url} target="_blank" rel="noreferrer">
              👍 Facebook
            </a>
          ) : null}
          {social?.whatsapp_number ? (
            <a href={`https://wa.me/${social.whatsapp_number.replace(/\D/g, "")}`} target="_blank" rel="noreferrer">
              💬 WhatsApp
            </a>
          ) : null}
          {!social?.instagram_url && !social?.facebook_url && !social?.whatsapp_number ? (
            <span className="c-muted">Bill total {formatINR(sale.net_amount)} · Thank you for shopping with us!</span>
          ) : null}
        </div>
      </div>
    </div>
  );
}
