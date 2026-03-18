import { useState, useEffect } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { supabase } from '@/integrations/supabase/client';
import { ArrowLeft, FileText, Loader2 } from 'lucide-react';

const PORTAL_SESSION_KEY = 'portal_session';

interface PortalSession {
  orgSlug: string;
  sessionToken: string;
  customerId: string;
  customerName: string;
  priceType: string;
  expires: number;
}

interface Invoice {
  id: string;
  sale_number: string;
  sale_date: string;
  net_amount: number;
  paid_amount: number;
  payment_status: string;
  sale_type: string;
}

const STATUS: Record<string, { label: string; bg: string; color: string }> = {
  completed: { label: 'Paid',      bg: 'bg-green-100',  color: 'text-green-800' },
  partial:   { label: 'Partial',   bg: 'bg-yellow-100', color: 'text-yellow-800' },
  pending:   { label: 'Unpaid',    bg: 'bg-red-100',    color: 'text-red-800' },
  cancelled: { label: 'Cancelled', bg: 'bg-muted',      color: 'text-muted-foreground' },
};

export default function PortalInvoices() {
  const { orgSlug } = useParams<{ orgSlug: string }>();
  const navigate = useNavigate();
  const [session, setSession] = useState<PortalSession | null>(null);
  const [invoices, setInvoices] = useState<Invoice[]>([]);
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
      const { data } = await supabase
        .from('sales')
        .select('id, sale_number, sale_date, net_amount, paid_amount, payment_status, sale_type')
        .eq('customer_id', session.customerId)
        .is('deleted_at', null)
        .in('sale_type', ['sale_invoice', 'pos', 'invoice'])
        .order('sale_date', { ascending: false })
        .limit(50);
      setInvoices((data as Invoice[]) || []);
      setLoading(false);
    })();
  }, [session]);

  if (!session) return null;

  return (
    <div className="min-h-screen bg-gray-50">
      <div className="bg-white border-b px-4 py-4">
        <div className="flex items-center gap-3">
          <button onClick={() => navigate(`/${orgSlug}/portal/home`)} className="p-1">
            <ArrowLeft className="h-5 w-5" />
          </button>
          <span className="font-semibold text-base">My Invoices</span>
        </div>
        <p className="text-xs text-muted-foreground mt-1 pl-9">
          {invoices.length} invoice{invoices.length !== 1 ? 's' : ''}
        </p>
      </div>

      <div className="p-4 space-y-3">
        {loading ? (
          <div className="flex items-center justify-center py-20">
            <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
          </div>
        ) : invoices.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-20 text-muted-foreground">
            <FileText className="h-12 w-12 mb-3" />
            <p className="text-sm font-medium">No invoices yet</p>
          </div>
        ) : (
          invoices.map(inv => {
            const st = STATUS[inv.payment_status] || STATUS.pending;
            const pending = Math.max(0, (inv.net_amount || 0) - (inv.paid_amount || 0));
            return (
              <div key={inv.id} className="bg-white rounded-xl border shadow-sm p-4">
                <div className="flex items-center gap-3">
                  <div className="h-10 w-10 rounded-lg bg-purple-50 flex items-center justify-center flex-shrink-0">
                    <FileText className="h-5 w-5 text-purple-700" />
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center justify-between">
                      <span className="text-sm font-semibold">{inv.sale_number}</span>
                      <span className="text-sm font-semibold">₹{Math.round(inv.net_amount).toLocaleString('en-IN')}</span>
                    </div>
                    <div className="flex items-center justify-between mt-0.5">
                      <span className="text-xs text-muted-foreground">
                        {new Date(inv.sale_date).toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: '2-digit' })}
                      </span>
                      <span className={`text-xs font-medium px-2 py-0.5 rounded-full ${st.bg} ${st.color}`}>
                        {st.label}
                      </span>
                    </div>
                    {pending > 0 && (
                      <p className="text-xs text-red-600 mt-1">₹{Math.round(pending).toLocaleString('en-IN')} pending</p>
                    )}
                  </div>
                </div>
              </div>
            );
          })
        )}
      </div>
    </div>
  );
}
