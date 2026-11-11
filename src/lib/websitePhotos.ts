/** Photo list edits for one website listing (website_products.photo_urls). */

export const WEBSITE_PHOTOS_MAX = 8;
export const WEBSITE_PHOTOS_BUCKET = "website-photos";

function clean(urls: string[] | null | undefined): string[] {
  return (urls || []).filter((url) => typeof url === "string" && url.trim().length > 0);
}

export function addWebsitePhoto(urls: string[] | null | undefined, url: string): string[] {
  return [...clean(urls), url].slice(0, WEBSITE_PHOTOS_MAX);
}

/** Put a new picture in the same place as the old one, so the order on the store does not change. */
export function replaceWebsitePhoto(urls: string[] | null | undefined, index: number, url: string): string[] {
  const list = clean(urls);
  if (index < 0 || index >= list.length) return addWebsitePhoto(list, url);
  return list.map((current, i) => (i === index ? url : current));
}

export function removeWebsitePhoto(urls: string[] | null | undefined, index: number): string[] {
  return clean(urls).filter((_, i) => i !== index);
}

/** The first photo is the one shown on product cards. */
export function makeMainWebsitePhoto(urls: string[] | null | undefined, index: number): string[] {
  const list = clean(urls);
  if (index <= 0 || index >= list.length) return list;
  return [list[index], ...list.filter((_, i) => i !== index)];
}

/**
 * Storage path of a photo this listing uploaded, or null for anything else.
 * Only files under `<org>/<listing>/` are ever deleted, so a picture that belongs
 * to another listing, a banner, or another site is never touched.
 */
export function ownWebsitePhotoPath(url: string, orgId: string, listingId: string): string | null {
  const marker = `/${WEBSITE_PHOTOS_BUCKET}/`;
  const at = url.indexOf(marker);
  if (at < 0) return null;
  let path = url.slice(at + marker.length).split("?")[0];
  try {
    path = decodeURIComponent(path);
  } catch {
    return null;
  }
  const prefix = `${orgId}/${listingId}/`;
  return path.startsWith(prefix) && !path.includes("..") ? path : null;
}
