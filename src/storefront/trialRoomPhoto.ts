/**
 * AI Trial Room: the shopper's photo. Kept in this tab's memory only (never localStorage or
 * sessionStorage), and scaled down before it is sent.
 */
import { TRIAL_ROOM_PHOTO_MAX_EDGE } from "@/lib/trialRoom";

// This tab only: lets the shopper try the next product without adding the photo again.
let rememberedPhoto: string | null = null;

export function rememberedTrialRoomPhoto(): string | null {
  return rememberedPhoto;
}

export function rememberTrialRoomPhoto(photo: string | null): void {
  rememberedPhoto = photo;
}

async function loadBitmap(file: File): Promise<{ source: CanvasImageSource; width: number; height: number; close: () => void }> {
  if (typeof createImageBitmap === "function") {
    try {
      // Phone photos carry their rotation in EXIF; "from-image" turns them upright.
      const bitmap = await createImageBitmap(file, { imageOrientation: "from-image" });
      return { source: bitmap, width: bitmap.width, height: bitmap.height, close: () => bitmap.close() };
    } catch {
      /* fall through to <img> */
    }
  }
  const url = URL.createObjectURL(file);
  try {
    const img = await new Promise<HTMLImageElement>((resolve, reject) => {
      const el = new Image();
      el.onload = () => resolve(el);
      el.onerror = () => reject(new Error("This photo could not be opened"));
      el.src = url;
    });
    return { source: img, width: img.naturalWidth, height: img.naturalHeight, close: () => undefined };
  } finally {
    URL.revokeObjectURL(url);
  }
}

/** The shopper's photo as a JPEG data URL, longest side TRIAL_ROOM_PHOTO_MAX_EDGE. */
export async function trialRoomPhotoFromFile(file: File): Promise<string> {
  if (!file.type.startsWith("image/")) throw new Error("Please choose a photo");
  const bitmap = await loadBitmap(file);
  try {
    if (bitmap.width < 200 || bitmap.height < 200) throw new Error("This photo is too small. Please use a bigger one.");
    const scale = Math.min(1, TRIAL_ROOM_PHOTO_MAX_EDGE / Math.max(bitmap.width, bitmap.height));
    const canvas = document.createElement("canvas");
    canvas.width = Math.max(1, Math.round(bitmap.width * scale));
    canvas.height = Math.max(1, Math.round(bitmap.height * scale));
    const ctx = canvas.getContext("2d");
    if (!ctx) throw new Error("This photo could not be opened");
    ctx.fillStyle = "#ffffff";
    ctx.fillRect(0, 0, canvas.width, canvas.height);
    ctx.drawImage(bitmap.source, 0, 0, canvas.width, canvas.height);
    return canvas.toDataURL("image/jpeg", 0.86);
  } finally {
    bitmap.close();
  }
}
