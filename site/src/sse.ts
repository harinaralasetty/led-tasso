import { isRecord } from "./types";
export interface ServerEvent {
  event: string;
  data: string;
}
export class SSEParser {
  private buffer = "";
  push(chunk: string, final = false): ServerEvent[] {
    this.buffer += chunk;
    const result: ServerEvent[] = [];
    let match: RegExpExecArray | null;
    while ((match = /\r?\n\r?\n/.exec(this.buffer))) {
      const block = this.buffer.slice(0, match.index);
      this.buffer = this.buffer.slice(match.index + match[0].length);
      const data: string[] = [];
      let event = "message";
      for (const line of block.split(/\r?\n/)) {
        if (line.startsWith("event:")) event = line.slice(6).trim();
        if (line.startsWith("data:"))
          data.push(line.slice(5).replace(/^ /, ""));
      }
      if (data.length) result.push({ event, data: data.join("\n") });
    }
    if (this.buffer.length > 100_000)
      throw new Error("The reply was too large. Please try a shorter message.");
    if (final && this.buffer.trim())
      throw new Error("The reply ended unexpectedly. Please try again.");
    return result;
  }
}
export async function* readSSE(
  stream: ReadableStream<Uint8Array>,
  signal?: AbortSignal,
): AsyncGenerator<string> {
  const reader = stream.getReader();
  const decoder = new TextDecoder();
  const parser = new SSEParser();
  let ended = false;
  const abort = () => {
    void reader.cancel();
  };
  signal?.addEventListener("abort", abort, { once: true });
  try {
    while (true) {
      signal?.throwIfAborted();
      const { done, value } = await reader.read();
      signal?.throwIfAborted();
      for (const event of parser.push(
        decoder.decode(value, { stream: !done }),
        done,
      )) {
        if (event.data === "[DONE]") {
          ended = true;
          continue;
        }
        let data: unknown;
        try {
          data = JSON.parse(event.data);
        } catch {
          throw new Error(
            "The reply arrived in an unreadable format. Please try again.",
          );
        }
        if (!isRecord(data)) continue;
        if (event.event === "error" || data.type === "error")
          throw new Error(
            "Coach lost the connection. Please try again in a moment.",
          );
        if (data.type === "message_stop") ended = true;
        if (
          data.type === "content_block_delta" &&
          isRecord(data.delta) &&
          data.delta.type === "text_delta" &&
          typeof data.delta.text === "string"
        )
          yield data.delta.text;
      }
      if (done) break;
    }
    if (!ended) throw new Error("The reply was interrupted. Please try again.");
  } finally {
    signal?.removeEventListener("abort", abort);
    await reader.cancel().catch(() => undefined);
    reader.releaseLock();
  }
}
