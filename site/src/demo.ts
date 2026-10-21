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
    "Hey there. Pull up a spot on the bench. What's one thing you'd like to work through today?",
    "Good to see you. You don't need a perfect plan to get started. What's on your mind?",
  ],
  nerves: [
    "Nerves have a habit of getting loud before something matters. Put both feet on the floor, take a slow breath, and pick the one part you can prepare for. What would make that first minute feel a little easier?",
    "You can feel nervous and still take the next step. Try one practice run, with room to be imperfect. What's the part you're most worried about?",
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
export function intentFor(text: string): Intent {
  if (/\b(thank|thanks|appreciate)\b/i.test(text)) return "thanks";
  if (/\b(nervous|anxious|anxiety|scared|worr|afraid|stress)/i.test(text))
    return "nerves";
  if (/\b(fail|lost|lose|setback|mistake|bad day|rough|disappoint)/i.test(text))
    return "setbacks";
  if (/\b(goal|plan|habit|training for|want to|aim)/i.test(text))
    return "goals";
  if (/\b(work|job|boss|meeting|project|office|deadline)/i.test(text))
    return "work";
  if (
    /\b(sport|run|race|football|soccer|game|team|5k|marathon|practice)/i.test(
      text,
    )
  )
    return "sport";
  if (/\b(motivat|pep talk|encourag|stuck|give up)/i.test(text))
    return "motivation";
  if (/\b(hi|hello|hey|morning)\b/i.test(text)) return "greeting";
  return "other";
}
export function statedFacts(text: string): string[] {
  const facts: string[] = [];
  const name =
    /\bmy name is ([\p{L}][\p{L}'-]*(?: [\p{L}][\p{L}'-]*)?)(?=[.!?,;\n]|$)/iu.exec(
      text,
    );
  if (name) facts.push(`Name: ${name[1]}`);
  const goal = /\bI(?: am|'m|’m) training for (.+?)(?=[.!?;\n]|$)/i.exec(text);
  if (goal) facts.push(`Training for ${goal[1]}`);
  const preference = /\bI (?:prefer|enjoy) (.+?)(?=[.!?;\n]|$)/i.exec(text);
  if (preference) facts.push(`Enjoys or prefers ${preference[1]}`);
  return facts;
}
export function demoReply(
  text: string,
  memory: Memory,
): { reply: string; facts: string[]; intent: Intent | "crisis" } {
  if (isCrisis(text))
    return { reply: crisisReply, facts: [], intent: "crisis" };
  const facts = statedFacts(text);
  const allFacts = [...facts, ...memory.facts];
  const name = allFacts.find((fact) => fact.startsWith("Name: "))?.slice(6);
  const goal = allFacts
    .find((fact) => fact.startsWith("Training for "))
    ?.slice(13);
  const intent = intentFor(text);
  const choice = memory.turns.length % replies[intent].length;
  let reply = replies[intent][choice];
  if (name) {
    const sentence = /^I(?:'|\s)/.test(reply)
      ? reply
      : reply.charAt(0).toLowerCase() + reply.slice(1);
    reply = `${name}, ${sentence}`;
  }
  if (
    goal &&
    (intent === "goals" ||
      intent === "sport" ||
      intent === "motivation" ||
      /remember/i.test(text))
  )
    reply += ` For ${goal}, let's focus on a step you can actually repeat.`;
  return { reply, facts, intent };
}
