import { describe, expect, it, vi } from "vitest";
import {
  DAILY_MESSAGE_LIMIT,
  describeWait,
  secondsUntilNextDay,
} from "../src/limits";
import { streamReply } from "../src/client";
import { emptyMemory } from "../src/memory";
describe("shared limits", () => {
  it("keeps the daily allowance in one place", () => {
    expect(DAILY_MESSAGE_LIMIT).toBe(100);
  });
  it.each([
    [1, "1 minute"],
    [60, "1 minute"],
    [90, "2 minutes"],
    [2700, "45 minutes"],
    [3600, "1 hour"],
    [3660, "1 hour 1 minute"],
    [49500, "13 hours 45 minutes"],
    [86400, "24 hours"],
    [0, "1 minute"],
  ])("describes %s seconds as %s", (seconds, text) => {
    expect(describeWait(seconds)).toBe(text);
  });
  it("counts the seconds left in the UTC day", () => {
    expect(secondsUntilNextDay(Date.parse("2026-10-21T10:15:00Z"))).toBe(49500);
    expect(secondsUntilNextDay(Date.parse("2026-10-21T00:00:00Z"))).toBe(86400);
    // Never zero, so Retry-After always asks for a real wait.
    expect(secondsUntilNextDay(Date.parse("2026-10-21T23:59:59Z"))).toBe(1);
  });
  it("quotes hours, not 825 minutes, when the friends cap is hit", async () => {
    const fetcher = vi.fn<typeof fetch>().mockResolvedValue(
      new Response("private details", {
        status: 429,
        headers: { "Retry-After": "49500" },
      }),
    );
    const reply = streamReply(
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
    );
    await expect(reply.next()).rejects.toThrow("13 hours 45 minutes");
  });
});
