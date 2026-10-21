import { isRecord, type Memory, type Turn } from "./types";
export const MEMORY_KEY = "led-tasso.memory.v1";
export const emptyMemory = (): Memory => ({ facts: [], turns: [] });
export function cleanFacts(values: unknown, limit = 50): string[] {
  if (!Array.isArray(values)) return [];
  const result: string[] = [];
  const seen = new Set<string>();
  for (const value of values) {
    if (typeof value !== "string") continue;
    const text = value.replace(/\s+/g, " ").trim().slice(0, 200);
    if (!text || seen.has(text.toLocaleLowerCase())) continue;
    seen.add(text.toLocaleLowerCase());
    result.push(text);
    if (result.length >= limit) break;
  }
  return result;
}
export function parseMemory(raw: string | null): Memory {
  try {
    const value: unknown = JSON.parse(raw ?? "{}");
    if (!isRecord(value)) return emptyMemory();
    const turns: Turn[] = [];
    if (Array.isArray(value.turns))
      for (const turn of value.turns) {
        if (
          isRecord(turn) &&
          typeof turn.user === "string" &&
          typeof turn.coach === "string"
        )
          turns.push({
            user: turn.user.slice(0, 2000),
            coach: turn.coach.slice(0, 6000),
          });
      }
    return { facts: cleanFacts(value.facts), turns: turns.slice(-10) };
  } catch {
    return emptyMemory();
  }
}
export function addReply(
  memory: Memory,
  user: string,
  coach: string,
  facts: unknown,
): Memory {
  return {
    facts: cleanFacts([...memory.facts, ...cleanFacts(facts, 5)]),
    turns: [
      ...memory.turns,
      { user: user.slice(0, 2000), coach: coach.slice(0, 6000) },
    ].slice(-10),
  };
}
export function forgetFact(memory: Memory, index: number): Memory {
  return { facts: memory.facts.filter((_, i) => i !== index), turns: [] };
}
export function loadMemory(storage: Pick<Storage, "getItem">): Memory {
  try {
    return parseMemory(storage.getItem(MEMORY_KEY));
  } catch {
    return emptyMemory();
  }
}
export function saveMemory(
  storage: Pick<Storage, "setItem">,
  memory: Memory,
): boolean {
  try {
    storage.setItem(MEMORY_KEY, JSON.stringify(memory));
    return true;
  } catch {
    return false;
  }
}
