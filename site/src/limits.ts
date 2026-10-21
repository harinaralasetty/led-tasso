// Shared by the browser app and the friends Worker so both quote the same numbers.
export const DAILY_MESSAGE_LIMIT = 100;
export const DAY_MS = 86_400_000;
// Counters live one day past their bucket so a late read still sees today's count.
export const COUNTER_TTL_SECONDS = 172_800;
// Coach replies are short and warm, not research. Low effort keeps them fast and cheap.
export const EFFORT = "low" as const;
// Seconds until the next UTC day, for the Retry-After header and the message that quotes it.
export function secondsUntilNextDay(now: number): number {
  return Math.max(1, Math.ceil(((Math.floor(now / DAY_MS) + 1) * DAY_MS - now) / 1000));
}
export function describeWait(seconds: number): string {
  const minutes = Math.max(1, Math.ceil(seconds / 60));
  const plural = (value: number, unit: string) =>
    `${value} ${unit}${value === 1 ? "" : "s"}`;
  if (minutes < 60) return plural(minutes, "minute");
  const hours = Math.floor(minutes / 60);
  const rest = minutes % 60;
  return rest
    ? `${plural(hours, "hour")} ${plural(rest, "minute")}`
    : plural(hours, "hour");
}
