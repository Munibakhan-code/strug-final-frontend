/**
 * @vitest-environment node
 */
import { describe, it, expect } from "vitest";
import {
  isChannelMutedLocally,
  isGloballySnoozedLocally,
  isChannelSnoozedLocally,
  shouldQuietChatPush,
  removeBlockedUserIdFromStorage,
  loadMutedConvs,
  patchMutedConv,
  MUTED_CONVS_KEY,
  SNOOZE_UNTIL_KEY,
  SNOOZE_CONVS_KEY,
} from "./chatQuietPrefs.js";

function memoryStorage(seed = {}) {
  const map = new Map(Object.entries(seed));
  return {
    getItem: (k) => (map.has(k) ? map.get(k) : null),
    setItem: (k, v) => { map.set(k, String(v)); },
    removeItem: (k) => { map.delete(k); },
  };
}

describe("shouldQuietChatPush", () => {
  it("allows push when no mute or snooze", () => {
    const storage = memoryStorage();
    expect(shouldQuietChatPush(12, 1_000, storage)).toBe(false);
  });

  it("quiets forever-muted channels", () => {
    const storage = memoryStorage({ [MUTED_CONVS_KEY]: JSON.stringify({ 12: -1 }) });
    expect(shouldQuietChatPush(12, 1_000, storage)).toBe(true);
    expect(shouldQuietChatPush(99, 1_000, storage)).toBe(false);
  });

  it("quiets timed mute only while active", () => {
    const storage = memoryStorage({ [MUTED_CONVS_KEY]: JSON.stringify({ 12: 2_000 }) });
    expect(isChannelMutedLocally(12, 1_500, storage)).toBe(true);
    expect(isChannelMutedLocally(12, 2_500, storage)).toBe(false);
    expect(shouldQuietChatPush(12, 1_500, storage)).toBe(true);
    expect(shouldQuietChatPush(12, 2_500, storage)).toBe(false);
  });

  it("quiets global and per-channel snooze", () => {
    const storage = memoryStorage({ [SNOOZE_UNTIL_KEY]: "5000" });
    expect(isGloballySnoozedLocally(4_000, storage)).toBe(true);
    expect(shouldQuietChatPush(1, 4_000, storage)).toBe(true);
    storage.removeItem(SNOOZE_UNTIL_KEY);
    storage.setItem(SNOOZE_CONVS_KEY, JSON.stringify({ 7: 9_000 }));
    expect(isChannelSnoozedLocally(7, 8_000, storage)).toBe(true);
    expect(shouldQuietChatPush(7, 8_000, storage)).toBe(true);
    expect(shouldQuietChatPush(7, 10_000, storage)).toBe(false);
  });

  it("treats missing channel as not quiet unless global snooze", () => {
    const storage = memoryStorage();
    expect(shouldQuietChatPush(null, 1_000, storage)).toBe(false);
    storage.setItem(SNOOZE_UNTIL_KEY, "2000");
    expect(shouldQuietChatPush(null, 1_000, storage)).toBe(true);
  });
});

describe("removeBlockedUserIdFromStorage", () => {
  it("removes the id and returns true", () => {
    const storage = memoryStorage({ strug_blocked: JSON.stringify([10, 20, 30]) });
    expect(removeBlockedUserIdFromStorage(20, storage)).toBe(true);
    expect(JSON.parse(storage.getItem("strug_blocked"))).toEqual([10, 30]);
  });

  it("returns false for missing id or bad storage", () => {
    const storage = memoryStorage({ strug_blocked: JSON.stringify([1]) });
    expect(removeBlockedUserIdFromStorage(99, storage)).toBe(false);
    expect(removeBlockedUserIdFromStorage(0, storage)).toBe(false);
    expect(removeBlockedUserIdFromStorage(1, memoryStorage({ strug_blocked: "{}" }))).toBe(false);
  });
});

describe("patchMutedConv", () => {
  it("preserves sibling mutes when patching after a stale snapshot would have wiped them", () => {
    const storage = memoryStorage({
      [MUTED_CONVS_KEY]: JSON.stringify({ 1: -1, 2: -1 }),
    });
    // Simulate what a stale React closure would do (only know about channel 1).
    const staleSnapshot = { 1: -1 };
    expect(staleSnapshot[2]).toBeUndefined();

    const after = patchMutedConv(1, null, storage);
    expect(after).toEqual({ 2: -1 });
    expect(JSON.parse(storage.getItem(MUTED_CONVS_KEY))).toEqual({ 2: -1 });
    expect(loadMutedConvs(storage)).toEqual({ 2: -1 });
  });

  it("adds forever mute without dropping other channels", () => {
    const storage = memoryStorage({
      [MUTED_CONVS_KEY]: JSON.stringify({ 9: 5_000 }),
    });
    const after = patchMutedConv(3, -1, storage);
    expect(after).toEqual({ 9: 5_000, 3: -1 });
  });

  it("clears a muted channel keyed as a string id", () => {
    const storage = memoryStorage({
      [MUTED_CONVS_KEY]: JSON.stringify({ 7: -1 }),
    });
    expect(patchMutedConv(7, null, storage)).toEqual({});
    expect(patchMutedConv("7", null, memoryStorage({
      [MUTED_CONVS_KEY]: JSON.stringify({ 7: -1 }),
    }))).toEqual({});
  });

  it("no-ops on missing channel id", () => {
    const storage = memoryStorage({
      [MUTED_CONVS_KEY]: JSON.stringify({ 1: -1 }),
    });
    expect(patchMutedConv(null, -1, storage)).toEqual({ 1: -1 });
  });
});
