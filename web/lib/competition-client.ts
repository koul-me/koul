/**
 * Entering the competition from the browser: ask for a challenge, have the wallet's passkey sign it (one prompt), send
 * the signature with the handle and email. The entry counts once the person opens the link in the email.
 *   const r = await enterCompetition({ wallet: w.address, handle: "ada", email: "ada@example.com" });
 */
const b64urlToBytes = (s: string) => Uint8Array.from(atob(s.replace(/-/g, "+").replace(/_/g, "/").padEnd(Math.ceil(s.length / 4) * 4, "=")), (c) => c.charCodeAt(0));
const bytesToB64url = (b: ArrayBuffer) => btoa(String.fromCharCode(...new Uint8Array(b))).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");

/** The relying party the app's passkeys use: koul.me on every koul.me host, the page's own host elsewhere. */
function rpId(): string | undefined {
  const host = window.location.hostname;
  return host === "koul.me" || host.endsWith(".koul.me") ? "koul.me" : undefined;
}

export interface EnterResult { handle: string; emailSent: boolean }

export async function enterCompetition(input: { wallet: string; handle: string; email: string }): Promise<EnterResult> {
  const post = async (path: string, body: unknown) => {
    const r = await fetch(path, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(body) });
    const json = (await r.json().catch(() => ({}))) as { error?: string };
    if (!r.ok) throw new Error(json.error ?? "Something went wrong. Try again in a minute.");
    return json;
  };
  const { challenge, credentialIds } = (await post("/api/competition/challenge", { wallet: input.wallet })) as { challenge: string; credentialIds: string[] };
  const credential = (await navigator.credentials.get({
    publicKey: {
      challenge: b64urlToBytes(challenge),
      ...(rpId() ? { rpId: rpId() } : {}),
      allowCredentials: credentialIds.map((id) => ({ type: "public-key" as const, id: b64urlToBytes(id) })),
      userVerification: "preferred",
      timeout: 60_000,
    },
  })) as PublicKeyCredential | null;
  if (!credential) throw new Error("Nothing was signed. Try again when you are ready.");
  const response = credential.response as AuthenticatorAssertionResponse;
  const result = (await post("/api/competition/register", {
    ...input,
    assertion: {
      credentialId: bytesToB64url(credential.rawId),
      authenticatorData: bytesToB64url(response.authenticatorData),
      clientDataJSON: bytesToB64url(response.clientDataJSON),
      signature: bytesToB64url(response.signature),
    },
  })) as { handle: string; emailSent: boolean };
  return { handle: result.handle, emailSent: result.emailSent };
}
