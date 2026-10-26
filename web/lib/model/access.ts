/**
 * Whether the key already on the wallet allows everything a set of rules needs. A grant is pinned to one XOXNO
 * account and allowlists the exact calls and transfer recipients its rules needed when it was given, so rules that
 * add an action (a swap after a yield move, say) need a new grant, or the policy rejects every tick (7103, 7104).
 */
import { permissionsFor, validateAutopilot, type Autopilot as CoreAutopilot } from "@koul/core";
import { WRITE_CONFIG } from "@/lib/koul";
import type { AgentParams } from "@/lib/data/live";

export function grantCovers(params: AgentParams | null, autopilot: CoreAutopilot): boolean {
  if (!params || validateAutopilot(autopilot).length) return false;
  if (params.accountId !== autopilot.account_id) return false;
  const needed = permissionsFor(autopilot, WRITE_CONFIG);
  const calls = new Set(params.allowedCalls.map(([c, f]) => `${c}:${f}`));
  return needed.allowedCalls.every(([c, f]) => calls.has(`${c}:${f}`)) && needed.transferRecipients.every((r) => params.transferRecipients.includes(r));
}
