/**
 * @vitest-environment node
 */
import { describe, it, expect, vi } from "vitest";
import {
  scheduledMsgsStorageKey,
  loadScheduledMsgs,
  saveScheduledMsgs,
  partitionDueScheduledMsgs,
  removeScheduledMsg,
  isValidScheduleTime,
  coerceScheduleForMigration,
  buildScheduledMessageUpdatePayload,
  migrateLegacyScheduledMsgs,
  SCHEDULED_MSGS_STORAGE_PREFIX,
  SCHEDULED_CHAT_MIN_LEAD_MS,
} from "./scheduledMessages.js";

function memoryStorage(seed = {}) {
  const map = new Map(Object.entries(seed));
  return {
    getItem: (k) => (map.has(k) ? map.get(k) : null),
    setItem: (k, v) => { map.set(k, String(v)); },
    removeItem: (k) => { map.delete(k); },
    _map: map,
  };
}

describe("scheduledMsgsStorageKey", () => {
  it("scopes by user id", () => {
    expect(scheduledMsgsStorageKey(42)).toBe(`${SCHEDULED_MSGS_STORAGE_PREFIX}:42`);
  });

  it("uses anon when user id missing", () => {
    expect(scheduledMsgsStorageKey(null)).toBe(`${SCHEDULED_MSGS_STORAGE_PREFIX}:anon`);
  });
});

describe("loadScheduledMsgs / saveScheduledMsgs", () => {
  it("round-trips the queue for a user", () => {
    const storage = memoryStorage();
    saveScheduledMsgs(7, [{ clientMsgId: "a", scheduledFor: 1 }], storage);
    expect(loadScheduledMsgs(7, storage)).toEqual([{ clientMsgId: "a", scheduledFor: 1 }]);
    expect(loadScheduledMsgs(8, storage)).toEqual([]);
  });

  it("migrates legacy unscoped key into the user key once", () => {
    const storage = memoryStorage({
      [SCHEDULED_MSGS_STORAGE_PREFIX]: JSON.stringify([{ clientMsgId: "legacy", scheduledFor: 9 }]),
    });
    expect(loadScheduledMsgs(3, storage)).toEqual([{ clientMsgId: "legacy", scheduledFor: 9 }]);
    expect(storage.getItem(SCHEDULED_MSGS_STORAGE_PREFIX)).toBeNull();
    expect(storage.getItem(scheduledMsgsStorageKey(3))).toBeTruthy();
  });

  it("returns [] on malformed JSON", () => {
    const storage = memoryStorage({
      [scheduledMsgsStorageKey(1)]: "{not-json",
    });
    expect(loadScheduledMsgs(1, storage)).toEqual([]);
  });
});

describe("partitionDueScheduledMsgs", () => {
  it("splits due vs remaining without dropping either", () => {
    const { due, remaining } = partitionDueScheduledMsgs([
      { clientMsgId: "a", scheduledFor: 100 },
      { clientMsgId: "b", scheduledFor: 300 },
    ], 200);
    expect(due.map((e) => e.clientMsgId)).toEqual(["a"]);
    expect(remaining.map((e) => e.clientMsgId)).toEqual(["b"]);
  });

  it("treats empty / non-array as empty", () => {
    expect(partitionDueScheduledMsgs(null, 1)).toEqual({ due: [], remaining: [] });
  });
});

describe("removeScheduledMsg", () => {
  it("removes by clientMsgId and leaves others", () => {
    expect(removeScheduledMsg([
      { clientMsgId: "a" },
      { clientMsgId: "b" },
    ], "a")).toEqual([{ clientMsgId: "b" }]);
  });

  it("is a no-op for missing id", () => {
    const q = [{ clientMsgId: "a" }];
    expect(removeScheduledMsg(q, "nope")).toEqual(q);
  });
});

describe("isValidScheduleTime", () => {
  it("requires at least 30s lead by default", () => {
    const now = 1_000_000;
    expect(isValidScheduleTime(now + 29_000, now)).toBe(false);
    expect(isValidScheduleTime(now + 30_000, now)).toBe(true);
  });

  it("rejects non-finite times", () => {
    expect(isValidScheduleTime(undefined, Date.now())).toBe(false);
    expect(isValidScheduleTime(NaN, Date.now())).toBe(false);
  });
});

