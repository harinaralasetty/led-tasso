import { isRecord } from "../../site/src/types";
import { cleanFacts } from "../../site/src/memory";
import { systemPrompt } from "../../site/src/persona";
import {
  COUNTER_TTL_SECONDS,
  DAILY_MESSAGE_LIMIT,
  DAY_MS,
  EFFORT,
  describeWait,
  secondsUntilNextDay,
} from "../../site/src/limits";
export const ALLOWED_ORIGIN = "https://harinaralasetty.github.io";
export const MAX_BYTES = 32_768;
export interface Env {
  ANTHROPIC_API_KEY: string;
  PASSCODE: string;
  LIMITS: {
    get(key: string): Promise<string | null>;
    put(
      key: string,
      value: string,
      options: { expirationTtl: number },
    ): Promise<void>;
  };
  RATE_LIMITER: {
    limit(options: { key: string }): Promise<{ success: boolean }>;
  };
}
const cors = {
  "Access-Control-Allow-Origin": ALLOWED_ORIGIN,
  "Access-Control-Allow-Methods": "POST, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type, Authorization",
  "Access-Control-Expose-Headers": "Retry-After",
  Vary: "Origin",
  "Cache-Control": "no-store",
  "X-Content-Type-Options": "nosniff",
};
function error(message: string, status: number, retryAfter?: number): Response {
  return Response.json(
    { error: message },
    {
      status,
      headers: {
        ...cors,
        ...(retryAfter ? { "Retry-After": String(retryAfter) } : {}),
      },
    },
  );
}
// Hash both strings to the same fixed length. Compare every byte without an early return.
export async function passcodesEqual(a: string, b: string): Promise<boolean> {
  const encoder = new TextEncoder();
  const hashes = await Promise.all(
    [a, b].map((value) =>
      crypto.subtle.digest("SHA-256", encoder.encode(value)),
    ),
  );
  const left = new Uint8Array(hashes[0]);
  const right = new Uint8Array(hashes[1]);
  let difference = 0;
  for (let i = 0; i < left.length; i++) difference |= left[i] ^ right[i];
  return difference === 0;
}
async function boundedBody(request: Request): Promise<string> {
  if (Number(request.headers.get("content-length")) > MAX_BYTES)
    throw new Error("size");
  if (!request.body) return "";
  const reader = request.body.getReader();
  const chunks: Uint8Array[] = [];
  let size = 0;
  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      size += value.byteLength;
      if (size > MAX_BYTES) {
        await reader.cancel();
        throw new Error("size");
      }
      chunks.push(value);
    }
  } finally {
    reader.releaseLock();
  }
  const buffer = new Uint8Array(size);
  let position = 0;
  for (const chunk of chunks) {
    buffer.set(chunk, position);
    position += chunk.byteLength;
  }
  return new TextDecoder().decode(buffer);
}
export function validateBody(body: unknown): {
  model: string;
  max_tokens: number;
  stream: true;
  messages: { role: "user" | "assistant"; content: string }[];
  system: string;
  output_config: { effort: typeof EFFORT };
} | null {
  if (
    !isRecord(body) ||
    body.model !== "claude-haiku-5-5" ||
    body.stream !== true
  )
    return null;
  if (!Number.isInteger(body.max_tokens) || typeof body.max_tokens !== "number")
    return null;
  if (!Array.isArray(body.messages) || body.messages.length < 1) return null;
  // Ten completed exchanges plus the current user message. Older context is discarded.
  const recent = body.messages.slice(-21);
  const messages: { role: "user" | "assistant"; content: string }[] = [];
  for (let i = 0; i < recent.length; i++) {
    const message: unknown = recent[i];
    if (
      !isRecord(message) ||
      message.role !== (i % 2 ? "assistant" : "user") ||
      typeof message.content !== "string" ||
      !message.content.trim()
    )
      return null;
    messages.push({
      role: i % 2 ? "assistant" : "user",
      content: message.content.trim().slice(0, i % 2 ? 6000 : 2000),
    });
  }
  if (messages.at(-1)?.role !== "user") return null;
  return {
    model: String(body.model),
    max_tokens: Math.max(1, Math.min(400, body.max_tokens)),
    stream: true,
    messages,
    system: systemPrompt(cleanFacts(body.memory)),
    // Set here, never by the caller: the owner pays, so the owner picks the effort.
    output_config: { effort: EFFORT },
  };
}
export async function handleRequest(
  request: Request,
  env: Env,
  fetcher: typeof fetch = (input, init) => fetch(input, init),
): Promise<Response> {
  if (request.headers.get("Origin") !== ALLOWED_ORIGIN)
    return new Response("This origin is not allowed.", { status: 403 });
  if (new URL(request.url).pathname !== "/")
    return error("Endpoint not found.", 404);
  if (request.method === "OPTIONS")
    return new Response(null, { status: 204, headers: cors });
  if (request.method !== "POST")
    return error("Please send a POST request.", 405);
  if (
    !env.ANTHROPIC_API_KEY ||
    !env.PASSCODE ||
    !env.RATE_LIMITER ||
    !env.LIMITS
  )
    return error("The friends service is not configured yet.", 503);
  // Apply the limit to failed authentication too, to slow down passcode guessing.
  try {
    if (
      !(
        await env.RATE_LIMITER.limit({
          key: request.headers.get("CF-Connecting-IP") || "unknown",
        })
      ).success
    )
      return error("Take a breather and try again in 60 seconds.", 429, 60);
    const now = Date.now();
    const day = Math.floor(now / DAY_MS);
    const ip = request.headers.get("CF-Connecting-IP") || "unknown";
    const digest = await crypto.subtle.digest(
      "SHA-256",
      new TextEncoder().encode(ip),
    );
    const hash = Array.from(new Uint8Array(digest), (byte) =>
      byte.toString(16).padStart(2, "0"),
    ).join("");
    const key = `${hash}:${day}`;
    const count = Number((await env.LIMITS.get(key)) || "0");
    if (!Number.isSafeInteger(count) || count < 0)
      throw Error("Invalid limit counter");
    if (count >= DAILY_MESSAGE_LIMIT) {
      const retry = secondsUntilNextDay(now);
      return error(
        `You have reached ${DAILY_MESSAGE_LIMIT} messages today. Try again in ${describeWait(retry)}, when the next day starts (UTC).`,
        429,
        retry,
      );
    }
    // KV read/modify/write is eventually consistent, so this is an approximate cap.
    await env.LIMITS.put(key, String(count + 1), {
      expirationTtl: COUNTER_TTL_SECONDS,
    });
  } catch {
    return error("The friends service is temporarily unavailable.", 503);
  }
  const auth = request.headers.get("Authorization") || "";
  if (
    auth.length > 1024 ||
    !auth.startsWith("Bearer ") ||
    !(await passcodesEqual(auth.slice(7), env.PASSCODE))
  )
    return error(
      "That password was not accepted. Check it and try again.",
      401,
    );
  if (!request.headers.get("Content-Type")?.startsWith("application/json"))
    return error("Please send JSON.", 415);
  let raw: string;
  try {
    raw = await boundedBody(request);
  } catch {
    return error("That conversation is too large. Start a fresh chat.", 413);
  }
  let body: unknown;
  try {
    body = JSON.parse(raw);
  } catch {
    return error("The request could not be read.", 400);
  }
  const payload = validateBody(body);
  if (!payload) return error("Please check the model and message limits.", 400);
  try {
    const upstream = await fetcher("https://api.anthropic.com/v1/messages", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "anthropic-version": "2023-06-01",
        "x-api-key": env.ANTHROPIC_API_KEY,
      },
      body: JSON.stringify(payload),
      signal: request.signal,
      // Workers only support "follow" and "manual"; "error" throws.
      redirect: "manual",
    });
    if (!upstream.ok)
      return error(
        upstream.status === 429
          ? "The service is busy. Try again in a minute."
          : "Coach could not reach the service. Please try again.",
        upstream.status === 429 ? 429 : 502,
      );
    if (
      !upstream.body ||
      !upstream.headers.get("Content-Type")?.includes("text/event-stream")
    )
      return error("The service returned an unreadable reply.", 502);
    return new Response(upstream.body, {
      headers: { ...cors, "Content-Type": "text/event-stream" },
    });
  } catch (cause) {
    console.error("upstream fetch failed", cause instanceof Error ? cause.name + ": " + cause.message : "unknown");
    return error("Coach could not connect. Please try again in a moment.", 502);
  }
}
// The runtime passes (request, env, ctx); keep ctx out of handleRequest's injectable fetcher.
export default { fetch: (request: Request, env: Env) => handleRequest(request, env) };
