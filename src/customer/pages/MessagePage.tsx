import { useParams, useSearchParams, Link } from "react-router-dom";
import { BillView } from "./account";

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

// /m/:id — opened from a notification tap when the push has no bill link
// (/t/<token>). The raw bill token is never stored, but invoice pushes carry
// sale_id: a logged-in customer sees the full bill straight away, otherwise
// they log in with their mobile number first. Offer pushes link to /offers.
export default function MessagePage() {
  const { id = "" } = useParams();
  const [params] = useSearchParams();
  const title = params.get("title") || "New update from your shop";
  const body = params.get("body") || "";
  const saleId = params.get("sale") ?? "";
  const campaignId = params.get("campaign") ?? "";

  if (UUID.test(saleId)) {
    return (
      <div className="c-wrap">
        <BillView saleId={saleId} />
        <Link className="c-btn c-btn-ghost no-print" style={{ textDecoration: "none", textAlign: "center" }} to="/account">
          My account
        </Link>
      </div>
    );
  }

  return (
    <div className="c-wrap">
      <div className="c-card">
        <div className="c-muted" style={{ fontSize: 11 }}>
          Message {id.slice(0, 8)}
        </div>
        <h2 style={{ margin: "6px 0 8px", fontSize: 18 }}>{title}</h2>
        {body ? <p style={{ margin: 0, lineHeight: 1.55 }}>{body}</p> : null}
      </div>
      <div className="c-card">
        <Link className="c-btn" style={{ textDecoration: "none", textAlign: "center" }} to={UUID.test(campaignId) ? "/offers" : "/account"}>
          {UUID.test(campaignId) ? "See all offers" : "My bills & offers"}
        </Link>
      </div>
    </div>
  );
}
