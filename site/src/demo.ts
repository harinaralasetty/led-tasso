import { cleanFacts } from "./memory";
import type { Memory } from "./types";
export const crisisReply =
  "I'm glad you told me. Your safety matters, and you deserve support right now. Please contact local emergency services or a crisis line, or reach out to someone you trust right now and ask them to stay with you. If you can, move somewhere safe and away from anything you could use to hurt yourself.";
export function isCrisis(text: string): boolean {
  return /suicid|self[- ]?harm|kill (myself|me)|end(?:ing)? (?:my life|it all)|hurt(ing)? myself|want to die|don't want to live|do not want to live|\bdanger\b|not safe|unsafe|overdos|being (abused|attacked)|someone.*(hurt|kill).*me/i.test(
    text,
  );
}
const replies = {
  greeting: [
    "Hello! I'm listening. What would help you most today: making a plan, talking something through, or finding a little courage?",
    "Hi! There's room here for whatever kind of day you're having. Where would you like to begin?",
  ],
  nerves: [
    "Nerves have a habit of getting loud before something matters. Put both feet on the floor, take a slow breath, and pick the one part you can prepare for. What would make that first minute feel a little easier?",
    "You can feel nervous and still take the next step. Try one practice run, with room to be imperfect. What's the part you're most worried about?",
  ],
  sad: [
    "That sounds heavy. You don't have to rush yourself into feeling better. Would a little company or talking about what happened help right now?",
    "I'm sorry today hurts. Give yourself room to feel it, and consider checking in with someone who cares about you. What's been weighing on you?",
  ],
  excited: [
    "I can hear how much this means to you. Take a moment to enjoy that spark, then put it toward one small bit of preparation.",
    "That's a lovely bit of energy to bring along. What are you looking forward to most, and how could you make room to enjoy it?",
  ],
  tired: [
    "Sounds like your energy is running low. Let's make room for rest and choose only what really needs doing today. What could wait?",
    "You don't need to earn a breather. Take a pause, then see whether a smaller version of today's plan would be enough.",
  ],
  event: [
    "Something meaningful is coming up. A little preparation can give you a steadier place to start.",
    "Let's give what's coming up a manageable first step. You don't have to solve every part of it today.",
  ],
  goals: [
    "Let's make that goal small enough to start today. Pick one action you can finish in ten minutes, then give it a place on your calendar. What would that first step be?",
    "A goal needs a next step more than a fancy scoreboard. Choose something specific and small for today. We can build from there.",
  ],
  setbacks: [
    "A rough day gives us something to learn from, even when it stings. Name one thing that got in the way and one thing you'd try differently. You get another practice tomorrow.",
    "That sounds disappointing, and you don't have to pretend otherwise. Give yourself a little space, then pick one piece you can change. One missed shot doesn't decide the whole season.",
  ],
  motivation: [
    "You don't have to feel ready for the whole climb. Put your shoes on and take the first ten minutes. A little honest effort counts, even on the days nobody is keeping score.",
    "Let's borrow a little momentum from a very small start. Set a five-minute timer and do the easiest useful part. Then decide what comes next.",
  ],
  work: [
    "That sounds like a full plate. Write down what actually needs doing today, then choose the one task that would lighten the load most. A clear first pass beats carrying the whole job in your head.",
    "Work can feel like a team sport with nobody calling the plays. Pick one priority and, if you need help, ask someone a specific question. What's the task taking up the most room right now?",
  ],
  sport: [
    "Showing up for practice is a useful place to begin. Keep today's effort manageable and leave room to recover. What's one part of your game you'd like to work on?",
    "Let's aim for steady practice you can come back to. Pick one skill, give it a little focused time, and notice what you learn. Progress doesn't need an audience.",
  ],
  thanks: [
    "You're welcome. You did the useful part by talking it through. I'm here when you want to work on the next step.",
    "Glad we could make a little room to think. Give yourself some credit for showing up today.",
  ],
  other: [
    "I'm listening. In this demo I can help with nerves, goals, setbacks, work, or a little encouragement. What's one small part of this you'd like to tackle?",
    "Let's take it one piece at a time. What feels hardest right now, and what's one thing you can influence today?",
  ],
};
export type Intent = keyof typeof replies;
const normalize = (text: string) =>
  text
    .replace(/’/g, "'")
    .replace(/[ \t]+/g, " ")
    .trim();

