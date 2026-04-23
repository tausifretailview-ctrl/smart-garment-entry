import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

// Helper to find organization by phone number ID from settings
// Returns settings array if multiple orgs share the same phone_number_id
async function findOrganizationByPhoneId(supabase: any, phoneNumberId: string) {
  // First check if any org has this specific phone_number_id
  const { data: orgSettings, error } = await supabase
    .from('whatsapp_api_settings')
    .select('*')
    .eq('phone_number_id', phoneNumberId)
    .eq('use_default_api', false);
  
  if (error) {
    console.error('Error fetching org settings by phone_number_id:', error);
  }

  // If exactly one org has this phone_number_id, return it
  if (orgSettings && orgSettings.length === 1) {
    return orgSettings[0];
  }
  
  // If multiple orgs share this phone_number_id, return null
  // The caller should use customer phone lookup to disambiguate
  if (orgSettings && orgSettings.length > 1) {
    console.log(`Multiple orgs (${orgSettings.length}) share phone_number_id: ${phoneNumberId}. Will use customer phone lookup.`);
    return { is_shared_number: true, settings_list: orgSettings };
  }

  // Check if this is the platform default phone number
  const { data: platformSettings } = await supabase
    .from('platform_settings')
    .select('setting_value')
    .eq('setting_key', 'default_whatsapp_api')
    .single();

  if (platformSettings) {
    const defaultCreds = platformSettings.setting_value as Record<string, unknown>;
    if (defaultCreds.phone_number_id === phoneNumberId) {
      // This is the shared platform number - return platform settings merged with null org
      return {
        ...defaultCreds,
        organization_id: null, // Will need special routing
        is_platform_default: true,
      };
    }
  }

  return null;
}

// Helper to find organization for a customer phone using the shared API
async function findOrganizationByCustomerPhone(supabase: any, customerPhone: string) {
  const cleanPhone = customerPhone.replace(/\D/g, '').slice(-10);
  const fullPhone = customerPhone.replace(/\D/g, '');
  
  console.log(`Looking up organization for customer phone: ${customerPhone} (clean: ${cleanPhone})`);
  
  // Priority 1: Check whatsapp_logs for the most recent outbound message to this customer
  // This is the most reliable way to find which org sent a message to this customer
  const { data: recentLog } = await supabase
    .from('whatsapp_logs')
    .select('organization_id')
    .or(`phone_number.ilike.%${cleanPhone}%,phone_number.ilike.%${fullPhone}%`)
    .order('created_at', { ascending: false })
    .limit(1)
    .maybeSingle();

  if (recentLog?.organization_id) {
    console.log(`Found org from whatsapp_logs: ${recentLog.organization_id}`);
    const { data: orgSettings } = await supabase
      .from('whatsapp_api_settings')
      .select('*')
      .eq('organization_id', recentLog.organization_id)
      .maybeSingle();
    
    if (orgSettings) return orgSettings;
  }
  
  // Priority 2: Check existing conversations (most recent interaction)
  const { data: conversation } = await supabase
    .from('whatsapp_conversations')
    .select('organization_id')
    .or(`customer_phone.ilike.%${cleanPhone}%,customer_phone.ilike.%${fullPhone}%`)
    .order('last_message_at', { ascending: false })
    .limit(1)
    .maybeSingle();

  if (conversation?.organization_id) {
    console.log(`Found org from whatsapp_conversations: ${conversation.organization_id}`);
    const { data: orgSettings } = await supabase
      .from('whatsapp_api_settings')
      .select('*')
      .eq('organization_id', conversation.organization_id)
      .maybeSingle();
    
    if (orgSettings) return orgSettings;
  }

  // Priority 3: Check customers table across all orgs (most recent customer)
  const { data: customer } = await supabase
    .from('customers')
    .select('organization_id')
    .or(`phone.ilike.%${cleanPhone}%,phone.ilike.%${fullPhone}%`)
    .is('deleted_at', null)
    .order('created_at', { ascending: false })
    .limit(1)
    .maybeSingle();

  if (customer?.organization_id) {
    console.log(`Found org from customers table: ${customer.organization_id}`);
    const { data: orgSettings } = await supabase
      .from('whatsapp_api_settings')
      .select('*')
      .eq('organization_id', customer.organization_id)
      .maybeSingle();
    
    if (orgSettings) return orgSettings;
  }

  // Priority 4: Check settings table for owner_phone match
  // This ensures owner messages are routed even if the owner is not a customer
  const { data: ownerSettings } = await supabase
    .from('settings')
    .select('organization_id')
    .or(`owner_phone.ilike.%${cleanPhone}%,owner_phone.ilike.%${fullPhone}%`)
    .limit(1)
    .maybeSingle();

  if (ownerSettings?.organization_id) {
    console.log(`Found org from settings owner_phone: ${ownerSettings.organization_id}`);
    const { data: orgSettings } = await supabase
      .from('whatsapp_api_settings')
      .select('*')
      .eq('organization_id', ownerSettings.organization_id)
      .maybeSingle();
    
    if (orgSettings) return orgSettings;
  }

  console.log('No organization found for this customer phone');
  return null;
}

// Helper to get or create conversation
async function getOrCreateConversation(
  supabase: any, 
  organizationId: string, 
  customerPhone: string,
  customerName?: string
) {
  // Try to find existing conversation
  const { data: existing } = await supabase
    .from('whatsapp_conversations')
    .select('*')
    .eq('organization_id', organizationId)
    .eq('customer_phone', customerPhone)
    .single();

  if (existing) {
    return existing;
  }

  // Create new conversation
  const { data: newConv, error } = await supabase
    .from('whatsapp_conversations')
    .insert({
      organization_id: organizationId,
      customer_phone: customerPhone,
      customer_name: customerName,
      last_message_at: new Date().toISOString(),
      unread_count: 0,
    })
    .select()
    .single();

  if (error) {
    console.error('Error creating conversation:', error);
    throw error;
  }

  return newConv;
}

// Helper to get conversation history
async function getConversationHistory(supabase: any, conversationId: string, limit: number = 10) {
  const { data } = await supabase
    .from('whatsapp_messages')
    .select('direction, message_text, sent_at')
    .eq('conversation_id', conversationId)
    .order('sent_at', { ascending: false })
    .limit(limit);
  
  return (data || []).reverse();
}

// Helper to get customer info
async function getCustomerInfo(supabase: any, organizationId: string, phone: string) {
  // Format phone for search
  const cleanPhone = phone.replace(/\D/g, '').slice(-10);
  
  const { data: customer } = await supabase
    .from('customers')
    .select('id, customer_name, phone, opening_balance, points_balance')
    .eq('organization_id', organizationId)
    .or(`phone.ilike.%${cleanPhone}%,phone.ilike.%${phone}%`)
    .maybeSingle();

  if (!customer) return null;

  // Get recent sales
  const { data: sales } = await supabase
    .from('sales')
    .select('sale_number, sale_date, net_amount, payment_status')
    .eq('organization_id', organizationId)
    .eq('customer_id', customer.id)
    .is('deleted_at', null)
    .order('sale_date', { ascending: false })
    .limit(5);

  // Calculate outstanding
  const { data: balance } = await supabase
    .rpc('get_customer_balance', { p_customer_id: customer.id })
    .maybeSingle();

  return {
    ...customer,
    recent_sales: sales || [],
    outstanding_balance: balance?.balance || 0
  };
}

