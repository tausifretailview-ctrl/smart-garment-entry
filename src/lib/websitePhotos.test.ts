import { describe, expect, it } from "vitest";
import {
  WEBSITE_PHOTOS_MAX,
  addWebsitePhoto,
  makeMainWebsitePhoto,
  ownWebsitePhotoPath,
  removeWebsitePhoto,
  replaceWebsitePhoto,
} from "./websitePhotos";

describe("website listing photos", () => {
  const urls = ["a", "b", "c"];

  it("replaces a photo in place, keeping the order on the store", () => {
    expect(replaceWebsitePhoto(urls, 1, "new")).toEqual(["a", "new", "c"]);
    expect(replaceWebsitePhoto(urls, 0, "new")).toEqual(["new", "b", "c"]);
    // No photo at that position yet: it is simply added.
    expect(replaceWebsitePhoto([], 0, "new")).toEqual(["new"]);
    expect(replaceWebsitePhoto(null, 3, "new")).toEqual(["new"]);
  });

  it("adds, removes and picks the main photo", () => {
    expect(addWebsitePhoto(urls, "d")).toEqual(["a", "b", "c", "d"]);
    expect(removeWebsitePhoto(urls, 0)).toEqual(["b", "c"]);
    expect(makeMainWebsitePhoto(urls, 2)).toEqual(["c", "a", "b"]);
    expect(makeMainWebsitePhoto(urls, 0)).toEqual(urls);
    expect(makeMainWebsitePhoto(urls, 9)).toEqual(urls);
  });

  it("never keeps more than the maximum, and drops blank entries", () => {
    const full = Array.from({ length: WEBSITE_PHOTOS_MAX }, (_, i) => `p${i}`);
    expect(addWebsitePhoto(full, "extra")).toHaveLength(WEBSITE_PHOTOS_MAX);
    expect(addWebsitePhoto(["a", "", "  "], "b")).toEqual(["a", "b"]);
  });

  it("only treats this listing's own uploads as deletable", () => {
    const base = "https://x.supabase.co/storage/v1/object/public/website-photos/";
    expect(ownWebsitePhotoPath(`${base}org1/list1/17.jpg`, "org1", "list1")).toBe("org1/list1/17.jpg");
    expect(ownWebsitePhotoPath(`${base}org1/list1/17.jpg?v=2`, "org1", "list1")).toBe("org1/list1/17.jpg");
    expect(ownWebsitePhotoPath(`${base}org1/list2/17.jpg`, "org1", "list1")).toBeNull();
    expect(ownWebsitePhotoPath(`${base}org1/banners/17.jpg`, "org1", "list1")).toBeNull();
    expect(ownWebsitePhotoPath(`${base}org1/list1/../list2/17.jpg`, "org1", "list1")).toBeNull();
    expect(ownWebsitePhotoPath("https://elsewhere.example/photo.jpg", "org1", "list1")).toBeNull();
  });
});