// An introduction must end before a new clause. In particular, don't turn
// "I'm nervous" or "I'm training for a race" into a person's name.
const nonNames = new Set(
  (
    "a an the not no just really very so quite feeling feel doing getting going " +
    "having starting training working trying looking hoping planning ready here " +
    "nervous anxious scared worried stressed sad unhappy excited tired exhausted " +
    "stuck happy fine okay ok good great better sorry grateful thankful afraid " +
    "depressed overwhelmed lonely frustrated angry upset disappointed proud " +
    "hungry sleepy sick ill late early back home new from in on at with about " +
    "sure unsure interested confused lost struggling busy done out still also " +
    "coach someone nobody my your his her their friend name called available " +
    "afraid bored burnt burned motivated unmotivated curious delighted " +
    "thrilled relieved devastated miserable hopeless unable off all only " +
    "tomorrow today tonight when alone unemployed married single american " +
    "british indian student teacher doctor runner diabetic autistic responsible " +
    "and but because who that this it is am have need want love enjoy prefer"
  ).split(/\s+/),
);
function statedName(text: string): string | undefined {
  const introductions = /\b(?:my name is|call me|this is|I am|I'm)\s+/gi;
  for (const match of text.matchAll(introductions)) {
    const tail = text.slice(match.index! + match[0].length);
    const words: string[] = [];
    let consumed = 0;
    for (const token of tail.matchAll(/[\p{L}][\p{L}'-]*/gu)) {
      if (tail.slice(consumed, token.index).trim()) break;
      if (nonNames.has(token[0].toLowerCase())) break;
      // Lowercase names are accepted, but ordinary following prose is not.
      if (words.length && !/^\p{Lu}/u.test(token[0])) break;
      words.push(token[0]);
      consumed = token.index! + token[0].length;
      if (words.length === 3) break;
    }
    if (!words.length) continue;
    const rest = tail.slice(consumed);
    if (
      !/^(?:\s*(?:[.!?,;\n。！？]|$)|\s+(?:and|but|here|who|from|with)\b)/i.test(
        rest,
      )
    )
      continue;
    if (/this is/i.test(match[0]) && !/^\s+here\b/i.test(rest)) continue;
    return words.join(" ");
  }
  return undefined;
}

// Keep joined descriptions ("a 5K in June"), but stop when another personal
// statement or feeling starts. Transient feelings inform replies, not memory.
const clauseEnd =
  /[.!?;\n]|,\s*|\s+\b(?:and|but|because)\s+(?:(?:I|I'm|I've|my)\b|(?:am |feel |feeling )?(?:nervous|sad|excited|tired|stuck)\b)/i;
const description = (text: string) => text.split(clauseEnd)[0].trim();
function extractFacts(text: string): string[] {
  const facts: string[] = [];
  const name = statedName(text);
  if (name) facts.push(`Name: ${name}`);
  const patterns: [RegExp, string][] = [
    [/\bI(?: am|'m) training for\s+([^.!?;\n]+)/gi, "Training for "],
    [/\bI (?:want to|aim to|plan to|hope to)\s+([^.!?;\n]+)/gi, "Goal: "],
    [/\bmy goal is (?:to )?([^.!?;\n]+)/gi, "Goal: "],
    [/\bI(?: am|'m) (?:trying|planning|hoping) to\s+([^.!?;\n]+)/gi, "Goal: "],
    [/\bI (?:prefer|enjoy)\s+([^.!?;\n]+)/gi, "Enjoys or prefers "],
    [
      /\bI(?: have|'ve got| have got)\s+((?:an? |my )?(?:(?:big|important|first|job|final) )*(?:presentation|interview|exam|test|meeting|race|game|performance|audition|deadline|appointment)\b[^.!?;\n]*)/gi,
      "Upcoming: ",
    ],
    [
      /(?:\bI(?: am|'m)|^|[.!?;]\s*)\s*(starting (?:an? |my )?(?:new )?job\b[^.!?;\n]*)/gi,
      "Upcoming: ",
    ],
  ];
  for (const [pattern, prefix] of patterns)
    for (const match of text.matchAll(pattern)) {
      const value = description(match[1]);
      if (value) facts.push(prefix + value);
    }
  return facts;
}
export function statedFacts(text: string): string[] {
  // Match the network protocol: five additions, 200 characters per fact.
  return cleanFacts(extractFacts(normalize(text)), 5);
}

function classify(text: string, facts: string[]): Intent {
  if (/\b(nervous|anxious|anxiety|scared|worr|afraid|stress)/i.test(text))
    return "nerves";
  if (/\b(sad|unhappy|lonely|down|depressed|grief|heartbroken)\b/i.test(text))
    return "sad";
  if (/\b(tired|exhausted|drained|burnt out|burned out)\b/i.test(text))
    return "tired";
  if (/\b(excited|thrilled|looking forward)\b/i.test(text)) return "excited";
  if (/\b(fail|lost|lose|setback|mistake|bad day|rough|disappoint)/i.test(text))
    return "setbacks";
  if (/\b(motivat|pep talk|encourag|stuck|give up)/i.test(text))
    return "motivation";
  if (facts.some((fact) => fact.startsWith("Upcoming: "))) return "event";
  if (
    facts.some((fact) => /^(?:Training for |Goal: )/.test(fact)) ||
    /\b(goal|plan|habit|training for|want to|aim)/i.test(text)
  )
    return "goals";
  if (/\b(presentation|interview|exam|audition|appointment)\b/i.test(text))
    return "event";
  if (/\b(work|job|boss|meeting|project|office|deadline)/i.test(text))
    return "work";
  if (
    /\b(sport|run|race|football|soccer|game|team|5k|marathon|practice)/i.test(
      text,
    )
  )
    return "sport";
  if (/\b(thank|thanks|appreciate)\b/i.test(text)) return "thanks";
  if (
    /\b(hi|hello|hey|morning)\b/i.test(text) ||
    facts.some((fact) => fact.startsWith("Name: "))
  )
    return "greeting";
  return "other";
}
export function intentFor(text: string): Intent {
  const normalized = normalize(text);
  return classify(normalized, statedFacts(normalized));
}

function contextAdvice(context: string, variant: number): string {
  if (/presentation/i.test(context))
    return [
      "Try saying the opening of your presentation out loud once, then choose the one idea you want people to remember.",
      "For the presentation, rehearse a short opening and a clear closing. Leave yourself a pause between the two; you have room to breathe.",
    ][variant];
  if (/job/i.test(context))
    return [
      "For the new job, get the practical details ready and bring one question for your first day. Learning is part of starting.",
      "Starting a job takes time to settle into. Pick one thing to learn on day one and give yourself permission to ask for help.",
    ][variant];
  if (/interview/i.test(context))
    return [
      "For the interview, practice one example of something you handled well and write down a question you'd like to ask.",
      "Give your interview preparation a small target: one clear story about your work, spoken aloud at a comfortable pace.",
    ][variant];
  if (/exam|test/i.test(context))
    return [
      "For the test, pick one topic to review and try recalling it without your notes. Leave yourself time to rest too.",
      "Prepare for the exam in one short block, then check what you can recall. You can choose the next topic after a break.",
    ][variant];
  return [
    "Pick one piece you can prepare today, and keep the first step small enough to finish.",
    "What would make the first few minutes easier? Prepare that piece, then give yourself a pause.",
  ][variant];
}
export function demoReply(
  text: string,
  memory: Memory,
): { reply: string; facts: string[]; intent: Intent | "crisis" } {
  if (isCrisis(text))
    return { reply: crisisReply, facts: [], intent: "crisis" };
  const normalized = normalize(text);
  const facts = statedFacts(normalized);
  const intent = classify(normalized, facts);
  const name = [...facts, ...memory.facts]
    .find((fact) => fact.startsWith("Name: "))
    ?.slice(6);
  const currentContexts = facts.filter((fact) =>
    /^(?:Upcoming: |Training for |Goal: )/.test(fact),
  );
  const rememberedContext = memory.facts.find((fact) =>
    /^(?:Training for |Goal: )/.test(fact),
  );
  const useRememberedContext =
    ["goals", "sport", "motivation"].includes(intent) ||
    /\bremember\b/i.test(text);
  const contexts = currentContexts.length
    ? currentContexts
    : useRememberedContext && rememberedContext
      ? [rememberedContext]
      : [];
  const adviceContext =
    contexts.find((fact) => fact.startsWith("Upcoming: ")) ?? contexts[0];
  const candidates = replies[intent].map((base, index) => {
    let reply = name
      ? `${name}, ${base.startsWith("I'") ? base : base.charAt(0).toLowerCase() + base.slice(1)}`
      : base;
    if (adviceContext) {
      for (const context of contexts) {
        const label = context.replace(
          /^(?:Upcoming: |Training for |Goal: )/,
          "",
        );
        reply +=
          " " +
          (context.startsWith("Training for ")
            ? `You're training for ${label}.`
            : context.startsWith("Goal: ")
              ? `You're working toward this: ${label}.`
              : `You mentioned ${label}.`);
      }
      reply += ` ${contextAdvice(adviceContext, index)}`;
    } else if (intent === "event") {
      reply += ` ${contextAdvice(normalized, index)}`;
    }
    return reply;
  });
  // History is capped at ten turns. Compare the actual last response instead
  // of relying on history length, which stops changing once that cap is hit.
  const previous = memory.turns.at(-1)?.coach;
  const preferred = memory.turns.length % candidates.length;
  const reply =
    candidates[preferred] !== previous
      ? candidates[preferred]
      : candidates[(preferred + 1) % candidates.length];
  return { reply, facts, intent };
}
