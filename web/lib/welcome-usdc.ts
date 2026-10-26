/**
 * A new wallet gets 100 test USDC without asking: the same route as Deposit's test tab (friendbot XLM bought into USDC
 * on the testnet DEX, about 15 seconds, nothing spent from the keeper). It runs after creation and never blocks it; a
 * failure leaves the manual Deposit button as it was.
 */
import { toast } from "sonner";
import { toastTx } from "@/hooks/use-passkey-action";
import { track } from "@/lib/analytics";
import { invalidate } from "@/lib/data/store";

export const WELCOME_USDC = 100;

export async function giveWelcomeUsdc(wallet: string): Promise<void> {
  const pending = toast.loading(`Adding ${WELCOME_USDC} test USDC to your new wallet`, { description: "Bought with test XLM on the testnet DEX. About 15 seconds." });
  try {
    const res = await fetch("/api/faucet/test-usdc", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ wallet }) });
    const body = (await res.json().catch(() => ({}))) as { hash?: string; error?: string };
    if (!res.ok || !body.hash) throw new Error(body.error ?? `The server answered ${res.status}`);
    toast.dismiss(pending);
    track("test_usdc_added");
    toastTx(`${WELCOME_USDC} USDC added`, body.hash, "Test USDC to start with, from the testnet DEX.");
    invalidate("portfolio:"); invalidate("events:"); invalidate("holdings:");
  } catch (err) {
    toast.dismiss(pending);
    toast.error("The starting USDC did not arrive", { description: `${err instanceof Error ? err.message : String(err)}. Deposit → Testnet gets it by hand.` });
  }
}
