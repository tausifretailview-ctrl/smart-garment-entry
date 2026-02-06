import { useState, useEffect } from "react";
import { X, ChevronLeft, ChevronRight } from "lucide-react";
import { Dialog, DialogContent, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

interface ProductImage {
  id: string;
  image_url: string;
  display_order: number;
}

interface ProductImageViewerProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  images: ProductImage[];
  productName: string;
  initialIndex?: number;
}

export const ProductImageViewer = ({
  open,
  onOpenChange,
  images,
  productName,
  initialIndex = 0,
}: ProductImageViewerProps) => {
  const [currentIndex, setCurrentIndex] = useState(initialIndex);

  useEffect(() => {
    if (open) {
      setCurrentIndex(initialIndex);
    }
  }, [open, initialIndex]);

  const handlePrevious = () => {
    setCurrentIndex((prev) => (prev === 0 ? images.length - 1 : prev - 1));
  };

  const handleNext = () => {
    setCurrentIndex((prev) => (prev === images.length - 1 ? 0 : prev + 1));
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "ArrowLeft") {
      handlePrevious();
    } else if (e.key === "ArrowRight") {
      handleNext();
    } else if (e.key === "Escape") {
      onOpenChange(false);
    }
  };

  if (images.length === 0) return null;

  const currentImage = images[currentIndex];

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent 
        className="max-w-4xl w-[95vw] h-[90vh] p-0 bg-background/95 backdrop-blur-sm border-none"
        onKeyDown={handleKeyDown}
      >
        <DialogTitle className="sr-only">{productName} - Image {currentIndex + 1} of {images.length}</DialogTitle>
        <DialogDescription className="sr-only">
          Product image viewer. Use arrow keys to navigate.
        </DialogDescription>
        
        {/* Close button */}
        <Button
          variant="ghost"
          size="icon"
          className="absolute top-4 right-4 z-50 h-10 w-10 bg-background/80 hover:bg-background"
          onClick={() => onOpenChange(false)}
        >
          <X className="h-6 w-6" />
        </Button>

        {/* Image container */}
        <div className="relative flex items-center justify-center h-full p-8">
          {/* Previous button */}
          {images.length > 1 && (
            <Button
              variant="ghost"
              size="icon"
              className="absolute left-4 z-40 h-12 w-12 bg-background/80 hover:bg-background rounded-full"
              onClick={handlePrevious}
            >
              <ChevronLeft className="h-8 w-8" />
            </Button>
          )}

          {/* Main image */}
          <div className="relative max-h-full max-w-full flex items-center justify-center">
            <img
              src={currentImage?.image_url}
              alt={`${productName} - Image ${currentIndex + 1}`}
              className="max-h-[75vh] max-w-full object-contain rounded-lg shadow-lg"
            />
          </div>

          {/* Next button */}
          {images.length > 1 && (
            <Button
              variant="ghost"
              size="icon"
              className="absolute right-4 z-40 h-12 w-12 bg-background/80 hover:bg-background rounded-full"
              onClick={handleNext}
            >
              <ChevronRight className="h-8 w-8" />
            </Button>
          )}
        </div>

        {/* Dot indicators */}
        {images.length > 1 && (
          <div className="absolute bottom-6 left-1/2 -translate-x-1/2 flex gap-2">
            {images.map((_, index) => (
              <button
                key={index}
                className={cn(
                  "h-3 w-3 rounded-full transition-all",
                  index === currentIndex 
                    ? "bg-primary scale-110" 
                    : "bg-muted-foreground/50 hover:bg-muted-foreground/70"
                )}
                onClick={() => setCurrentIndex(index)}
                aria-label={`Go to image ${index + 1}`}
              />
            ))}
          </div>
        )}

        {/* Product name */}
        <div className="absolute top-4 left-4 bg-background/80 px-3 py-1.5 rounded-md">
          <p className="text-sm font-medium">{productName}</p>
          {images.length > 1 && (
            <p className="text-xs text-muted-foreground">
              {currentIndex + 1} of {images.length}
            </p>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
};
