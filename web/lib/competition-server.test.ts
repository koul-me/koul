import { describe, expect, it, vi } from "vitest";
import { COMP_KEYS, type EntrantRecord } from "@koul/core";
import type { EntryStore } from "./competition-server";

vi.mock("server-only", () => ({}));
const { confirmEntry, entryEmailKey, PLACE_SCRIPT, takePlace } = await import("./competition-server");

/** An in-memory store with the calls an entry makes; its eval runs what PLACE_SCRIPT does, in one step like Redis. */
function memory(): EntryStore & { kv: Map<string, unknown>; sets: Map<string, Set<string>> } {
  const kv = new Map<string, unknown>();
  const sets = new Map<string, Set<string>>();
  const set = (key: string) => sets.get(key) ?? sets.set(key, new Set()).get(key)!;
  return {
    kv,
    sets,
    async get<T>(key: string) { return (kv.get(key) as T | undefined) ?? null; },
    async set(key: string, value: unknown, opts?: { nx: true }) {
      if (opts?.nx && kv.has(key)) return null;
      kv.set(key, value);
      return "OK";
    },
    async del(...keys: string[]) { return keys.filter((k) => kv.delete(k)).length; },
    async eval(script: string, keys: string[], args: unknown[]) {
      expect(script).toBe(PLACE_SCRIPT);
      const s = set(keys[0]!), [member, max] = args as [string, number];
      if (s.has(member)) return 1;
      if (max >= 0 && s.size >= max) return 0;
      s.add(member);
      return 1;
    },
  };
}

const wallet = (n: number) => `C${String(n).padStart(55, "A")}`;
const entry = (n: number, over: Partial<{ handle: string; email: string; max: number | null }> = {}) =>
  ({ wallet: wallet(n), handle: `trader${n}`, email: `t${n}@example.com`, max: null, now: 1000, ...over });

describe("competition entry", () => {
  it("is confirmed and scored as soon as the passkey signature is checked", async () => {
    const r = memory();
    const out = await confirmEntry(r, entry(1));
    expect(out.ok).toBe(true);
    expect(r.sets.get(COMP_KEYS.entrants)?.has(wallet(1))).toBe(true);
    expect((r.kv.get(COMP_KEYS.entrant(wallet(1))) as EntrantRecord).verifiedAt).toBe(1000);
    expect(r.kv.get(COMP_KEYS.handle("TRADER1"))).toBe(wallet(1));
    expect(r.kv.get(entryEmailKey("t1@example.com"))).toBe(wallet(1));
  });

  it("allows one entry per wallet, handle and email", async () => {
    const r = memory();
    await confirmEntry(r, entry(1));
    expect(await confirmEntry(r, entry(1, { handle: "other" }))).toEqual({ ok: false, error: "This wallet is already entered as trader1" });
    expect(await confirmEntry(r, entry(2, { handle: "Trader1" }))).toEqual({ ok: false, error: "That handle is taken" });
    expect(await confirmEntry(r, entry(2, { email: "t1@example.com" }))).toEqual({ ok: false, error: "That email already has an entry" });
    // The refused attempts left nothing behind: wallet 2 can still enter with its own handle and email.
    expect(r.kv.has(COMP_KEYS.handle("trader2"))).toBe(false);
    expect((await confirmEntry(r, entry(2))).ok).toBe(true);
    expect(r.sets.get(COMP_KEYS.entrants)?.size).toBe(2);
  });

  it("closes at the cap and gives back the handle and email of an entry that did not fit", async () => {
    const r = memory();
    expect((await confirmEntry(r, entry(1, { max: 2 }))).ok).toBe(true);
    expect((await confirmEntry(r, entry(2, { max: 2 }))).ok).toBe(true);
    expect(await confirmEntry(r, entry(3, { max: 2 }))).toEqual({ ok: false, error: "Entries are full: all 2 places are taken." });
    expect(r.sets.get(COMP_KEYS.entrants)?.size).toBe(2);
    expect(r.kv.has(COMP_KEYS.handle("trader3"))).toBe(false);
    expect(r.kv.has(entryEmailKey("t3@example.com"))).toBe(false);
  });

  it("fills the cap exactly when entries arrive together", async () => {
    const r = memory();
    const outs = await Promise.all(Array.from({ length: 10 }, (_, i) => confirmEntry(r, entry(i, { max: 3 }))));
    expect(outs.filter((o) => o.ok).length).toBe(3);
    expect(r.sets.get(COMP_KEYS.entrants)!.size).toBe(3);
  });

  it("replaces a pending entry of the same wallet from the email-link days and lets its old handle go", async () => {
    const r = memory();
    const pending: EntrantRecord = { wallet: wallet(1), handle: "oldname", email: "old@example.com", registeredAt: 1, verifiedAt: null };
    r.kv.set(COMP_KEYS.entrant(wallet(1)), pending);
    r.kv.set(COMP_KEYS.handle("oldname"), wallet(1));
    r.kv.set(entryEmailKey("old@example.com"), wallet(1));
    expect((await confirmEntry(r, entry(1))).ok).toBe(true);
    expect(r.kv.has(COMP_KEYS.handle("oldname"))).toBe(false);
    expect(r.kv.has(entryEmailKey("old@example.com"))).toBe(false);
    expect(r.kv.get(COMP_KEYS.handle("trader1"))).toBe(wallet(1));
  });

  it("keeps a place for a wallet that already holds one, even at the cap", async () => {
    const r = memory();
    expect(await takePlace(r, wallet(1), 1)).toBe(true);
    expect(await takePlace(r, wallet(1), 1)).toBe(true);
    expect(await takePlace(r, wallet(2), 1)).toBe(false);
    expect([...r.sets.get(COMP_KEYS.entrants)!]).toEqual([wallet(1)]);
  });
});
