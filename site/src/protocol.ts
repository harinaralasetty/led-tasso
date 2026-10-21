import { cleanFacts } from "./memory";
export const MEMORY_OPEN = "<coach-memory>";
export const MEMORY_CLOSE = "</coach-memory>";
// Hold marker prefixes back so no metadata flashes while network chunks arrive.
export function extractReply(
  raw: string,
  complete = false,
): { text: string; facts: string[] } {
  const marker = raw.indexOf("<coach-");
  if (marker >= 0) {
    const text = raw.slice(0, marker).trimEnd();
    const block = raw.slice(marker).trimEnd();
    if (
      !complete ||
      !block.startsWith(MEMORY_OPEN) ||
      !block.endsWith(MEMORY_CLOSE)
    )
      return { text, facts: [] };
    try {
      return {
        text,
        facts: cleanFacts(
          JSON.parse(block.slice(MEMORY_OPEN.length, -MEMORY_CLOSE.length)),
          5,
        ),
      };
    } catch {
      return { text, facts: [] };
    }
  }
  let end = raw.length;
  for (let length = 1; length < MEMORY_OPEN.length; length++)
    if (raw.endsWith(MEMORY_OPEN.slice(0, length)))
      end = Math.min(end, raw.length - length);
  return { text: raw.slice(0, end).trimEnd(), facts: [] };
}
