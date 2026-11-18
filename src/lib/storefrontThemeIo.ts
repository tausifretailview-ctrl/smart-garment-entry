import { supabase } from "@/integrations/supabase/client";
import type { Json } from "@/integrations/supabase/types";
import { compressImageFile } from "@/lib/compressImage";
import {
  STOREFRONT_BANNERS_KEY,
  STOREFRONT_BANNERS_MAX,
  parseStorefrontBanners,
  type StorefrontBanner,
} from "@/lib/storefrontBanners";
import {
  STOREFRONT_VIDEOS_KEY,
  STOREFRONT_VIDEOS_MAX,
  parseStorefrontVideos,
  storefrontVideoFileProblem,
  type StorefrontVideo,
} from "@/lib/storefrontVideos";
import { STOREFRONT_SHOWCASE_KEY, parseStorefrontShowcase } from "@/lib/storefrontShowcase";
import {
  STOREFRONT_THEME_KEY,
  parseStorefrontTheme,
  type StorefrontThemeId,
} from "@/lib/storefrontThemes";

function asSettings(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" && !Array.isArray(value) ? (value as Record<string, unknown>) : {};
}

async function readOrgSettings(orgId: string): Promise<Record<string, unknown>> {
  const { data, error } = await supabase.from("organizations").select("settings").eq("id", orgId).maybeSingle();
  if (error) throw error;
  return asSettings(data?.settings);
}

/**
 * Merge keys into organizations.settings. An update the user is not allowed to make
 * comes back with no error and no rows, so the changed row is read back.
 */
async function patchOrgSettings(orgId: string, patch: Record<string, unknown>, what: string): Promise<void> {
  const next = { ...(await readOrgSettings(orgId)), ...patch };
  const { data, error } = await supabase
    .from("organizations")
    .update({ settings: next as Json })
    .eq("id", orgId)
    .select("id");
  if (error) throw error;
  if (!data || data.length === 0) {
    throw new Error(`Only an organization admin can change ${what}.`);
  }
}

export type StorefrontLook = {
  theme: StorefrontThemeId | null;
  banners: StorefrontBanner[];
  videos: StorefrontVideo[];
  /** Product slideshow on the home page; on unless switched off. */
  showcase: boolean;
};

export async function loadStorefrontLook(orgId: string): Promise<StorefrontLook> {
  const settings = await readOrgSettings(orgId);
  return {
    theme: parseStorefrontTheme(settings),
    banners: parseStorefrontBanners(settings),
    videos: parseStorefrontVideos(settings),
    showcase: parseStorefrontShowcase(settings),
  };
}

export async function saveStorefrontTheme(orgId: string, theme: StorefrontThemeId): Promise<void> {
  await patchOrgSettings(orgId, { [STOREFRONT_THEME_KEY]: theme }, "the store theme");
}

export async function saveStorefrontBanners(orgId: string, banners: StorefrontBanner[]): Promise<void> {
  await patchOrgSettings(
    orgId,
    { [STOREFRONT_BANNERS_KEY]: banners.slice(0, STOREFRONT_BANNERS_MAX) },
    "the store banners",
  );
}

export async function saveStorefrontShowcase(orgId: string, enabled: boolean): Promise<void> {
  await patchOrgSettings(orgId, { [STOREFRONT_SHOWCASE_KEY]: enabled }, "the product slideshow");
}

export async function saveStorefrontVideos(orgId: string, videos: StorefrontVideo[]): Promise<void> {
  await patchOrgSettings(
    orgId,
    { [STOREFRONT_VIDEOS_KEY]: videos.slice(0, STOREFRONT_VIDEOS_MAX) },
    "the store videos",
  );
}

/** Upload one home-page video (as is, no re-encoding) to the store's public bucket; returns its URL. */
export async function uploadStorefrontVideo(orgId: string, file: File): Promise<string> {
  const problem = storefrontVideoFileProblem(file);
  if (problem) throw new Error(problem);
  const ext = (file.name.match(/\.(mp4|webm|mov|m4v)$/i)?.[1] || "mp4").toLowerCase();
  const path = `${orgId}/videos/${Date.now()}-${Math.random().toString(36).slice(2, 8)}.${ext}`;
  const { error } = await supabase.storage.from("website-photos").upload(path, file, {
    contentType: file.type || "video/mp4",
    cacheControl: "604800",
    upsert: false,
  });
  if (error) throw error;
  return supabase.storage.from("website-photos").getPublicUrl(path).data.publicUrl;
}

/** Upload one banner image to the store's public photo bucket and return its URL. */
export async function uploadStorefrontBannerImage(orgId: string, file: File): Promise<string> {
  // Banners run edge to edge on a desktop screen, so keep more pixels than a product photo.
  const blob = await compressImageFile(file, 2200, 0.84);
  const path = `${orgId}/banners/${Date.now()}-${Math.random().toString(36).slice(2, 8)}.jpg`;
  const { error } = await supabase.storage.from("website-photos").upload(path, blob, {
    contentType: "image/jpeg",
    upsert: true,
  });
  if (error) throw error;
  return supabase.storage.from("website-photos").getPublicUrl(path).data.publicUrl;
}