// Generate AI response
async function generateAIResponse(
  settings: any,
  customerMessage: string,
  conversationHistory: any[],
  customerInfo: any
) {
  const LOVABLE_API_KEY = Deno.env.get('LOVABLE_API_KEY');
  
  if (!LOVABLE_API_KEY) {
    console.error('LOVABLE_API_KEY not configured');
    return null;
  }

  // Build context about the customer
  let customerContext = '';
  if (customerInfo) {
    customerContext = `
Customer Information:
- Name: ${customerInfo.customer_name}
- Phone: ${customerInfo.phone}
- Outstanding Balance: ₹${customerInfo.outstanding_balance || 0}
- Points Balance: ${customerInfo.points_balance || 0}

Recent Invoices:
${customerInfo.recent_sales?.map((s: any) => 
  `- ${s.sale_number} (${s.sale_date}): ₹${s.net_amount} - ${s.payment_status}`
).join('\n') || 'No recent invoices'}
`;
  }

  // Build conversation history for context
  const historyMessages = conversationHistory.map(msg => ({
    role: msg.direction === 'inbound' ? 'user' : 'assistant',
    content: msg.message_text
  }));

  const systemPrompt = `${settings.chatbot_system_prompt || 'You are a helpful business assistant.'}

Business: ${settings.business_name || 'Our Business'}

${customerContext}

Guidelines:
- Keep responses under 500 characters for mobile readability
- Be helpful, friendly, and professional
- If asked about invoices/payments, reference the customer info above
- If asked to speak to a human, say you'll connect them with the team
- Format prices with ₹ symbol
- Use simple formatting suitable for WhatsApp`;

  try {
    const response = await fetch('https://ai.gateway.lovable.dev/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${LOVABLE_API_KEY}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        model: 'google/gemini-2.5-flash',
        messages: [
          { role: 'system', content: systemPrompt },
          ...historyMessages,
          { role: 'user', content: customerMessage }
        ],
        max_tokens: 200,
      }),
    });

    if (!response.ok) {
      console.error('AI API error:', response.status, await response.text());
      return null;
    }

    const data = await response.json();
    return data.choices?.[0]?.message?.content || null;
  } catch (error) {
    console.error('AI generation error:', error);
    return null;
  }
}

