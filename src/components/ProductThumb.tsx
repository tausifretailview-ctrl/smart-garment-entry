import { useState } from "react";
import { ImageOff } from "lucide-react";
import { cn } from "@/lib/utils";
import { isUsableImageUrl } from "@/lib/productImages";

/**
 * Small product photo for report rows and the Field Sales app. Lazy-loaded; a missing or broken
 * photo shows a light placeholder of the same size so rows stay aligned.
 */
export function ProductThumb({
  url,
  alt = "",
  size = 40,
  className,
  onClick,
}: {
  url?: string | null;
  alt?: string;
  size?: number;
  className?: string;
  onClick?: (e: React.MouseEvent<HTMLImageElement>) => void;
}) {
  const [failed, setFailed] = useState(false);
  const show = isUsableImageUrl(url) && !failed;
  const box = { width: size, height: size };
  if (!show) {
    return (
      <span
        className={cn("inline-flex shrink-0 items-center justify-center rounded-md bg-muted text-muted-foreground/50", className)}
        style={box}
        aria-hidden
      >
        <ImageOff style={{ width: size * 0.4, height: size * 0.4 }} />
      </span>
    );
  }
  return (
    <img
      src={url!}
      alt={alt}
      loading="lazy"
      decoding="async"
      onError={() => setFailed(true)}
      onClick={onClick}
      className={cn("shrink-0 rounded-md border bg-white object-cover", onClick && "cursor-zoom-in", className)}
      style={box}
      data-testid="product-thumb"
    />
  );
}
