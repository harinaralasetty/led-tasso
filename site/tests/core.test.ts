import { describe, expect, it } from "vitest";
import {
  addReply,
  cleanFacts,
  emptyMemory,
  forgetFact,
  loadMemory,
  parseMemory,
  saveMemory,
} from "../src/memory";
import { demoReply, intentFor, isCrisis } from "../src/demo";
import { extractReply, MEMORY_OPEN, MEMORY_CLOSE } from "../src/protocol";
import { PERSONA } from "../src/persona";
import { readFileSync } from "node:fs";
describe("offline coach", () => {
  it.each([
    ["hello", "greeting"],
    ["I am nervous", "nerves"],
    ["a goal for today", "goals"],
    ["I failed", "setbacks"],
    ["pep talk", "motivation"],
    ["my job", "work"],
    ["soccer", "sport"],
    ["thanks", "thanks"],
    ["hmm", "other"],
  ])("recognizes %s", (text, intent) => expect(intentFor(text)).toBe(intent));
  it("extracts explicitly stated facts and uses remembered facts", () => {
    const result = demoReply(
      "My name is Rowan. I'm training for a 5K.",
      emptyMemory(),
    );
    expect(result.facts).toEqual(["Name: Rowan", "Training for a 5K"]);
    const memory = addReply(emptyMemory(), "hello", result.reply, result.facts);
    const next = demoReply("What goal should I work on?", memory);
    expect(next.reply).toContain("Rowan");
    expect(next.reply).toContain("a 5K");
    expect(next.facts).toEqual([]);
  });
  it("varies replies over turns", () =>
    expect(demoReply("hi", emptyMemory()).reply).not.toBe(
      demoReply("hi", { facts: [], turns: [{ user: "hi", coach: "hey" }] })
        .reply,
    ));
  it.each([
    "I want to kill myself",
    "self-harm",
    "I am in danger",
    "I want to die",
    "I don't want to live",
    "someone will hurt me",
    "I feel unsafe",
    "I am in immediate danger",
    "I am ending my life",
  ])("uses caring crisis path for %s", (text) => {
    expect(isCrisis(text)).toBe(true);
    const result = demoReply(text, emptyMemory());
    expect(result.intent).toBe("crisis");
    expect(result.reply).toContain("emergency services");
    expect(result.reply).toContain("right now");
    expect(result.facts).toEqual([]);
    expect(result.reply).not.toMatch(/bench|game|score|play/);
  });
  it("keeps persona rules identical to Python before the output format", () => {
    const source = readFileSync(
      new URL("../../led_tasso/persona.md", import.meta.url),
      "utf8",
    )
      .split("Return exactly ONE JSON object")[0]
      .trim();
    expect(PERSONA.startsWith(source)).toBe(true);
  });
});
describe("bounded browser memory", () => {
  it("caps facts, length, new additions and history", () => {
    let memory = emptyMemory();
    for (let i = 0; i < 15; i++)
      memory = addReply(
        memory,
        "u",
        "c",
        Array.from({ length: 9 }, (_, j) => `${i}-${j}-${"x".repeat(250)}`),
      );
    expect(memory.facts).toHaveLength(50);
    expect(memory.facts.every((f) => f.length === 200)).toBe(true);
    expect(memory.turns).toHaveLength(10);
    expect(
      addReply(emptyMemory(), "u", "c", ["a", "b", "c", "d", "e", "f"]).facts,
    ).toHaveLength(5);
  });
  it("normalizes whitespace and dedupes case insensitively", () =>
    expect(cleanFacts([" A  B ", "a b", "", 3, null, "C"])).toEqual([
      "A B",
      "C",
    ]));
  it.each(["{", "null", "[]", "42", '{"facts":5,"turns":[null,{}]}'])(
    "recovers corruption %s",
    (raw) => expect(parseMemory(raw)).toEqual(emptyMemory()),
  );
  it("validates individual turns and facts", () =>
    expect(
      parseMemory(
        '{"facts":["hello",null],"turns":[{"user":"hi","coach":"hey"},{}]}',
      ),
    ).toEqual({ facts: ["hello"], turns: [{ user: "hi", coach: "hey" }] }));
  it("handles blocked or exhausted storage", () => {
    expect(
      loadMemory({
        getItem: () => {
          throw Error();
        },
      }),
    ).toEqual(emptyMemory());
    expect(
      saveMemory(
        {
          setItem: () => {
            throw Error();
          },
        },
        emptyMemory(),
      ),
    ).toBe(false);
  });
  it("forgetting resets recent context", () =>
    expect(
      forgetFact({ facts: ["a", "b"], turns: [{ user: "a", coach: "b" }] }, 0),
    ).toEqual({ facts: ["b"], turns: [] }));
});
describe("streamed memory protocol", () => {
  const raw = `A useful reply.\n${MEMORY_OPEN}["Name: Rowan"]${MEMORY_CLOSE}`;
  it("never displays metadata at any chunk boundary", () => {
    for (let i = 0; i < raw.length; i++) {
      const part = extractReply(raw.slice(0, i));
      expect(part.text).not.toContain("<");
      expect(part.text).not.toContain("Name:");
      expect(part.facts).toEqual([]);
    }
    expect(extractReply(raw, true)).toEqual({
      text: "A useful reply.",
      facts: ["Name: Rowan"],
    });
  });
  it.each([
    '<coach-memory>["a"]',
    "<coach-memory>nonsense</coach-memory>",
    '<coach-memory>{"a":5}</coach-memory>',
    "<coach-memory broken>secret",
    '<coach-memory>["a"]</coach-memory>trailing',
  ])("ignores partial or garbled metadata %s", (suffix) =>
    expect(extractReply("Hello\n" + suffix, true)).toEqual({
      text: "Hello",
      facts: [],
    }),
  );
  it("accepts harmless whitespace after a complete block", () => {
    expect(extractReply(raw + "\n  ", true)).toEqual({
      text: "A useful reply.",
      facts: ["Name: Rowan"],
    });
  });
  it("accepts absent metadata and renders text literally", () =>
    expect(extractReply("<img src=x onerror=alert(1)> Hello", true)).toEqual({
      text: "<img src=x onerror=alert(1)> Hello",
      facts: [],
    }));
});
