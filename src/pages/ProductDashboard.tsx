import { useState, useEffect } from "react";
import { useNavigate, Link } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { useToast } from "@/hooks/use-toast";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import { Loader2, Package, Search, Download, Upload, Filter, Plus, MoreHorizontal, Home } from "lucide-react";
import { Avatar, AvatarImage, AvatarFallback } from "@/components/ui/avatar";

interface ProductVariantRow {
  variant_id: string;
  product_id: string;
  product_name: string;
  category: string;
  brand: string;
  image_url?: string;
  barcode: string;
  size: string;
  pur_price: number;
  sale_price: number;
  hsn_code: string;
  stock_qty: number;
  status: string;
  gst_per: number;
}

const ProductDashboard = () => {
  const { toast } = useToast();
  const navigate = useNavigate();
  const [variantRows, setVariantRows] = useState<ProductVariantRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchQuery, setSearchQuery] = useState("");

  useEffect(() => {
    fetchProductVariants();
  }, []);

  const fetchProductVariants = async () => {
    setLoading(true);
    try {
      const { data, error } = await supabase
        .from("product_variants")
        .select(`
          id,
          size,
          barcode,
          pur_price,
          sale_price,
          stock_qty,
          active,
          products (
            id,
            product_name,
            category,
            brand,
            hsn_code,
            status,
            image_url,
            gst_per
          )
        `)
        .order("created_at", { ascending: false });

      if (error) throw error;

      const rows: ProductVariantRow[] = (data || []).map((variant: any) => ({
        variant_id: variant.id,
        product_id: variant.products?.id || "",
        product_name: variant.products?.product_name || "",
        category: variant.products?.category || "",
        brand: variant.products?.brand || "",
        image_url: variant.products?.image_url,
        barcode: variant.barcode || "",
        size: variant.size,
        pur_price: variant.pur_price,
        sale_price: variant.sale_price,
        hsn_code: variant.products?.hsn_code || "",
        stock_qty: variant.stock_qty,
        status: variant.products?.status || "active",
        gst_per: variant.products?.gst_per || 0,
      }));

      setVariantRows(rows);
    } catch (error: any) {
      toast({
        title: "Error",
        description: error.message || "Failed to load products",
        variant: "destructive",
      });
    } finally {
      setLoading(false);
    }
  };

  const filteredRows = variantRows.filter((row) =>
    row.product_name.toLowerCase().includes(searchQuery.toLowerCase()) ||
    row.brand?.toLowerCase().includes(searchQuery.toLowerCase()) ||
    row.category?.toLowerCase().includes(searchQuery.toLowerCase()) ||
    row.barcode?.toLowerCase().includes(searchQuery.toLowerCase())
  );

  if (loading) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center">
        <Loader2 className="h-8 w-8 animate-spin text-primary" />
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-background p-4 md:p-8">
      <div className="max-w-7xl mx-auto">
        <BackToDashboard />
        <div className="mb-6 flex items-center gap-3">
          <Package className="h-8 w-8 text-primary" />
          <h1 className="text-3xl font-bold text-foreground">Product Dashboard</h1>
        </div>

        <Card className="shadow-lg border-border">
          <CardHeader>
            <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-4">
              <div>
                <CardTitle className="text-2xl">All Products</CardTitle>
                <CardDescription>
                  {filteredProducts.length} products in inventory
                </CardDescription>
              </div>
              <div className="relative max-w-sm">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                <Input
                  placeholder="Search products..."
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  className="pl-9"
                />
              </div>
            </div>
          </CardHeader>
          <CardContent>
            {filteredProducts.length === 0 ? (
              <div className="text-center py-12 text-muted-foreground">
                <Package className="h-12 w-12 mx-auto mb-4 opacity-50" />
                <p className="text-lg">No products found</p>
                <p className="text-sm">Add your first product to get started</p>
              </div>
            ) : (
              <div className="space-y-4">
                {filteredProducts.map((product) => (
                  <Card
                    key={product.id}
                    className="overflow-hidden cursor-pointer hover:shadow-md transition-shadow"
                    onClick={() => toggleExpanded(product.id)}
                  >
                    <div className="p-4">
                      <div className="flex items-start gap-4">
                        <Avatar className="h-20 w-20 rounded-lg">
                          <AvatarImage
                            src={product.image_url}
                            alt={product.product_name}
                            className="object-cover"
                          />
                          <AvatarFallback className="rounded-lg bg-muted">
                            <Package className="h-8 w-8 text-muted-foreground" />
                          </AvatarFallback>
                        </Avatar>

                        <div className="flex-1 min-w-0">
                          <div className="flex items-start justify-between gap-4">
                            <div className="flex-1">
                              <h3 className="text-lg font-semibold text-foreground">
                                {product.product_name}
                              </h3>
                              <div className="flex flex-wrap gap-2 mt-2">
                                {product.brand && (
                                  <Badge variant="secondary">{product.brand}</Badge>
                                )}
                                {product.category && (
                                  <Badge variant="outline">{product.category}</Badge>
                                )}
                                {product.color && (
                                  <Badge variant="outline">{product.color}</Badge>
                                )}
                              </div>
                            </div>
                            <Badge variant={product.status === "active" ? "default" : "secondary"}>
                              {product.status}
                            </Badge>
                          </div>

                          <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mt-4 text-sm">
                            <div>
                              <p className="text-muted-foreground">HSN Code</p>
                              <p className="font-medium">{product.hsn_code || "—"}</p>
                            </div>
                            <div>
                              <p className="text-muted-foreground">GST %</p>
                              <p className="font-medium">{product.gst_per}%</p>
                            </div>
                            <div>
                              <p className="text-muted-foreground">Purchase Price</p>
                              <p className="font-medium">₹{product.default_pur_price}</p>
                            </div>
                            <div>
                              <p className="text-muted-foreground">Sale Price</p>
                              <p className="font-medium">₹{product.default_sale_price}</p>
                            </div>
                          </div>

                          <div className="mt-3 text-sm">
                            <p className="text-muted-foreground">
                              {product.variants?.length || 0} size variants
                              {expandedProduct === product.id ? " (click to collapse)" : " (click to expand)"}
                            </p>
                          </div>
                        </div>
                      </div>

                      {/* Expanded Variants Table */}
                      {expandedProduct === product.id && product.variants && product.variants.length > 0 && (
                          <div className="mt-4 pt-4 border-t border-border">
                          <h4 className="font-semibold mb-3">Size Variants & Stock</h4>
                          <div className="border rounded-lg overflow-hidden">
                            <Table>
                              <TableHeader>
                                <TableRow>
                                  <TableHead>Size</TableHead>
                                  <TableHead>Barcode</TableHead>
                                  <TableHead>Stock Qty</TableHead>
                                  <TableHead>Purchase Price</TableHead>
                                  <TableHead>Sale Price</TableHead>
                                  <TableHead className="text-center">Status</TableHead>
                                </TableRow>
                              </TableHeader>
                              <TableBody>
                                {product.variants.map((variant) => (
                                  <TableRow key={variant.id}>
                                    <TableCell className="font-medium">{variant.size}</TableCell>
                                    <TableCell className="font-mono text-sm">
                                      {variant.barcode || "—"}
                                    </TableCell>
                                    <TableCell>
                                      <Badge 
                                        variant={variant.stock_qty <= 0 ? "destructive" : variant.stock_qty <= 10 ? "secondary" : "default"}
                                        className="font-medium"
                                      >
                                        {variant.stock_qty}
                                      </Badge>
                                    </TableCell>
                                    <TableCell>₹{variant.pur_price}</TableCell>
                                    <TableCell>₹{variant.sale_price}</TableCell>
                                    <TableCell className="text-center">
                                      <Badge
                                        variant={variant.active ? "default" : "secondary"}
                                        className="text-xs"
                                      >
                                        {variant.active ? "Active" : "Inactive"}
                                      </Badge>
                                    </TableCell>
                                  </TableRow>
                                ))}
                              </TableBody>
                            </Table>
                          </div>
                        </div>
                      )}
                    </div>
                  </Card>
                ))}
              </div>
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  );
};

export default ProductDashboard;
