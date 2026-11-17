/**
 * Home-page videos for the public store (Street theme "Watch & shop" row): short portrait clips
 * of the shop, played muted in a sideways row. Saved on organizations.settings next to the
 * banners, so the public store reads them through get_org_public_info with no database change.
 */
export const STOREFRONT_VIDEOS_KEY = "storefront_videos";
export const STOREFRONT_VIDEOS_MAX = 12;
/** Upload limit per clip. Short reels (15–40 s, 720p) are usually 3–15 MB. */
export const STOREFRONT_VIDEO_MAX_MB = 40;

export type StorefrontVideo = {
  id: string;
  video_url: string;
  /** Short line shown over the clip (optional). */
  caption: string;
  /** Section slug or category the "Shop now" button opens; empty shows no button. */
  target: string;
};

function text(value: unknown, max: number): string {
  return typeof value === "string" ? value.trim().slice(0, max) : "";
}

function isSafeVideoUrl(url: string): boolean {
  return /^https:\/\/[^\s"'<>]+$/i.test(url);
}

/** Videos saved in organizations.settings; anything malformed is dropped. */
export function parseStorefrontVideos(orgSettings: unknown): StorefrontVideo[] {
  if (!orgSettings || typeof orgSettings !== "object" || Array.isArray(orgSettings)) return [];
  const raw = (orgSettings as Record<string, unknown>)[STOREFRONT_VIDEOS_KEY];
  if (!Array.isArray(raw)) return [];
  const videos: StorefrontVideo[] = [];
  for (const item of raw) {
    if (!item || typeof item !== "object") continue;
    const row = item as Record<string, unknown>;
    const video_url = text(row.video_url, 600);
    if (!isSafeVideoUrl(video_url)) continue;
    videos.push({
      id: text(row.id, 80) || `video-${videos.length + 1}`,
      video_url,
      caption: text(row.caption, 80),
      target: text(row.target, 120),
    });
    if (videos.length >= STOREFRONT_VIDEOS_MAX) break;
  }
  return videos;
}

export function moveStorefrontVideo(videos: StorefrontVideo[], index: number, delta: -1 | 1): StorefrontVideo[] {
  const to = index + delta;
  if (index < 0 || index >= videos.length || to < 0 || to >= videos.length) return videos;
  const next = [...videos];
  [next[index], next[to]] = [next[to], next[index]];
  return next;
}

/** Why a picked file cannot be used as a store video, or null when it can. */
export function storefrontVideoFileProblem(file: { type: string; size: number; name: string }): string | null {
  const isVideo = file.type.startsWith("video/") || /\.(mp4|webm|mov|m4v)$/i.test(file.name);
  if (!isVideo) return `${file.name} is not a video (use MP4).`;
  if (file.size > STOREFRONT_VIDEO_MAX_MB * 1024 * 1024) {
    return `${file.name} is over ${STOREFRONT_VIDEO_MAX_MB} MB. Use a shorter clip or export at 720p.`;
  }
  return null;
}
