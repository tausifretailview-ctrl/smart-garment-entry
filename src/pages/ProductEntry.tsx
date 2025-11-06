import { useState, useEffect } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useToast } from "@/hooks/use-toast";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Switch } from "@/components/ui/switch";
import { Loader2, Package, Barcode } from "lucide-react";

interface SizeGroup {
  id: string;
  group_name: string;
  sizes: string[];
}

interface ProductVariant {
  size: string;
  pur_price: number;
  sale_price: number;
  barcode: string;
  active: boolean;
}

interface ProductForm {
  product_name: string;
  category: string;
  brand: string;
  style: string;
  color: string;
  size_group_id: string;
  hsn_code: string;
  gst_per: number;
  default_pur_price: number;
  default_sale_price: number;
  status: string;
}

const ProductEntry = () => {
  const { toast } = useToast();
  const [loading, setLoading] = useState(false);
  const [sizeGroups, setSizeGroups] = useState<SizeGroup[]>([]);
  const [variants, setVariants] = useState<ProductVariant[]>([]);
  const [showVariants, setShowVariants] = useState(false);
  
  const [formData, setFormData] = useState<ProductForm>({
    product_name: "",
    category: "",
    brand: "",
    style: "",
    color: "",
    size_group_id: "",
    hsn_code: "",
    gst_per: 18,
    default_pur_price: 0,
    default_sale_price: 0,
    status: "active",
  });

  useEffect(() => {
    fetchSizeGroups();
  }, []);

  const fetchSizeGroups = async () => {
    const { data, error } = await supabase
      .from("size_groups")
      .select("*")
      .order("group_name");

    if (error) {
      toast({
        title: "Error",
        description: "Failed to load size groups",
        variant: "destructive",
      });
    } else {
      const typedData: SizeGroup[] = (data || []).map((item) => ({
        id: item.id,
        group_name: item.group_name,
        sizes: Array.isArray(item.sizes) 
          ? item.sizes.filter((s): s is string => typeof s === 'string')
          : [],
      }));
      setSizeGroups(typedData);
    }
  };

  const generateEAN8Checksum = (code: string): string => {
    const digits = code.split("").map(Number);
    let sum = 0;
    for (let i = 0; i < 7; i++) {
      sum += digits[i] * (i % 2 === 0 ? 3 : 1);
    }
    const checksum = (10 - (sum % 10)) % 10;
    return checksum.toString();
  };

  const generateEAN8Barcode = (): string => {
    const randomDigits = Math.floor(Math.random() * 10000000)
      .toString()
      .padStart(7, "0");
    const checksum = generateEAN8Checksum(randomDigits);
    return randomDigits + checksum;
  };

  const handleGenerateSizeVariants = () => {
    const selectedGroup = sizeGroups.find((g) => g.id === formData.size_group_id);
    if (!selectedGroup) {
      toast({
        title: "Error",
        description: "Please select a size group first",
        variant: "destructive",
      });
      return;
    }

    const newVariants: ProductVariant[] = selectedGroup.sizes.map((size) => ({
      size,
      pur_price: formData.default_pur_price,
      sale_price: formData.default_sale_price,
      barcode: "",
      active: true,
    }));

    setVariants(newVariants);
    setShowVariants(true);
  };

  const handleAutoGenerateBarcodes = () => {
    const updatedVariants = variants.map((v) => ({
      ...v,
      barcode: v.barcode || generateEAN8Barcode(),
    }));
    setVariants(updatedVariants);
    toast({
      title: "Success",
      description: "Barcodes generated for all variants",
    });
  };

  const handleVariantChange = (index: number, field: keyof ProductVariant, value: any) => {
    const updated = [...variants];
    updated[index] = { ...updated[index], [field]: value };
    setVariants(updated);
  };

  const validateForm = (): boolean => {
    if (!formData.product_name.trim()) {
      toast({
        title: "Validation Error",
        description: "Product name is required",
        variant: "destructive",
      });
      return false;
    }

    if (![0, 5, 12, 18, 28].includes(formData.gst_per)) {
      toast({
        title: "Validation Error",
        description: "GST % must be one of: 0, 5, 12, 18, 28",
        variant: "destructive",
      });
      return false;
    }

    if (formData.default_pur_price < 0 || formData.default_sale_price < 0) {
      toast({
        title: "Validation Error",
        description: "Prices cannot be negative",
        variant: "destructive",
      });
      return false;
    }

    return true;
  };

  const handleSave = async () => {
    if (!validateForm()) return;

    setLoading(true);
    try {
      // Insert product
      const { data: productData, error: productError } = await supabase
        .from("products")
        .insert([formData])
        .select()
        .single();

      if (productError) throw productError;

      // Insert variants
      if (variants.length > 0) {
        const variantsToInsert = variants.map((v) => ({
          product_id: productData.id,
          ...v,
        }));

        const { error: variantsError } = await supabase
          .from("product_variants")
          .insert(variantsToInsert);

        if (variantsError) throw variantsError;
      }

      toast({
        title: "Success",
        description: `Product "${formData.product_name}" saved successfully`,
      });

      // Reset form
      setFormData({
        product_name: "",
        category: "",
        brand: "",
        style: "",
        color: "",
        size_group_id: "",
        hsn_code: "",
        gst_per: 18,
        default_pur_price: 0,
        default_sale_price: 0,
        status: "active",
      });
      setVariants([]);
      setShowVariants(false);
    } catch (error: any) {
      toast({
        title: "Error",
        description: error.message || "Failed to save product",
        variant: "destructive",
      });
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-background p-4 md:p-8">
      <div className="max-w-6xl mx-auto">
        <div className="mb-6 flex items-center gap-3">
          <Package className="h-8 w-8 text-primary" />
          <h1 className="text-3xl font-bold text-foreground">Smart Inventory</h1>
        </div>

        <Card className="shadow-lg border-border">
          <CardHeader>
            <CardTitle className="text-2xl">Product Entry</CardTitle>
            <CardDescription>Add new product to your inventory</CardDescription>
          </CardHeader>
          <CardContent className="space-y-6">
            {/* Product Details Form */}
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
              <div className="space-y-2">
                <Label htmlFor="product_name">Product Name *</Label>
                <Input
                  id="product_name"
                  value={formData.product_name}
                  onChange={(e) =>
                    setFormData({ ...formData, product_name: e.target.value })
                  }
                  placeholder="Enter product name"
                />
              </div>

              <div className="space-y-2">
                <Label htmlFor="category">Category</Label>
                <Input
                  id="category"
                  value={formData.category}
                  onChange={(e) =>
                    setFormData({ ...formData, category: e.target.value })
                  }
                  placeholder="e.g., T-Shirt, Jeans"
                />
              </div>

              <div className="space-y-2">
                <Label htmlFor="brand">Brand</Label>
                <Input
                  id="brand"
                  value={formData.brand}
                  onChange={(e) =>
                    setFormData({ ...formData, brand: e.target.value })
                  }
                  placeholder="Brand name"
                />
              </div>

              <div className="space-y-2">
                <Label htmlFor="style">Style</Label>
                <Input
                  id="style"
                  value={formData.style}
                  onChange={(e) =>
                    setFormData({ ...formData, style: e.target.value })
                  }
                  placeholder="Style description"
                />
              </div>

              <div className="space-y-2">
                <Label htmlFor="color">Color</Label>
                <Input
                  id="color"
                  value={formData.color}
                  onChange={(e) =>
                    setFormData({ ...formData, color: e.target.value })
                  }
                  placeholder="Color"
                />
              </div>

              <div className="space-y-2">
                <Label htmlFor="size_group">Size Group</Label>
                <Select
                  value={formData.size_group_id}
                  onValueChange={(value) =>
                    setFormData({ ...formData, size_group_id: value })
                  }
                >
                  <SelectTrigger>
                    <SelectValue placeholder="Select size group" />
                  </SelectTrigger>
                  <SelectContent>
                    {sizeGroups.map((group) => (
                      <SelectItem key={group.id} value={group.id}>
                        {group.group_name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              <div className="space-y-2">
                <Label htmlFor="hsn_code">HSN Code</Label>
                <Input
                  id="hsn_code"
                  value={formData.hsn_code}
                  onChange={(e) =>
                    setFormData({ ...formData, hsn_code: e.target.value })
                  }
                  placeholder="HSN Code"
                />
              </div>

              <div className="space-y-2">
                <Label htmlFor="gst_per">GST % *</Label>
                <Select
                  value={formData.gst_per.toString()}
                  onValueChange={(value) =>
                    setFormData({ ...formData, gst_per: parseInt(value) })
                  }
                >
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {[0, 5, 12, 18, 28].map((rate) => (
                      <SelectItem key={rate} value={rate.toString()}>
                        {rate}%
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              <div className="space-y-2">
                <Label htmlFor="default_pur_price">Default Purchase Price</Label>
                <Input
                  id="default_pur_price"
                  type="number"
                  min="0"
                  step="0.01"
                  value={formData.default_pur_price}
                  onChange={(e) =>
                    setFormData({
                      ...formData,
                      default_pur_price: parseFloat(e.target.value) || 0,
                    })
                  }
                />
              </div>

              <div className="space-y-2">
                <Label htmlFor="default_sale_price">Default Sale Price</Label>
                <Input
                  id="default_sale_price"
                  type="number"
                  min="0"
                  step="0.01"
                  value={formData.default_sale_price}
                  onChange={(e) =>
                    setFormData({
                      ...formData,
                      default_sale_price: parseFloat(e.target.value) || 0,
                    })
                  }
                />
              </div>

              <div className="space-y-2">
                <Label htmlFor="status">Status</Label>
                <Select
                  value={formData.status}
                  onValueChange={(value) =>
                    setFormData({ ...formData, status: value })
                  }
                >
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="active">Active</SelectItem>
                    <SelectItem value="inactive">Inactive</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>

            {/* Generate Variants Button */}
            <div className="flex justify-start">
              <Button
                onClick={handleGenerateSizeVariants}
                disabled={!formData.size_group_id}
                variant="secondary"
                className="gap-2"
              >
                <Package className="h-4 w-4" />
                Generate Size Variants
              </Button>
            </div>

            {/* Size Variants Table */}
            {showVariants && variants.length > 0 && (
              <div className="space-y-4">
                <div className="flex items-center justify-between">
                  <h3 className="text-lg font-semibold">Size Variants</h3>
                  <Button
                    onClick={handleAutoGenerateBarcodes}
                    size="sm"
                    className="gap-2"
                  >
                    <Barcode className="h-4 w-4" />
                    Auto-Generate Barcodes
                  </Button>
                </div>

                <div className="border rounded-lg overflow-hidden">
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>Size</TableHead>
                        <TableHead>Purchase Price</TableHead>
                        <TableHead>Sale Price</TableHead>
                        <TableHead>Barcode</TableHead>
                        <TableHead className="text-center">Active</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {variants.map((variant, index) => (
                        <TableRow key={index}>
                          <TableCell className="font-medium">{variant.size}</TableCell>
                          <TableCell>
                            <Input
                              type="number"
                              min="0"
                              step="0.01"
                              value={variant.pur_price}
                              onChange={(e) =>
                                handleVariantChange(
                                  index,
                                  "pur_price",
                                  parseFloat(e.target.value) || 0
                                )
                              }
                              className="w-32"
                            />
                          </TableCell>
                          <TableCell>
                            <Input
                              type="number"
                              min="0"
                              step="0.01"
                              value={variant.sale_price}
                              onChange={(e) =>
                                handleVariantChange(
                                  index,
                                  "sale_price",
                                  parseFloat(e.target.value) || 0
                                )
                              }
                              className="w-32"
                            />
                          </TableCell>
                          <TableCell>
                            <Input
                              value={variant.barcode}
                              readOnly
                              className="w-40 bg-muted"
                              placeholder="Not generated"
                            />
                          </TableCell>
                          <TableCell className="text-center">
                            <Switch
                              checked={variant.active}
                              onCheckedChange={(checked) =>
                                handleVariantChange(index, "active", checked)
                              }
                            />
                          </TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                </div>
              </div>
            )}

            {/* Save Button */}
            <div className="flex justify-end pt-4">
              <Button
                onClick={handleSave}
                disabled={loading}
                size="lg"
                className="gap-2 min-w-[150px]"
              >
                {loading ? (
                  <>
                    <Loader2 className="h-4 w-4 animate-spin" />
                    Saving...
                  </>
                ) : (
                  "Save Product"
                )}
              </Button>
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  );
};

export default ProductEntry;
