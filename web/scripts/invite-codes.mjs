/**
 * Invite codes for the waitlist gate. `pnpm invite-codes 5 judge` prints five codes like judge-k7m2qx9p with their
 * links, then the comma-separated value to add to KOUL_INVITE_CODES on Vercel. The prefix only says who a code is
 * for; take a code out of the list to revoke it.
 */
import { randomInt } from "node:crypto";

// No 0/o, 1/l/i: a code read aloud or typed from a screenshot still works.
const ALPHABET = "23456789abcdefghjkmnpqrstuvwxyz";
const LENGTH = 8;

const count = Number(process.argv[2] ?? 1);
const prefix = (process.argv[3] ?? "koul").toLowerCase().replace(/[^a-z0-9]/g, "");
if (!Number.isInteger(count) || count < 1 || count > 500 || !prefix) {
  console.error("Usage: pnpm invite-codes <count 1-500> [prefix]");
  process.exit(1);
}

const code = () => `${prefix}-${Array.from({ length: LENGTH }, () => ALPHABET[randomInt(ALPHABET.length)]).join("")}`;
const codes = Array.from({ length: count }, code);

for (const c of codes) console.log(`${c}  https://app.koul.me/?invite=${c}`);
console.log(`\nKOUL_INVITE_CODES value to add:\n${codes.join(",")}`);
