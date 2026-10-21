import { expect, it } from "vitest";
import { readFileSync } from "node:fs";
const css = readFileSync(new URL("../src/style.css", import.meta.url), "utf8");
function luminance(hex: string) {
  return [1, 3, 5]
    .map((i) => parseInt(hex.slice(i, i + 2), 16) / 255)
    .map((v) => (v <= 0.04045 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4))
    .reduce((sum, value, i) => sum + value * [0.2126, 0.7152, 0.0722][i], 0);
}
function contrast(fg: string, bg: string) {
  const [lo, hi] = [luminance(fg), luminance(bg)].sort((a, b) => a - b);
  expect((hi + 0.05) / (lo + 0.05), `${fg} on ${bg}`).toBeGreaterThanOrEqual(
    4.5,
  );
}
it("keeps text colors at 4.5:1 across both themes and red button states", () => {
  const blocks = [
    css.match(/:root\s*\{([^}]+)\}/)![1],
    css.match(/\[data-theme="light"\]\s*\{([^}]+)\}/)![1],
  ];
  let vars: Record<string, string> = {};
  for (const block of blocks) {
    vars = {
      ...vars,
      ...Object.fromEntries(
        [...block.matchAll(/--([\w-]+):\s*(#[\da-f]{6})/g)].map((m) => [
          m[1],
          m[2],
        ]),
      ),
    };
    for (const fg of ["text", "muted", "accent"])
      for (const bg of ["bg", "panel", "card", "soft"])
        contrast(vars[fg], vars[bg]);
    contrast(vars.ink, vars.button);
    contrast(vars.ink, "#b91c1c");
  }
  // The stage gradient's brightest stop is used for its fixed text colors.
  for (const fg of ["#f5efe5", "#ccd4df", "#b9c7d9", "#e6e4dc", "#cbd8e6"])
    for (const bg of ["#344a68", "#38506d"]) contrast(fg, bg);
  for (const fg of ["#f6f0e6", "#cad6e2"]) contrast(fg, "#55474e");
});
