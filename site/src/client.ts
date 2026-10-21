import { systemPrompt } from "./persona";
import { readSSE } from "./sse";
import type { Connection, Memory, Message } from "./types";
export class ServiceError extends Error {
  constructor(
    message: string,
    public readonly status: number,
  ) {
    super(message);
  }
}
export const ANTHROPIC_URL = "https://api.anthropic.com/v1/messages";
export function messagesFor(memory: Memory, text: string): Message[] {
  return [
    ...memory.turns.flatMap((turn) => [
      { role: "user" as const, content: turn.user },
      { role: "assistant" as const, content: turn.coach },
    ]),
    { role: "user", content: text },
  ];
}
export function errorFor(status: number): string {
  if (status === 401 || status === 403)
    return "That key or passcode was not accepted. Check it in Settings and try again.";
  if (status === 429)
    return "A little breather. The request limit was reached. Please try again in a minute.";
  if (status === 400 || status === 404)
    return "The model or request was not accepted. Try the other model in Settings.";
  if (status === 413)
    return "That conversation is too long for the friends service. Start a fresh chat and try again.";
  return "Coach could not connect to the service. Please try again in a moment.";
}
export async function* streamReply(
  connection: Exclude<Connection, { mode: "demo" }>,
  memory: Memory,
  text: string,
  signal: AbortSignal,
  fetcher: typeof fetch = fetch,
): AsyncGenerator<string> {
  const headers: Record<string, string> = {
    "Content-Type": "application/json",
  };
  const body = {
    model: connection.model,
    max_tokens: 800,
    stream: true,
    messages: messagesFor(memory, text),
  };
  let url: string;
  let payload: object;
  if (connection.mode === "key") {
    url = ANTHROPIC_URL;
    headers["x-api-key"] = connection.key;
    headers["anthropic-version"] = "2023-06-01";
    headers["anthropic-dangerous-direct-browser-access"] = "true";
    payload = { ...body, system: systemPrompt(memory.facts) };
  } else {
    url = connection.url;
    headers["Authorization"] = `Bearer ${connection.passcode}`;
    payload = {
      ...body,
      model: "claude-haiku-5-5",
      max_tokens: 400,
      memory: memory.facts,
    };
  }
  let response: Response;
  try {
    response = await fetcher(url, {
      method: "POST",
      headers,
      body: JSON.stringify(payload),
      signal,
      credentials: "omit",
      redirect: "error",
      referrerPolicy: "no-referrer",
    });
  } catch (error) {
    signal.throwIfAborted();
    throw new Error(
      "Could not reach Coach. Check your connection and try again.",
      { cause: error },
    );
  }
  if (!response.ok) {
    let message = errorFor(response.status);
    if (connection.mode === "friends") {
      if (response.status === 401)
        message = "That password was not accepted. Check it and try again.";
      if (response.status === 429) {
        const seconds = Number(response.headers.get("Retry-After"));
        if (Number.isFinite(seconds) && seconds > 0)
          message = `A little breather. The request limit was reached. Try again in ${Math.ceil(seconds / 60)} minutes.`;
      }
    }
    throw new ServiceError(message, response.status);
  }
  if (
    !response.body ||
    !response.headers.get("Content-Type")?.includes("text/event-stream")
  )
    throw new Error(
      "The service did not return a streaming reply. Please try again.",
    );
  yield* readSSE(response.body, signal);
}
