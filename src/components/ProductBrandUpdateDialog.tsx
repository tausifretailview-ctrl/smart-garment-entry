import { useEffect, useMemo, useState } from "react";
import { toast } from "sonner";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { AlertTriangle, Loader2 } from "lucide-react";
import { MergeDuplicateBrandsDialog } from "@/components/MergeDuplicateBrandsDialog";
import { MergeDuplicateProductsDialog } from "@/components/MergeDuplicateProductsDialog";
import { ProductMergeCombobox } from "@/components/ProductMergeCombobox";
import {
  findProductNameCollision,
  listOrgProductsForMerge,
  type ProductPickerResult,
} from "@/utils/productMergeUtils";
import { renameOrgBrand, renameOrgProductName } from "@/utils/productNameUpdate";

type TabId = "rename" | "merge" | "brand";

interface ProductBrandUpdateDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  organizationId: string;
  brands: string[];
  onComplete: () => void;
}

export function ProductBrandUpdateDialog({
  open,
  onOpenChange,
  organizationId,
  brands,
  onComplete,
}: ProductBrandUpdateDialogProps) {
  const [tab, setTab] = useState<TabId>("rename");
  const [products, setProducts] = useState<ProductPickerResult[]>([]);
  const [loadingList, setLoadingList] = useState(false);

  const [renameProduct, setRenameProduct] = useState<ProductPickerResult | null>(null);
  const [newProductName, setNewProductName] = useState("");
  const [renaming, setRenaming] = useState(false);

  const [mergeSource, setMergeSource] = useState<ProductPickerResult | null>(null);
  const [mergeTarget, setMergeTarget] = useState<ProductPickerResult | null>(null);

  const [currentBrand, setCurrentBrand] = useState("");
  const [newBrand, setNewBrand] = useState("");
  const [renamingBrand, setRenamingBrand] = useState(false);

  const reloadProducts = async () => {
    if (!organizationId) return;
    setLoadingList(true);
    try {
      setProducts(await listOrgProductsForMerge(organizationId));
    } catch (err) {
      console.error(err);
      toast.error(err instanceof Error ? err.message : "Failed to load products");
    } finally {
      setLoadingList(false);
    }
  };

  useEffect(() => {
    if (!open || !organizationId) return;
    setTab("rename");
    setRenameProduct(null);
    setNewProductName("");
    setMergeSource(null);
    setMergeTarget(null);
    setCurrentBrand("");
    setNewBrand("");
    void reloadProducts();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, organizationId]);

  const collision = useMemo(() => {
    if (!renameProduct || !newProductName.trim()) return null;
    if (newProductName.trim() === renameProduct.productName) return null;
    return findProductNameCollision(products, newProductName, renameProduct.id);
  }, [products, renameProduct, newProductName]);

  const handleRenameProduct = async () => {
    if (!renameProduct) return;
    const next = newProductName.trim();
    if (!next) {
      toast.error("Enter the new product name");
      return;
    }
    if (next === renameProduct.productName) {
      toast.error("New name is the same as the current name");
      return;
    }
    if (collision?.kind === "exact") {
      toast.error(`"${collision.product.productName}" already exists — merge instead of renaming`);
      return;
    }
    setRenaming(true);
    try {
      const saved = await renameOrgProductName(organizationId, renameProduct.id, next);
      toast.success(`Renamed to "${saved}"`);
      setRenameProduct({ ...renameProduct, productName: saved });
      setNewProductName("");
      onComplete();
      await reloadProducts();
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : "Rename failed";
      if (/unique|duplicate|idx_unique_active_product_name/i.test(message)) {
        toast.error("That product name already exists. Use Merge products to combine the two masters.");
      } else {
        toast.error(message);
      }
    } finally {
      setRenaming(false);
    }
  };

  const switchToMerge = (source: ProductPickerResult, target: ProductPickerResult) => {
    setMergeSource(source);
    setMergeTarget(target);
    setTab("merge");
  };

  const handleRenameBrand = async () => {
    if (!currentBrand) {
      toast.error("Select a brand");
      return;
    }
    if (!newBrand.trim()) {
      toast.error("Enter the new brand name");
      return;
    }
    setRenamingBrand(true);
    try {
      const saved = await renameOrgBrand(organizationId, currentBrand, newBrand);
      toast.success(`Brand updated to "${saved}"`);
      setCurrentBrand("");
      setNewBrand("");
      onComplete();
    } catch (err: unknown) {
      toast.error(err instanceof Error ? err.message : "Brand update failed");
    } finally {
      setRenamingBrand(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Product & Brand Update</DialogTitle>
          <DialogDescription>
            Rename a product (e.g. FLEXI LS/100 → FLEXI LS100), merge two masters from the dropdown, or
            update brand spellings. Merge never silently combines colliding size + color variants.
          </DialogDescription>
        </DialogHeader>

        <Tabs value={tab} onValueChange={(v) => setTab(v as TabId)} className="space-y-4">
          <TabsList className="grid w-full grid-cols-3 h-auto p-1">
            <TabsTrigger value="rename" className="text-sm">
              Rename product
            </TabsTrigger>
            <TabsTrigger value="merge" className="text-sm">
              Merge products
            </TabsTrigger>
            <TabsTrigger value="brand" className="text-sm">
              Brand
            </TabsTrigger>
          </TabsList>

          <TabsContent value="rename" className="mt-0 space-y-4">
            <ProductMergeCombobox
              label="Current product"
              products={products}
              selected={renameProduct}
              onSelect={(p) => {
                setRenameProduct(p);
                setNewProductName(p?.productName || "");
              }}
              disabled={loadingList || renaming}
              placeholder={loadingList ? "Loading products…" : "Select product…"}
            />
            <div className="space-y-1.5">
              <Label className="text-xs font-medium text-muted-foreground">New product name</Label>
              <Input
                value={newProductName}
                onChange={(e) => setNewProductName(e.target.value)}
                placeholder="e.g. FLEXI LS100"
                className="h-11"
                disabled={!renameProduct || renaming}
              />
              <p className="text-xs text-muted-foreground">
                Example: FLEXI LS/100 → FLEXI LS100. If that name already exists as another master, use
                Merge products.
              </p>
            </div>

            {collision?.kind === "exact" && renameProduct && (
              <Alert>
                <AlertTriangle className="h-4 w-4" />
                <AlertDescription className="flex flex-col sm:flex-row sm:items-center gap-2">
                  <span>
                    "{collision.product.productName}" already exists. Rename is blocked — merge the two
                    products instead.
                  </span>
                  <Button
                    type="button"
                    size="sm"
                    variant="outline"
                    className="shrink-0"
                    onClick={() => switchToMerge(renameProduct, collision.product)}
                  >
                    Open merge
                  </Button>
                </AlertDescription>
              </Alert>
            )}

            {collision?.kind === "compact" && renameProduct && (
              <Alert>
                <AlertTriangle className="h-4 w-4" />
                <AlertDescription className="flex flex-col sm:flex-row sm:items-center gap-2">
                  <span>
                    Looks like a spelling variant of "{collision.product.productName}". You can rename
                    this master, or merge INTO that product from the dropdown.
                  </span>
                  <Button
                    type="button"
                    size="sm"
                    variant="outline"
                    className="shrink-0"
                    onClick={() => switchToMerge(renameProduct, collision.product)}
                  >
                    Merge instead
                  </Button>
                </AlertDescription>
              </Alert>
            )}

            <div className="flex justify-end">
              <Button
                type="button"
                onClick={() => void handleRenameProduct()}
                disabled={
                  !renameProduct ||
                  !newProductName.trim() ||
                  renaming ||
                  collision?.kind === "exact"
                }
              >
                {renaming ? (
                  <>
                    <Loader2 className="h-4 w-4 animate-spin mr-2" />
                    Updating…
                  </>
                ) : (
                  "Update product name"
                )}
              </Button>
            </div>
          </TabsContent>

          <TabsContent value="merge" className="mt-0">
            <MergeDuplicateProductsDialog
              open={open && tab === "merge"}
              onOpenChange={onOpenChange}
              organizationId={organizationId}
              onMergeComplete={() => {
                onComplete();
                void reloadProducts();
              }}
              embedded
              initialSource={mergeSource}
              initialTarget={mergeTarget}
            />
          </TabsContent>

          <TabsContent value="brand" className="mt-0 space-y-6">
            <div className="rounded-lg border p-4 space-y-3">
              <div>
                <h3 className="text-sm font-semibold">Rename brand</h3>
                <p className="text-xs text-muted-foreground mt-0.5">
                  Change a brand spelling on every product that uses it (saved UPPERCASE).
                </p>
              </div>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div className="space-y-1.5">
                  <Label className="text-xs font-medium text-muted-foreground">Current brand</Label>
                  <Select
                    value={currentBrand || undefined}
                    onValueChange={(v) => {
                      setCurrentBrand(v);
                      setNewBrand(v);
                    }}
                  >
                    <SelectTrigger className="h-11">
                      <SelectValue placeholder="Select brand…" />
                    </SelectTrigger>
                    <SelectContent>
                      {brands.map((b) => (
                        <SelectItem key={b} value={b}>
                          {b}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-1.5">
                  <Label className="text-xs font-medium text-muted-foreground">New brand</Label>
                  <Input
                    value={newBrand}
                    onChange={(e) => setNewBrand(e.target.value)}
                    placeholder="e.g. FLEXI"
                    className="h-11"
                    disabled={!currentBrand || renamingBrand}
                  />
                </div>
              </div>
              <div className="flex justify-end">
                <Button
                  type="button"
                  onClick={() => void handleRenameBrand()}
                  disabled={!currentBrand || !newBrand.trim() || renamingBrand}
                >
                  {renamingBrand ? (
                    <>
                      <Loader2 className="h-4 w-4 animate-spin mr-2" />
                      Updating…
                    </>
                  ) : (
                    "Update brand"
                  )}
                </Button>
              </div>
            </div>

            <div className="rounded-lg border p-4">
              <h3 className="text-sm font-semibold mb-1">Merge duplicate brands</h3>
              <MergeDuplicateBrandsDialog
                open={open && tab === "brand"}
                onOpenChange={onOpenChange}
                organizationId={organizationId}
                onMergeComplete={onComplete}
                embedded
              />
            </div>
          </TabsContent>
        </Tabs>
      </DialogContent>
    </Dialog>
  );
}
