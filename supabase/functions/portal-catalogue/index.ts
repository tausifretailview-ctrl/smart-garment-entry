import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type, x-portal-token',
};

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response(null, { headers: corsHeaders });

  const supabase = createClient(
    Deno.env.get('SUPABASE_URL')!,
    Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
  );

  try {
    // Validate session token
    const token = req.headers.get('x-portal-token');
    if (!token) {
      return new Response(JSON.stringify({ error: 'Unauthorized' }),
        { status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
    }

    const { data: session } = await supabase
      .from('portal_sessions')
      .select('customer_id, organization_id, expires_at')
      .eq('session_token', token)
      .single();

    if (!session || new Date(session.expires_at) < new Date()) {
      return new Response(JSON.stringify({ error: 'Session expired. Please login again.' }),
        { status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
    }

    const url = new URL(req.url);
    const category = url.searchParams.get('category') || '';
    const search = url.searchParams.get('search') || '';

    // Fetch customer details for pricing
    const { data: customer } = await supabase
      .from('customers')
      .select('portal_price_type, discount_percent')
      .eq('id', session.customer_id)
      .single();

    // Fetch products with variants (in stock only)
    let query = supabase
      .from('products')
      .select(`
        id, product_name, brand, category, image_url, gst_per, hsn_code,
        product_variants (
          id, size, color, stock_qty, sale_price, mrp, barcode
        )
      `)
      .eq('organization_id', session.organization_id)
      .eq('status', 'active')
      .is('deleted_at', null);

    if (category) {
      query = query.eq('category', category);
    }

    if (search) {
      query = query.or(`product_name.ilike.%${search}%,brand.ilike.%${search}%`);
    }

    const { data: products } = await query.order('product_name').limit(500);

    // Fetch customer-specific prices
    const { data: customerPrices } = await supabase
      .from('customer_product_prices')
      .select('variant_id, last_sale_price, last_mrp')
      .eq('customer_id', session.customer_id)
      .eq('organization_id', session.organization_id);

    const priceMap = new Map((customerPrices || []).map(p => [p.variant_id, p]));

    // Fetch categories list
    const { data: allProducts } = await supabase
      .from('products')
      .select('category')
      .eq('organization_id', session.organization_id)
      .is('deleted_at', null)
      .eq('status', 'active');

    const categories = [...new Set((allProducts || []).map(p => p.category).filter(Boolean))].sort();

    // Build catalogue with buyer pricing
    const catalogue = (products || [])
      .map(product => {
        const variants = (product.product_variants || [])
          .filter((v: any) => v.stock_qty > 0)
          .map((v: any) => {
            let buyerPrice = v.sale_price || v.mrp;

            if (customer?.portal_price_type === 'last_sale' && priceMap.has(v.id)) {
              buyerPrice = priceMap.get(v.id)!.last_sale_price;
            } else if (customer?.portal_price_type === 'discount' && customer.discount_percent) {
              buyerPrice = v.mrp * (1 - customer.discount_percent / 100);
            } else if (customer?.portal_price_type === 'mrp') {
              buyerPrice = v.mrp;
            }

            return {
              id: v.id,
              size: v.size,
              color: v.color,
              stock_qty: v.stock_qty,
              sale_price: Math.round(buyerPrice * 100) / 100,
              mrp: v.mrp,
              barcode: v.barcode,
            };
          });

        return {
          id: product.id,
          product_name: product.product_name,
          brand: product.brand,
          category: product.category,
          image_url: product.image_url,
          gst_per: product.gst_per,
          hsn_code: product.hsn_code,
          variants,
        };
      })
      .filter(p => p.variants.length > 0);

    return new Response(
      JSON.stringify({ catalogue, categories }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );

  } catch (err) {
    console.error('portal-catalogue error:', err);
    return new Response(JSON.stringify({ error: 'Internal server error' }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
  }
});
