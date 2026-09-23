import { BrowserRouter, Route, Routes } from "react-router-dom";
import TokenPage from "./pages/TokenPage";
import MessagePage from "./pages/MessagePage";

function HomePage() {
  return (
    <div className="c-wrap">
      <div className="c-card c-center">
        <h2 style={{ margin: "0 0 8px" }}>Your Bill & Offers</h2>
        <p className="c-muted" style={{ lineHeight: 1.55 }}>
          Open the invoice link sent to you on WhatsApp or SMS to view your bill, get new-arrival alerts, and rate
          your shopping.
        </p>
      </div>
    </div>
  );
}

export default function CustomerApp() {
  return (
    <BrowserRouter>
      <Routes>
        <Route path="/" element={<HomePage />} />
        <Route path="/t/:token" element={<TokenPage />} />
        <Route path="/join/:token" element={<TokenPage />} />
        <Route path="/m/:id" element={<MessagePage />} />
        <Route path="*" element={<HomePage />} />
      </Routes>
    </BrowserRouter>
  );
}
