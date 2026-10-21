export type CoachState =
  "idle" | "listening" | "thinking" | "talking" | "cheer";
export type Mode = "demo" | "key" | "friends";
export type Model = "claude-haiku-5-5" | "claude-sonnet-5-5";
export interface Turn {
  user: string;
  coach: string;
}
export interface Memory {
  facts: string[];
  turns: Turn[];
}
export interface Message {
  role: "user" | "assistant";
  content: string;
}
export type Connection =
  | { mode: "demo" }
  | { mode: "key"; key: string; model: Model }
  | { mode: "friends"; passcode: string; model: Model; url: string };
export const MODELS: readonly Model[] = [
  "claude-haiku-5-5",
  "claude-sonnet-5-5",
];
export function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}
