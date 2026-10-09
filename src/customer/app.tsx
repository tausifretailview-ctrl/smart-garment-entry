import { BrowserRouter, Navigate, Route, Routes, useNavigate } from "react-router-dom";
import TokenPage from "./pages/TokenPage";
import MessagePage from "./pages/MessagePage";
import { AccountPage, BillPage, BillsPage, OffersPage, ReturnsPage, RewardsPage, TransactionsPage } from "./pages/account";
import LoginCard from "./components/LoginCard";
import { PoweredBy, ShopHeader, ShopNowCard, useShop } from "./components/AppChrome";
import InstallAppCard from "./components/InstallApp";
import { getSessionToken } from "./lib/account";

function HomePage() {
  const navigate = useNavigate();
  const shop = useShop();
  if (getSessionToken()) return <Navigate to="/account" replace />;
  return (
    <>
      <ShopHeader />
      <div className="c-wrap">
        <div className="c-welcome">
          <h2>Your bills &amp; offers</h2>
          <p>See every bill, return and balance, and get the latest offers from the shop.</p>
        </div>
        <LoginCard title="Log in with your mobile number" onDone={() => navigate("/account", { replace: true })} />
        <ShopNowCard shop={shop} />
        <InstallAppCard shopName={shop?.name} />
        <PoweredBy />
      </div>
    </>
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
        <Route path="/rewards" element={<RewardsPage />} />
        <Route path="*" element={<HomePage />} />
      </Routes>
    </BrowserRouter>
  );
}
