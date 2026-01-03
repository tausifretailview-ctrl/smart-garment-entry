import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

type QueryIntent = "stock" | "sales" | "purchase" | "customer" | "support" | "general";

const detectIntent = (query: string): QueryIntent => {
  const lowerQuery = query.toLowerCase();
  
  const stockKeywords = ["stock", "inventory", "barcode", "available", "quantity", "out of stock", "low stock"];
  const salesKeywords = ["sale", "sold", "revenue", "invoice", "bill", "today's sale", "sales total", "top selling"];
  const purchaseKeywords = ["purchase", "bought", "supplier", "vendor", "purchase bill"];
  const customerKeywords = ["customer", "balance", "outstanding", "payment", "pending", "due"];
  const supportKeywords = ["how to", "how do i", "what is", "help", "guide", "tutorial", "create", "add"];
  
  if (stockKeywords.some(kw => lowerQuery.includes(kw))) return "stock";
  if (salesKeywords.some(kw => lowerQuery.includes(kw))) return "sales";
  if (purchaseKeywords.some(kw => lowerQuery.includes(kw))) return "purchase";
  if (customerKeywords.some(kw => lowerQuery.includes(kw))) return "customer";
  if (supportKeywords.some(kw => lowerQuery.includes(kw))) return "support";
  
  return "general";
};

const extractBarcodeOrName = (query: string): { barcode?: string; productName?: string } => {
  // Extract barcode (8-digit number pattern)
  const barcodeMatch = query.match(/\b\d{8}\b/);
  if (barcodeMatch) {
    return { barcode: barcodeMatch[0] };
  }
  
  // Extract product name between quotes
  const nameMatch = query.match(/"([^"]+)"/);
  if (nameMatch) {
    return { productName: nameMatch[1] };
  }
  
  return {};
};

const fetchStockContext = async (supabase: any, orgId: string, query: string) => {
  const { barcode, productName } = extractBarcodeOrName(query);
  const lowerQuery = query.toLowerCase();
  
  // Check for low stock query
  if (lowerQuery.includes("low stock") || lowerQuery.includes("less than")) {
    const { data } = await supabase
      .from("product_variants")
      .select("barcode, size, stock_qty, products(product_name, brand)")
      .eq("organization_id", orgId)
      .lt("stock_qty", 10)
      .order("stock_qty", { ascending: true })
      .limit(20);
    return { type: "low_stock", items: data };
  }
  
  // Check for out of stock
  if (lowerQuery.includes("out of stock") || lowerQuery.includes("zero stock")) {
    const { data } = await supabase
      .from("product_variants")
      .select("barcode, size, stock_qty, products(product_name, brand)")
      .eq("organization_id", orgId)
      .eq("stock_qty", 0)
      .limit(50);
    return { type: "out_of_stock", items: data };
  }
  
  // Specific barcode search
  if (barcode) {
    const { data } = await supabase
      .from("product_variants")
      .select("barcode, size, color, stock_qty, mrp, sale_price, products(product_name, brand, category)")
      .eq("organization_id", orgId)
      .eq("barcode", barcode)
      .single();
    return { type: "specific_product", product: data };
  }
  
  // Product name search
  if (productName) {
    const { data } = await supabase
      .from("products")
      .select("product_name, brand, category, product_variants(barcode, size, stock_qty, mrp, sale_price)")
      .eq("organization_id", orgId)
      .ilike("product_name", `%${productName}%`)
      .limit(10);
    return { type: "product_search", products: data };
  }
  
  // General stock summary
  const { data: summary } = await supabase
    .from("product_variants")
    .select("stock_qty")
    .eq("organization_id", orgId);
  
  const totalItems = summary?.length || 0;
  const totalStock = summary?.reduce((acc: number, item: any) => acc + (item.stock_qty || 0), 0) || 0;
  const outOfStock = summary?.filter((item: any) => item.stock_qty === 0).length || 0;
  
  return { type: "summary", totalItems, totalStock, outOfStock };
};

