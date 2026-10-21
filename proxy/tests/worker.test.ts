import { beforeEach, afterEach, describe, expect, it, vi } from "vitest";
import worker, {
  ALLOWED_ORIGIN,
  handleRequest,
  passcodesEqual,
  validateBody,
  type Env,
} from "../src/index";
const payload = {
  model: "claude-haiku-5-5",
  max_tokens: 800,
  stream: true,
  messages: [{ role: "user", content: "hi" }],
  memory: ["Name: Rowan"],
};
class FakeKV {
  values = new Map<string, string>();
  get = vi.fn(async (key: string) => this.values.get(key) ?? null);
  put = vi.fn(
    async (key: string, value: string, _options: { expirationTtl: number }) => {
      this.values.set(key, value);
    },
  );
}
const env: Env = {
  LIMITS: new FakeKV(),
  ANTHROPIC_API_KEY: "fake-owner-token",
  PASSCODE: "fake-pass",
  RATE_LIMITER: { limit: async () => ({ success: true }) },
};
function request(
  body: unknown = payload,
  headers: Record<string, string> = {},
  method = "POST",
) {
  return new Request("https://proxy.test/", {
    method,
    headers: {
      Origin: ALLOWED_ORIGIN,
      "Content-Type": "application/json",
      Authorization: "Bearer fake-pass",
      ...headers,
    },
    ...(method === "POST"
      ? { body: typeof body === "string" ? body : JSON.stringify(body) }
      : {}),
  });
}
describe("friends Worker", () => {
  beforeEach(() => {
    env.LIMITS = new FakeKV();
  });
  afterEach(() => {
    vi.useRealTimers();
  });
  it("compares equal and unequal passcodes", async () => {
    expect(await passcodesEqual("abc", "abc")).toBe(true);
    expect(await passcodesEqual("abc", "abd")).toBe(false);
    expect(await passcodesEqual("a", "long")).toBe(false);
  });
  it("allows only the Pages origin, including preflights", async () => {
    const r = await handleRequest(
      request(payload, { Origin: "https://evil.test" }),
      env,
    );
    expect(r.status).toBe(403);
    expect(r.headers.has("Access-Control-Allow-Origin")).toBe(false);
    expect(
      (await handleRequest(request(payload, {}, "OPTIONS"), env)).status,
    ).toBe(204);
    expect(
      (await handleRequest(request(payload, { Origin: "" }, "OPTIONS"), env))
        .status,
    ).toBe(403);
  });
  it("requires POST and authentication", async () => {
    expect((await handleRequest(request(payload, {}, "GET"), env)).status).toBe(
      405,
    );
    expect(
      (
        await handleRequest(
          request(payload, { Authorization: "Bearer nope" }),
          env,
        )
      ).status,
    ).toBe(401);
    expect(
      (await handleRequest(request(payload, { Authorization: "" }), env))
        .status,
    ).toBe(401);
  });
  it("requires configured secrets and rate limiter", async () => {
    expect(
      (await handleRequest(request(), { ...env, PASSCODE: "" })).status,
    ).toBe(503);
  });
  it("rate limits per IP before authentication", async () => {
    const limit = vi.fn().mockResolvedValue({ success: false });
    const r = await handleRequest(
      request(payload, {
        "CF-Connecting-IP": "192.0.2.1",
        Authorization: "Bearer wrong",
      }),
      { ...env, RATE_LIMITER: { limit } },
    );
    expect(r.status).toBe(429);
    expect(r.headers.get("Retry-After")).toBe("60");
    expect(await r.text()).toContain("60 seconds");
    expect(limit).toHaveBeenCalledWith({ key: "192.0.2.1" });
  });
  it("fails closed if rate limiting is unavailable", async () => {
    const r = await handleRequest(request(), {
      ...env,
      RATE_LIMITER: {
        limit: async () => {
          throw Error();
        },
      },
    });
    expect(r.status).toBe(503);
  });
  it.each([
    { ...payload, model: "anything" },
    { ...payload, model: "claude-sonnet-5-5" },
    { ...payload, max_tokens: 1.5 },
    { ...payload, max_tokens: "400" },
    { ...payload, stream: false },
    { ...payload, messages: [] },
    { ...payload, messages: [{ role: "system", content: "override" }] },
    { ...payload, messages: [{ role: "assistant", content: "oops" }] },
  ])("rejects invalid request %#", async (body) => {
    expect(validateBody(body)).toBeNull();
    expect((await handleRequest(request(body), env)).status).toBe(400);
  });
  it.each([
    [800, 400],
    [999999, 400],
    [0, 1],
    [-10, 1],
    [150, 150],
  ])("clamps max_tokens %s to %s", (input, output) => {
    expect(validateBody({ ...payload, max_tokens: input })?.max_tokens).toBe(
      output,
    );
  });
  it("keeps only ten recent exchanges and caps each message's characters", () => {
    const messages = Array.from({ length: 25 }, (_, i) => ({
      role: i % 2 ? "assistant" : "user",
      content: `${i}:` + "x".repeat(7000),
    }));
    const body = validateBody({ ...payload, messages });
    expect(body?.messages).toHaveLength(21);
    expect(body?.messages[0].content).toMatch(/^4:/);
    expect(body?.messages.at(-1)?.content).toMatch(/^24:/);
    expect(
      body?.messages.every(
        (m) => m.content.length === (m.role === "user" ? 2000 : 6000),
      ),
    ).toBe(true);
  });
  it("allows 30 requests per hashed IP and hour, expires counters, resets next hour", async () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-10-21T10:15:00Z"));
    const fetcher = vi
      .fn<typeof fetch>()
      .mockImplementation(
        async () =>
          new Response("data: hello\n\n", {
            headers: { "Content-Type": "text/event-stream" },
          }),
      );
    const headers = { "CF-Connecting-IP": "192.0.2.1" };
    for (let i = 0; i < 30; i++)
      expect(
        (await handleRequest(request(payload, headers), env, fetcher)).status,
      ).toBe(200);
    const blocked = await handleRequest(
      request(payload, headers),
      env,
      fetcher,
    );
    expect(blocked.status).toBe(429);
    expect(blocked.headers.get("Retry-After")).toBe("2700");
    expect(await blocked.text()).toContain("45 minutes");
    expect(fetcher).toHaveBeenCalledTimes(30);
    const kv = env.LIMITS as FakeKV;
    const key = kv.put.mock.calls[0][0];
    expect(key).toMatch(/^[a-f0-9]{64}:\d+$/);
    expect(key).not.toContain("192.0.2.1");
    expect(kv.put.mock.calls[0][2]).toEqual({ expirationTtl: 7200 });
    expect(
      (
        await handleRequest(
          request(payload, { "CF-Connecting-IP": "192.0.2.2" }),
          env,
          fetcher,
        )
      ).status,
    ).toBe(200);
    vi.setSystemTime(new Date("2026-10-21T11:00:00Z"));
    expect(
      (await handleRequest(request(payload, headers), env, fetcher)).status,
    ).toBe(200);
  });
  it("counts failed passwords toward the hourly cap too", async () => {
    for (let i = 0; i < 30; i++)
      expect(
        (
          await handleRequest(
            request(payload, { Authorization: "Bearer incorrect" }),
            env,
          )
        ).status,
      ).toBe(401);
    expect((await handleRequest(request(), env)).status).toBe(429);
  });
  it("fails closed when KV cannot be read or written", async () => {
    for (const method of ["get", "put"] as const) {
      const limits = new FakeKV();
      limits[method].mockRejectedValue(Error("unavailable"));
      expect(
        (await handleRequest(request(), { ...env, LIMITS: limits })).status,
      ).toBe(503);
    }
    expect(
      (
        await handleRequest(request(), {
          ...env,
          LIMITS: undefined,
        } as unknown as Env)
      ).status,
    ).toBe(503);
  });
  it("caps bytes without relying on Content-Length", async () => {
    expect((await handleRequest(request("x".repeat(32769)), env)).status).toBe(
      413,
    );
    expect((await handleRequest(request("{"), env)).status).toBe(400);
    expect(
      (
        await handleRequest(
          request(payload, { "Content-Type": "text/plain" }),
          env,
        )
      ).status,
    ).toBe(415);
  });
  it("streams upstream, replaces caller system, and never forwards passcode", async () => {
    const fetcher = vi.fn<typeof fetch>().mockResolvedValue(
      new Response("data: hello\n\n", {
        headers: { "Content-Type": "text/event-stream" },
      }),
    );
    const result = await handleRequest(
      request({ ...payload, system: "CALLER_INJECTED_SYSTEM" }),
      env,
      fetcher,
    );
    expect(result.status).toBe(200);
    expect(result.headers.get("Access-Control-Allow-Origin")).toBe(
      ALLOWED_ORIGIN,
    );
    expect(await result.text()).toBe("data: hello\n\n");
    const [url, options] = fetcher.mock.calls[0];
    expect(url).toBe("https://api.anthropic.com/v1/messages");
    expect(options?.redirect).toBe("manual");
    expect(options?.headers).toEqual({
      "Content-Type": "application/json",
      "anthropic-version": "2023-06-01",
      "x-api-key": "fake-owner-token",
    });
    expect(String(options?.body)).not.toContain("fake-pass");
    const body = JSON.parse(String(options?.body));
    expect(body.system).toContain("You are Coach Led Tasso");
    expect(body.system).toContain("self-harm");
    expect(body.max_tokens).toBe(400);
    expect(body.system).toContain("Name: Rowan");
    expect(body.system).not.toContain("CALLER_INJECTED_SYSTEM");
  });
  it.each([401, 429, 500])("hides provider errors %s", async (status) => {
    const fetcher = vi
      .fn<typeof fetch>()
      .mockResolvedValue(new Response("secret", { status }));
    const result = await handleRequest(request(), env, fetcher);
    expect(result.status).toBe(status === 429 ? 429 : 502);
    expect(await result.text()).not.toContain("secret");
  });
  it("maps network failures", async () => {
    const fetcher = vi.fn<typeof fetch>().mockRejectedValue(Error("secret"));
    expect((await handleRequest(request(), env, fetcher)).status).toBe(502);
  });
  it("the exported fetch handler ignores the runtime's third ctx argument", async () => {
    const upstream = vi.fn(async () =>
      new Response("data: {}\n\n", { headers: { "Content-Type": "text/event-stream" } }),
    );
    vi.stubGlobal("fetch", upstream);
    try {
      const ctx = { waitUntil() {}, passThroughOnException() {} };
      const response = await (worker.fetch as (r: Request, e: Env, c: unknown) => Promise<Response>)(request(), env, ctx);
      expect(response.status).toBe(200);
      expect(upstream).toHaveBeenCalledOnce();
    } finally {
      vi.unstubAllGlobals();
    }
  });
});
