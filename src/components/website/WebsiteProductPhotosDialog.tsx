import { useRef, useState } from "react";
import { ImagePlus, Loader2, RefreshCw, Star, Trash2 } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { supabase } from "@/integrations/supabase/client";
import { compressImageFile } from "@/lib/compressImage";
import { websiteFrom } from "@/lib/websiteDb";
import {
  WEBSITE_PHOTOS_BUCKET,
  WEBSITE_PHOTOS_MAX,
  addWebsitePhoto,
  makeMainWebsitePhoto,
  ownWebsitePhotoPath,
  removeWebsitePhoto,
  replaceWebsitePhoto,
} from "@/lib/websitePhotos";

/**
 * Photos of one website listing: add, replace one with a new picture, remove,
 * or choose which one is shown first. Every change is saved straight away.
 */
export function WebsiteProductPhotosDialog({
  open,
  onOpenChange,
  orgId,
  listingId,
  productName,
  photoUrls,
  onChanged,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  orgId: string;
  listingId: string;
  productName: string;
  photoUrls: string[];
  onChanged: () => void;
}) {
  const [busy, setBusy] = useState(false);
  const fileRef = useRef<HTMLInputElement | null>(null);
  /** Position being replaced; null means the next picked file is added as a new photo. */
  const targetRef = useRef<number | null>(null);
  const full = photoUrls.length >= WEBSITE_PHOTOS_MAX;

  const save = async (next: string[], done: string) => {
    const { error } = await websiteFrom("website_products")
      .update({ photo_urls: next })
      .eq("id", listingId)
      .eq("organization_id", orgId);
    if (error) throw new Error(error.message);
    toast.success(done);
    onChanged();
  };

  /** Clear out a picture this listing no longer uses. A failure here only leaves an unused file behind. */
  const discard = async (url: string | undefined) => {
    const path = url ? ownWebsitePhotoPath(url, orgId, listingId) : null;
    if (!path) return;
    try {
      await supabase.storage.from(WEBSITE_PHOTOS_BUCKET).remove([path]);
    } catch {
      /* the listing is already saved without it */
    }
  };

  const run = async (work: () => Promise<void>) => {
    setBusy(true);
    try {
      await work();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Could not update the photos");
    } finally {
      setBusy(false);
    }
  };

  const pick = (index: number | null) => {
    targetRef.current = index;
    fileRef.current?.click();
  };

  const onFile = (file: File | undefined) => {
    if (!file) return;
    const index = targetRef.current;
    void run(async () => {
      const blob = await compressImageFile(file);
      const path = `${orgId}/${listingId}/${Date.now()}.jpg`;
      const { error } = await supabase.storage.from(WEBSITE_PHOTOS_BUCKET).upload(path, blob, {
        contentType: "image/jpeg",
        upsert: true,
      });
      if (error) throw error;
      const url = supabase.storage.from(WEBSITE_PHOTOS_BUCKET).getPublicUrl(path).data.publicUrl;
      if (index == null) {
        await save(addWebsitePhoto(photoUrls, url), "Photo added");
      } else {
        const old = photoUrls[index];
        await save(replaceWebsitePhoto(photoUrls, index, url), "Photo replaced");
        await discard(old);
      }
    });
  };

  return (
    <Dialog open={open} onOpenChange={(next) => (busy ? undefined : onOpenChange(next))}>
      <DialogContent className="max-w-2xl">
        <DialogHeader>
          <DialogTitle>Photos · {productName}</DialogTitle>
          <DialogDescription>
            The first photo is shown on the store's product cards. Up to {WEBSITE_PHOTOS_MAX} photos.
          </DialogDescription>
        </DialogHeader>

        <input
          ref={fileRef}
          type="file"
          accept="image/*"
          className="hidden"
          onChange={(e) => {
            onFile(e.target.files?.[0]);
            e.target.value = "";
          }}
        />

        <div className="grid max-h-[60vh] grid-cols-2 gap-3 overflow-y-auto sm:grid-cols-3">
          {photoUrls.map((url, index) => (
            <div key={url} className="rounded-lg border border-slate-200 p-2">
              <div className="relative aspect-[3/4] overflow-hidden rounded bg-slate-100">
                <img src={url} alt={`Photo ${index + 1}`} className="h-full w-full object-cover" />
                {index === 0 ? (
                  <span className="absolute left-1.5 top-1.5 rounded bg-teal-600 px-1.5 py-0.5 text-[11px] font-semibold text-white">
                    Main
                  </span>
                ) : null}
              </div>
              <div className="mt-2 flex flex-wrap gap-1">
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  className="h-8 flex-1 px-2 text-xs"
                  disabled={busy}
                  onClick={() => pick(index)}
                >
                  <RefreshCw className="mr-1 h-3.5 w-3.5" />
                  Replace
                </Button>
                {index > 0 ? (
                  <Button
                    type="button"
                    variant="outline"
                    size="icon"
                    className="h-8 w-8"
                    aria-label="Make main photo"
                    title="Make main photo"
                    disabled={busy}
                    onClick={() => void run(() => save(makeMainWebsitePhoto(photoUrls, index), "Main photo changed"))}
                  >
                    <Star className="h-3.5 w-3.5" />
                  </Button>
                ) : null}
                <Button
                  type="button"
                  variant="outline"
                  size="icon"
                  className="h-8 w-8 text-destructive"
                  aria-label="Remove photo"
                  title="Remove photo"
                  disabled={busy}
                  onClick={() =>
                    void run(async () => {
                      await save(removeWebsitePhoto(photoUrls, index), "Photo removed");
                      await discard(url);
                    })
                  }
                >
                  <Trash2 className="h-3.5 w-3.5" />
                </Button>
              </div>
            </div>
          ))}

          {!full ? (
            <button
              type="button"
              disabled={busy}
              onClick={() => pick(null)}
              className="flex aspect-[3/4] flex-col items-center justify-center gap-2 rounded-lg border border-dashed border-slate-300 text-sm font-medium text-slate-600 hover:bg-slate-50 disabled:opacity-60"
            >
              {busy ? <Loader2 className="h-5 w-5 animate-spin" /> : <ImagePlus className="h-5 w-5" />}
              {busy ? "Saving…" : "Add photo"}
            </button>
          ) : null}
        </div>
      </DialogContent>
    </Dialog>
  );
}
