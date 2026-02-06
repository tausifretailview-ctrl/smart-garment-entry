import { useState, useEffect } from "react";
import { Plus, Package, Image } from "lucide-react";
import { Avatar, AvatarImage, AvatarFallback } from "@/components/ui/avatar";
import { Button } from "@/components/ui/button";
import { supabase } from "@/integrations/supabase/client";

export interface ProductImage {
  id: string;
  image_url: string;
  display_order: number;
}

interface ProductImageGalleryProps {
  productId: string;
  productName: string;
  fallbackImageUrl?: string;
  onImageClick: (images: ProductImage[], productId: string, productName: string) => void;
  onAddClick: (productId: string, productName: string, existingImages: ProductImage[]) => void;
}

export const ProductImageGallery = ({
  productId,
  productName,
  fallbackImageUrl,
  onImageClick,
  onAddClick,
}: ProductImageGalleryProps) => {
  const [images, setImages] = useState<ProductImage[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetchImages();
  }, [productId]);

  const fetchImages = async () => {
    try {
      const { data, error } = await supabase
        .from("product_images")
        .select("id, image_url, display_order")
        .eq("product_id", productId)
        .order("display_order", { ascending: true });

      if (error) throw error;
      setImages(data || []);
    } catch (error) {
      console.error("Failed to fetch product images:", error);
      // If no images in new table, show fallback from products.image_url
      setImages([]);
    } finally {
      setLoading(false);
    }
  };

  const handleImageClick = (e: React.MouseEvent) => {
    e.stopPropagation();
    if (images.length > 0) {
      onImageClick(images, productId, productName);
    } else if (fallbackImageUrl) {
      // If only fallback image, still open viewer
      onImageClick([{ id: 'fallback', image_url: fallbackImageUrl, display_order: 1 }], productId, productName);
    }
  };

  const handleAddClick = (e: React.MouseEvent) => {
    e.stopPropagation();
    onAddClick(productId, productName, images);
  };

  if (loading) {
    return (
      <div className="flex gap-1 items-center">
        <div className="h-10 w-10 rounded bg-muted animate-pulse" />
      </div>
    );
  }

  const displayImages = images.length > 0 ? images : (fallbackImageUrl ? [{ id: 'fallback', image_url: fallbackImageUrl, display_order: 1 }] : []);
  const canAddMore = images.length < 3;

  return (
    <div className="flex gap-1 items-center">
      {displayImages.length > 0 ? (
        <>
          {displayImages.slice(0, 3).map((img, idx) => (
            <Avatar 
              key={img.id} 
              className="h-10 w-10 rounded cursor-pointer hover:ring-2 hover:ring-primary transition-all"
              onClick={handleImageClick}
            >
              <AvatarImage
                src={img.image_url}
                alt={`${productName} ${idx + 1}`}
                className="object-cover"
              />
              <AvatarFallback className="rounded bg-muted">
                <Package className="h-4 w-4 text-muted-foreground" />
              </AvatarFallback>
            </Avatar>
          ))}
          {canAddMore && (
            <Button
              variant="outline"
              size="icon"
              className="h-10 w-10 rounded border-dashed"
              onClick={handleAddClick}
            >
              <Plus className="h-4 w-4 text-muted-foreground" />
            </Button>
          )}
        </>
      ) : (
        <Button
          variant="outline"
          size="icon"
          className="h-10 w-10 rounded border-dashed"
          onClick={handleAddClick}
        >
          <Image className="h-4 w-4 text-muted-foreground" />
        </Button>
      )}
    </div>
  );
};
