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
    // items: [{ variantId, productId, productName, size, color, barcode, hsnCode, qty, rate, mrp }]

    if (!items || items.length === 0) {
      return new Response(JSON.stringify({ error: 'Cart is empty' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
    }

    // Fetch customer details
    const { data: customer } = await supabase
      .from('customers')
      .select('customer_name, phone, address, gst_number')
      .eq('id', session.customer_id)
      .single();

    if (!customer) {
      return new Response(JSON.stringify({ error: 'Customer not found' }),
        { status: 404, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
    }

    // Generate order number
    const { data: orderNumber } = await supabase.rpc('generate_sale_order_number', {
      p_organization_id: session.organization_id
    });

    const grossAmount = items.reduce((s: number, i: any) => s + (i.rate * i.qty), 0);

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
