import { describe, expect, it, vi } from "vitest";
import { readSSE, SSEParser } from "../src/sse";
import { streamReply, ANTHROPIC_URL, errorFor } from "../src/client";
import { emptyMemory } from "../src/memory";
export function event(text: string): string {
  return `event: content_block_delta\ndata: ${JSON.stringify({ type: "content_block_delta", delta: { type: "text_delta", text } })}\n\n`;
}
const stop = 'event: message_stop\ndata: {"type":"message_stop"}\n\n';
function stream(chunks: string[]): ReadableStream<Uint8Array> {
  return new ReadableStream({
    start(controller) {
      for (const chunk of chunks)
        controller.enqueue(new TextEncoder().encode(chunk));
      controller.close();
    },
  });
}
async function collect(source: AsyncGenerator<string>): Promise<string> {
  let text = "";
  for await (const chunk of source) text += chunk;
  return text;
}
describe("SSE parsing", () => {
  it("parses each possible chunk split and CRLF", async () => {
    const raw = (event("héllo") + stop).replaceAll("\n", "\r\n");
    for (let i = 0; i < raw.length; i++)
      expect(
        await collect(readSSE(stream([raw.slice(0, i), raw.slice(i)]))),
      ).toBe("héllo");
  });
  it("decodes UTF-8 split inside a multibyte character", async () => {
    const bytes = new TextEncoder().encode(event("🏅") + stop);
    const body = new ReadableStream<Uint8Array>({
      start(c) {
        for (const byte of bytes) c.enqueue(new Uint8Array([byte]));
        c.close();
      },
    });
    expect(await collect(readSSE(body))).toBe("🏅");
  });
  it("joins multiline data and skips comments", () =>
    expect(
      new SSEParser().push(
        ": ping\nevent: test\ndata: first\ndata: second\n\n",
      ),
    ).toEqual([{ event: "test", data: "first\nsecond" }]));
  it("reports error events without exposing provider payloads", async () =>
    expect(
      collect(
        readSSE(
          stream([
            'event: error\ndata: {"type":"error","error":{"message":"SECRET"}}\n\n',
          ]),
        ),
      ),
    ).rejects.toThrow("lost the connection"));
  it.each(["data: nope\n\n", event("unfinished"), "data: {"])(
    "rejects malformed or interrupted streams",
    async (raw) => expect(collect(readSSE(stream([raw])))).rejects.toThrow(),
  );
  it("rejects oversized unfinished events", () =>
    expect(() => new SSEParser().push("x".repeat(100001))).toThrow(
      "too large",
    ));
  it("aborts a pending read", async () => {
    const controller = new AbortController();
    const source = readSSE(new ReadableStream(), controller.signal);
    const next = source.next();
    controller.abort();
    await expect(next).rejects.toThrow();
  });
});
describe("Anthropic client", () => {
  it("sends exact BYOK endpoint, headers and bounded context", async () => {
    const fetcher = vi.fn<typeof fetch>().mockResolvedValue(
      new Response(stream([event("hello"), stop]), {
        headers: { "Content-Type": "text/event-stream" },
      }),
    );
    expect(
      await collect(
        streamReply(
          { mode: "key", key: "fake-test-token", model: "claude-haiku-5-5" },
          emptyMemory(),
          "hi",
          new AbortController().signal,
          fetcher,
        ),
      ),
    ).toBe("hello");
    const [url, options] = fetcher.mock.calls[0];
    expect(url).toBe(ANTHROPIC_URL);
    expect(options?.headers).toEqual({
      "Content-Type": "application/json",
      "x-api-key": "fake-test-token",
      "anthropic-version": "2023-06-01",
      "anthropic-dangerous-direct-browser-access": "true",
    });
    const body = JSON.parse(String(options?.body));
    expect(body).toMatchObject({
      model: "claude-haiku-5-5",
      max_tokens: 800,
      stream: true,
      messages: [{ role: "user", content: "hi" }],
    });
    expect(body.system).toContain("self-harm");
    expect(body.output_config).toEqual({ effort: "low" });
    expect(options?.credentials).toBe("omit");
    expect(options?.redirect).toBe("error");
  });
  it("sends friends passcode only to configured proxy", async () => {
    const fetcher = vi.fn<typeof fetch>().mockResolvedValue(
      new Response(stream([stop]), {
        headers: { "Content-Type": "text/event-stream" },
      }),
    );
    await collect(
      streamReply(
        {
          mode: "friends",
          passcode: "fake-pass",
          url: "https://proxy.test",
          model: "claude-sonnet-5-5",
        },
        emptyMemory(),
        "hi",
        new AbortController().signal,
        fetcher,
      ),
    );
    const [url, options] = fetcher.mock.calls[0];
    expect(url).toBe("https://proxy.test");
    expect(options?.headers).toEqual({
      "Content-Type": "application/json",
      Authorization: "Bearer fake-pass",
    });
    const body = JSON.parse(String(options?.body));
    expect(body).not.toHaveProperty("system");
    // The Worker sets the effort itself; a caller value would be discarded anyway.
    expect(body).not.toHaveProperty("output_config");
    expect(body.model).toBe("claude-haiku-5-5");
    expect(body.max_tokens).toBe(400);
  });
  it.each([400, 401, 403, 404, 413, 429, 500])(
    "maps HTTP %s without raw error leakage",
    async (status) => {
      const fetcher = vi
        .fn<typeof fetch>()
        .mockResolvedValue(new Response("secret provider details", { status }));
      await expect(
        collect(
          streamReply(
            { mode: "key", key: "fake-test-token", model: "claude-haiku-5-5" },
            emptyMemory(),
            "hi",
            new AbortController().signal,
            fetcher,
          ),
        ),
      ).rejects.toThrow(errorFor(status));
    },
  );
  it("preserves the friends daily retry time without exposing the response body", async () => {
    const fetcher = vi
      .fn<typeof fetch>()
      .mockResolvedValue(
        new Response("private details", {
          status: 429,
          headers: { "Retry-After": "2700" },
        }),
      );
    await expect(
      collect(
        streamReply(
          {
            mode: "friends",
            passcode: "fake-pass",
            model: "claude-haiku-5-5",
            url: "https://proxy.test",
          },
          emptyMemory(),
          "hi",
          new AbortController().signal,
          fetcher,
        ),
      ),
    ).rejects.toThrow("45 minutes");
  });
  it("maps offline failure", async () => {
    const fetcher = vi.fn<typeof fetch>().mockRejectedValue(Error("secret"));
    await expect(
      collect(
        streamReply(
          { mode: "key", key: "fake", model: "claude-haiku-5-5" },
          emptyMemory(),
          "hi",
          new AbortController().signal,
          fetcher,
        ),
      ),
    ).rejects.toThrow("Check your connection");
  });
  it("rejects non-stream replies", async () => {
    const fetcher = vi.fn<typeof fetch>().mockResolvedValue(Response.json({}));
    await expect(
      collect(
        streamReply(
          { mode: "key", key: "fake", model: "claude-haiku-5-5" },
          emptyMemory(),
          "hi",
          new AbortController().signal,
          fetcher,
        ),
      ),
    ).rejects.toThrow("streaming reply");
  });
});
