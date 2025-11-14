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
import { Loader2, Package, Search, Download, Upload, Filter, Plus, MoreHorizontal, Home, ChevronDown, ChevronRight } from "lucide-react";
import { Avatar, AvatarImage, AvatarFallback } from "@/components/ui/avatar";

interface ProductVariant {
  variant_id: string;
  size: string;
  barcode: string;
  pur_price: number;
  sale_price: number;
  stock_qty: number;
}

interface ProductRow {
  product_id: string;
  product_name: string;
  category: string;
  brand: string;
  image_url?: string;
  hsn_code: string;
  gst_per: number;
  variants: ProductVariant[];
  total_stock: number;
}

const ProductDashboard = () => {
  const { toast } = useToast();
  const navigate = useNavigate();
  const [productRows, setProductRows] = useState<ProductRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchQuery, setSearchQuery] = useState("");
  const [expandedProduct, setExpandedProduct] = useState<string | null>(null);

  useEffect(() => {
    fetchProductVariants();
  }, []);

  const fetchProductVariants = async () => {
    setLoading(true);
    try {
      const { data, error } = await supabase
        .from("products")
        .select(`
          id,
          product_name,
          category,
          brand,
          hsn_code,
          image_url,
          gst_per,
          product_variants (
            id,
            size,
            barcode,
            pur_price,
            sale_price,
            stock_qty
          )
        `)
        .order("created_at", { ascending: false });

      if (error) throw error;

      const rows: ProductRow[] = (data || []).map((product: any) => {
        const variants: ProductVariant[] = (product.product_variants || []).map((v: any) => ({
          variant_id: v.id,
          size: v.size,
          barcode: v.barcode || "",
          pur_price: v.pur_price,
          sale_price: v.sale_price,
          stock_qty: v.stock_qty,
        }));

        const total_stock = variants.reduce((sum, v) => sum + v.stock_qty, 0);

        return {
          product_id: product.id,
          product_name: product.product_name,
          category: product.category || "",
          brand: product.brand || "",
          image_url: product.image_url,
          hsn_code: product.hsn_code || "",
          gst_per: product.gst_per || 0,
          variants,
          total_stock,
        };
      });

      setProductRows(rows);
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

  const toggleExpanded = (productId: string) => {
    setExpandedProduct(expandedProduct === productId ? null : productId);
  };

  const filteredRows = productRows.filter((row) =>
    row.product_name.toLowerCase().includes(searchQuery.toLowerCase()) ||
    row.brand?.toLowerCase().includes(searchQuery.toLowerCase()) ||
    row.category?.toLowerCase().includes(searchQuery.toLowerCase())
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
      <div className="max-w-[1600px] mx-auto">
        {/* Header */}
        <div className="mb-6 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <Button
              variant="ghost"
              size="icon"
              onClick={() => navigate("/")}
              className="h-8 w-8"
            >
              <Home className="h-4 w-4" />
            </Button>
            <h1 className="text-2xl font-bold text-foreground">Product</h1>
          </div>
          <Link
            to="/product-entry"
            className="text-sm text-primary hover:underline"
          >
            Setup Opening Stock
          </Link>
        </div>

        {/* Toolbar */}
        <Card className="mb-4">
          <CardContent className="p-4">
            <div className="flex items-center justify-between gap-4 flex-wrap">
              <div className="flex items-center gap-2">
                <DropdownMenu>
                  <DropdownMenuTrigger asChild>
                    <Button variant="default" size="sm" className="gap-2">
                      <Upload className="h-4 w-4" />
                      Import/Export
                      <ChevronDown className="h-4 w-4" />
                    </Button>
                  </DropdownMenuTrigger>
                  <DropdownMenuContent>
                    <DropdownMenuItem>
                      <Upload className="h-4 w-4 mr-2" />
                      Import Products
                    </DropdownMenuItem>
                    <DropdownMenuItem>
                      <Download className="h-4 w-4 mr-2" />
                      Export Products
                    </DropdownMenuItem>
                  </DropdownMenuContent>
                </DropdownMenu>

                <Button variant="default" size="sm" className="gap-2">
                  <Download className="h-4 w-4" />
                  Export
                </Button>

                <Button variant="outline" size="sm" className="gap-2">
                  <Filter className="h-4 w-4" />
                  Filter
                </Button>
              </div>

              <div className="flex items-center gap-2 flex-1 max-w-md">
                <div className="relative flex-1">
                  <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                  <Input
                    placeholder="Search List..."
                    value={searchQuery}
                    onChange={(e) => setSearchQuery(e.target.value)}
                    className="pl-9"
                  />
                </div>
                <Button
                  size="sm"
                  className="gap-2"
                  onClick={() => navigate("/product-entry")}
                >
                  <Plus className="h-4 w-4" />
                  Create New
                </Button>
              </div>
            </div>
          </CardContent>
        </Card>

        {/* Table */}
        <Card>
          <CardContent className="p-0">
            {filteredRows.length === 0 ? (
              <div className="text-center py-12 text-muted-foreground">
                <Package className="h-12 w-12 mx-auto mb-4 opacity-50" />
                <p className="text-lg">No products found</p>
                <p className="text-sm">Add your first product to get started</p>
              </div>
            ) : (
              <div className="overflow-x-auto">
                <Table>
                  <TableHeader>
                    <TableRow className="bg-muted/50">
                      <TableHead className="w-12"></TableHead>
                      <TableHead className="w-16 text-center">Sr. No.</TableHead>
                      <TableHead className="w-20">Image</TableHead>
                      <TableHead>Category</TableHead>
                      <TableHead>Brand</TableHead>
                      <TableHead>Product Name</TableHead>
                      <TableHead>HSN</TableHead>
                      <TableHead className="text-right">Total Qty</TableHead>
                      <TableHead className="text-center">Variants</TableHead>
                      <TableHead className="w-16">Actions</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {filteredRows.map((row, index) => (
                      <>
                        <TableRow
                          key={row.product_id}
                          className="cursor-pointer hover:bg-muted/30 transition-colors"
                          onClick={() => toggleExpanded(row.product_id)}
                        >
                          <TableCell>
                            {expandedProduct === row.product_id ? (
                              <ChevronDown className="h-4 w-4 text-muted-foreground" />
                            ) : (
                              <ChevronRight className="h-4 w-4 text-muted-foreground" />
                            )}
                          </TableCell>
                          <TableCell className="text-center font-medium">
                            {index + 1}
                          </TableCell>
                          <TableCell>
                            <Avatar className="h-12 w-12 rounded">
                              <AvatarImage
                                src={row.image_url}
                                alt={row.product_name}
                                className="object-cover"
                              />
                              <AvatarFallback className="rounded bg-muted">
                                <Package className="h-5 w-5 text-muted-foreground" />
                              </AvatarFallback>
                            </Avatar>
                          </TableCell>
                          <TableCell>{row.category || "—"}</TableCell>
                          <TableCell>{row.brand || "—"}</TableCell>
                          <TableCell className="font-medium">{row.product_name}</TableCell>
                          <TableCell className="text-xs">{row.hsn_code || "—"}</TableCell>
                          <TableCell className="text-right font-medium">
                            {row.total_stock}
                          </TableCell>
                          <TableCell className="text-center">
                            <Badge variant="secondary">{row.variants.length}</Badge>
                          </TableCell>
                          <TableCell>
                            <DropdownMenu>
                              <DropdownMenuTrigger asChild>
                                <Button 
                                  variant="ghost" 
                                  size="icon" 
                                  className="h-8 w-8"
                                  onClick={(e) => e.stopPropagation()}
                                >
                                  <MoreHorizontal className="h-4 w-4" />
                                </Button>
                              </DropdownMenuTrigger>
                              <DropdownMenuContent align="end">
                                <DropdownMenuItem
                                  onClick={(e) => {
                                    e.stopPropagation();
                                    navigate(`/product-entry?id=${row.product_id}`);
                                  }}
                                >
                                  Edit Product
                                </DropdownMenuItem>
                                <DropdownMenuItem className="text-destructive">
                                  Delete
                                </DropdownMenuItem>
                              </DropdownMenuContent>
                            </DropdownMenu>
                          </TableCell>
                        </TableRow>

                        {/* Expanded Variants Row */}
                        {expandedProduct === row.product_id && row.variants.length > 0 && (
                          <TableRow>
                            <TableCell colSpan={10} className="bg-muted/20 p-0">
                              <div className="p-4">
                                <h4 className="font-semibold text-sm mb-3">Product Variants Details</h4>
                                <div className="border rounded-lg overflow-hidden">
                                  <Table>
                                    <TableHeader>
                                      <TableRow className="bg-muted/30">
                                        <TableHead>Size</TableHead>
                                        <TableHead>Barcode</TableHead>
                                        <TableHead className="text-right">Purchase Price</TableHead>
                                        <TableHead className="text-right">Sale Price</TableHead>
                                        <TableHead className="text-right">Stock Qty</TableHead>
                                      </TableRow>
                                    </TableHeader>
                                    <TableBody>
                                      {row.variants.map((variant) => (
                                        <TableRow key={variant.variant_id}>
                                          <TableCell className="font-medium">{variant.size}</TableCell>
                                          <TableCell className="font-mono text-xs">
                                            {variant.barcode || "—"}
                                          </TableCell>
                                          <TableCell className="text-right">
                                            ₹{variant.pur_price.toFixed(2)}
                                          </TableCell>
                                          <TableCell className="text-right">
                                            ₹{variant.sale_price.toFixed(2)}
                                          </TableCell>
                                          <TableCell className="text-right font-medium">
                                            {variant.stock_qty}
                                          </TableCell>
                                        </TableRow>
                                      ))}
                                    </TableBody>
                                  </Table>
                                </div>
                              </div>
                            </TableCell>
                          </TableRow>
                        )}
                      </>
                    ))}
                  </TableBody>
                </Table>
              </div>
            )}
          </CardContent>
        </Card>

        {/* Footer Summary */}
        {filteredRows.length > 0 && (
          <div className="mt-4 text-sm text-muted-foreground text-right">
            Showing {filteredRows.length} of {productRows.length} products
          </div>
        )}
      </div>
    </div>
  );
};

export default ProductDashboard;