const fetchSalesContext = async (supabase: any, orgId: string, query: string) => {
  const lowerQuery = query.toLowerCase();
  const today = new Date().toISOString().split("T")[0];
  
  // Today's sales
  if (lowerQuery.includes("today")) {
    const { data } = await supabase
      .from("sales")
      .select("sale_number, customer_name, net_amount, payment_method, created_at")
      .eq("organization_id", orgId)
      .gte("sale_date", today)
      .is("deleted_at", null)
      .order("created_at", { ascending: false });
    
    const total = data?.reduce((acc: number, sale: any) => acc + (sale.net_amount || 0), 0) || 0;
    return { type: "today_sales", invoices: data, total, count: data?.length || 0 };
  }
  
  // Top selling products
  if (lowerQuery.includes("top") && (lowerQuery.includes("selling") || lowerQuery.includes("product"))) {
    const { data } = await supabase
      .from("sale_items")
      .select("product_name, quantity, sale_id, sales!inner(organization_id, deleted_at)")
      .eq("sales.organization_id", orgId)
      .is("sales.deleted_at", null)
      .is("deleted_at", null);
    
    // Aggregate by product
    const productMap = new Map<string, number>();
    data?.forEach((item: any) => {
      const current = productMap.get(item.product_name) || 0;
      productMap.set(item.product_name, current + item.quantity);
    });
    
    const topProducts = Array.from(productMap.entries())
      .sort((a, b) => b[1] - a[1])
      .slice(0, 10)
      .map(([name, qty]) => ({ product_name: name, total_sold: qty }));
    
    return { type: "top_products", products: topProducts };
  }
  
  // Recent sales (default)
  const { data } = await supabase
    .from("sales")
    .select("sale_number, customer_name, net_amount, payment_method, sale_date")
    .eq("organization_id", orgId)
    .is("deleted_at", null)
    .order("created_at", { ascending: false })
    .limit(10);
  
  return { type: "recent_sales", sales: data };
};

const fetchPurchaseContext = async (supabase: any, orgId: string, query: string) => {
  const lowerQuery = query.toLowerCase();
  
  // Pending purchases
  if (lowerQuery.includes("pending") || lowerQuery.includes("unpaid")) {
    const { data } = await supabase
      .from("purchase_bills")
      .select("software_bill_no, supplier_name, net_amount, paid_amount, payment_status, bill_date")
      .eq("organization_id", orgId)
      .neq("payment_status", "paid")
      .is("deleted_at", null)
      .order("bill_date", { ascending: false })
      .limit(20);
    return { type: "pending_purchases", bills: data };
  }
  
  // Recent purchases
  const { data } = await supabase
    .from("purchase_bills")
    .select("software_bill_no, supplier_name, net_amount, payment_status, bill_date")
    .eq("organization_id", orgId)
    .is("deleted_at", null)
    .order("bill_date", { ascending: false })
    .limit(10);
  
  return { type: "recent_purchases", bills: data };
};

const fetchCustomerContext = async (supabase: any, orgId: string, query: string) => {
  const lowerQuery = query.toLowerCase();
  
  // Extract customer name
  const nameMatch = query.match(/"([^"]+)"/);
  
  if (nameMatch) {
    const customerName = nameMatch[1];
    const { data: customer } = await supabase
      .from("customers")
      .select("customer_name, phone, opening_balance, points_balance")
      .eq("organization_id", orgId)
      .ilike("customer_name", `%${customerName}%`)
      .is("deleted_at", null)
      .single();
    
    if (customer) {
      // Get customer's sales
      const { data: sales } = await supabase
        .from("sales")
        .select("net_amount, payment_status")
        .eq("organization_id", orgId)
        .eq("customer_name", customer.customer_name)
        .is("deleted_at", null);
      
      const totalSales = sales?.reduce((acc: number, s: any) => acc + (s.net_amount || 0), 0) || 0;
      const pending = sales?.filter((s: any) => s.payment_status !== "paid")
        .reduce((acc: number, s: any) => acc + (s.net_amount || 0), 0) || 0;
      
      return { type: "customer_detail", customer, totalSales, pendingAmount: pending };
    }
  }
  
  // Top customers
  if (lowerQuery.includes("top")) {
    const { data } = await supabase
      .from("sales")
      .select("customer_name, net_amount")
      .eq("organization_id", orgId)
      .is("deleted_at", null);
    
    const customerMap = new Map<string, number>();
    data?.forEach((sale: any) => {
      if (sale.customer_name) {
        const current = customerMap.get(sale.customer_name) || 0;
        customerMap.set(sale.customer_name, current + (sale.net_amount || 0));
      }
    });
    
    const topCustomers = Array.from(customerMap.entries())
      .sort((a, b) => b[1] - a[1])
      .slice(0, 10)
      .map(([name, amount]) => ({ customer_name: name, total_amount: amount }));
    
    return { type: "top_customers", customers: topCustomers };
  }
  
  // Customers with pending payments
  if (lowerQuery.includes("pending") || lowerQuery.includes("outstanding")) {
    const { data: customers } = await supabase
      .from("customers")
      .select("customer_name, phone, opening_balance")
      .eq("organization_id", orgId)
      .gt("opening_balance", 0)
      .is("deleted_at", null)
      .order("opening_balance", { ascending: false })
      .limit(20);
    
    return { type: "pending_customers", customers };
  }
  
  // All customers count
  const { count } = await supabase
    .from("customers")
    .select("*", { count: "exact", head: true })
    .eq("organization_id", orgId)
    .is("deleted_at", null);
  
  return { type: "customer_summary", totalCustomers: count };
};

