import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

type QueryIntent = "stock" | "sales" | "purchase" | "customer" | "supplier" | "product" | "support" | "general";

// Extract barcode from query - supports EAN-8, EAN-13, UPC, and custom formats
const extractBarcode = (query: string): string | null => {
  // Match 8-14 digit numbers (covers EAN-8, EAN-13, UPC-A, etc.)
  const barcodeMatch = query.match(/\b\d{8,14}\b/);
  return barcodeMatch ? barcodeMatch[0] : null;
};

// Extract phone number from query
const extractPhone = (query: string): string | null => {
  const phoneMatch = query.match(/\b\d{10}\b/);
  return phoneMatch ? phoneMatch[0] : null;
};

// Extract name from quotes
const extractQuotedName = (query: string): string | null => {
  const nameMatch = query.match(/"([^"]+)"/);
  return nameMatch ? nameMatch[1] : null;
};

const detectIntent = (query: string): QueryIntent => {
  const lowerQuery = query.toLowerCase();
  
  // Check for barcode first - if user enters a barcode, it's likely a stock query
  const hasBarcode = extractBarcode(query) !== null;
  
  const stockKeywords = ["stock", "inventory", "barcode", "available", "quantity", "out of stock", "low stock", "qty", "remaining"];
  const salesKeywords = ["sale", "sold", "revenue", "invoice", "bill", "today's sale", "sales total", "top selling", "selling"];
  const purchaseKeywords = ["purchase", "bought", "supplier bill", "vendor", "purchase bill", "grn"];
  const customerKeywords = ["customer", "balance", "outstanding", "payment", "pending", "due", "ledger", "credit"];
  const supplierKeywords = ["supplier", "vendor", "supplier balance", "supplier outstanding"];
  const productKeywords = ["product", "item", "price", "mrp", "rate", "cost"];
  const supportKeywords = ["how to", "how do i", "what is", "help", "guide", "tutorial", "create", "add", "steps"];
  
  // If query contains a barcode, treat as stock query
  if (hasBarcode) return "stock";
  
  if (stockKeywords.some(kw => lowerQuery.includes(kw))) return "stock";
  if (salesKeywords.some(kw => lowerQuery.includes(kw))) return "sales";
  if (purchaseKeywords.some(kw => lowerQuery.includes(kw))) return "purchase";
  if (supplierKeywords.some(kw => lowerQuery.includes(kw))) return "supplier";
  if (customerKeywords.some(kw => lowerQuery.includes(kw))) return "customer";
  if (productKeywords.some(kw => lowerQuery.includes(kw))) return "product";
  if (supportKeywords.some(kw => lowerQuery.includes(kw))) return "support";
  
  return "general";
};

