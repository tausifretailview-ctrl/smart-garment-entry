import { describe, expect, it, vi } from "vitest";
import { acquireSharedChannel, sharedChannelCount } from "./sharedRealtimeChannel";

describe("acquireSharedChannel", () => {
  it("opens once for many callers and closes only when the last one releases", () => {
    const removeChannel = vi.fn();
    const client = { removeChannel };
    const open = vi.fn(() => ({ topic: "t" }));

    const releaseMenu = acquireSharedChannel(client, "user-permissions-u-o", open);
    const releasePage = acquireSharedChannel(client, "user-permissions-u-o", open);
    expect(open).toHaveBeenCalledTimes(1);
    expect(sharedChannelCount("user-permissions-u-o")).toBe(2);

    // A page unmounting (tab switch) must not close the menu's channel.
    releasePage();
    releasePage();
    expect(removeChannel).not.toHaveBeenCalled();
    expect(sharedChannelCount("user-permissions-u-o")).toBe(1);

    releaseMenu();
    expect(removeChannel).toHaveBeenCalledTimes(1);
    expect(sharedChannelCount("user-permissions-u-o")).toBe(0);

    // The next caller after a full close opens a fresh channel.
    acquireSharedChannel(client, "user-permissions-u-o", open);
    expect(open).toHaveBeenCalledTimes(2);
  });

  it("keeps topics apart", () => {
    const client = { removeChannel: vi.fn() };
    const a = acquireSharedChannel(client, "a", () => ({}));
    acquireSharedChannel(client, "b", () => ({}));
    a();
    expect(client.removeChannel).toHaveBeenCalledTimes(1);
    expect(sharedChannelCount("b")).toBe(1);
  });
});