const getSupportContent = (): string => {
  return `
Here are common operations in the system:

**Creating a Sale:**
1. Go to Sales → New Sale
2. Enter customer name or phone
3. Scan barcode or search product
4. Enter quantity and discount if any
5. Select payment method
6. Click Save

**Adding a Product:**
1. Go to Products → Add New
2. Enter product name, brand, category
3. Add sizes with MRP, sale price, purchase price
4. Save to generate barcodes

**Purchase Entry:**
1. Go to Purchase → New Purchase
2. Select or add supplier
3. Add items with quantities and prices
4. Stock will be automatically updated

**Customer Management:**
1. Go to Customers → Add New
2. Enter name, phone, address
3. Set opening balance if any
4. Customer will be searchable in sales

**Reports:**
- Stock Report: Products → Stock Report
- Sales Report: Sales → Dashboard
- Customer Ledger: Customers → View Ledger
`;
};

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const { message, organizationId, conversationHistory } = await req.json();
    
    if (!message || !organizationId) {
      return new Response(
        JSON.stringify({ error: "Message and organizationId are required" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const supabaseKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const supabase = createClient(supabaseUrl, supabaseKey);

    // Detect intent
    const intent = detectIntent(message);
    console.log(`Detected intent: ${intent} for query: ${message}`);

    // Fetch context based on intent
    let context: any = {};
    
    switch (intent) {
      case "stock":
        context = await fetchStockContext(supabase, organizationId, message);
        break;
      case "sales":
        context = await fetchSalesContext(supabase, organizationId, message);
        break;
      case "purchase":
        context = await fetchPurchaseContext(supabase, organizationId, message);
        break;
      case "customer":
        context = await fetchCustomerContext(supabase, organizationId, message);
        break;
      case "support":
        context = { type: "support", content: getSupportContent() };
        break;
      default:
        // Fetch general summary
        const { count: productCount } = await supabase
          .from("products")
          .select("*", { count: "exact", head: true })
          .eq("organization_id", organizationId);
        
        const { count: customerCount } = await supabase
          .from("customers")
          .select("*", { count: "exact", head: true })
          .eq("organization_id", organizationId);
        
        context = { 
          type: "general_summary", 
          totalProducts: productCount,
          totalCustomers: customerCount 
        };
    }

    console.log(`Fetched context: ${JSON.stringify(context).substring(0, 500)}`);

    // Build prompt for AI
    const systemPrompt = `You are a helpful AI assistant for an inventory and billing software. 
You help users with queries about their stock, sales, purchases, and customers.
Always be concise and format numbers nicely (use ₹ for currency).
If the data doesn't contain the answer, say so clearly.
For tabular data, use markdown tables.
Always answer in the context of the data provided.`;

    const userPrompt = `Based on this organization data:
${JSON.stringify(context, null, 2)}

User Question: ${message}

Provide a helpful, concise response.`;

    // Call Lovable AI
    const LOVABLE_API_KEY = Deno.env.get("LOVABLE_API_KEY");
    if (!LOVABLE_API_KEY) {
      throw new Error("LOVABLE_API_KEY is not configured");
    }

    const aiResponse = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${LOVABLE_API_KEY}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: "google/gemini-2.5-flash",
        messages: [
          { role: "system", content: systemPrompt },
          ...(conversationHistory || []),
          { role: "user", content: userPrompt },
        ],
      }),
    });

    if (!aiResponse.ok) {
      if (aiResponse.status === 429) {
        return new Response(
          JSON.stringify({ error: "Rate limit exceeded. Please try again later." }),
          { status: 429, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }
      if (aiResponse.status === 402) {
        return new Response(
          JSON.stringify({ error: "AI credits exhausted. Please add funds to continue." }),
          { status: 402, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }
      const errorText = await aiResponse.text();
      console.error("AI API error:", aiResponse.status, errorText);
      throw new Error(`AI API error: ${aiResponse.status}`);
    }

    const aiData = await aiResponse.json();
    const reply = aiData.choices?.[0]?.message?.content || "I couldn't generate a response.";

    return new Response(
      JSON.stringify({ reply, intent, context: context.type }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );

  } catch (error) {
    console.error("Error in ai-assistant:", error);
    return new Response(
      JSON.stringify({ error: error instanceof Error ? error.message : "Unknown error" }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
