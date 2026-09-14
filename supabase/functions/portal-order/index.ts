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
      return new Response(JSON.stringify({ error: 'Session expired' }),
        { status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
    }

    const { items, notes } = await req.json();
    // items: [{ variantId, qty }] — every other field (price, mrp, names) is
    // re-derived server-side. Client-supplied rate/mrp is NEVER trusted.

    if (!Array.isArray(items) || items.length === 0) {
      return new Response(JSON.stringify({ error: 'Cart is empty' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
    }

    if (items.length > 200) {
      return new Response(JSON.stringify({ error: 'Too many items in one order' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
    }

    // Validate the only two fields we accept from the buyer.
    const requested: Array<{ variantId: string; qty: number }> = [];
    const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
    for (const raw of items) {
      const variantId = String(raw?.variantId ?? '').trim();
      const qty = Number(raw?.qty);
      if (!UUID_RE.test(variantId)) {
        return new Response(JSON.stringify({ error: 'Invalid item in cart' }),
          { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
      }
      if (!Number.isFinite(qty) || qty <= 0 || qty > 100000) {
        return new Response(JSON.stringify({ error: 'Invalid quantity' }),
          { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
      }
      requested.push({ variantId, qty: Math.round(qty * 1000) / 1000 });
    }

    // Fetch customer details (incl. portal pricing rule)
    const { data: customer } = await supabase
      .from('customers')
      .select('customer_name, phone, address, gst_number, portal_price_type, discount_percent')
      .eq('id', session.customer_id)
      .single();

    if (!customer) {
      return new Response(JSON.stringify({ error: 'Customer not found' }),
        { status: 404, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
    }

    // Authoritative variant + product data, scoped to this buyer's organization.
    const { data: variantRows, error: variantError } = await supabase
      .from('product_variants')
      .select('id, product_id, size, color, barcode, sale_price, mrp, organization_id, products!inner(id, product_name, hsn_code, organization_id, status, deleted_at)')
      .eq('organization_id', session.organization_id)
      .in('id', requested.map((r) => r.variantId));

    if (variantError) throw variantError;

    const variantMap = new Map((variantRows || []).map((v: any) => [v.id, v]));

    // Customer-specific last-sale prices (same source portal-catalogue uses).
    const { data: customerPrices } = await supabase
      .from('customer_product_prices')
      .select('variant_id, last_sale_price')
      .eq('customer_id', session.customer_id)
      .eq('organization_id', session.organization_id)
      .in('variant_id', requested.map((r) => r.variantId));

    const lastSaleMap = new Map((customerPrices || []).map((p: any) => [p.variant_id, p.last_sale_price]));

    const resolveRate = (v: any): number => {
      let price = Number(v.sale_price ?? v.mrp ?? 0);
      const type = customer.portal_price_type;
      if (type === 'last_sale' && lastSaleMap.has(v.id)) {
        price = Number(lastSaleMap.get(v.id) ?? price);
      } else if (type === 'discount' && customer.discount_percent) {
        price = Number(v.mrp ?? 0) * (1 - Number(customer.discount_percent) / 100);
      } else if (type === 'mrp') {
        price = Number(v.mrp ?? price);
      }
      if (!Number.isFinite(price) || price < 0) price = 0;
      return Math.round(price * 100) / 100;
    };

    const pricedItems = [] as Array<Record<string, unknown>>;
    for (const r of requested) {
      const v: any = variantMap.get(r.variantId);
      const product = v?.products;
      if (!v || !product || product.deleted_at || product.status !== 'active') {
        return new Response(JSON.stringify({ error: 'One or more items are no longer available' }),
          { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
      }
      const rate = resolveRate(v);
      pricedItems.push({
        product_id: v.product_id,
        variant_id: v.id,
        product_name: product.product_name,
        size: v.size,
        barcode: v.barcode || null,
        color: v.color || null,
        order_qty: r.qty,
        pending_qty: r.qty,
        unit_price: rate,
        mrp: v.mrp,
        discount_percent: 0,
        line_total: Math.round(rate * r.qty * 100) / 100,
        hsn_code: product.hsn_code || null,
      });
    }


    // Generate order number
    const { data: orderNumber } = await supabase.rpc('generate_sale_order_number', {
      p_organization_id: session.organization_id
    });

    const grossAmount = Math.round(
      pricedItems.reduce((s: number, i: any) => s + Number(i.line_total || 0), 0) * 100,
    ) / 100;

    // Insert sale order
    const { data: order, error: orderError } = await supabase
      .from('sale_orders')
      .insert({
        order_number: orderNumber,
        order_date: new Date().toISOString(),
        organization_id: session.organization_id,
        customer_id: session.customer_id,
        customer_name: customer.customer_name,
        customer_phone: customer.phone,
        customer_address: customer.address,
        customer_email: null,
        gross_amount: grossAmount,
        discount_amount: 0,
        flat_discount_percent: 0,
        flat_discount_amount: 0,
        gst_amount: 0,
        net_amount: grossAmount,
        round_off: 0,
        status: 'pending',
        order_source: 'portal',
        notes: notes || 'Order placed via Buyer Portal',
      })
      .select()
      .single();

    if (orderError) throw orderError;

    // Insert order items
    const orderItems = items.map((item: any) => ({
      order_id: order.id,
      product_id: item.productId,
      variant_id: item.variantId,
      product_name: item.productName,
      size: item.size,
      barcode: item.barcode || null,
      color: item.color || null,
      order_qty: item.qty,
      pending_qty: item.qty,
      unit_price: item.rate,
      mrp: item.mrp,
      discount_percent: 0,
      line_total: item.rate * item.qty,
      hsn_code: item.hsnCode || null,
    }));

    await supabase.from('sale_order_items').insert(orderItems);

    // Notify seller via WhatsApp (fire and forget)
    const { data: waSettings } = await supabase
      .from('whatsapp_api_settings')
      .select('access_token, phone_number_id, api_version')
      .eq('organization_id', session.organization_id)
      .single();

    const { data: sellerSettings } = await supabase
      .from('settings')
      .select('mobile_number')
      .eq('organization_id', session.organization_id)
      .single();

    if (waSettings?.access_token && waSettings?.phone_number_id && sellerSettings?.mobile_number) {
      const formattedPhone = (sellerSettings.mobile_number || '').replace(/\D/g, '');
      const sellerPhone = formattedPhone.length === 10 ? `91${formattedPhone}` : formattedPhone;
      const version = waSettings.api_version || 'v21.0';

      fetch(`https://graph.facebook.com/${version}/${waSettings.phone_number_id}/messages`, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${waSettings.access_token}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          messaging_product: 'whatsapp',
          to: sellerPhone,
          type: 'text',
          text: {
            body: `🛒 *New Portal Order!*\n\nOrder: ${orderNumber}\nCustomer: ${customer.customer_name}\nItems: ${items.length}\nAmount: ₹${grossAmount.toLocaleString('en-IN')}\n\nReview in Sale Orders dashboard.`
          }
        }),
      }).catch(console.error);
    }

    return new Response(
      JSON.stringify({ success: true, orderNumber, orderId: order.id }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );

  } catch (err) {
    console.error('portal-order error:', err);
    return new Response(JSON.stringify({ error: 'Failed to place order' }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
  }
});