// ─── Owner Command Handler ─────────────────────────────────────────────────
async function handleOwnerCommand(
  supabase: any,
  settings: any,
  organizationId: string,
  senderPhone: string,
  messageText: string
): Promise<boolean> {
  const { data: orgSettings } = await supabase
    .from('settings')
    .select('owner_phone, business_name')
    .eq('organization_id', organizationId)
    .maybeSingle();

  if (!orgSettings?.owner_phone) return false;

  const normalizePhone = (p: string) => p?.replace(/\D/g, '').slice(-10) || '';
  const ownerPhoneNorm = normalizePhone(orgSettings.owner_phone);
  const senderNorm = normalizePhone(senderPhone);

  if (ownerPhoneNorm !== senderNorm) return false;

  const cmd = messageText.trim().toLowerCase();
  const businessName = orgSettings.business_name || 'Store';
  // Use IST (UTC+5:30) for date boundaries
  const nowUtc = new Date();
  const istOffsetMs = 5.5 * 60 * 60 * 1000;
  const nowIST = new Date(nowUtc.getTime() + istOffsetMs);
  const todayStr = nowIST.toISOString().split('T')[0]; // IST date as YYYY-MM-DD
  const todayDisplay = nowIST.toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' });
  // IST midnight in UTC = subtract 5:30
  const startOfDay = new Date(todayStr + 'T00:00:00+05:30').toISOString();
  const endOfDay = new Date(todayStr + 'T23:59:59.999+05:30').toISOString();
  const fmt = (n: number) => `₹${Math.round(n).toLocaleString('en-IN')}`;

  let replyMessage = '';

  try {
    if (['help', 'menu', 'commands', '?'].includes(cmd)) {
      replyMessage =
        `🏪 *${businessName} — Owner Commands*\n\n` +
        `📊 *report* or *hi* — Today's full tally\n` +
        `💰 *sales* — Today's sales summary\n` +
        `📦 *stock* — Low stock items\n` +
        `💳 *credit* — Outstanding credit sales\n` +
        `💸 *expenses* — Today's expenses\n` +
        `📈 *week* — Last 7 days summary\n` +
        `👥 *staff* — Sales by salesman today\n\n` +
        `Reply with any command above.`;

    } else if (['report', 'hi', 'hello', 'tally', 'summary', 'daily', 'cashier', ''].includes(cmd)) {
      const { data: sales } = await supabase
        .from('sales')
        .select('net_amount, paid_amount, payment_method, cash_amount, upi_amount, card_amount, is_cancelled, payment_status')
        .eq('organization_id', organizationId)
        .gte('created_at', startOfDay)
        .lte('created_at', endOfDay)
        .is('deleted_at', null)
        .neq('payment_status', 'hold');

      const activeSales = (sales || []).filter((s: any) => !s.is_cancelled);
      const totalSales = activeSales.reduce((sum: number, s: any) => sum + (s.net_amount || 0), 0);
      const totalCash = activeSales.reduce((sum: number, s: any) => sum + (s.cash_amount || 0), 0);
      const totalUpi = activeSales.reduce((sum: number, s: any) => sum + (s.upi_amount || 0), 0);
      const totalCard = activeSales.reduce((sum: number, s: any) => sum + (s.card_amount || 0), 0);
      const totalCredit = activeSales
        .filter((s: any) => s.payment_status === 'credit' || s.payment_status === 'partial')
        .reduce((sum: number, s: any) => sum + Math.max(0, (s.net_amount || 0) - (s.paid_amount || 0)), 0);
      const billCount = activeSales.length;

      const { data: expenses } = await supabase
        .from('voucher_entries')
        .select('total_amount')
        .eq('organization_id', organizationId)
        .eq('voucher_type', 'expense')
        .gte('created_at', startOfDay)
        .lte('created_at', endOfDay)
        .is('deleted_at', null);
      const totalExpenses = (expenses || []).reduce((sum: number, e: any) => sum + (e.total_amount || 0), 0);
      const cancelledToday = (sales || []).filter((s: any) => s.is_cancelled).length;

      replyMessage =
        `📊 *${businessName}*\n` +
        `📅 *${todayDisplay}*\n` +
        `━━━━━━━━━━━━━━━━\n\n` +
        `🧾 *Bills Today:* ${billCount}\n` +
        `💰 *Total Sales:* ${fmt(totalSales)}\n\n` +
        `*Payment Breakdown:*\n` +
        `  💵 Cash: ${fmt(totalCash)}\n` +
        `  📱 UPI: ${fmt(totalUpi)}\n` +
        `  💳 Card: ${fmt(totalCard)}\n` +
        (totalCredit > 0 ? `  📝 Credit Due: ${fmt(totalCredit)}\n` : '') +
        `\n💸 *Expenses:* ${fmt(totalExpenses)}\n` +
        `📊 *Net:* ${fmt(totalSales - totalExpenses)}\n` +
        (cancelledToday > 0 ? `\n⚠️ Cancelled Bills: ${cancelledToday}` : '') +
        `\n\nReply *help* for all commands`;

    } else if (['sales', 'sale', 'invoices'].includes(cmd)) {
      const { data: sales } = await supabase
        .from('sales')
        .select('sale_number, net_amount, customer_name, payment_method, created_at, is_cancelled, payment_status')
        .eq('organization_id', organizationId)
        .gte('created_at', startOfDay)
        .lte('created_at', endOfDay)
        .is('deleted_at', null)
        .neq('payment_status', 'hold')
        .order('created_at', { ascending: false })
        .limit(15);

      const activeSales = (sales || []).filter((s: any) => !s.is_cancelled);
      const totalSales = activeSales.reduce((sum: number, s: any) => sum + (s.net_amount || 0), 0);

      const salesLines = activeSales.slice(0, 10).map((s: any) => {
        const time = new Date(s.created_at).toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit' });
        return `${time} | ${s.sale_number} | ${s.customer_name?.slice(0, 12) || 'Walk-in'} | ${fmt(s.net_amount)}`;
      }).join('\n');

      replyMessage =
        `💰 *Sales Today — ${todayDisplay}*\n` +
        `━━━━━━━━━━━━━━━━\n` +
        `Total: ${fmt(totalSales)} (${activeSales.length} bills)\n\n` +
        (salesLines || 'No sales today') +
        (activeSales.length > 10 ? `\n...and ${activeSales.length - 10} more` : '');

    } else if (['stock', 'inventory', 'low stock'].includes(cmd)) {
      const { data: lowStock } = await supabase
        .from('product_variants')
        .select('barcode, size, color, stock_qty, products!inner(product_name)')
        .eq('organization_id', organizationId)
        .lte('stock_qty', 5)
        .gte('stock_qty', 0)
        .is('deleted_at', null)
        .order('stock_qty', { ascending: true })
        .limit(20);

      const stockLines = (lowStock || []).map((v: any) =>
        `${v.products?.product_name?.slice(0, 18)} | ${v.size} | Qty: ${v.stock_qty}`
      ).join('\n');

      replyMessage =
        `📦 *Low Stock Alert*\n` +
        `━━━━━━━━━━━━━━━━\n` +
        `Items with stock ≤ 5:\n\n` +
        (stockLines || '✅ No low stock items') +
        (lowStock && lowStock.length >= 20 ? '\n...and more' : '');

    } else if (['credit', 'outstanding', 'due', 'pending'].includes(cmd)) {
      const { data: creditSales } = await supabase
        .from('sales')
        .select('sale_number, customer_name, net_amount, paid_amount, sale_date')
        .eq('organization_id', organizationId)
        .in('payment_status', ['credit', 'partial'])
        .is('deleted_at', null)
        .is('is_cancelled', false)
        .order('sale_date', { ascending: false })
        .limit(15);

      const totalDue = (creditSales || []).reduce((sum: number, s: any) =>
        sum + Math.max(0, (s.net_amount || 0) - (s.paid_amount || 0)), 0);

      const creditLines = (creditSales || []).slice(0, 10).map((s: any) => {
        const due = Math.max(0, (s.net_amount || 0) - (s.paid_amount || 0));
        return `${s.sale_number} | ${s.customer_name?.slice(0, 12)} | Due: ${fmt(due)}`;
      }).join('\n');

      replyMessage =
        `💳 *Outstanding Credit*\n` +
        `━━━━━━━━━━━━━━━━\n` +
        `Total Due: ${fmt(totalDue)} (${creditSales?.length || 0} bills)\n\n` +
        (creditLines || '✅ No outstanding credit') +
        (creditSales && creditSales.length > 10 ? `\n...and ${creditSales.length - 10} more` : '');

    } else if (['expenses', 'expense', 'exp'].includes(cmd)) {
      const { data: expenses } = await supabase
        .from('voucher_entries')
        .select('total_amount, description, category, payment_method')
        .eq('organization_id', organizationId)
        .eq('voucher_type', 'expense')
        .gte('created_at', startOfDay)
        .lte('created_at', endOfDay)
        .is('deleted_at', null);

      const total = (expenses || []).reduce((sum: number, e: any) => sum + (e.total_amount || 0), 0);
      const expLines = (expenses || []).map((e: any) =>
        `${e.description?.slice(0, 20) || e.category || 'Expense'} | ${fmt(e.total_amount)}`
      ).join('\n');

      replyMessage =
        `💸 *Expenses Today*\n` +
        `━━━━━━━━━━━━━━━━\n` +
        `Total: ${fmt(total)}\n\n` +
        (expLines || '✅ No expenses today');

    } else if (['week', 'weekly', '7 days'].includes(cmd)) {
      const weekAgo = new Date(nowIST);
      weekAgo.setDate(weekAgo.getDate() - 6);
      const weekAgoIST = weekAgo.toISOString().split('T')[0];
      const weekAgoStr = new Date(weekAgoIST + 'T00:00:00+05:30').toISOString();

      const { data: weekSales } = await supabase
        .from('sales')
        .select('net_amount, sale_date, created_at, is_cancelled, payment_status')
        .eq('organization_id', organizationId)
        .gte('created_at', weekAgoStr)
        .is('deleted_at', null)
        .neq('payment_status', 'hold');

      const activeSales = (weekSales || []).filter((s: any) => !s.is_cancelled);
      const weekTotal = activeSales.reduce((sum: number, s: any) => sum + (s.net_amount || 0), 0);
      const avgPerDay = weekTotal / 7;

      const byDate: Record<string, number> = {};
      activeSales.forEach((s: any) => {
        const d = s.sale_date || s.created_at?.split('T')[0];
        byDate[d] = (byDate[d] || 0) + (s.net_amount || 0);
      });

      const dayLines = Object.entries(byDate)
        .sort(([a], [b]) => b.localeCompare(a))
        .slice(0, 7)
        .map(([date, amt]) => {
          const d = new Date(date).toLocaleDateString('en-IN', { weekday: 'short', day: '2-digit', month: 'short' });
          return `${d}: ${fmt(amt as number)}`;
        }).join('\n');

      replyMessage =
        `📈 *Last 7 Days*\n` +
        `━━━━━━━━━━━━━━━━\n` +
        `Total: ${fmt(weekTotal)}\n` +
        `Daily Avg: ${fmt(avgPerDay)}\n` +
        `Bills: ${activeSales.length}\n\n` +
        (dayLines || 'No data');

    } else if (['staff', 'salesman', 'team'].includes(cmd)) {
      const { data: sales } = await supabase
        .from('sales')
        .select('salesman, net_amount, is_cancelled')
        .eq('organization_id', organizationId)
        .gte('created_at', startOfDay)
        .lte('created_at', endOfDay)
        .is('deleted_at', null);

      const activeSales = (sales || []).filter((s: any) => !s.is_cancelled);
      const byStaff: Record<string, { total: number; count: number }> = {};
      activeSales.forEach((s: any) => {
        const name = s.salesman || 'Unassigned';
        if (!byStaff[name]) byStaff[name] = { total: 0, count: 0 };
        byStaff[name].total += s.net_amount || 0;
        byStaff[name].count++;
      });

      const staffLines = Object.entries(byStaff)
        .sort(([, a], [, b]) => (b as any).total - (a as any).total)
        .map(([name, data]) => `${name}: ${fmt((data as any).total)} (${(data as any).count} bills)`)
        .join('\n');

      replyMessage =
        `👥 *Staff Performance — ${todayDisplay}*\n` +
        `━━━━━━━━━━━━━━━━\n` +
        (staffLines || '✅ No sales assigned to staff today');

    } else {
      replyMessage =
        `👋 Hello Owner!\n\n` +
        `I didn't understand "*${messageText}*"\n\n` +
        `Reply *help* to see all available commands.\n\n` +
        `Quick commands: *report*, *sales*, *stock*, *credit*, *expenses*, *week*, *staff*`;
    }

    if (replyMessage) {
      await sendWhatsAppMessage(settings, senderPhone, replyMessage);
      console.log(`Owner command "${cmd}" handled for org ${organizationId}`);
    }
  } catch (err) {
    console.error('Owner command error:', err);
    await sendWhatsAppMessage(settings, senderPhone, '⚠️ Error fetching report. Please try again.');
  }

  return true;
}

