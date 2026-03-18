import { useState, useEffect } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { supabase } from '@/integrations/supabase/client';
import { ArrowLeft, IndianRupee, TrendingUp, Clock, Loader2, LogOut } from 'lucide-react';

const PORTAL_SESSION_KEY = 'portal_session';

interface PortalSession {
  orgSlug: string;
  sessionToken: string;
  customerId: string;
  customerName: string;
  priceType: string;
  expires: number;
}

interface Stats {
  totalBusiness: number;
  totalPending: number;
  partialOrUnpaid: number;
}

interface RecentInvoice {
  id: string;
  sale_number: string;
  sale_date: string;
  net_amount: number;
  paid_amount: number;
  payment_status: string;
}

export default function PortalAccount() {
  const { orgSlug } = useParams<{ orgSlug: string }>();
  const navigate = useNavigate();
  const [session, setSession] = useState<PortalSession | null>(null);
  const [stats, setStats] = useState<Stats | null>(null);
  const [recentInvoices, setRecentInvoices] = useState<RecentInvoice[]>([]);
  const [loading, setLoading] = useState(true);

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

  useEffect(() => {
    if (!session) return;
    (async () => {
      setLoading(true);
      const { data: invoices } = await supabase
        .from('sales')
        .select('id, sale_number, sale_date, net_amount, paid_amount, payment_status')
        .eq('customer_id', session.customerId)
        .is('deleted_at', null)
        .order('sale_date', { ascending: false })
        .limit(50);

      const all = (invoices as RecentInvoice[]) || [];
      const totalBusiness = all.reduce((s, i) => s + (i.net_amount || 0), 0);
      const totalPending = all.reduce((s, i) => s + Math.max(0, (i.net_amount || 0) - (i.paid_amount || 0)), 0);
      const partialOrUnpaid = all.filter(i => i.payment_status !== 'completed' && i.payment_status !== 'cancelled').length;

      setStats({ totalBusiness, totalPending, partialOrUnpaid });
      setRecentInvoices(all.slice(0, 3));
      setLoading(false);
    })();
  }, [session]);

  const handleLogout = () => {
    localStorage.removeItem(PORTAL_SESSION_KEY);
    navigate(`/${orgSlug}/portal`, { replace: true });
  };

  if (!session) return null;

  return (
    <div className="min-h-screen bg-gray-50">
      <div className="bg-white border-b px-4 py-4">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <button onClick={() => navigate(`/${orgSlug}/portal/home`)} className="p-1">
              <ArrowLeft className="h-5 w-5" />
            </button>
            <span className="font-semibold text-base">My Account</span>
          </div>
          <button onClick={handleLogout} className="flex items-center gap-1.5 text-red-600 text-sm font-medium">
            <LogOut className="h-4 w-4" />
            Logout
          </button>
        </div>
        <div className="mt-3 pl-9">
          <p className="text-[10px] uppercase tracking-wider text-muted-foreground font-semibold">Account Name</p>
          <p className="text-lg font-bold">{session.customerName}</p>
        </div>
      </div>

      <div className="p-4">
        {loading ? (
          <div className="flex items-center justify-center py-20">
            <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
          </div>
        ) : (
          <>
            {/* Stats cards */}
            <div className="grid grid-cols-2 gap-3 mb-6">
              <div className="bg-white rounded-xl border shadow-sm p-4">
                <div className="flex items-center gap-1.5 mb-2">
                  <TrendingUp className="h-3.5 w-3.5 text-muted-foreground" />
                  <span className="text-[10px] uppercase tracking-wider text-muted-foreground font-semibold">Total Business</span>
                </div>
                <p className="text-xl font-bold">₹{Math.round(stats?.totalBusiness || 0).toLocaleString('en-IN')}</p>
              </div>
              <div className="bg-white rounded-xl border shadow-sm p-4">
                <div className="flex items-center gap-1.5 mb-2">
                  <Clock className="h-3.5 w-3.5 text-muted-foreground" />
                  <span className="text-[10px] uppercase tracking-wider text-muted-foreground font-semibold">Pending</span>
                </div>
                <p className={`text-xl font-bold ${(stats?.totalPending || 0) > 0 ? 'text-red-600' : 'text-green-600'}`}>
                  ₹{Math.round(stats?.totalPending || 0).toLocaleString('en-IN')}
                </p>
                {(stats?.partialOrUnpaid || 0) > 0 && (
                  <p className="text-xs text-muted-foreground mt-1">{stats!.partialOrUnpaid} invoice{stats!.partialOrUnpaid > 1 ? 's' : ''} due</p>
                )}
              </div>
            </div>

            {/* Recent invoices */}
            {recentInvoices.length > 0 && (
              <div className="bg-white rounded-xl border shadow-sm overflow-hidden">
                <div className="flex items-center justify-between px-4 py-3 border-b">
                  <span className="text-sm font-semibold">Recent Invoices</span>
                  <button onClick={() => navigate(`/${orgSlug}/portal/invoices`)} className="text-xs text-green-700 font-semibold">
                    View all →
                  </button>
                </div>
                <div className="divide-y">
                  {recentInvoices.map(inv => (
                    <div key={inv.id} className="px-4 py-3 flex items-center justify-between">
                      <div>
                        <p className="text-sm font-medium">{inv.sale_number}</p>
                        <p className="text-xs text-muted-foreground">
                          {new Date(inv.sale_date).toLocaleDateString('en-IN', { day: '2-digit', month: 'short' })}
                        </p>
                      </div>
                      <div className="text-right">
                        <p className="text-sm font-semibold">₹{Math.round(inv.net_amount).toLocaleString('en-IN')}</p>
                        <span className={`text-[10px] font-medium px-1.5 py-0.5 rounded-full ${
                          inv.payment_status === 'completed' ? 'bg-green-100 text-green-800' :
                          inv.payment_status === 'partial' ? 'bg-yellow-100 text-yellow-800' :
                          'bg-red-100 text-red-800'
                        }`}>
                          {inv.payment_status === 'completed' ? 'Paid' : inv.payment_status === 'partial' ? 'Partial' : 'Unpaid'}
                        </span>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* Contact support */}
            <div className="mt-6 bg-white rounded-xl border shadow-sm p-4 text-center">
              <p className="text-sm font-semibold">Need help?</p>
              <p className="text-xs text-muted-foreground mt-1">Contact your supplier directly on WhatsApp</p>
            </div>
          </>
        )}
      </div>
    </div>
  );
}
