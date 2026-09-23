import { useParams, useSearchParams, Link } from "react-router-dom";

// /m/:id — opened from a notification tap. The FCM data payload carries only
// the message id (push_messages.id); the raw customer token is never stored
// anywhere recoverable, so this page cannot re-fetch the bill. The service
// worker passes the notification title/body through the URL query instead.
export default function MessagePage() {
  const { id = "" } = useParams();
  const [params] = useSearchParams();
  const title = params.get("title") || "New update from your shop";
  const body = params.get("body") || "Tap your invoice link from WhatsApp to view your bill.";

  return (
    <div className="c-wrap">
      <div className="c-card">
        <div className="c-muted" style={{ fontSize: 11 }}>
          Message {id.slice(0, 8)}
        </div>
        <h2 style={{ margin: "6px 0 8px", fontSize: 18 }}>{title}</h2>
        <p style={{ margin: 0, lineHeight: 1.55 }}>{body}</p>
      </div>
      <div className="c-card">
        <p className="c-muted" style={{ marginTop: 0 }}>
          To see your full bill, open the invoice link sent to you on WhatsApp or SMS.
        </p>
        <Link className="c-btn c-btn-ghost" style={{ textDecoration: "none", textAlign: "center" }} to="/">
          Home
        </Link>
      </div>
    </div>
  );
}