// Send WhatsApp message
async function sendWhatsAppMessage(
  settings: any,
  recipientPhone: string,
  message: string
) {
  const baseUrl = settings.custom_api_url || 'https://graph.facebook.com';
  const version = settings.api_version || 'v21.0';
  const url = `${baseUrl}/${version}/${settings.phone_number_id}/messages`;
  
  try {
    const response = await fetch(url, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${settings.access_token}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        messaging_product: 'whatsapp',
        recipient_type: 'individual',
        to: recipientPhone,
        type: 'text',
        text: { body: message }
      }),
    });

    const data = await response.json();
    
    if (!response.ok) {
      console.error('WhatsApp send error:', data);
      return null;
    }

    return data.messages?.[0]?.id || null;
  } catch (error) {
    console.error('WhatsApp send error:', error);
    return null;
  }
}

// Send WhatsApp document (PDF) - only works within the 24-hour customer service window
async function sendWhatsAppDocument(
  settings: any,
  recipientPhone: string,
  documentUrl: string,
  filename: string,
  caption?: string
) {
  const baseUrl = settings.custom_api_url || 'https://graph.facebook.com';
  const version = settings.api_version || 'v21.0';
  const url = `${baseUrl}/${version}/${settings.phone_number_id}/messages`;

  try {
    const response = await fetch(url, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${settings.access_token}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        messaging_product: 'whatsapp',
        recipient_type: 'individual',
        to: recipientPhone,
        type: 'document',
        document: {
          link: documentUrl,
          filename: filename || 'Invoice.pdf',
          caption: caption || '',
        },
      }),
    });

    const data = await response.json();
    if (!response.ok) {
      console.error('WhatsApp document send error:', data);
      return { wamid: null, error: data?.error || data };
    }

    return { wamid: data?.messages?.[0]?.id || null, error: null };
  } catch (error) {
    console.error('WhatsApp document send error:', error);
    return { wamid: null, error };
  }
}

// Check if message contains handoff keywords
function shouldHandoff(message: string, keywords: string[]): boolean {
  const lowerMessage = message.toLowerCase();
  return keywords.some(keyword => lowerMessage.includes(keyword.toLowerCase()));
}

// Check if within business hours
function isWithinBusinessHours(settings: any): boolean {
  if (!settings.business_hours_enabled) return true;
  
  const now = new Date();
  const currentTime = now.toLocaleTimeString('en-US', { 
    hour12: false, 
    timeZone: 'Asia/Kolkata' 
  });
  
  const start = settings.business_hours_start || '09:00';
  const end = settings.business_hours_end || '18:00';
  
  return currentTime >= start && currentTime <= end;
}

