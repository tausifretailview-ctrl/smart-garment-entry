import { useRef, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Loader2, Rotate3d, Trash2 } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { supabase } from "@/integrations/supabase/client";
import { compressImageFile } from "@/lib/compressImage";
import { websiteFrom } from "@/lib/websiteDb";
import { WEBSITE_PHOTOS_BUCKET, ownWebsitePhotoPath } from "@/lib/websitePhotos";
import {
  SPIN_FRAME_MAX_PX,
  SPIN_MAX_FRAMES,
  SPIN_MIN_FRAMES,
  cleanSpinUrls,
  isMissingSpinColumn,
  sortSpinFiles,
  spinFilesProblem,
  spinStep,
} from "@/lib/productSpin";

type SpinState = { frames: string[]; missingColumn: boolean };

/**
 * Photos dialog → 360° view: upload the photos taken around a product in one go. They are
 * ordered by file name (the order the camera took them), saved on the listing and shown on the
 * store's product page as a picture the customer drags to rotate.
 */
export function WebsiteProductSpinSection({ orgId, listingId }: { orgId: string; listingId: string }) {
  const queryClient = useQueryClient();
  const key = ["website_product_spin", orgId, listingId];
  const fileRef = useRef<HTMLInputElement | null>(null);
  const [progress, setProgress] = useState<string | null>(null);
  const [preview, setPreview] = useState(0);

  const query = useQuery({
    queryKey: key,
    queryFn: async (): Promise<SpinState> => {
      const { data, error } = await websiteFrom("website_products")
        .select("spin_urls")
        .eq("id", listingId)
        .eq("organization_id", orgId)
        .maybeSingle();
      if (error) {
        if (isMissingSpinColumn(error.message)) return { frames: [], missingColumn: true };
        throw new Error(error.message);
      }
      return { frames: cleanSpinUrls((data as { spin_urls?: unknown } | null)?.spin_urls), missingColumn: false };
    },
  });
  const frames = query.data?.frames ?? [];
  const busy = progress !== null;

  const removeFiles = async (urls: string[]) => {
    const paths = urls.map((url) => ownWebsitePhotoPath(url, orgId, listingId)).filter((p): p is string => !!p);
    if (paths.length === 0) return;
    try {
      await supabase.storage.from(WEBSITE_PHOTOS_BUCKET).remove(paths);
    } catch {
      /* the listing is already saved without them; unused files are harmless */
    }
  };

  const save = async (next: string[]) => {
    const { data, error } = await websiteFrom("website_products")
      .update({ spin_urls: next })
      .eq("id", listingId)
      .eq("organization_id", orgId)
      .select("id");
    if (error) throw new Error(error.message);
    if (!Array.isArray(data) || data.length === 0) throw new Error("Only an admin or manager can change the 360° view.");
    queryClient.setQueryData<SpinState>(key, { frames: next, missingColumn: false });
    setPreview(0);
  };

  const onFiles = async (picked: File[]) => {
    const files = sortSpinFiles(picked);
    const problem = spinFilesProblem(files.length);
    if (problem) {
      toast.error(problem);
      return;
    }
    const old = frames;
    const batch = Date.now();
    const uploaded: string[] = [];
    try {
      for (let i = 0; i < files.length; i += 1) {
        setProgress(`Uploading ${i + 1} of ${files.length}…`);
        const blob = await compressImageFile(files[i], SPIN_FRAME_MAX_PX, 0.8);
        const path = `${orgId}/${listingId}/spin-${batch}-${String(i + 1).padStart(2, "0")}.jpg`;
        const { error } = await supabase.storage.from(WEBSITE_PHOTOS_BUCKET).upload(path, blob, {
          contentType: "image/jpeg",
          upsert: true,
        });
        if (error) throw error;
        uploaded.push(supabase.storage.from(WEBSITE_PHOTOS_BUCKET).getPublicUrl(path).data.publicUrl);
      }
      setProgress("Saving…");
      await save(uploaded);
      await removeFiles(old);
      toast.success(`360° view saved with ${uploaded.length} photos. Reload the store to see it.`);
    } catch (err) {
      // Nothing was saved: clear out what this attempt uploaded.
      await removeFiles(uploaded);
      toast.error(err instanceof Error ? err.message : "Could not save the 360° view");
    } finally {
      setProgress(null);
    }
  };

  const remove = async () => {
    setProgress("Removing…");
    try {
      const old = frames;
      await save([]);
      await removeFiles(old);
      toast.success("360° view removed");
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Could not remove the 360° view");
    } finally {
      setProgress(null);
    }
  };

  return (
    <div className="space-y-2 border-t border-slate-200 pt-3">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div>
          <h3 className="flex items-center gap-1.5 text-sm font-semibold text-slate-900">
            <Rotate3d className="h-4 w-4" /> 360° view
            {frames.length > 0 ? <span className="font-normal text-muted-foreground">· {frames.length} photos</span> : null}
          </h3>
          <p className="text-sm text-muted-foreground">
            Put the product on a turntable or mannequin, take {SPIN_MIN_FRAMES} to {SPIN_MAX_FRAMES} photos turning it a
            little each time (12 to 24 is smooth), then choose them all together. Customers drag the picture to rotate
            it.
          </p>
        </div>
        <div className="flex gap-2">
          <Button
            type="button"
            variant="outline"
            size="sm"
            disabled={busy || query.isLoading || query.data?.missingColumn}
            onClick={() => fileRef.current?.click()}
          >
            {busy ? <Loader2 className="mr-1 h-4 w-4 animate-spin" /> : <Rotate3d className="mr-1 h-4 w-4" />}
            {progress ?? (frames.length > 0 ? "Replace 360° photos" : "Add 360° photos")}
          </Button>
          {frames.length > 0 ? (
            <Button
              type="button"
              variant="outline"
              size="icon"
              className="h-9 w-9 text-destructive"
              aria-label="Remove 360° view"
              title="Remove 360° view"
              disabled={busy}
              onClick={() => void remove()}
            >
              <Trash2 className="h-4 w-4" />
            </Button>
          ) : null}
        </div>
      </div>

      <input
        ref={fileRef}
        type="file"
        accept="image/*"
        multiple
        className="hidden"
        onChange={(e) => {
          const picked = Array.from(e.target.files ?? []);
          e.target.value = "";
          if (picked.length > 0) void onFiles(picked);
        }}
      />

      {query.data?.missingColumn ? (
        <p className="rounded-md border border-dashed px-3 py-2 text-sm text-muted-foreground">
          The 360° view is not set up on this database yet. Run the migration
          20270503120000_website_products_spin_urls.sql, then open Photos again.
        </p>
      ) : query.error ? (
        <p className="text-sm text-destructive">Could not load the 360° photos. Close and open Photos again.</p>
      ) : frames.length > 0 ? (
        <div className="flex items-center gap-3">
          <img
            src={frames[Math.min(preview, frames.length - 1)]}
            alt={`360° photo ${preview + 1} of ${frames.length}`}
            className="h-28 w-24 rounded bg-slate-100 object-cover"
          />
          <div className="flex-1 space-y-1">
            <input
              type="range"
              min={0}
              max={frames.length - 1}
              value={preview}
              aria-label="Turn the product"
              className="w-full"
              onChange={(e) => setPreview(spinStep(Number(e.target.value), 0, frames.length))}
            />
            <p className="text-xs text-muted-foreground">
              Slide to check the order. If it jumps, rename the photos in the order you took them (1, 2, 3…) and upload
              again.
            </p>
          </div>
        </div>
      ) : null}
    </div>
  );
}
