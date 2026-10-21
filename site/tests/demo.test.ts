import { describe, expect, it } from "vitest";
import { demoReply, intentFor, statedFacts, type Intent } from "../src/demo";
import { addReply, emptyMemory } from "../src/memory";

// These are user sentences, with exact expected durable facts. Feelings shape
// the answer without becoming lasting claims about the person.
const cases: [string, string[], Intent][] = [
  [
    "Hi coach, my name is Sam and I have a big presentation tomorrow.",
    ["Name: Sam", "Upcoming: a big presentation tomorrow"],
    "event",
  ],
  ["My name is River", ["Name: River"], "greeting"],
  [
    "Hey, my name is Sam, and I'm nervous about tomorrow.",
    ["Name: Sam"],
    "nerves",
  ],
  [
    "I'm Maya and I have an interview on Friday.",
    ["Name: Maya", "Upcoming: an interview on Friday"],
    "event",
  ],
  ["I'm Alex.", ["Name: Alex"], "greeting"],
  ["I am Priya, nice to meet you.", ["Name: Priya"], "greeting"],
  [
    "hello, i'm sam and I want to finish my book.",
    ["Name: sam", "Goal: finish my book"],
    "goals",
  ],
  ["Call me Jo, please.", ["Name: Jo"], "greeting"],
  [
    "You can call me Jean-Luc and I'm training for a 5K.",
    ["Name: Jean-Luc", "Training for a 5K"],
    "goals",
  ],
  [
    "This is Aisha here, and I have a meeting tomorrow.",
    ["Name: Aisha", "Upcoming: a meeting tomorrow"],
    "event",
  ],
  ["Hi coach, this is José here.", ["Name: José"], "greeting"],
  [
    "My name is Mary Jane Watson and I enjoy painting.",
    ["Name: Mary Jane Watson", "Enjoys or prefers painting"],
    "greeting",
  ],
  ["I'm O'Connor, and I'm excited!", ["Name: O'Connor"], "excited"],
  ["My name is 李明。", ["Name: 李明"], "greeting"],
  ["Call me Élodie!", ["Name: Élodie"], "greeting"],
  ["I'm nervous", [], "nerves"],
  ["I'm tired and I need a break.", [], "tired"],
  ["I'm stuck on the next step.", [], "motivation"],
  ["I'm sad today.", [], "sad"],
  ["I'm excited about this week!", [], "excited"],
  ["I'm feeling overwhelmed.", [], "other"],
  ["I'm really anxious about work.", [], "nerves"],
  ["I'm training for a 5K", ["Training for a 5K"], "goals"],
  [
    "I’m training for a marathon in April and I feel nervous.",
    ["Training for a marathon in April"],
    "nerves",
  ],
  ["I'm not Sam, I'm tired.", [], "tired"],
  ["My name is not Sam.", [], "other"],
  ["Call me back, please.", [], "other"],
  ["Call me tomorrow.", [], "other"],
  ["I'm a teacher.", [], "other"],
  ["I'm American.", [], "other"],
  ["I'm alone and tired.", [], "tired"],
  ["I'm unemployed.", [], "other"],
  ["This is my friend here.", [], "other"],
  ["This is hard work.", [], "work"],
  ["My friend's name is Sam.", [], "other"],
  ["You are Sam, right?", [], "other"],
  ["Am I ready for tomorrow?", [], "other"],
  [
    "I have a presentation tomorrow",
    ["Upcoming: a presentation tomorrow"],
    "event",
  ],
  [
    "I'm starting a new job on Monday",
    ["Upcoming: starting a new job on Monday"],
    "event",
  ],
  [
    "starting a new job on Monday",
    ["Upcoming: starting a new job on Monday"],
    "event",
  ],
  [
    "I am starting my new job next week and I'm excited.",
    ["Upcoming: starting my new job next week"],
    "excited",
  ],
  [
    "I have my final exam next Tuesday, and I am scared.",
    ["Upcoming: my final exam next Tuesday"],
    "nerves",
  ],
  [
    "I've got an audition on Saturday.",
    ["Upcoming: an audition on Saturday"],
    "event",
  ],
  [
    "I have a big race this weekend.",
    ["Upcoming: a big race this weekend"],
    "event",
  ],
  [
    "I have a performance tonight but I'm tired.",
    ["Upcoming: a performance tonight"],
    "tired",
  ],
  ["I want to read every evening.", ["Goal: read every evening"], "goals"],
  [
    "My goal is to finish a draft this month.",
    ["Goal: finish a draft this month"],
    "goals",
  ],
  [
    "I plan to learn guitar and I enjoy singing.",
    ["Goal: learn guitar", "Enjoys or prefers singing"],
    "goals",
  ],
  [
    "I'm trying to build a walking habit.",
    ["Goal: build a walking habit"],
    "goals",
  ],
  ["I hope to make the team.", ["Goal: make the team"], "goals"],
  ["I prefer quiet mornings.", ["Enjoys or prefers quiet mornings"], "other"],
  ["Thanks, I'm nervous about the presentation.", [], "nerves"],
  ["Hi, I failed my exam.", [], "setbacks"],
  ["Hello, work has been a lot this week.", [], "work"],
  ["Hey coach, could I get a pep talk?", [], "motivation"],
  ["Thanks for listening.", [], "thanks"],
  ["I feel lonely tonight.", [], "sad"],
  ["I'm exhausted after a long day.", [], "tired"],
  ["I'm thrilled about the weekend.", [], "excited"],
  ["I don't have a presentation tomorrow.", [], "event"],
  ["My sister has an interview tomorrow.", [], "event"],
  ["I wish I had a race to train for.", [], "sport"],
  [
    "Hi, I'm Sam and I'm nervous because I have a presentation tomorrow.",
    ["Name: Sam", "Upcoming: a presentation tomorrow"],
    "nerves",
  ],
  [
    "Call me Sam. I want to write a book. I have an interview tomorrow and I'm excited.",
    ["Name: Sam", "Goal: write a book", "Upcoming: an interview tomorrow"],
    "excited",
  ],
];

