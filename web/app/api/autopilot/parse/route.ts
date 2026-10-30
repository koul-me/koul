import { parseAutopilot, type ParseContext } from "@koul/core/server";
import { rateLimit } from "@/lib/rate-limit";
import { FX_ON } from "@/lib/fx";

/**
 * Reference server route. The API key stays in the server environment. USD/TRY follows the same switch as the app
 * (lib/fx.ts): off, the model is not offered FxPrice and a rule that uses it anyway is dropped with a note.
 */
export async function POST(request: Request): Promise<Response> {
  const limited = await rateLimit(request, "parse");
  if (limited) return limited;
  let body: { text?: unknown; context?: unknown };
  try { body = await request.json(); } catch { return Response.json({ error: "Invalid JSON" }, { status: 400 }); }
  if (typeof body.text !== "string" || !body.context || typeof body.context !== "object") {
    return Response.json({ error: "text and context are required" }, { status: 400 });
  }
  try {
    const result = await parseAutopilot(body.text, body.context as ParseContext, { fx: FX_ON });
    return Response.json(result);
  } catch (error) {
    const message = error instanceof Error ? error.message : "Parsing failed";
    if (message.includes("parser API key")) return Response.json({ error: "Parser is not configured" }, { status: 503 });
    if (message.startsWith("Request must") || message.startsWith("A valid account")) return Response.json({ error: message }, { status: 400 });
    // Keep production responses deliberately vague, but expose the provider/schema
    // reason in development so a failed tool call can be fixed instead of silently
    // looking like a keyword-parser success.
    console.error("Autopilot parser failed:", message);
    return Response.json({ error: process.env.NODE_ENV === "development" ? message : "Could not produce a valid autopilot" }, { status: 502 });
  }
}
