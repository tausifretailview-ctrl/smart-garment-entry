import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

// Purchase Entry > Photo: reads a supplier bill photo into purchase lines. Writes nothing to
// purchase tables; the browser shows the lines for review and imports them through the same
// path as the Excel import. Each read is logged in purchase_photo_reads (when that table
// exists) and capped per shop per day.

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

const MODEL = "google/gemini-2.5-flash";
const MAX_IMAGES = 4;
const MAX_IMAGE_CHARS = 4_000_000; // ~3 MB per image after base64
const DAILY_CAP = 50;

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { ...corsHeaders, "Content-Type": "application/json" } });

const BILL_SCHEMA = {
  type: "object",
  properties: {
    supplier_name: { type: "string" },
    supplier_gstin: { type: "string" },
    invoice_no: { type: "string" },
    invoice_date: { type: "string", description: "As printed, or YYYY-MM-DD" },
    other_charges: { type: "number", description: "Freight, packing, courier etc. added to the bill" },
    taxable_total: { type: "number" },
    gst_total: { type: "number", description: "CGST + SGST, or IGST" },
    grand_total: { type: "number" },
    printed_line_count: { type: "number", description: "Number of item lines the bill says it has, if printed" },
    lines: {
      type: "array",
      items: {
        type: "object",
        properties: {
          product_name: { type: "string" },
          brand: { type: "string" },
          hsn_code: { type: "string" },
          size: { type: "string" },
          color: { type: "string" },
          qty: { type: "number" },
          uom: { type: "string" },
          rate: { type: "number", description: "Purchase rate per unit before GST" },
          discount_amount: { type: "number", description: "Total discount on this line in rupees" },
          taxable_amount: { type: "number", description: "Line amount before GST, after discount" },
          gst_percent: { type: "number" },
          mrp: { type: "number" },
          barcode: { type: "string", description: "EAN / barcode printed for the item, if any" },
          unclear: { type: "boolean", description: "True if any part of this line was hard to read" },
        },
        required: ["product_name", "qty", "rate"],
      },
    },
  },
  required: ["lines"],
};

const SYSTEM_PROMPT = `You read Indian supplier purchase bills (GST tax invoices, estimates, thermal or handwritten bills) for a retail shop.
Return every item line exactly once, in printed order, across all pages. Never invent lines or numbers.
- rate is the per-unit purchase price before GST. If only a GST-inclusive rate is printed, convert it to before-GST using the line's GST %.
- If sizes are printed as separate columns or lines, return one line per size with its own qty.
- Leave a field empty when it is not printed. Do not guess barcodes, HSN or MRP.
- Do not return freight, packing, courier, round off or discount rows as item lines; put freight/packing/courier in other_charges.
- Mark unclear=true on any line you could not read with confidence.`;

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  try {
    const authHeader = req.headers.get("Authorization");
    if (!authHeader) return json({ error: "No authorization header" }, 401);

    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const supabaseAuth = createClient(supabaseUrl, Deno.env.get("SUPABASE_ANON_KEY") ?? "", {
      global: { headers: { Authorization: authHeader } },
    });
    const { data: { user }, error: authError } = await supabaseAuth.auth.getUser();
    if (authError || !user) return json({ error: "Unauthorized" }, 401);

    const { organizationId, images } = await req.json();
    const uuidRegex = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
    if (!organizationId || !uuidRegex.test(organizationId)) {
      return json({ error: "Valid organizationId is required" }, 400);
    }
    if (!Array.isArray(images) || images.length === 0 || images.length > MAX_IMAGES) {
      return json({ error: `Send 1 to ${MAX_IMAGES} bill photos` }, 400);
    }
    for (const img of images) {
      if (typeof img !== "string" || !/^data:image\/(jpeg|png|webp);base64,/.test(img) || img.length > MAX_IMAGE_CHARS) {
        return json({ error: "Each photo must be a JPEG, PNG or WebP under 3 MB" }, 400);
      }
    }

    const { data: membership, error: memErr } = await supabaseAuth
      .from("organization_members")
      .select("organization_id")
      .eq("user_id", user.id)
      .eq("organization_id", organizationId)
      .maybeSingle();
    if (memErr || !membership) return json({ error: "Not authorized for this organization" }, 403);

    // Daily cap per shop. Skipped quietly until the purchase_photo_reads SQL is run.
    const admin = createClient(supabaseUrl, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!);
    const since = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString();
    const { count, error: capErr } = await admin
      .from("purchase_photo_reads")
      .select("id", { count: "exact", head: true })
      .eq("organization_id", organizationId)
      .gte("created_at", since);
    const canLog = !capErr;
    if (canLog && (count ?? 0) >= DAILY_CAP) {
      return json({ error: `Daily limit of ${DAILY_CAP} bill photos reached. Please try again tomorrow.` }, 429);
    }

    const LOVABLE_API_KEY = Deno.env.get("LOVABLE_API_KEY");
    if (!LOVABLE_API_KEY) throw new Error("LOVABLE_API_KEY is not configured");

    const aiResponse = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
      method: "POST",
      headers: { Authorization: `Bearer ${LOVABLE_API_KEY}`, "Content-Type": "application/json" },
      body: JSON.stringify({
        model: MODEL,
        messages: [
          { role: "system", content: SYSTEM_PROMPT },
          {
            role: "user",
            content: [
              { type: "text", text: `Read this purchase bill (${images.length} photo${images.length > 1 ? "s" : ""}, in page order).` },
              ...images.map((url: string) => ({ type: "image_url", image_url: { url } })),
            ],
          },
        ],
        tools: [
          {
            type: "function",
            function: { name: "save_purchase_bill", description: "Save the lines read from the bill", parameters: BILL_SCHEMA },
          },
        ],
        tool_choice: { type: "function", function: { name: "save_purchase_bill" } },
      }),
    });

    const log = async (ok: boolean, usage?: { prompt_tokens?: number; completion_tokens?: number }, lines = 0) => {
      if (!canLog) return;
      await admin.from("purchase_photo_reads").insert({
        organization_id: organizationId,
        user_id: user.id,
        pages: images.length,
        model: MODEL,
        input_tokens: usage?.prompt_tokens ?? null,
        output_tokens: usage?.completion_tokens ?? null,
        line_count: lines,
        ok,
      });
    };

    if (!aiResponse.ok) {
      await log(false);
      if (aiResponse.status === 429) return json({ error: "Too many requests. Please try again in a minute." }, 429);
      if (aiResponse.status === 402) return json({ error: "AI balance used up. Please add AI credits in Lovable." }, 402);
      console.error("AI API error:", aiResponse.status, await aiResponse.text());
      throw new Error(`AI API error: ${aiResponse.status}`);
    }

    const aiData = await aiResponse.json();
    const args = aiData.choices?.[0]?.message?.tool_calls?.[0]?.function?.arguments;
    let bill: { lines?: unknown[] } | null = null;
    try {
      bill = typeof args === "string" ? JSON.parse(args) : args ?? null;
    } catch {
      bill = null;
    }
    const lineCount = Array.isArray(bill?.lines) ? bill!.lines!.length : 0;
    await log(lineCount > 0, aiData.usage, lineCount);
    if (!bill || lineCount === 0) {
      return json({ error: "Could not read this bill. Retake the photo flat, in good light, with the whole bill in view." }, 422);
    }
    return json({ bill, model: MODEL });
  } catch (error) {
    console.error("Error in read-purchase-bill:", error);
    return json({ error: error instanceof Error ? error.message : "Unknown error" }, 500);
  }
});
