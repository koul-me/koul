import { describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));
const { judge } = await import("./keeper-status");

const beat = (agoSec: number) => ({ at: 1_000_000 - agoSec * 1000, passMs: 4000, intervalSec: 15, wallets: 12, autopilots: 12, submitted: 0, failed: 0, ledger: 1 });

describe("keeper status", () => {
  it("is healthy right after a pass", () => {
    const s = judge(beat(12), null, 1_000_000);
    expect(s).toMatchObject({ healthy: true, ageSec: 12, problems: [] });
  });

  it("is late after five minutes without a pass", () => {
    expect(judge(beat(299), null, 1_000_000).healthy).toBe(true);
    expect(judge(beat(301), null, 1_000_000).problems).toEqual(["The keeper's last pass was 5 min ago."]);
  });

  it("flags a keeper that never reported", () => {
    expect(judge(null, null, 1_000_000).problems).toEqual(["The keeper has not reported a pass."]);
  });

  it("flags leases that need a person and a guard that stopped running", () => {
    const leases = { at: 1_000_000, leases: [{ name: "XOXNO controller", part: "wasm", days: 12, action: "too expensive" }, { name: "koul router", part: "instance", days: 170, action: "ok" }] };
    expect(judge(beat(10), leases, 1_000_000).problems).toEqual(["Lease: XOXNO controller wasm too expensive (12 days left)."]);
    expect(judge(beat(10), { at: 0, leases: [] }, 4 * 86400_000).problems).toContain("The lease guard has not run for 3 days.");
  });
});