describe("coerceScheduleForMigration", () => {
  const now = 1_000_000;

  it("returns null for past or non-finite times", () => {
    expect(coerceScheduleForMigration(now - 1, now)).toBeNull();
    expect(coerceScheduleForMigration(now, now)).toBeNull();
    expect(coerceScheduleForMigration("bad", now)).toBeNull();
  });

  it("bumps near-term drafts into the lead window so they still deliver", () => {
    expect(coerceScheduleForMigration(now + 10_000, now)).toBe(now + SCHEDULED_CHAT_MIN_LEAD_MS);
  });

  it("keeps times that already clear the lead window", () => {
    expect(coerceScheduleForMigration(now + 60_000, now)).toBe(now + 60_000);
  });
});

describe("buildScheduledMessageUpdatePayload", () => {
  const now = 2_000_000;

  it("omits scheduledFor when the time is unchanged so text-only edits near send time work", () => {
    const original = now + 20_000;
    const out = buildScheduledMessageUpdatePayload({
      content: "  fixed typo  ",
      scheduledFor: original,
      originalScheduledFor: original,
      now,
    });
    expect(out).toEqual({ ok: true, payload: { content: "fixed typo" } });
  });

  it("rejects a changed time that is too soon", () => {
    const out = buildScheduledMessageUpdatePayload({
      content: "hi",
      scheduledFor: now + 5_000,
      originalScheduledFor: now + 60_000,
      now,
    });
    expect(out).toEqual({ ok: false, error: "too_soon" });
  });

  it("includes a changed valid time", () => {
    const out = buildScheduledMessageUpdatePayload({
      content: "hi",
      scheduledFor: now + 90_000,
      originalScheduledFor: now + 60_000,
      now,
    });
    expect(out).toEqual({
      ok: true,
      payload: { content: "hi", scheduledFor: now + 90_000 },
    });
  });

  it("rejects empty content", () => {
    expect(buildScheduledMessageUpdatePayload({ content: "  ", scheduledFor: null })).toEqual({
      ok: false,
      error: "empty",
    });
  });
});

describe("migrateLegacyScheduledMsgs", () => {
  const now = 5_000_000;

  it("keeps failed creates in storage and does not wipe successes' siblings", async () => {
    const storage = memoryStorage();
    saveScheduledMsgs(7, [
      { clientMsgId: "ok", channelId: 1, content: "a", scheduledFor: now + 60_000 },
      { clientMsgId: "fail", channelId: 1, content: "b", scheduledFor: now + 90_000 },
    ], storage);
    const create = vi.fn(async (body) => {
      if (body.clientMsgId === "fail") throw new Error("network");
      return { scheduled_message_id: 1 };
    });

    const result = await migrateLegacyScheduledMsgs({
      userId: 7,
      createScheduledMessage: create,
      storage,
      now,
    });

    expect(result).toEqual({ migrated: 1, remaining: 1 });
    expect(loadScheduledMsgs(7, storage)).toEqual([
      { clientMsgId: "fail", channelId: 1, content: "b", scheduledFor: now + 90_000 },
    ]);
    expect(create).toHaveBeenCalledTimes(2);
  });

  it("bumps near-term drafts instead of dropping or wiping them", async () => {
    const storage = memoryStorage();
    saveScheduledMsgs(7, [
      { clientMsgId: "soon", channelId: 2, content: "c", scheduledFor: now + 5_000 },
    ], storage);
    const create = vi.fn(async () => ({ scheduled_message_id: 2 }));

    await migrateLegacyScheduledMsgs({
      userId: 7,
      createScheduledMessage: create,
      storage,
      now,
    });

    expect(create).toHaveBeenCalledWith(expect.objectContaining({
      clientMsgId: "soon",
      scheduledFor: now + SCHEDULED_CHAT_MIN_LEAD_MS,
    }));
    expect(loadScheduledMsgs(7, storage)).toEqual([]);
  });

  it("drops past drafts and leaves storage empty when nothing remains", async () => {
    const storage = memoryStorage();
    saveScheduledMsgs(7, [
      { clientMsgId: "past", channelId: 1, content: "x", scheduledFor: now - 1 },
    ], storage);
    const create = vi.fn();
    const result = await migrateLegacyScheduledMsgs({
      userId: 7,
      createScheduledMessage: create,
      storage,
      now,
    });
    expect(result).toEqual({ migrated: 0, remaining: 0 });
    expect(create).not.toHaveBeenCalled();
    expect(loadScheduledMsgs(7, storage)).toEqual([]);
  });
});
