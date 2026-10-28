import "server-only";
import { sendMail } from "@/lib/mail";
import { store } from "@/lib/redis";

/**
 * The keeper's health as the app and the owner see it: the heartbeat the keeper writes after every pass
 * (keeper/src/lib/status.ts) and the report the daily lease guard leaves (keeper/scripts/leases.ts). Reading it is
 * also what raises the alarm: a stale heartbeat or a lease that needs a person emails the owner, at most once an hour.
 */
const HEARTBEAT = "koul:keeper:heartbeat";
const LEASES = "koul:leases";
const ALERTED = "koul:keeper:alerted";

interface Heartbeat { at: number; passMs: number; intervalSec: number; wallets: number; autopilots: number; submitted: number; failed: number; ledger: number }
interface LeaseRow { name: string; part: string; days: number | null; action: string }
interface LeaseReport { at: number; leases: LeaseRow[] }

export interface KeeperStatus {
  /** When the last pass ended, ms since epoch; null when the keeper never reported. */
  lastPassAt: number | null;
  ageSec: number | null;
  intervalSec: number | null;
  wallets: number | null;
  autopilots: number | null;
  healthy: boolean;
  /** Plain sentences, empty when all is well. */
  problems: string[];
}

/** A pass is late when nothing arrived for four intervals plus the last pass's own length, and never before 5 minutes. */
const lateAfterSec = (b: Heartbeat) => Math.max(300, 4 * b.intervalSec + b.passMs / 1000);

export function judge(beat: Heartbeat | null, leases: LeaseReport | null, now: number): KeeperStatus {
  const problems: string[] = [];
  const ageSec = beat ? Math.round((now - beat.at) / 1000) : null;
  if (!beat) problems.push("The keeper has not reported a pass.");
  else if (ageSec! > lateAfterSec(beat)) problems.push(`The keeper's last pass was ${Math.round(ageSec! / 60)} min ago.`);
  if (leases) {
    if (now - leases.at > 3 * 86400_000) problems.push("The lease guard has not run for 3 days.");
    for (const l of leases.leases) {
      if (["failed", "too expensive", "missing"].includes(l.action)) problems.push(`Lease: ${l.name} ${l.part} ${l.action}${l.days !== null ? ` (${l.days} days left)` : ""}.`);
    }
  }
  return { lastPassAt: beat?.at ?? null, ageSec, intervalSec: beat?.intervalSec ?? null, wallets: beat?.wallets ?? null, autopilots: beat?.autopilots ?? null, healthy: problems.length === 0, problems };
}

export async function readKeeperStatus(now = Date.now()): Promise<KeeperStatus | null> {
  const redis = store();
  if (!redis) return null;
  const [beat, leases] = await Promise.all([redis.get<Heartbeat>(HEARTBEAT), redis.get<LeaseReport>(LEASES)]);
  return judge(beat, leases, now);
}

/** Emails the owner about the problems, once an hour at most. */
export async function alertOwner(status: KeeperStatus): Promise<void> {
  const to = process.env.KEEPER_ALERT_TO ?? process.env.WAITLIST_NOTIFY_TO;
  const redis = store();
  if (status.healthy || !to || !redis) return;
  if ((await redis.set(ALERTED, Date.now(), { nx: true, ex: 3600 })) !== "OK") return;
  const text = `${status.problems.join("\n")}\n\nKeeper runs: https://github.com/koul-me/koul/actions/workflows/keeper.yml\nLease guard: https://github.com/koul-me/koul/actions/workflows/leases.yml`;
  await sendMail(to, "Koul keeper needs a look", text, text.split("\n").map((l) => (l ? `<p>${l.replace(/(https:\/\/\S+)/g, '<a href="$1">$1</a>')}</p>` : "")).join(""));
}
