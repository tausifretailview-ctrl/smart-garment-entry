import { useState, useRef } from "react";
import { Upload, X, Loader2, Trash2, Image } from "lucide-react";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { supabase } from "@/integrations/supabase/client";
import { useToast } from "@/hooks/use-toast";
import { useOrganization } from "@/contexts/OrganizationContext";

interface ProductImage {
  id: string;
  image_url: string;
  display_order: number;
}

interface ProductImageUploaderProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  productId: string;
  productName: string;
  existingImages: ProductImage[];
  onImagesUpdated: () => void;
}

const MAX_IMAGES = 3;
const MAX_FILE_SIZE = 5 * 1024 * 1024; // 5MB

export const ProductImageUploader = ({
  open,
  onOpenChange,
  productId,
  productName,
  existingImages,
  onImagesUpdated,
}: ProductImageUploaderProps) => {
  const { toast } = useToast();
  const { currentOrganization } = useOrganization();
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [images, setImages] = useState<ProductImage[]>(existingImages);
  const [uploading, setUploading] = useState(false);
  const [deleting, setDeleting] = useState<string | null>(null);

  const canAddMore = images.length < MAX_IMAGES;

  const handleFileSelect = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = e.target.files;
    if (!files || files.length === 0) return;

    const file = files[0];
    
    // Validate file size
    if (file.size > MAX_FILE_SIZE) {
      toast({
        title: "File too large",
        description: "Maximum file size is 5MB",
        variant: "destructive",
      });
      return;
    }

    // Validate file type
    if (!file.type.startsWith("image/")) {
      toast({
        title: "Invalid file type",
        description: "Please select an image file",
        variant: "destructive",
      });
      return;
    }

    // Check max images
    if (images.length >= MAX_IMAGES) {
      toast({
        title: "Maximum images reached",
        description: `You can only have ${MAX_IMAGES} images per product`,
        variant: "destructive",
      });
      return;
    }

    await uploadImage(file);
    
    // Reset file input
    if (fileInputRef.current) {
      fileInputRef.current.value = "";
    }
  };

  const uploadImage = async (file: File) => {
    if (!currentOrganization?.id) {
      toast({
        title: "Error",
        description: "No organization selected",
        variant: "destructive",
      });
      return;
    }

    setUploading(true);

    try {
      // Get the next available display order from database
      const { data: existingOrders } = await supabase
        .from("product_images")
        .select("display_order")
        .eq("product_id", productId)
        .order("display_order", { ascending: false })
        .limit(1);

      const nextOrder = existingOrders && existingOrders.length > 0 
        ? existingOrders[0].display_order + 1 
        : 1;

      // Check if we've reached max images
      if (nextOrder > MAX_IMAGES) {
        toast({
          title: "Maximum images reached",
          description: `You can only have ${MAX_IMAGES} images per product`,
          variant: "destructive",
        });
        setUploading(false);
        return;
      }

      // Generate unique filename
      const fileExt = file.name.split(".").pop();
      const fileName = `${productId}/${Date.now()}.${fileExt}`;

      // Upload to storage
      const { error: uploadError } = await supabase.storage
        .from("product-images")
        .upload(fileName, file, {
          cacheControl: "3600",
          upsert: false,
        });

      if (uploadError) throw uploadError;

      // Get public URL
      const { data: publicUrlData } = supabase.storage
        .from("product-images")
        .getPublicUrl(fileName);
      const imageUrl = publicUrlData.publicUrl;

      // Insert into product_images table
      const { data: insertedImage, error: insertError } = await supabase
        .from("product_images")
        .insert({
          product_id: productId,
          organization_id: currentOrganization.id,
          image_url: imageUrl,
          display_order: nextOrder,
        })
        .select("id, image_url, display_order")
        .single();

      if (insertError) throw insertError;

      // Update local state
      setImages([...images, insertedImage]);

      // If this is the first image, update products.image_url for backward compatibility
      if (nextOrder === 1) {
        await supabase
          .from("products")
          .update({ image_url: imageUrl })
          .eq("id", productId);
      }

      toast({
        title: "Success",
        description: "Image uploaded successfully",
      });

    } catch (error: any) {
      console.error("Upload error:", error);
      toast({
        title: "Upload failed",
        description: error.message || "Failed to upload image",
        variant: "destructive",
      });
    } finally {
      setUploading(false);
    }
  };

  const handleDeleteImage = async (imageId: string, imageUrl: string) => {
    setDeleting(imageId);

    try {
      // Delete from database
      const { error: deleteError } = await supabase
        .from("product_images")
        .delete()
        .eq("id", imageId);

      if (deleteError) throw deleteError;

      // Update local state
      const remainingImages = images.filter(img => img.id !== imageId);
      setImages(remainingImages);

      // If we deleted the primary image, update products.image_url
      const deletedImage = images.find(img => img.id === imageId);
      if (deletedImage?.display_order === 1) {
        // Set to next image or null
        const nextPrimaryImage = remainingImages.find(img => img.display_order === 2);
        await supabase
          .from("products")
          .update({ image_url: nextPrimaryImage?.image_url || null })
          .eq("id", productId);
      }

      // Try to delete from storage (don't fail if this fails)
      try {
        const urlParts = imageUrl.split("/product-images/");
        if (urlParts[1]) {
          await supabase.storage
            .from("product-images")
            .remove([urlParts[1]]);
        }
      } catch (storageError) {
        console.warn("Failed to delete from storage:", storageError);
      }

      toast({
        title: "Success",
        description: "Image deleted successfully",
      });

    } catch (error: any) {
      console.error("Delete error:", error);
      toast({
        title: "Delete failed",
        description: error.message || "Failed to delete image",
        variant: "destructive",
      });
    } finally {
      setDeleting(null);
    }
  };

  const handleClose = () => {
    onImagesUpdated();
    onOpenChange(false);
  };

  return (
    <Dialog open={open} onOpenChange={handleClose}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle>Manage Product Images</DialogTitle>
          <DialogDescription>
            {productName} - Upload up to {MAX_IMAGES} images
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4">
          {/* Existing images */}
          {images.length > 0 && (
            <div className="grid grid-cols-3 gap-3">
              {images.map((img) => (
                <div key={img.id} className="relative group">
                  <img
                    src={img.image_url}
                    alt={`Product image ${img.display_order}`}
                    className="h-24 w-full object-cover rounded-lg border"
                  />
                  <Button
                    variant="destructive"
                    size="icon"
                    className="absolute top-1 right-1 h-6 w-6 opacity-0 group-hover:opacity-100 transition-opacity"
                    onClick={() => handleDeleteImage(img.id, img.image_url)}
                    disabled={deleting === img.id}
                  >
                    {deleting === img.id ? (
                      <Loader2 className="h-3 w-3 animate-spin" />
                    ) : (
                      <Trash2 className="h-3 w-3" />
                    )}
                  </Button>
                  <span className="absolute bottom-1 left-1 bg-background/80 text-xs px-1.5 py-0.5 rounded">
                    #{img.display_order}
                  </span>
                </div>
              ))}
            </div>
          )}

          {/* Upload area */}
          {canAddMore && (
            <div
              className="border-2 border-dashed rounded-lg p-6 text-center cursor-pointer hover:border-primary transition-colors"
              onClick={() => fileInputRef.current?.click()}
            >
              {uploading ? (
                <div className="flex flex-col items-center gap-2">
                  <Loader2 className="h-8 w-8 animate-spin text-primary" />
                  <p className="text-sm text-muted-foreground">Uploading...</p>
                </div>
              ) : (
                <div className="flex flex-col items-center gap-2">
                  <div className="h-12 w-12 rounded-full bg-primary/10 flex items-center justify-center">
                    <Upload className="h-6 w-6 text-primary" />
                  </div>
                  <p className="text-sm font-medium">Click to upload</p>
                  <p className="text-xs text-muted-foreground">
                    PNG, JPG up to 5MB ({MAX_IMAGES - images.length} remaining)
                  </p>
                </div>
              )}
              <input
                ref={fileInputRef}
                type="file"
                accept="image/*"
                className="hidden"
                onChange={handleFileSelect}
                disabled={uploading}
              />
            </div>
          )}

          {/* No images message */}
          {images.length === 0 && !canAddMore && (
            <div className="text-center py-8 text-muted-foreground">
              <Image className="h-12 w-12 mx-auto mb-2 opacity-50" />
              <p>No images uploaded yet</p>
            </div>
          )}
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={handleClose}>
            Done
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
};
