import { BrowserRouter, Navigate, Route, Routes, useNavigate } from "react-router-dom";
import TokenPage from "./pages/TokenPage";
import MessagePage from "./pages/MessagePage";
import { AccountPage, BillPage, BillsPage, OffersPage, ReturnsPage, TransactionsPage } from "./pages/account";
import LoginCard from "./components/LoginCard";
import { getSessionToken } from "./lib/account";

function HomePage() {
  const navigate = useNavigate();
  if (getSessionToken()) return <Navigate to="/account" replace />;
  return (
    <div className="c-wrap">
      <div className="c-card c-center">
        <h2 style={{ margin: "0 0 8px" }}>Your Bill & Offers</h2>
        <p className="c-muted" style={{ lineHeight: 1.55, margin: 0 }}>
          See all your bills, returns, balance and the latest offers from the shop.
        </p>
      </div>
      <LoginCard title="Log in with your mobile number" onDone={() => navigate("/account", { replace: true })} />
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
        <Route path="/account" element={<AccountPage />} />
        <Route path="/bills" element={<BillsPage />} />
        <Route path="/bills/:saleId" element={<BillPage />} />
        <Route path="/returns" element={<ReturnsPage />} />
        <Route path="/transactions" element={<TransactionsPage />} />
        <Route path="/offers" element={<OffersPage />} />
        <Route path="*" element={<HomePage />} />
      </Routes>
    </BrowserRouter>
  );
}