const fetchStockContext = async (supabase: any, orgId: string, query: string) => {
  const barcode = extractBarcode(query);
  const productName = extractQuotedName(query);
  const lowerQuery = query.toLowerCase();
  
  // Check for low stock query
  if (lowerQuery.includes("low stock") || lowerQuery.includes("less than")) {
    const { data } = await supabase
      .from("product_variants")
      .select("barcode, size, stock_qty, mrp, sale_price, products(product_name, brand, category)")
      .eq("organization_id", orgId)
      .is("deleted_at", null)
      .lt("stock_qty", 10)
      .gt("stock_qty", 0)
      .order("stock_qty", { ascending: true })
      .limit(20);
    return { type: "low_stock", items: data };
  }
  
  // Check for out of stock
  if (lowerQuery.includes("out of stock") || lowerQuery.includes("zero stock") || lowerQuery.includes("no stock")) {
    const { data } = await supabase
      .from("product_variants")
      .select("barcode, size, stock_qty, products(product_name, brand, category)")
      .eq("organization_id", orgId)
      .is("deleted_at", null)
      .lte("stock_qty", 0)
      .limit(50);
    return { type: "out_of_stock", items: data };
  }
  
  // Specific barcode search - PRIORITY for any barcode in query
  if (barcode) {
    const { data, error } = await supabase
      .from("product_variants")
      .select("barcode, size, color, stock_qty, mrp, sale_price, pur_price, products(product_name, brand, category, hsn_code)")
      .eq("organization_id", orgId)
      .eq("barcode", barcode)
      .is("deleted_at", null)
      .maybeSingle();
    
    if (data) {
      return { 
        type: "specific_product", 
        product: data,
        query_barcode: barcode
      };
    } else {
      return {
        type: "barcode_not_found",
        query_barcode: barcode,
        message: `No product found with barcode ${barcode}`
      };
    }
  }
  
  // Product name search (in quotes or natural language)
  if (productName) {
    const { data } = await supabase
      .from("products")
      .select("product_name, brand, category, product_variants(barcode, size, stock_qty, mrp, sale_price)")
      .eq("organization_id", orgId)
      .is("deleted_at", null)
      .ilike("product_name", `%${productName}%`)
      .limit(10);
    return { type: "product_search", products: data, search_term: productName };
  }
  
  // Try to extract product name from query without quotes
  const words = query.replace(/stock|qty|quantity|available|check/gi, '').trim();
  if (words.length > 2) {
    const { data } = await supabase
      .from("products")
      .select("product_name, brand, category, product_variants(barcode, size, stock_qty, mrp, sale_price)")
      .eq("organization_id", orgId)
      .is("deleted_at", null)
      .ilike("product_name", `%${words}%`)
      .limit(10);
    
    if (data && data.length > 0) {
      return { type: "product_search", products: data, search_term: words };
    }
  }
  
  // General stock summary
  const { data: summary } = await supabase
    .from("product_variants")
    .select("stock_qty")
    .eq("organization_id", orgId)
    .is("deleted_at", null);
  
  const totalItems = summary?.length || 0;
  const totalStock = summary?.reduce((acc: number, item: any) => acc + (item.stock_qty || 0), 0) || 0;
  const outOfStock = summary?.filter((item: any) => (item.stock_qty || 0) <= 0).length || 0;
  const lowStock = summary?.filter((item: any) => item.stock_qty > 0 && item.stock_qty < 10).length || 0;
  
  return { type: "summary", totalItems, totalStock, outOfStock, lowStock };
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
  const phone = extractPhone(query);
  const customerName = extractQuotedName(query);
  
  // Search by phone number
  if (phone) {
    const { data: customer } = await supabase
      .from("customers")
      .select("id, customer_name, phone, address, email, opening_balance, points_balance, discount_percent")
      .eq("organization_id", orgId)
      .eq("phone", phone)
      .is("deleted_at", null)
      .maybeSingle();
    
    if (customer) {
      // Get customer's sales history
      const { data: sales } = await supabase
        .from("sales")
        .select("sale_number, net_amount, payment_status, sale_date, payment_method")
        .eq("organization_id", orgId)
        .eq("customer_id", customer.id)
        .is("deleted_at", null)
        .order("sale_date", { ascending: false })
        .limit(10);
      
      const totalSales = sales?.reduce((acc: number, s: any) => acc + (s.net_amount || 0), 0) || 0;
      const pendingAmount = sales?.filter((s: any) => s.payment_status !== "paid")
        .reduce((acc: number, s: any) => acc + (s.net_amount || 0), 0) || 0;
      
      return { 
        type: "customer_detail", 
        customer, 
        recentSales: sales,
        totalSales, 
        pendingAmount,
        search_phone: phone
      };
    } else {
      return { type: "customer_not_found", search_phone: phone };
    }
  }
  
  // Search by customer name
  if (customerName) {
    const { data: customers } = await supabase
      .from("customers")
      .select("id, customer_name, phone, address, opening_balance, points_balance")
      .eq("organization_id", orgId)
      .ilike("customer_name", `%${customerName}%`)
      .is("deleted_at", null)
      .limit(10);
    
    if (customers && customers.length > 0) {
      // If single match, get details
      if (customers.length === 1) {
        const customer = customers[0];
        const { data: sales } = await supabase
          .from("sales")
          .select("sale_number, net_amount, payment_status, sale_date")
          .eq("organization_id", orgId)
          .eq("customer_id", customer.id)
          .is("deleted_at", null)
          .order("sale_date", { ascending: false })
          .limit(10);
        
        const totalSales = sales?.reduce((acc: number, s: any) => acc + (s.net_amount || 0), 0) || 0;
        const pendingAmount = sales?.filter((s: any) => s.payment_status !== "paid")
          .reduce((acc: number, s: any) => acc + (s.net_amount || 0), 0) || 0;
        
        return { type: "customer_detail", customer, recentSales: sales, totalSales, pendingAmount };
      }
      return { type: "customer_search", customers, search_term: customerName };
    }
    return { type: "customer_not_found", search_term: customerName };
  }
  
  // Top customers
  if (lowerQuery.includes("top")) {
    const { data } = await supabase
      .from("sales")
      .select("customer_name, customer_id, net_amount")
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
  
  // Customers with pending payments / outstanding
  if (lowerQuery.includes("pending") || lowerQuery.includes("outstanding") || lowerQuery.includes("due")) {
    const { data: customers } = await supabase
      .from("customers")
      .select("customer_name, phone, opening_balance")
      .eq("organization_id", orgId)
      .gt("opening_balance", 0)
      .is("deleted_at", null)
      .order("opening_balance", { ascending: false })
      .limit(20);
    
    const totalOutstanding = customers?.reduce((acc: number, c: any) => acc + (c.opening_balance || 0), 0) || 0;
    return { type: "pending_customers", customers, totalOutstanding };
  }
  
  // All customers summary
  const { count } = await supabase
    .from("customers")
    .select("*", { count: "exact", head: true })
    .eq("organization_id", orgId)
    .is("deleted_at", null);
  
  return { type: "customer_summary", totalCustomers: count };
};

const fetchSupplierContext = async (supabase: any, orgId: string, query: string) => {
  const lowerQuery = query.toLowerCase();
  const phone = extractPhone(query);
  const supplierName = extractQuotedName(query);
  
  // Search by phone
  if (phone) {
    const { data: supplier } = await supabase
      .from("suppliers")
      .select("id, supplier_name, phone, address, email, opening_balance, gst_number")
      .eq("organization_id", orgId)
      .eq("phone", phone)
      .is("deleted_at", null)
      .maybeSingle();
    
    if (supplier) {
      const { data: purchases } = await supabase
        .from("purchase_bills")
        .select("software_bill_no, net_amount, payment_status, bill_date")
        .eq("organization_id", orgId)
        .eq("supplier_id", supplier.id)
        .is("deleted_at", null)
        .order("bill_date", { ascending: false })
        .limit(10);
      
      const totalPurchases = purchases?.reduce((acc: number, p: any) => acc + (p.net_amount || 0), 0) || 0;
      const pendingAmount = purchases?.filter((p: any) => p.payment_status !== "paid")
        .reduce((acc: number, p: any) => acc + (p.net_amount || 0), 0) || 0;
      
      return { type: "supplier_detail", supplier, recentPurchases: purchases, totalPurchases, pendingAmount };
    }
    return { type: "supplier_not_found", search_phone: phone };
  }
  
  // Search by name
  if (supplierName) {
    const { data: suppliers } = await supabase
      .from("suppliers")
      .select("id, supplier_name, phone, opening_balance")
      .eq("organization_id", orgId)
      .ilike("supplier_name", `%${supplierName}%`)
      .is("deleted_at", null)
      .limit(10);
    
    if (suppliers && suppliers.length > 0) {
      return { type: "supplier_search", suppliers, search_term: supplierName };
    }
    return { type: "supplier_not_found", search_term: supplierName };
  }
  
  // Suppliers with pending payments
  if (lowerQuery.includes("pending") || lowerQuery.includes("outstanding") || lowerQuery.includes("payable")) {
    const { data: suppliers } = await supabase
      .from("suppliers")
      .select("supplier_name, phone, opening_balance")
      .eq("organization_id", orgId)
      .gt("opening_balance", 0)
      .is("deleted_at", null)
      .order("opening_balance", { ascending: false })
      .limit(20);
    
    const totalPayable = suppliers?.reduce((acc: number, s: any) => acc + (s.opening_balance || 0), 0) || 0;
    return { type: "pending_suppliers", suppliers, totalPayable };
  }
  
  // Supplier summary
  const { count } = await supabase
    .from("suppliers")
    .select("*", { count: "exact", head: true })
    .eq("organization_id", orgId)
    .is("deleted_at", null);
  
  return { type: "supplier_summary", totalSuppliers: count };
};

const fetchProductContext = async (supabase: any, orgId: string, query: string) => {
  const barcode = extractBarcode(query);
  const productName = extractQuotedName(query);
  const lowerQuery = query.toLowerCase();
  
  // Search by barcode
  if (barcode) {
    const { data } = await supabase
      .from("product_variants")
      .select("barcode, size, color, stock_qty, mrp, sale_price, pur_price, products(product_name, brand, category, hsn_code, gst_per)")
      .eq("organization_id", orgId)
      .eq("barcode", barcode)
      .is("deleted_at", null)
      .maybeSingle();
    
    if (data) {
      return { type: "product_detail", product: data, query_barcode: barcode };
    }
    return { type: "product_not_found", query_barcode: barcode };
  }
  
  // Search by product name
  if (productName) {
    const { data } = await supabase
      .from("products")
      .select("product_name, brand, category, hsn_code, gst_per, product_variants(barcode, size, stock_qty, mrp, sale_price)")
      .eq("organization_id", orgId)
      .is("deleted_at", null)
      .ilike("product_name", `%${productName}%`)
      .limit(10);
    
    return { type: "product_search", products: data, search_term: productName };
  }
  
  // Try natural language search
  const words = query.replace(/product|item|price|mrp|rate|cost|details?/gi, '').trim();
  if (words.length > 2) {
    const { data } = await supabase
      .from("products")
      .select("product_name, brand, category, product_variants(barcode, size, stock_qty, mrp, sale_price)")
      .eq("organization_id", orgId)
      .is("deleted_at", null)
      .ilike("product_name", `%${words}%`)
      .limit(10);
    
    if (data && data.length > 0) {
      return { type: "product_search", products: data, search_term: words };
    }
  }
  
  // Product summary
  const { count: totalProducts } = await supabase
    .from("products")
    .select("*", { count: "exact", head: true })
    .eq("organization_id", orgId)
    .is("deleted_at", null);
  
  const { count: totalVariants } = await supabase
    .from("product_variants")
    .select("*", { count: "exact", head: true })
    .eq("organization_id", orgId)
    .is("deleted_at", null);
  
  return { type: "product_summary", totalProducts, totalVariants };
};

const getSupportContent = (query: string): string => {
  const lowerQuery = query.toLowerCase();
  
  // GST Reports
  if (lowerQuery.includes("gst") || lowerQuery.includes("tax")) {
    return `
**GST Reports Navigation:**
📍 Go to **Reports → GST Reports** from the left sidebar menu

**Available GST Reports:**
1. **GSTR-1 Report** - Outward supplies (sales)
2. **GSTR-2 Report** - Inward supplies (purchases)
3. **GST Sale/Purchase Register** - Detailed register with HSN codes

**Quick Access:**
- From Dashboard, click on **Reports** in sidebar
- Select **GST Reports** or **GST Register**
- Choose date range and export to Excel/PDF

**Tips:**
- Ensure products have correct HSN codes for accurate GST reports
- GST percentage should be set at product level
`;
  }
  
  // Stock Reports
  if (lowerQuery.includes("stock report") || lowerQuery.includes("inventory report")) {
    return `
**Stock Reports Navigation:**
📍 Go to **Reports → Stock Report** from the left sidebar

**Available Stock Reports:**
1. **Stock Report** - Current stock with valuation
2. **Stock Analysis** - Size-wise and brand-wise analysis
3. **Item-wise Stock Report** - Detailed item breakdown
4. **Low Stock Alert** - Items below reorder level

**Quick Access:**
- Click **Reports** in sidebar → **Stock Report**
- Use filters for Brand, Category, Department
- Export to Excel for detailed analysis
`;
  }
  
  // Sales Reports
  if (lowerQuery.includes("sales report") || lowerQuery.includes("sale report") || lowerQuery.includes("sales analytics")) {
    return `
**Sales Reports Navigation:**
📍 Go to **Reports → Sales Analytics** or **Sales Dashboard**

**Available Sales Reports:**
1. **Sales Analytics** - Revenue trends, top customers, top products
2. **Sales Report by Customer** - Customer-wise sales summary
3. **Item-wise Sales Report** - Product-wise sales breakdown
4. **Daily Cashier Report** - Day-end cash summary

**Quick Access:**
- Dashboard → Click any metric card
- Reports → Sales Analytics
- Use date filters: Today, Week, Month, Custom
`;
  }
  
  // Purchase Reports
  if (lowerQuery.includes("purchase report")) {
    return `
**Purchase Reports Navigation:**
📍 Go to **Reports → Purchase Report by Supplier**

**Available Purchase Reports:**
1. **Purchase Report by Supplier** - Supplier-wise purchase summary
2. **Purchase Dashboard** - All purchase bills
3. **Pending Purchase Bills** - Unpaid supplier bills

**Quick Access:**
- Inventory → Purchase Bills Dashboard
- Reports → Purchase Report by Supplier
`;
  }
  
  // Customer Ledger
  if (lowerQuery.includes("ledger") || lowerQuery.includes("customer balance") || lowerQuery.includes("outstanding")) {
    return `
**Customer Ledger Navigation:**
📍 Go to **Master → Customers** → Select customer → **View Ledger**

**To Check Customer Outstanding:**
1. Go to **Master → Customers**
2. Search for the customer
3. Click on the customer row
4. Select **View Ledger** from options

**Alternative:**
- Dashboard → Click **Receivables** card
- Shows all pending customer payments
`;
  }
  
  // Barcode Printing
  if (lowerQuery.includes("barcode") || lowerQuery.includes("label") || lowerQuery.includes("print barcode")) {
    return `
**Barcode Printing Navigation:**
📍 Go to **Settings → Barcode Printing**

**Steps to Print Barcodes:**
1. Go to **Settings** → **Barcode Printing**
2. Search products by name or scan existing barcode
3. Enter quantity of labels needed
4. Select label template (50x25mm, 38x25mm, etc.)
5. Click **Print**

**Tips:**
- Connect thermal printer for best results
- Use BarTender or TSPL templates for professional labels
`;
  }
  
  // Creating Sale / Invoice
  if (lowerQuery.includes("create sale") || lowerQuery.includes("new sale") || lowerQuery.includes("make invoice") || lowerQuery.includes("billing")) {
    return `
**Creating a New Sale/Invoice:**
📍 Go to **Sales → POS Sales** or **Sales Invoice**

**Steps:**
1. Click **Sales** in sidebar → **POS Sales**
2. Enter customer name/phone or select existing
3. Scan barcode or search product
4. Enter quantity (adjust discount if needed)
5. Select payment method (Cash/Card/UPI)
6. Click **Save & Print**

**Shortcuts:**
- F2: New Sale
- F4: Search Product
- F8: Save Sale
- Ctrl+P: Print Invoice
`;
  }
  
  // Adding Product
  if (lowerQuery.includes("add product") || lowerQuery.includes("new product") || lowerQuery.includes("create product")) {
    return `
**Adding a New Product:**
📍 Go to **Inventory → Product Entry**

**Steps:**
1. Click **Inventory** → **Product Entry**
2. Enter Product Name, Brand, Category
3. Set HSN Code and GST %
4. Add sizes with MRP, Sale Price, Purchase Price
5. Click **Save** (barcodes auto-generated)

**Tips:**
- Use Excel Import for bulk product upload
- Set size groups for quick size selection
`;
  }
  
  // Purchase Entry
  if (lowerQuery.includes("purchase entry") || lowerQuery.includes("add purchase") || lowerQuery.includes("grn")) {
    return `
**Creating a Purchase Entry:**
📍 Go to **Inventory → Purchase Entry**

**Steps:**
1. Click **Inventory** → **Purchase Entry**
2. Select or add Supplier
3. Enter Bill No and Bill Date
4. Scan/search products and add quantities
5. Click **Save** (stock updated automatically)

**Tips:**
- Purchase prices update product cost automatically
- Use Purchase Orders for planned purchases
`;
  }
  
  // Default support content
  return `
**Quick Navigation Guide:**

**📊 Reports:**
- GST Reports: Reports → GST Reports
- Stock Report: Reports → Stock Report
- Sales Analytics: Reports → Sales Analytics
- Customer Ledger: Master → Customers → View Ledger

**💰 Sales:**
- POS Billing: Sales → POS Sales
- Sale Invoice: Sales → Sales Invoice
- Sale Returns: Sales → Sale Returns

**📦 Inventory:**
- Add Product: Inventory → Product Entry
- Purchase Entry: Inventory → Purchase Entry
- Stock Analysis: Reports → Stock Analysis

**👥 Master Data:**
- Customers: Master → Customers
- Suppliers: Master → Suppliers
- Employees: Master → Employees

**⚙️ Settings:**
- Barcode Printing: Settings → Barcode Printing
- User Management: Settings → User Rights
- Organization: Settings → Organization

**Keyboard Shortcuts:**
- F2: New Sale | F4: Search | F8: Save
- Ctrl+P: Print | Esc: Cancel

Need help with something specific? Ask me about any report or feature!
`;
};

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    // Authenticate the requesting user
    const authHeader = req.headers.get("Authorization");
    if (!authHeader) {
      return new Response(
        JSON.stringify({ error: "No authorization header" }),
        { status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const supabaseKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

    // Verify the user's token
    const supabaseAuth = createClient(supabaseUrl, Deno.env.get("SUPABASE_ANON_KEY") ?? "", {
      global: { headers: { Authorization: authHeader } }
    });
    const { data: { user }, error: authError } = await supabaseAuth.auth.getUser();
    if (authError || !user) {
      return new Response(
        JSON.stringify({ error: "Unauthorized" }),
        { status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const { message, organizationId, conversationHistory } = await req.json();
    
    const uuidRegex = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
    if (!message || typeof message !== "string" || message.length > 2000) {
      return new Response(
        JSON.stringify({ error: "Message is required and must be under 2000 characters" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }
    if (!organizationId || !uuidRegex.test(organizationId)) {
      return new Response(
        JSON.stringify({ error: "Valid organizationId is required" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }
    if (conversationHistory && (!Array.isArray(conversationHistory) || conversationHistory.length > 20)) {
      return new Response(
        JSON.stringify({ error: "Invalid conversationHistory" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

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
      case "supplier":
        context = await fetchSupplierContext(supabase, organizationId, message);
        break;
      case "product":
        context = await fetchProductContext(supabase, organizationId, message);
        break;
      case "support":
        context = { type: "support", content: getSupportContent(message) };
        break;
      default:
        // Fetch general summary for dashboard-like queries
        const { count: productCount } = await supabase
          .from("products")
          .select("*", { count: "exact", head: true })
          .eq("organization_id", organizationId)
          .is("deleted_at", null);
        
        const { count: customerCount } = await supabase
          .from("customers")
          .select("*", { count: "exact", head: true })
          .eq("organization_id", organizationId)
          .is("deleted_at", null);
        
        const { count: supplierCount } = await supabase
          .from("suppliers")
          .select("*", { count: "exact", head: true })
          .eq("organization_id", organizationId)
          .is("deleted_at", null);
        
        const today = new Date().toISOString().split("T")[0];
        const { data: todaySales } = await supabase
          .from("sales")
          .select("net_amount")
          .eq("organization_id", organizationId)
          .gte("sale_date", today)
          .is("deleted_at", null);
        
        const todaySalesTotal = todaySales?.reduce((acc: number, s: any) => acc + (s.net_amount || 0), 0) || 0;
        
        context = { 
          type: "general_summary", 
          totalProducts: productCount,
          totalCustomers: customerCount,
          totalSuppliers: supplierCount,
          todaySalesTotal,
          todaySalesCount: todaySales?.length || 0
        };
    }

    console.log(`Fetched context: ${JSON.stringify(context).substring(0, 500)}`);

    // Build prompt for AI
    const systemPrompt = `You are a helpful AI assistant for an inventory and billing software called "Tirtha Billing". 
You help users with queries about their stock, sales, purchases, customers, and suppliers.

IMPORTANT GUIDELINES:
- Always be concise and format numbers nicely (use ₹ for Indian Rupees currency)
- For stock queries with barcode, always show: Product Name, Size, Stock Qty, MRP, Sale Price
- For customer/supplier queries, show balance, contact details, and recent transactions
- If the data shows a specific product/customer/supplier, provide all relevant details
- If data is not found (type contains "not_found"), clearly state that item was not found
- For tabular data with multiple items, use markdown tables
- Always answer based on the actual data provided, don't make up information
- If opening_balance > 0 for customer, it means they owe money (receivable)
- If opening_balance > 0 for supplier, it means we owe them money (payable)`;

    const userPrompt = `Organization Data Retrieved:
${JSON.stringify(context, null, 2)}

User's Question: ${message}

Based on the above data, provide a helpful and accurate response. If the data contains specific product/customer/supplier information, format it clearly with all available details.`;

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