Deno.serve(async (req) => {
  // Handle CORS preflight
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  const url = new URL(req.url);

  // Webhook verification (GET request)
  if (req.method === 'GET') {
    const mode = url.searchParams.get('hub.mode');
    const token = url.searchParams.get('hub.verify_token');
    const challenge = url.searchParams.get('hub.challenge');

    // Meta-style verification: hub.mode=subscribe + hub.verify_token
    if (mode && token) {
      const verifyToken = Deno.env.get('WHATSAPP_VERIFY_TOKEN') || 'lovable_whatsapp_webhook';
      if (mode === 'subscribe' && token === verifyToken) {
        console.log('Webhook verified successfully (Meta)');
        return new Response(challenge, { status: 200 });
      } else {
        console.error('Webhook verification failed (Meta)');
        return new Response('Forbidden', { status: 403 });
      }
    }

    // Third-party provider verification (WappConnect etc.) — echo challenge token
    const thirdPartyChallenge = url.searchParams.get('challenge') 
      || url.searchParams.get('challange')  // WappConnect misspelling
      || url.searchParams.get('verify_token')
      || url.searchParams.get('hub.challenge')
      || url.searchParams.get('token');
    
    console.log('Webhook verification accepted (third-party provider)', 
      { params: Object.fromEntries(url.searchParams) });

    return new Response(thirdPartyChallenge || 'OK', { 
      status: 200,
      headers: { ...corsHeaders, 'Content-Type': 'text/plain' },
    });
  }

  // Handle webhook events (POST request)
  if (req.method === 'POST') {
    try {
      const rawBody = await req.text();

      // Handle third-party POST-based challenge verification
      try {
        const parsed = JSON.parse(rawBody);
        if (parsed.challenge || parsed.verify || parsed.hub?.challenge) {
          console.log('POST challenge verification accepted (third-party provider)');
          const echoChallenge = parsed.challenge || parsed.hub?.challenge || 'accepted';
          return new Response(String(echoChallenge), {
            status: 200,
            headers: { ...corsHeaders, 'Content-Type': 'text/plain' },
          });
        }
      } catch (_) {
        // Not JSON or no challenge field — continue normal processing
      }

      // Validate Meta webhook signature
      const appSecret = Deno.env.get('META_APP_SECRET');
      if (appSecret) {
        const signature = req.headers.get('x-hub-signature-256');
        if (!signature) {
          console.error('Missing x-hub-signature-256 header');
          return new Response('Unauthorized', { status: 401 });
        }

        const encoder = new TextEncoder();
        const key = await crypto.subtle.importKey(
          'raw',
          encoder.encode(appSecret),
          { name: 'HMAC', hash: 'SHA-256' },
          false,
          ['sign']
        );
        const sig = await crypto.subtle.sign('HMAC', key, encoder.encode(rawBody));
        const expectedSig = 'sha256=' + Array.from(new Uint8Array(sig))
          .map(b => b.toString(16).padStart(2, '0'))
          .join('');

        if (signature !== expectedSig) {
          console.error('Invalid webhook signature');
          return new Response('Unauthorized', { status: 401 });
        }
      } else {
        console.warn('META_APP_SECRET not configured - skipping webhook signature validation');
      }

      const body = JSON.parse(rawBody);
      console.log('Webhook received:', JSON.stringify(body, null, 2));

      const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
      const supabaseKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
      const supabase = createClient(supabaseUrl, supabaseKey);

      // ─── Provider acknowledgment payload (wappconnect / third-party) ──────
      // Format: { messaging_channel: "whatsapp", message: { queue_id, message_status }, response: { messages: [{ id: "wamid.HBgM..." }] } }
      // We stored queue_id as the initial `wamid`. When the provider returns the real Meta wamid,
      // upgrade our row so subsequent sent/delivered/read updates (which use the real wamid) match.
      if (body.messaging_channel === 'whatsapp' && body.message?.queue_id && body.response?.messages?.[0]?.id) {
        const queueId = body.message.queue_id;
        const realWamid = body.response.messages[0].id;
        const providerStatus = body.message.message_status || 'sent';

        try {
          const { data: existing } = await supabase
            .from('whatsapp_logs')
            .select('id, status')
            .eq('wamid', queueId)
            .maybeSingle();

          if (existing) {
            const updatePayload: Record<string, any> = {
              wamid: realWamid,
            };
            // Only upgrade status forward (sent < delivered < read)
            const rank: Record<string, number> = { failed: -1, queued: 0, sent: 1, delivered: 2, read: 3 };
            const currentRank = rank[existing.status] ?? 0;
            const incomingRank = rank[providerStatus] ?? 1;
            if (incomingRank > currentRank) {
              updatePayload.status = providerStatus === 'queued' ? 'sent' : providerStatus;
              if (!('sent_at' in updatePayload)) updatePayload.sent_at = new Date().toISOString();
            }

            const { error: upgradeError } = await supabase
              .from('whatsapp_logs')
              .update(updatePayload)
              .eq('id', existing.id);

            if (upgradeError) {
              console.error('Error upgrading queue_id to wamid:', upgradeError);
            } else {
              console.log(`Upgraded queue_id ${queueId} -> wamid ${realWamid}`);
            }

            // Mirror upgrade to whatsapp_messages
            await supabase
              .from('whatsapp_messages')
              .update({ wamid: realWamid })
              .eq('wamid', queueId);
          } else {
            console.log(`No log found for queue_id ${queueId} - cannot upgrade wamid`);
          }
        } catch (e) {
          console.error('Provider ack handling error:', e);
        }

        return new Response(JSON.stringify({ success: true }), {
          status: 200,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        });
      }

      // Process webhook entries
      if (body.entry) {
        for (const entry of body.entry) {
          if (entry.changes) {
            for (const change of entry.changes) {
              const phoneNumberId = change.value?.metadata?.phone_number_id;
              
              // Process status updates
              if (change.value && change.value.statuses) {
                for (const status of change.value.statuses) {
                  const wamid = status.id;
                  const newStatus = status.status; // sent, delivered, read, failed
                  const timestamp = status.timestamp ? new Date(parseInt(status.timestamp) * 1000).toISOString() : new Date().toISOString();

                  console.log(`Status update: ${wamid} -> ${newStatus} at ${timestamp}`);

                  // Find and update the log entry by wamid
                  const updateData: Record<string, any> = {
                    status: newStatus,
                  };

                  if (newStatus === 'delivered') {
                    updateData.delivered_at = timestamp;
                  } else if (newStatus === 'read') {
                    updateData.read_at = timestamp;
                    updateData.delivered_at = timestamp;
                  } else if (newStatus === 'failed') {
                    updateData.error_message = status.errors?.[0]?.message || 'Message delivery failed';
                  }

                  // Update whatsapp_logs
                  const { error: logError } = await supabase
                    .from('whatsapp_logs')
                    .update(updateData)
                    .eq('wamid', wamid);

                  if (logError) {
                    console.error('Error updating whatsapp_logs:', logError);
                  }

                  // Update whatsapp_messages if exists
                  const { error: msgError } = await supabase
                    .from('whatsapp_messages')
                    .update(updateData)
                    .eq('wamid', wamid);

                  if (msgError) {
                    console.error('Error updating whatsapp_messages:', msgError);
                  }

                  console.log(`Updated status for wamid: ${wamid} to: ${newStatus}`);
                }
              }

              // Process incoming messages
              if (change.value && change.value.messages) {
                console.log('Processing incoming messages:', change.value.messages);
                
                // Find organization settings by phone_number_id
                let settings = await findOrganizationByPhoneId(supabase, phoneNumberId);
                
                // Get customer phone from first message for routing
                const firstMessage = change.value.messages[0];
                const senderPhone = firstMessage?.from;
                
                // If multiple orgs share this phone number, route by customer phone
                if (settings?.is_shared_number) {
                  console.log('Multiple orgs share this phone number, routing by customer phone...');
                  
                  if (senderPhone) {
                    const routedSettings = await findOrganizationByCustomerPhone(supabase, senderPhone);
                    if (routedSettings) {
                      console.log('Routed to organization:', routedSettings.organization_id);
                      settings = routedSettings;
                    } else {
                      // If no previous interaction, use the first org in the list
                      console.log('No previous org found for customer, using first org with this phone number');
                      settings = settings.settings_list[0];
                    }
                  } else {
                    // Fallback to first org
                    settings = settings.settings_list[0];
                  }
                }
                
                // If this is the platform default number, we need special routing
                if (settings?.is_platform_default) {
                  console.log('Incoming message on shared platform number, routing by customer phone...');
                  
                  if (senderPhone) {
                    const routedSettings = await findOrganizationByCustomerPhone(supabase, senderPhone);
                    if (routedSettings) {
                      console.log('Routed to organization:', routedSettings.organization_id);
                      // Merge platform credentials with org settings
                      settings = {
                        ...routedSettings,
                        phone_number_id: settings.phone_number_id,
                        access_token: settings.access_token,
                        waba_id: settings.waba_id,
                      };
                    } else {
                      console.error('Could not route message - no organization found for customer:', senderPhone);
                      continue;
                    }
                  }
                }
                
                if (!settings || !settings.organization_id) {
                  console.error('Settings not found for phone_number_id:', phoneNumberId);
                  continue;
                }

                const organizationId = settings.organization_id;

                for (const message of change.value.messages) {
                  const senderPhone = message.from;
                  const messageType = message.type;
                  const wamid = message.id;
                  const timestamp = message.timestamp ? new Date(parseInt(message.timestamp) * 1000).toISOString() : new Date().toISOString();
                  
                  // Get message text based on type
                  let messageText = '';
                  if (messageType === 'text') {
                    messageText = message.text?.body || '';
                  } else if (messageType === 'button') {
                    messageText = message.button?.text || '';
                  } else if (messageType === 'interactive') {
                    messageText = message.interactive?.button_reply?.title || message.interactive?.list_reply?.title || '';
                  } else {
                    messageText = `[${messageType}]`;
                  }

                  // Get contact name if available
                  const contactName = change.value.contacts?.[0]?.profile?.name;

                  console.log(`Incoming message from ${senderPhone}: ${messageText}`);

                  // Get or create conversation
                  const conversation = await getOrCreateConversation(
                    supabase,
                    organizationId,
                    senderPhone,
                    contactName
                  );

                  // Insert the message
                  const { error: insertError } = await supabase
                    .from('whatsapp_messages')
                    .insert({
                      organization_id: organizationId,
                      conversation_id: conversation.id,
                      wamid: wamid,
                      direction: 'inbound',
                      message_type: messageType,
                      message_text: messageText,
                      status: 'received',
                      sent_at: timestamp,
                    });

                  if (insertError) {
                    console.error('Error inserting message:', insertError);
                  } else {
                    console.log('Message inserted successfully');
                  }

                  // Update conversation
                  const { error: updateError } = await supabase
                    .from('whatsapp_conversations')
                    .update({
                      last_message_at: timestamp,
                      unread_count: conversation.unread_count + 1,
                      customer_name: contactName || conversation.customer_name,
                    })
                    .eq('id', conversation.id);

                  if (updateError) {
                    console.error('Error updating conversation:', updateError);
                  }

                  // Check if this is a button click from a template CTA - 24-hour window now open!
                  if (settings.send_followup_on_button_click) {
                    const buttonText = message.button?.text || 
                                       message.interactive?.button_reply?.title ||
                                       message.interactive?.list_reply?.title || '';
                    const buttonId = message.interactive?.button_reply?.id ||
                                     message.interactive?.list_reply?.id || '';
                    
                    console.log(`User interaction: "${buttonText}" (ID: ${buttonId}) from ${senderPhone}`);
                    
                    const cleanPhone = senderPhone.replace(/\D/g, '').slice(-10);
                    
                    // Check if this is a "Feedback" FLOW button click - auto-send invoice link after
                    const isFeedbackButton = buttonText.toLowerCase().includes('feedback') || 
                                             buttonId.toLowerCase().includes('feedback');
                    
                    if (isFeedbackButton && messageType === 'button') {
                      console.log('Feedback button clicked, auto-sending invoice link...');
                      
                      // Get pending followup data
                      const { data: pendingLogs } = await supabase
                        .from('whatsapp_logs')
                        .select('*')
                        .eq('organization_id', organizationId)
                        .ilike('phone_number', `%${cleanPhone}%`)
                        .eq('pending_followup', true)
                        .order('created_at', { ascending: false })
                        .limit(1);
                      
                        if (pendingLogs && pendingLogs.length > 0) {
                        const log = pendingLogs[0];
                        const followupData = log.followup_data as Record<string, string> | null;
                        
                        if (followupData && followupData.invoice_link) {
                            // If a PDF is queued, send it first (button click opens the 24h window)
                            const docUrl = String(followupData.document_url || '').trim();
                            if (docUrl) {
                              const { wamid: docWamid, error: docErr } = await sendWhatsAppDocument(
                                settings,
                                senderPhone,
                                docUrl,
                                String(followupData.document_filename || 'Invoice.pdf'),
                                String(followupData.document_caption || '')
                              );

                              if (docWamid) {
                                await supabase.from('whatsapp_messages').insert({
                                  organization_id: organizationId,
                                  conversation_id: conversation.id,
                                  wamid: docWamid,
                                  direction: 'outbound',
                                  message_type: 'document',
                                  media_url: docUrl,
                                  message_text: `PDF Document: ${String(followupData.document_filename || 'Invoice.pdf')}`,
                                  status: 'sent',
                                  sent_at: new Date().toISOString(),
                                });
                                await supabase.from('whatsapp_logs').insert({
                                  organization_id: organizationId,
                                  phone_number: senderPhone,
                                  message: `PDF Document: ${String(followupData.document_filename || 'Invoice.pdf')}`,
                                  template_type: 'document_attachment',
                                  status: 'sent',
                                  wamid: docWamid,
                                  sent_at: new Date().toISOString(),
                                });

                                // Clear the doc so we don't resend it on future clicks
                                await supabase
                                  .from('whatsapp_logs')
                                  .update({
                                    followup_data: {
                                      ...followupData,
                                      document_url: '',
                                      document_filename: '',
                                      document_caption: '',
                                    },
                                  })
                                  .eq('id', log.id);
                              } else {
                                console.log('Queued PDF send failed after feedback click:', docErr);
                              }
                            }

                          const invoiceMessage = (settings.followup_invoice_message || '📄 Thank you for your feedback! 🙏\n\nHere is your invoice link:\n{invoice_link}\n\nInvoice No: {sale_number}\nWe appreciate your business! 💫')
                            .replace('{invoice_link}', followupData.invoice_link || '')
                            .replace('{sale_number}', followupData.sale_number || '')
                            .replace('{customer_name}', followupData.customer_name || '');
                          
                          const wamidReply = await sendWhatsAppMessage(settings, senderPhone, invoiceMessage);
                          
                          if (wamidReply) {
                            await supabase.from('whatsapp_messages').insert({
                              organization_id: organizationId,
                              conversation_id: conversation.id,
                              wamid: wamidReply,
                              direction: 'outbound',
                              message_type: 'text',
                              message_text: invoiceMessage,
                              status: 'sent',
                              sent_at: new Date().toISOString(),
                            });
                            console.log('Auto-sent invoice link after feedback button click');
                            
                            // Mark followup as completed
                            await supabase
                              .from('whatsapp_logs')
                              .update({ pending_followup: false })
                              .eq('id', log.id);
                          }
                        }
                      }
                      continue; // Skip further processing for feedback button
                    }
                    
                    // Check if this is "Order Details" button click - send invoice link + Google review
                    const isOrderDetailsButton = buttonText.toLowerCase().includes('order details') || 
                                                 buttonId.toLowerCase().includes('order_details') ||
                                                 buttonId.toLowerCase().includes('order-details');
                    
                    if (isOrderDetailsButton && messageType === 'button') {
                      console.log('Order Details button clicked, auto-sending invoice link + review request...');
                      
                      // Get pending followup data
                      const { data: pendingLogs } = await supabase
                        .from('whatsapp_logs')
                        .select('*')
                        .eq('organization_id', organizationId)
                        .ilike('phone_number', `%${cleanPhone}%`)
                        .eq('pending_followup', true)
                        .order('created_at', { ascending: false })
                        .limit(1);
                      
                        if (pendingLogs && pendingLogs.length > 0) {
                        const log = pendingLogs[0];
                        const followupData = log.followup_data as Record<string, string> | null;
                        
                        if (followupData && followupData.invoice_link) {
                            // If a PDF is queued, send it first (button click opens the 24h window)
                            const docUrl = String(followupData.document_url || '').trim();
                            if (docUrl) {
                              const { wamid: docWamid, error: docErr } = await sendWhatsAppDocument(
                                settings,
                                senderPhone,
                                docUrl,
                                String(followupData.document_filename || 'Invoice.pdf'),
                                String(followupData.document_caption || '')
                              );

                              if (docWamid) {
                                await supabase.from('whatsapp_messages').insert({
                                  organization_id: organizationId,
                                  conversation_id: conversation.id,
                                  wamid: docWamid,
                                  direction: 'outbound',
                                  message_type: 'document',
                                  media_url: docUrl,
                                  message_text: `PDF Document: ${String(followupData.document_filename || 'Invoice.pdf')}`,
                                  status: 'sent',
                                  sent_at: new Date().toISOString(),
                                });
                                await supabase.from('whatsapp_logs').insert({
                                  organization_id: organizationId,
                                  phone_number: senderPhone,
                                  message: `PDF Document: ${String(followupData.document_filename || 'Invoice.pdf')}`,
                                  template_type: 'document_attachment',
                                  status: 'sent',
                                  wamid: docWamid,
                                  sent_at: new Date().toISOString(),
                                });

                                // Clear the doc so we don't resend it on future clicks
                                await supabase
                                  .from('whatsapp_logs')
                                  .update({
                                    followup_data: {
                                      ...followupData,
                                      document_url: '',
                                      document_filename: '',
                                      document_caption: '',
                                    },
                                  })
                                  .eq('id', log.id);
                              } else {
                                console.log('Queued PDF send failed after Order Details click:', docErr);
                              }
                            }

                          // Step 1: Send Invoice Link
                          const invoiceMessage = (settings.followup_invoice_message || '📄 Here is your invoice link:\n{invoice_link}\n\nInvoice No: {sale_number}\nThank you for your business!')
                            .replace('{invoice_link}', followupData.invoice_link || '')
                            .replace('{sale_number}', followupData.sale_number || '')
                            .replace('{customer_name}', followupData.customer_name || '');
                          
                          const wamidInvoice = await sendWhatsAppMessage(settings, senderPhone, invoiceMessage);
                          
                          if (wamidInvoice) {
                            await supabase.from('whatsapp_messages').insert({
                              organization_id: organizationId,
                              conversation_id: conversation.id,
                              wamid: wamidInvoice,
                              direction: 'outbound',
                              message_type: 'text',
                              message_text: invoiceMessage,
                              status: 'sent',
                              sent_at: new Date().toISOString(),
                            });
                            console.log('Invoice link sent successfully after Order Details click');
                            
                            // Step 2: Send Google Review Request
                            const googleReviewLink = followupData.google_review || settings.social_links?.google_review || '';
                            
                            if (googleReviewLink) {
                              const reviewMessage = (settings.followup_review_message || '⭐ We hope you loved your purchase!\n\nPlease take a moment to rate us on Google:\n{google_review}\n\nYour feedback helps us serve you better! 🙏')
                                .replace('{google_review}', googleReviewLink);
                              
                              const wamidReview = await sendWhatsAppMessage(settings, senderPhone, reviewMessage);
                              
                              if (wamidReview) {
                                await supabase.from('whatsapp_messages').insert({
                                  organization_id: organizationId,
                                  conversation_id: conversation.id,
                                  wamid: wamidReview,
                                  direction: 'outbound',
                                  message_type: 'text',
                                  message_text: reviewMessage,
                                  status: 'sent',
                                  sent_at: new Date().toISOString(),
                                });
                                console.log('Google review request sent successfully');
                              }
                            } else {
                              console.log('No Google Review link configured, skipping review request');
                            }
                            
                            // Mark followup as completed
                            await supabase
                              .from('whatsapp_logs')
                              .update({ pending_followup: false })
                              .eq('id', log.id);
                          }
                        }
                      }
                      continue; // Skip further processing for Order Details button
                    }
                    
                    // Check if user selected one of our quick reply options
                    if (buttonId === 'invoice_link' || buttonId === 'social_media' || 
                        buttonId === 'google_review' || buttonId === 'chat_with_us') {
                      
                      // Get pending followup data
                      const { data: pendingLogs } = await supabase
                        .from('whatsapp_logs')
                        .select('*')
                        .eq('organization_id', organizationId)
                        .ilike('phone_number', `%${cleanPhone}%`)
                        .eq('pending_followup', true)
                        .order('created_at', { ascending: false })
                        .limit(1);
                      
                      if (pendingLogs && pendingLogs.length > 0) {
                        const log = pendingLogs[0];
                        const followupData = log.followup_data as Record<string, string> | null;
                        
                        if (followupData) {
                          let responseMessage = '';
                          
                          if (buttonId === 'invoice_link') {
                            responseMessage = (settings.followup_invoice_message || '📄 Here is your invoice link:\n{invoice_link}\n\nInvoice No: {sale_number}\nThank you for your business!')
                              .replace('{invoice_link}', followupData.invoice_link || '')
                              .replace('{sale_number}', followupData.sale_number || '')
                              .replace('{customer_name}', followupData.customer_name || '');
                          } else if (buttonId === 'social_media') {
                            responseMessage = (settings.followup_social_message || '📱 Connect with us on social media:\n\n🌐 Website: {website}\n📷 Instagram: {instagram}\n📘 Facebook: {facebook}')
                              .replace('{website}', followupData.website || '')
                              .replace('{instagram}', followupData.instagram || '')
                              .replace('{facebook}', followupData.facebook || '');
                          } else if (buttonId === 'google_review') {
                            responseMessage = (settings.followup_review_message || '⭐ We would love your feedback!\n\nPlease take a moment to rate us:\n{google_review}')
                              .replace('{google_review}', followupData.google_review || '');
                          } else if (buttonId === 'chat_with_us') {
                            const whatsappLink = `https://wa.me/${settings.phone_number_id?.replace(/\D/g, '')}`;
                            responseMessage = (settings.followup_chat_message || '💬 Chat with us directly!\n\nClick here to start a conversation:\n{whatsapp_link}')
                              .replace('{whatsapp_link}', followupData.whatsapp_link || whatsappLink);
                          }
                          
                          // Remove empty placeholder lines
                          responseMessage = responseMessage
                            .split('\n')
                            .filter(line => !line.includes('{') || line.trim() === '')
                            .join('\n')
                            .replace(/\n{3,}/g, '\n\n');
                          
                          if (responseMessage.trim()) {
                            const wamidReply = await sendWhatsAppMessage(settings, senderPhone, responseMessage);
                            
                            if (wamidReply) {
                              await supabase.from('whatsapp_messages').insert({
                                organization_id: organizationId,
                                conversation_id: conversation.id,
                                wamid: wamidReply,
                                direction: 'outbound',
                                message_type: 'text',
                                message_text: responseMessage,
                                status: 'sent',
                                sent_at: new Date().toISOString(),
                              });
                              console.log(`Sent ${buttonId} response to customer`);
                            }
                          }
                        }
                      }
                      continue; // Skip AI chatbot for menu selections
                    }
                    
                    // Check if this is a button click from template CTA (Invoice Details, Chat With Us, etc.)
                    if (messageType === 'button' || 
                        (messageType === 'interactive' && message.interactive?.type === 'button_reply' && 
                         !['invoice_link', 'social_media', 'google_review', 'chat_with_us'].includes(buttonId))) {
                      
                      // Check for pending follow-ups for this customer
                      const { data: pendingLogs } = await supabase
                        .from('whatsapp_logs')
                        .select('*')
                        .eq('organization_id', organizationId)
                        .ilike('phone_number', `%${cleanPhone}%`)
                        .eq('pending_followup', true)
                        .order('created_at', { ascending: false })
                        .limit(1);
                      
                      if (pendingLogs && pendingLogs.length > 0) {
                        const log = pendingLogs[0];
                        const followupData = log.followup_data as Record<string, string> | null;
                        
                        if (followupData) {
                          // Send interactive button menu asking what customer needs
                          const menuMessage = settings.followup_menu_message || 'Thank you for your interest! 🙏\n\nPlease select what you need:';
                          
                          const interactivePayload = {
                            messaging_product: 'whatsapp',
                            recipient_type: 'individual',
                            to: senderPhone,
                            type: 'interactive',
                            interactive: {
                              type: 'button',
                              body: {
                                text: menuMessage
                              },
                              action: {
                                buttons: [
                                  { type: 'reply', reply: { id: 'invoice_link', title: '📄 Invoice Link' } },
                                  { type: 'reply', reply: { id: 'social_media', title: '📱 Social Media' } },
                                  { type: 'reply', reply: { id: 'google_review', title: '⭐ Google Review' } }
                                ]
                              }
                            }
                          };
                          
                          // WhatsApp allows max 3 buttons, so we send chat option as text
                          try {
                            const menuBaseUrl = settings.custom_api_url || 'https://graph.facebook.com';
                            const menuVersion = settings.api_version || 'v21.0';
                            const menuResponse = await fetch(
                              `${menuBaseUrl}/${menuVersion}/${settings.phone_number_id}/messages`,
                              {
                                method: 'POST',
                                headers: {
                                  'Authorization': `Bearer ${settings.access_token}`,
                                  'Content-Type': 'application/json',
                                },
                                body: JSON.stringify(interactivePayload),
                              }
                            );
                            
                            if (menuResponse.ok) {
                              const menuResult = await menuResponse.json();
                              const menuWamid = menuResult.messages?.[0]?.id;
                              
                              if (menuWamid) {
                                await supabase.from('whatsapp_messages').insert({
                                  organization_id: organizationId,
                                  conversation_id: conversation.id,
                                  wamid: menuWamid,
                                  direction: 'outbound',
                                  message_type: 'interactive',
                                  message_text: menuMessage,
                                  status: 'sent',
                                  sent_at: new Date().toISOString(),
                                });
                                
                                // Also send "Chat with us" as a separate text with link
                                const whatsappLink = `https://wa.me/${settings.phone_number_id?.replace(/\D/g, '')}`;
                                const chatOption = `\n💬 Or chat with us directly: ${whatsappLink}`;
                                await sendWhatsAppMessage(settings, senderPhone, chatOption);
                                
                                console.log('Sent interactive menu after button click!');
                              }
                            } else {
                              console.error('Failed to send interactive menu:', await menuResponse.text());
                            }
                          } catch (err) {
                            console.error('Error sending interactive menu:', err);
                          }
                        }
                      }
                    }
                  }

                  // ─── Owner Command Handler (runs before chatbot) ──────────────
                  const isOwnerMessage = await handleOwnerCommand(
                    supabase,
                    settings,
                    organizationId,
                    senderPhone,
                    messageText
                  );

                  if (isOwnerMessage) {
                    continue; // Owner command handled — skip chatbot and customer flows
                  }
                  // ─── End Owner Command Handler ─────────────────────────────────

                  // AI Chatbot Response
                  if (settings.chatbot_enabled && settings.is_active && messageText) {
                    console.log('AI Chatbot is enabled, generating response...');

                    // Check handoff keywords
                    const handoffKeywords = settings.handoff_keywords || ['human', 'agent', 'support'];
                    if (shouldHandoff(messageText, handoffKeywords)) {
                      const handoffMessage = "I'll connect you with our team. Someone will respond shortly. Thank you for your patience! 🙏";
                      const wamidReply = await sendWhatsAppMessage(settings, senderPhone, handoffMessage);
                      
                      if (wamidReply) {
                        await supabase.from('whatsapp_messages').insert({
                          organization_id: organizationId,
                          conversation_id: conversation.id,
                          wamid: wamidReply,
                          direction: 'outbound',
                          message_type: 'text',
                          message_text: handoffMessage,
                          status: 'sent',
                          sent_at: new Date().toISOString(),
                        });
                      }
                      continue;
                    }

                    // Check business hours
                    if (!isWithinBusinessHours(settings)) {
                      const outsideHoursMsg = settings.outside_hours_message || 
                        "Thank you for your message. Our business hours are 9 AM to 6 PM. We will respond during business hours.";
                      const wamidReply = await sendWhatsAppMessage(settings, senderPhone, outsideHoursMsg);
                      
                      if (wamidReply) {
                        await supabase.from('whatsapp_messages').insert({
                          organization_id: organizationId,
                          conversation_id: conversation.id,
                          wamid: wamidReply,
                          direction: 'outbound',
                          message_type: 'text',
                          message_text: outsideHoursMsg,
                          status: 'sent',
                          sent_at: new Date().toISOString(),
                        });
                      }
                      continue;
                    }

                    // Get conversation history
                    const history = await getConversationHistory(supabase, conversation.id, 10);
                    
                    // Get customer info
                    const customerInfo = await getCustomerInfo(supabase, organizationId, senderPhone);
                    
                    // Generate AI response
                    const aiResponse = await generateAIResponse(
                      settings,
                      messageText,
                      history,
                      customerInfo
                    );

                    if (aiResponse) {
                      console.log('AI Response:', aiResponse);
                      
                      // Send the AI response
                      const wamidReply = await sendWhatsAppMessage(settings, senderPhone, aiResponse);
                      
                      if (wamidReply) {
                        // Save the outbound message
                        await supabase.from('whatsapp_messages').insert({
                          organization_id: organizationId,
                          conversation_id: conversation.id,
                          wamid: wamidReply,
                          direction: 'outbound',
                          message_type: 'text',
                          message_text: aiResponse,
                          status: 'sent',
                          sent_at: new Date().toISOString(),
                        });
                        
                        console.log('AI response sent successfully');
                      }
                    } else {
                      console.log('No AI response generated');
                    }
                  }
                }
              }
            }
          }
        }
      }

      return new Response(JSON.stringify({ success: true }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        status: 200,
      });
    } catch (error: unknown) {
      console.error('Webhook processing error:', error);
      const errorMessage = error instanceof Error ? error.message : 'Unknown error';
      return new Response(JSON.stringify({ error: errorMessage }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        status: 500,
      });
    }
  }

  return new Response('Method not allowed', { status: 405 });
});