describe("natural demo sentences", () => {
  it.each(cases)("understands %s", (text, facts, intent) => {
    expect(statedFacts(text)).toEqual(facts);
    expect(intentFor(text)).toBe(intent);
    const result = demoReply(text, emptyMemory());
    expect(result.facts).toEqual(facts);
    expect(result.intent).toBe(intent);
    const name = facts.find((fact) => fact.startsWith("Name: "))?.slice(6);
    if (name) expect(result.reply).toContain(name);
  });

  it.each([
    [
      "Hi coach, my name is Sam and I have a big presentation tomorrow.",
      /Sam/,
      /presentation/,
    ],
    ["I'm Jo and I'm starting a new job on Monday.", /Jo/, /job/],
    [
      "I'm Priya and I'm nervous because I have an interview tomorrow.",
      /Priya/,
      /interview/,
    ],
    [
      "I'm excited because I have my final exam tomorrow.",
      /energy|means/,
      /exam|test/,
    ],
  ])(
    "addresses introductions, feelings and events together: %s",
    (text, first, second) => {
      const { reply } = demoReply(text, emptyMemory());
      expect(reply).toMatch(first);
      expect(reply).toMatch(second);
    },
  );

  it.each([...new Set(cases.map(([, , intent]) => intent))])(
    "doesn't repeat adjacent replies over 20 turns of %s, including capped history",
    (intent) => {
      const text = cases.find((entry) => entry[2] === intent)![0];
      let memory = emptyMemory();
      for (let turn = 0; turn < 20; turn++) {
        const result = demoReply(text, memory);
        expect(result.reply).not.toBe(memory.turns.at(-1)?.coach);
        memory = addReply(memory, text, result.reply, result.facts);
      }
      expect(memory.turns).toHaveLength(10);
    },
  );

  it("doesn't reuse the welcome message on greetings or mixed turns", () => {
    const opening =
      "Hey there. Pull up a spot on the bench. What's one thing you'd like to work through today?";
    let memory = emptyMemory();
    for (let turn = 0; turn < 20; turn++) {
      const text = ["hi", "hello", cases[0][0], "thanks", "I'm nervous"][
        turn % 5
      ];
      const result = demoReply(text, memory);
      expect(result.reply).not.toContain(opening);
      expect(result.reply).not.toBe(memory.turns.at(-1)?.coach);
      memory = addReply(memory, text, result.reply, result.facts);
    }
  });

  it("responds to the event when a goal and feeling are stated as well", () => {
    const { reply, facts, intent } = demoReply(
      "My name is Sam. I'm training for a 5K and I'm nervous because I have a presentation tomorrow.",
      emptyMemory(),
    );
    expect(intent).toBe("nerves");
    expect(facts).toEqual([
      "Name: Sam",
      "Training for a 5K",
      "Upcoming: a presentation tomorrow",
    ]);
    expect(reply).toContain("Sam");
    expect(reply).toContain("5K");
    expect(reply).toContain("presentation");
    expect(reply).toMatch(/opening|rehearse/);
  });

  it("applies shared fact and history limits to extracted demo facts", () => {
    const text = `My name is Sam. I'm training for a 5K. I want to finish a book. I enjoy ${"quiet mornings ".repeat(30)}. I have an interview tomorrow. I'm starting a new job Monday.`;
    const { facts, reply } = demoReply(text, emptyMemory());
    expect(facts).toHaveLength(5);
    expect(facts.every((fact) => fact.length <= 200)).toBe(true);
    expect(facts[3]).toHaveLength(200);
    let memory = emptyMemory();
    for (let turn = 0; turn < 60; turn++) {
      const message = `I want to finish project ${turn}.`;
      const result = demoReply(message, memory);
      memory = addReply(memory, message, result.reply, result.facts);
    }
    expect(memory.facts).toHaveLength(50);
    expect(memory.turns).toHaveLength(10);
    expect(
      addReply(addReply(emptyMemory(), text, reply, facts), text, reply, facts)
        .facts,
    ).toEqual(facts);
  });

  it.each([
    "Hi coach, my name is Sam and I have a presentation, but I want to kill myself.",
    "I'm excited and training for a 5K, but I feel unsafe.",
    "Call me Jo. I'm starting a job Monday and I don't want to live.",
  ])("keeps crisis support ahead of every other intent: %s", (text) => {
    const result = demoReply(text, { facts: ["Name: River"], turns: [] });
    expect(result.intent).toBe("crisis");
    expect(result.facts).toEqual([]);
    expect(result.reply).toContain("emergency services");
    expect(result.reply).not.toMatch(/Sam|Jo|River|presentation|5K|job/);
  });
});
