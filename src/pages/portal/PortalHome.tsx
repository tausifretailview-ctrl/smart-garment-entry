import { useEffect, useState } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { ShoppingBag, Package, FileText, LogOut, ChevronRight, IndianRupee } from 'lucide-react';

const PORTAL_SESSION_KEY = 'portal_session';

interface PortalSession {
  orgSlug: string;
  sessionToken: string;
  customerId: string;
  customerName: string;
  priceType: string;
  expires: number;
}

export default function PortalHome() {
  const { orgSlug } = useParams<{ orgSlug: string }>();
  const navigate = useNavigate();
  const [session, setSession] = useState<PortalSession | null>(null);

  useEffect(() => {
    const stored = localStorage.getItem(PORTAL_SESSION_KEY);
    if (!stored) { navigate(`/${orgSlug}/portal`, { replace: true }); return; }
    try {
      const s = JSON.parse(stored) as PortalSession;
      if (s.orgSlug !== orgSlug || s.expires < Date.now()) {
        localStorage.removeItem(PORTAL_SESSION_KEY);
        navigate(`/${orgSlug}/portal`, { replace: true });
        return;
      }
      setSession(s);
    } catch {
      localStorage.removeItem(PORTAL_SESSION_KEY);
      navigate(`/${orgSlug}/portal`, { replace: true });
    }
  }, [orgSlug, navigate]);

  const handleLogout = () => {
    localStorage.removeItem(PORTAL_SESSION_KEY);
    navigate(`/${orgSlug}/portal`, { replace: true });
  };

  if (!session) return null;

  const navCards = [
    {
      icon: Package,
      label: 'My Orders',
      desc: 'Track your order status',
      color: 'bg-blue-50 text-blue-700',
      onClick: () => navigate(`/${orgSlug}/portal/orders`),
    },
    {
      icon: FileText,
      label: 'My Invoices',
      desc: 'View & download invoices',
      color: 'bg-purple-50 text-purple-700',
      onClick: () => navigate(`/${orgSlug}/portal/invoices`),
    },
    {
      icon: IndianRupee,
      label: 'My Account',
      desc: 'Balance & payment history',
      color: 'bg-orange-50 text-orange-700',
      onClick: () => navigate(`/${orgSlug}/portal/account`),
    },
  ];

  return (
    <div className="min-h-screen bg-gray-50">
      {/* Header */}
      <div className="bg-white border-b px-4 py-4 flex items-center justify-between">
        <div>
          <p className="text-xs text-muted-foreground">Welcome back</p>
          <h1 className="text-lg font-bold text-foreground">{session.customerName}</h1>
        </div>
        <button onClick={handleLogout} className="p-2 rounded-lg hover:bg-gray-100 transition-colors">
          <LogOut className="h-5 w-5 text-muted-foreground" />
        </button>
      </div>

      {/* Quick order CTA */}
      <div className="p-4">
        <button
          onClick={() => navigate(`/${orgSlug}/portal/catalogue`)}
          className="w-full bg-green-600 text-white rounded-xl px-4 py-4 flex items-center justify-between shadow-sm hover:bg-green-700 transition-colors"
        >
          <div className="flex items-center gap-3">
            <ShoppingBag className="h-6 w-6" />
            <div className="text-left">
              <p className="font-semibold">Place New Order</p>
              <p className="text-xs text-green-100">Browse catalogue with your prices</p>
            </div>
          </div>
          <ChevronRight className="h-5 w-5" />
        </button>
      </div>

      {/* Nav cards */}
      <div className="px-4 space-y-3">
        {navCards.map(card => (
          <button
            key={card.label}
            onClick={card.onClick}
            className="w-full bg-white rounded-xl p-4 flex items-center gap-3 border shadow-sm hover:shadow-md transition-shadow text-left"
          >
            <div className={`h-10 w-10 rounded-lg flex items-center justify-center ${card.color}`}>
              <card.icon className="h-5 w-5" />
            </div>
            <div className="flex-1">
              <p className="font-medium text-sm text-foreground">{card.label}</p>
              <p className="text-xs text-muted-foreground">{card.desc}</p>
            </div>
            <ChevronRight className="h-4 w-4 text-muted-foreground" />
          </button>
        ))}
      </div>
    </div>
  );
}
