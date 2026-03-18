import { useState, useEffect, useCallback } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { supabase } from '@/integrations/supabase/client';
import { ArrowLeft, Package, ChevronDown, ChevronRight, Loader2 } from 'lucide-react';

const PORTAL_SESSION_KEY = 'portal_session';

interface PortalSession {
  orgSlug: string;
  sessionToken: string;
  customerId: string;
  customerName: string;
  priceType: string;
  expires: number;
}

interface Order {
  id: string;
  order_number: string;
  order_date: string;
  net_amount: number;
  status: string;
  order_source: string;
  notes: string | null;
}

interface OrderItem {
  product_name: string;
  size: string;
  qty: number;
  unit_price: number;
  line_total: number;
}

const STATUS_STYLE: Record<string, { bg: string; color: string; icon: string }> = {
  pending:    { bg: 'bg-yellow-100', color: 'text-yellow-800', icon: '⏳' },
  confirmed:  { bg: 'bg-green-100',  color: 'text-green-800',  icon: '✅' },
  dispatched: { bg: 'bg-blue-100',   color: 'text-blue-800',   icon: '🚚' },
  delivered:  { bg: 'bg-muted',      color: 'text-muted-foreground', icon: '📦' },
  cancelled:  { bg: 'bg-red-100',    color: 'text-red-800',    icon: '❌' },
};

export default function PortalOrders() {
  const { orgSlug } = useParams<{ orgSlug: string }>();
  const navigate = useNavigate();
  const [session, setSession] = useState<PortalSession | null>(null);
  const [orders, setOrders] = useState<Order[]>([]);
  const [loading, setLoading] = useState(true);
  const [expanded, setExpanded] = useState<string | null>(null);
  const [itemsMap, setItemsMap] = useState<Record<string, OrderItem[]>>({});

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
        .from('sale_orders')
        .select('id, order_number, order_date, net_amount, status, order_source, notes')
        .eq('customer_id', session.customerId)
        .is('deleted_at', null)
        .order('created_at', { ascending: false })
        .limit(50);
      setOrders((data as Order[]) || []);
      setLoading(false);
    })();
  }, [session]);

  const loadItems = useCallback(async (orderId: string) => {
    if (itemsMap[orderId]) {
      setExpanded(prev => prev === orderId ? null : orderId);
      return;
    }
    const { data } = await supabase
      .from('sale_order_items')
      .select('product_name, size, qty, unit_price, line_total')
      .eq('order_id', orderId)
      .is('deleted_at', null);
    setItemsMap(prev => ({ ...prev, [orderId]: (data as OrderItem[]) || [] }));
    setExpanded(orderId);
  }, [itemsMap]);

  if (!session) return null;

  return (
    <div className="min-h-screen bg-gray-50">
      <div className="bg-white border-b px-4 py-4">
        <div className="flex items-center gap-3">
          <button onClick={() => navigate(`/${orgSlug}/portal/home`)} className="p-1">
            <ArrowLeft className="h-5 w-5" />
          </button>
          <span className="font-semibold text-base">My Orders</span>
        </div>
        <p className="text-xs text-muted-foreground mt-1 pl-9">
          {orders.length} order{orders.length !== 1 ? 's' : ''} total
        </p>
      </div>

      <div className="p-4 space-y-3">
        {loading ? (
          <div className="flex items-center justify-center py-20">
            <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
          </div>
        ) : orders.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-20 text-muted-foreground">
            <Package className="h-12 w-12 mb-3" />
            <p className="text-sm font-medium">No orders yet</p>
            <p className="text-xs mt-1">Place your first order from the catalogue</p>
            <button
              onClick={() => navigate(`/${orgSlug}/portal/catalogue`)}
              className="mt-4 bg-green-600 text-white rounded-xl px-6 py-2.5 text-sm font-semibold hover:bg-green-700 transition-colors"
            >
              Browse Catalogue
            </button>
          </div>
        ) : (
          orders.map(order => {
            const st = STATUS_STYLE[order.status] || STATUS_STYLE.pending;
            const isExpanded = expanded === order.id;
            return (
              <div key={order.id} className="bg-white rounded-xl border shadow-sm overflow-hidden">
                <button
                  onClick={() => loadItems(order.id)}
                  className="w-full px-4 py-3 flex items-center gap-3 text-left"
                >
                  <span className="text-lg">{st.icon}</span>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center justify-between">
                      <span className="text-sm font-semibold">{order.order_number}</span>
                      <span className="text-sm font-semibold">₹{Math.round(order.net_amount).toLocaleString('en-IN')}</span>
                    </div>
                    <div className="flex items-center justify-between mt-0.5">
                      <span className="text-xs text-muted-foreground">
                        {new Date(order.order_date).toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: '2-digit' })}
                      </span>
                      <span className={`text-xs font-medium px-2 py-0.5 rounded-full ${st.bg} ${st.color}`}>
                        {order.status.charAt(0).toUpperCase() + order.status.slice(1)}
                      </span>
                    </div>
                  </div>
                  {isExpanded ? <ChevronDown className="h-4 w-4 text-muted-foreground" /> : <ChevronRight className="h-4 w-4 text-muted-foreground" />}
                </button>

                {isExpanded && itemsMap[order.id] && (
                  <div className="border-t bg-gray-50 divide-y">
                    {itemsMap[order.id].map((item, i) => (
                      <div key={i} className="px-4 py-2 flex items-center justify-between">
                        <div>
                          <p className="text-sm font-medium">{item.product_name}</p>
                          <p className="text-xs text-muted-foreground">Size: {item.size} · Qty: {item.qty} · ₹{item.unit_price}/pc</p>
                        </div>
                        <span className="text-sm font-semibold">₹{Math.round(item.line_total).toLocaleString('en-IN')}</span>
                      </div>
                    ))}
                    {order.notes && (
                      <div className="px-4 py-2 text-xs text-muted-foreground italic">Note: {order.notes}</div>
                    )}
                  </div>
                )}
              </div>
            );
          })
        )}
      </div>
    </div>
  );
}
