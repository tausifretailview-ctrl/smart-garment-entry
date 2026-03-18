import { useState, useEffect, useCallback } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { supabase } from '@/integrations/supabase/client';
import { ShoppingCart, ArrowLeft, Search, Loader2, Plus, Minus, X, Package } from 'lucide-react';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { toast } from 'sonner';

const PORTAL_SESSION_KEY = 'portal_session';

interface CartItem {
  variantId: string;
  productId: string;
  productName: string;
  size: string;
  color: string;
  barcode: string;
  hsnCode: string;
  qty: number;
  rate: number;
  mrp: number;
}

interface PortalSession {
  orgSlug: string;
  sessionToken: string;
  customerId: string;
  customerName: string;
  priceType: string;
  expires: number;
}

interface ProductVariant {
  id: string;
  size: string;
  color: string;
  stock_qty: number;
  sale_price: number;
  mrp: number;
  barcode: string;
}

interface CatalogueProduct {
  id: string;
  product_name: string;
  brand: string;
  category: string;
  image_url: string;
  gst_per: number;
  hsn_code: string;
  variants: ProductVariant[];
}

export default function PortalCatalogue() {
  const { orgSlug } = useParams<{ orgSlug: string }>();
  const navigate = useNavigate();

  const [session, setSession] = useState<PortalSession | null>(null);
  const [products, setProducts] = useState<CatalogueProduct[]>([]);
  const [categories, setCategories] = useState<string[]>([]);
  const [selectedCategory, setSelectedCategory] = useState('');
  const [search, setSearch] = useState('');
  const [loading, setLoading] = useState(true);
  const [cart, setCart] = useState<CartItem[]>([]);
  const [showCart, setShowCart] = useState(false);
  const [placingOrder, setPlacingOrder] = useState(false);
  const [orderNotes, setOrderNotes] = useState('');

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
      navigate(`/${orgSlug}/portal`, { replace: true });
    }
  }, [orgSlug, navigate]);

  const fetchCatalogue = useCallback(async () => {
    if (!session) return;
    setLoading(true);
    try {
      const res = await supabase.functions.invoke('portal-catalogue', {
        headers: { 'x-portal-token': session.sessionToken },
      });
      if (res.error || res.data?.error) {
        if (res.data?.error?.includes?.('Session') || res.data?.error?.includes?.('expired')) {
          localStorage.removeItem(PORTAL_SESSION_KEY);
          navigate(`/${orgSlug}/portal`, { replace: true });
        }
        return;
      }
      setProducts(res.data.catalogue || []);
      setCategories(res.data.categories || []);
    } finally {
      setLoading(false);
    }
  }, [session, orgSlug, navigate]);

  useEffect(() => {
    if (session) fetchCatalogue();
  }, [session, fetchCatalogue]);

  const filteredProducts = products.filter(p => {
    const matchesCat = !selectedCategory || p.category === selectedCategory;
    const matchesSearch = !search ||
      p.product_name.toLowerCase().includes(search.toLowerCase()) ||
      p.brand?.toLowerCase().includes(search.toLowerCase());
    return matchesCat && matchesSearch;
  });

  const getCartQty = (variantId: string) => cart.find(c => c.variantId === variantId)?.qty || 0;

  const updateCart = (product: CatalogueProduct, variant: ProductVariant, delta: number) => {
    setCart(prev => {
      const idx = prev.findIndex(c => c.variantId === variant.id);
      if (idx >= 0) {
        const newQty = prev[idx].qty + delta;
        if (newQty <= 0) return prev.filter((_, i) => i !== idx);
        const updated = [...prev];
        updated[idx] = { ...updated[idx], qty: newQty };
        return updated;
      } else if (delta > 0) {
        return [...prev, {
          variantId: variant.id,
          productId: product.id,
          productName: product.product_name,
          size: variant.size,
          color: variant.color || '',
          barcode: variant.barcode || '',
          hsnCode: product.hsn_code || '',
          qty: 1,
          rate: variant.sale_price,
          mrp: variant.mrp,
        }];
      }
      return prev;
    });
  };

  const cartTotal = cart.reduce((s, i) => s + i.rate * i.qty, 0);
  const cartCount = cart.reduce((s, i) => s + i.qty, 0);

  const handlePlaceOrder = async () => {
    if (cart.length === 0 || !session) return;
    setPlacingOrder(true);
    try {
      const res = await supabase.functions.invoke('portal-order', {
        body: { items: cart, notes: orderNotes },
        headers: { 'x-portal-token': session.sessionToken },
      });
      if (res.error || res.data?.error) {
        toast.error(res.data?.error || 'Failed to place order');
        return;
      }
      toast.success(`Order ${res.data.orderNumber} placed successfully!`);
      setCart([]);
      setShowCart(false);
      setOrderNotes('');
      navigate(`/${orgSlug}/portal/home`);
    } catch {
      toast.error('Something went wrong. Try again.');
    } finally {
      setPlacingOrder(false);
    }
  };

  if (!session) return null;

  return (
    <div className="min-h-screen bg-gray-50 pb-24">
      {/* Header */}
      <div className="bg-white border-b sticky top-0 z-20">
        <div className="px-4 py-3 flex items-center justify-between">
          <button onClick={() => navigate(`/${orgSlug}/portal/home`)} className="p-1">
            <ArrowLeft className="h-5 w-5" />
          </button>
          <h1 className="font-semibold text-base">Catalogue</h1>
          <button onClick={() => setShowCart(true)} className="relative p-2">
            <ShoppingCart className="h-5 w-5" />
            {cartCount > 0 && (
              <span className="absolute -top-1 -right-1 bg-green-600 text-white text-[10px] font-bold rounded-full h-5 w-5 flex items-center justify-center">
                {cartCount}
              </span>
            )}
          </button>
        </div>

        {/* Search */}
        <div className="px-4 pb-3">
          <div className="relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
            <Input
              placeholder="Search products or brands..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="pl-9 h-10"
            />
          </div>
        </div>

        {/* Category chips */}
        {categories.length > 0 && (
          <div className="px-4 pb-3 flex gap-2 overflow-x-auto no-scrollbar">
            <button
              onClick={() => setSelectedCategory('')}
              className={`flex-shrink-0 px-3 py-1.5 rounded-full text-xs font-medium border transition-colors ${
                !selectedCategory ? 'bg-foreground text-background border-foreground' : 'bg-background text-muted-foreground border-border'
              }`}
            >
              All
            </button>
            {categories.map(cat => (
              <button
                key={cat}
                onClick={() => setSelectedCategory(cat === selectedCategory ? '' : cat)}
                className={`flex-shrink-0 px-3 py-1.5 rounded-full text-xs font-medium border transition-colors ${
                  selectedCategory === cat ? 'bg-foreground text-background border-foreground' : 'bg-background text-muted-foreground border-border'
                }`}
              >
                {cat}
              </button>
            ))}
          </div>
        )}
      </div>

      {/* Products */}
      <div className="p-4 space-y-4">
        {loading ? (
          <div className="flex items-center justify-center py-20">
            <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
          </div>
        ) : filteredProducts.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-20 text-muted-foreground">
            <Package className="h-12 w-12 mb-3" />
            <p className="text-sm">No products found</p>
          </div>
        ) : (
          filteredProducts.map(product => (
            <div key={product.id} className="bg-white rounded-xl border shadow-sm overflow-hidden">
              <div className="p-3">
                <div className="flex items-start justify-between">
                  <div className="flex-1 min-w-0">
                    <h3 className="font-semibold text-sm text-foreground truncate">{product.product_name}</h3>
                    {product.brand && <p className="text-xs text-muted-foreground">{product.brand}</p>}
                  </div>
                  {product.image_url && (
                    <img src={product.image_url} alt="" className="h-12 w-12 rounded-lg object-cover ml-2 flex-shrink-0" />
                  )}
                </div>
              </div>
              {/* Variants */}
              <div className="border-t divide-y">
                {product.variants.map((variant) => {
                  const qty = getCartQty(variant.id);
                  return (
                    <div key={variant.id} className="px-3 py-2 flex items-center justify-between">
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-1.5">
                          <span className="text-xs font-medium text-foreground">{variant.size}</span>
                          {variant.color && <span className="text-xs text-muted-foreground">· {variant.color}</span>}
                        </div>
                        <div className="flex items-center gap-1.5 mt-0.5">
                          <span className="text-sm font-semibold text-green-700">₹{variant.sale_price}</span>
                          {variant.mrp !== variant.sale_price && (
                            <span className="text-xs text-muted-foreground line-through">₹{variant.mrp}</span>
                          )}
                        </div>
                      </div>
                      <div className="flex-shrink-0">
                        {qty > 0 ? (
                          <div className="flex items-center gap-2 bg-green-50 rounded-lg px-1">
                            <button onClick={() => updateCart(product, variant, -1)} className="p-1.5 text-green-700">
                              <Minus className="h-3.5 w-3.5" />
                            </button>
                            <span className="text-sm font-semibold text-green-800 min-w-[20px] text-center">{qty}</span>
                            <button onClick={() => updateCart(product, variant, 1)} className="p-1.5 text-green-700">
                              <Plus className="h-3.5 w-3.5" />
                            </button>
                          </div>
                        ) : (
                          <button
                            onClick={() => updateCart(product, variant, 1)}
                            className="bg-green-600 text-white rounded-lg px-3 py-1.5 text-xs font-medium hover:bg-green-700 transition-colors"
                          >
                            Add
                          </button>
                        )}
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          ))
        )}
      </div>

      {/* Cart bar at bottom */}
      {cartCount > 0 && !showCart && (
        <div className="fixed bottom-0 left-0 right-0 p-4 bg-white border-t z-30">
          <button
            onClick={() => setShowCart(true)}
            className="w-full bg-green-600 text-white rounded-xl py-3.5 flex items-center justify-between px-4 font-semibold hover:bg-green-700 transition-colors"
          >
            <span className="text-sm">{cartCount} items</span>
            <span>View Cart</span>
            <span className="text-sm">₹{cartTotal.toLocaleString('en-IN')}</span>
          </button>
        </div>
      )}

      {/* Cart Sheet */}
      {showCart && (
        <div className="fixed inset-0 bg-black/50 z-40" onClick={() => setShowCart(false)}>
          <div
            className="absolute bottom-0 left-0 right-0 bg-white rounded-t-2xl max-h-[85vh] flex flex-col"
            onClick={e => e.stopPropagation()}
          >
            <div className="flex items-center justify-between p-4 border-b">
              <h2 className="font-bold text-lg">Your Cart</h2>
              <button onClick={() => setShowCart(false)} className="p-1">
                <X className="h-5 w-5" />
              </button>
            </div>

            <div className="flex-1 overflow-y-auto p-4 space-y-3">
              {cart.map(item => (
                <div key={item.variantId} className="flex items-center justify-between bg-gray-50 rounded-lg p-3">
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-medium text-foreground truncate">{item.productName}</p>
                    <p className="text-xs text-muted-foreground">
                      {item.size} {item.color && `· ${item.color}`} · ₹{item.rate}
                    </p>
                  </div>
                  <div className="flex items-center gap-2 ml-2">
                    <button
                      className="p-1 rounded hover:bg-gray-200 transition-colors"
                      onClick={() => setCart(prev =>
                        prev.map(c => c.variantId === item.variantId && c.qty > 1 ? { ...c, qty: c.qty - 1 } : c)
                          .filter(c => c.qty > 0)
                      )}
                    >
                      <Minus className="h-3.5 w-3.5" />
                    </button>
                    <span className="text-sm font-semibold min-w-[20px] text-center">{item.qty}</span>
                    <button
                      className="p-1 rounded hover:bg-gray-200 transition-colors"
                      onClick={() => setCart(prev =>
                        prev.map(c => c.variantId === item.variantId ? { ...c, qty: c.qty + 1 } : c)
                      )}
                    >
                      <Plus className="h-3.5 w-3.5" />
                    </button>
                    <span className="text-sm font-semibold text-green-700 ml-2 min-w-[60px] text-right">
                      ₹{(item.rate * item.qty).toLocaleString('en-IN')}
                    </span>
                  </div>
                </div>
              ))}
            </div>

            <div className="p-4 border-t space-y-3">
              <Input
                placeholder="Order notes (optional)"
                value={orderNotes}
                onChange={(e) => setOrderNotes(e.target.value)}
                className="h-10"
              />
            </div>

            <div className="p-4 border-t space-y-3">
              <div className="flex items-center justify-between">
                <span className="font-semibold">Total ({cartCount} items)</span>
                <span className="font-bold text-lg text-green-700">₹{cartTotal.toLocaleString('en-IN')}</span>
              </div>
              <Button
                className="w-full h-12 text-base bg-green-600 hover:bg-green-700"
                disabled={placingOrder}
                onClick={handlePlaceOrder}
              >
                {placingOrder ? <Loader2 className="h-4 w-4 mr-2 animate-spin" /> : null}
                Place Order
              </Button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
