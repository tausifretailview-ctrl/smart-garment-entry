import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version',
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders })
  }

  try {
    const url = new URL(req.url)
    const saleId = url.searchParams.get('saleId')

    if (!saleId) {
      return new Response(
        JSON.stringify({ error: 'saleId is required' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      )
    }

    const uuidRegex = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i
    if (!uuidRegex.test(saleId)) {
      return new Response(
        JSON.stringify({ error: 'Invalid sale ID format' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      )
    }

    const supabase = createClient(
      Deno.env.get('SUPABASE_URL')!,
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
    )

    // Fetch sale with items - include all display-relevant fields
    const { data: sale, error: saleError } = await supabase
      .from('sales')
      .select('id, sale_number, sale_date, customer_name, customer_id, customer_phone, customer_address, gross_amount, discount_amount, flat_discount_amount, round_off, net_amount, payment_method, terms_conditions, organization_id, salesman, notes, cash_amount, card_amount, upi_amount, paid_amount, credit_applied, sale_return_adjust, einvoice_qr_code, points_redeemed_amount, sale_items (id, product_name, barcode, size, mrp, quantity, unit_price, line_total, discount_percent, hsn_code, gst_percent, color)')
      .eq('id', saleId)
      .is('deleted_at', null)
      .maybeSingle()

    if (saleError) {
      console.error('Sale fetch error:', saleError)
      return new Response(
        JSON.stringify({ error: 'Failed to fetch invoice' }),
        { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      )
    }

    if (!sale) {
      return new Response(
        JSON.stringify({ error: 'Invoice not found' }),
        { status: 404, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      )
    }

    // Parallel-fetch all dependent data to minimize cold-start latency.
    // This avoids the "first load missing EMI/GST/financer" issue where
    // sequential awaits caused the page to occasionally paint before the
    // financer/customer/settings calls completed.
    const [financerRes, custRes, settingsRes, orgRes] = await Promise.all([
      supabase
        .from('sale_financer_details')
        .select('financer_name, loan_number, emi_amount, tenure, down_payment, down_payment_mode, finance_discount, bank_transfer_amount')
        .eq('sale_id', saleId)
        .maybeSingle(),
      sale.customer_id
        ? supabase
            .from('customers')
            .select('gst_number, transport_details')
            .eq('id', sale.customer_id)
            .maybeSingle()
        : Promise.resolve({ data: null }),
      supabase
        .from('settings')
        .select('business_name, address, mobile_number, email_id, gst_number, sale_settings, bill_barcode_settings')
        .eq('organization_id', sale.organization_id)
        .maybeSingle(),
      supabase
        .from('organizations')
        .select('slug, name')
        .eq('id', sale.organization_id)
        .single(),
    ])

    const financerDetails = financerRes.data
    const customerExtra = custRes.data as { gst_number?: string; transport_details?: string } | null
    const settings = settingsRes.data
    const org = orgRes.data

    const saleSettings = settings?.sale_settings as any || {};
    const sanitizedSettings = settings ? {
      business_name: settings.business_name,
      address: settings.address,
      mobile_number: settings.mobile_number,
      email_id: settings.email_id,
      gst_number: settings.gst_number,
      invoiceLogo: saleSettings?.invoiceLogo || '',
      invoice_template: saleSettings?.invoice_template || 'professional',
      invoice_color_scheme: saleSettings?.invoice_color_scheme || 'blue',
      logo_placement: saleSettings?.logo_placement || 'left',
      show_hsn_column: saleSettings?.show_hsn_code ?? true,
      show_barcode: saleSettings?.show_barcode ?? true,
      show_gst_breakdown: saleSettings?.show_gst_breakdown ?? true,
      show_mrp_column: saleSettings?.show_mrp_column ?? false,
      show_total_quantity: saleSettings?.show_total_quantity ?? true,
      invoice_header_text: saleSettings?.invoice_header_text || '',
      invoice_footer_text: saleSettings?.invoice_footer_text || '',
      declaration_text: saleSettings?.declaration_text || '',
      terms_list: saleSettings?.terms_list || [],
      font_family: saleSettings?.font_family || 'inter',
      bank_details: saleSettings?.bank_details || null,
      show_bank_details: saleSettings?.show_bank_details ?? false,
      pos_bill_format: saleSettings?.pos_bill_format || 'thermal',
      thermal_receipt_style: saleSettings?.thermal_receipt_style || 'classic',
      bill_barcode_settings: settings?.bill_barcode_settings ? {
        logo_url: (settings.bill_barcode_settings as any)?.logo_url || '',
        stamp_image_base64: (settings.bill_barcode_settings as any)?.stamp_image_base64 || '',
        stamp_show_sale: (settings.bill_barcode_settings as any)?.stamp_show_sale ?? true,
        stamp_position: (settings.bill_barcode_settings as any)?.stamp_position || 'bottom-right',
        stamp_size: (settings.bill_barcode_settings as any)?.stamp_size || 'medium',
      } : null,
    } : null

    return new Response(
      JSON.stringify({
        sale: {
          id: sale.id,
          sale_number: sale.sale_number,
          sale_date: sale.sale_date,
          customer_name: sale.customer_name,
          customer_phone: sale.customer_phone || '',
          customer_address: sale.customer_address || '',
          gross_amount: sale.gross_amount,
          discount_amount: sale.discount_amount,
          flat_discount_amount: sale.flat_discount_amount,
          round_off: sale.round_off,
          net_amount: sale.net_amount,
          payment_method: sale.payment_method,
          terms_conditions: sale.terms_conditions,
          sale_items: sale.sale_items,
          salesman: sale.salesman || '',
          notes: sale.notes || '',
          cash_amount: sale.cash_amount || 0,
          card_amount: sale.card_amount || 0,
          upi_amount: sale.upi_amount || 0,
          paid_amount: sale.paid_amount || 0,
          credit_amount: (sale as any).credit_applied || 0,
          sale_return_adjust: sale.sale_return_adjust || 0,
          einvoice_qr_code: sale.einvoice_qr_code || '',
          points_redeemed_amount: sale.points_redeemed_amount || 0,
        },
        financerDetails: financerDetails || null,
        customerExtra: customerExtra || null,
        settings: sanitizedSettings,
        organization: org ? { slug: org.slug, name: org.name } : null,
      }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    )
  } catch (err) {
    console.error('Unexpected error:', err)
    return new Response(
      JSON.stringify({ error: 'Internal server error' }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    )
  }
})
