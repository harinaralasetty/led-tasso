import { coachSVG } from "./coach-svg";
import type { CoachState } from "./types";
export interface Coach {
  state: CoachState;
  speech: number;
  pointer: { x: number; y: number };
  theme: string;
}
export function createCoach(element: HTMLElement): Coach {
  const coach: Coach = {
    state: "idle",
    speech: 0,
    pointer: { x: 0, y: 0 },
    theme: document.documentElement.dataset.theme || "dark",
  };
  const fallback = document.createElement("div");
  fallback.className = "coach-fallback";
  fallback.innerHTML = coachSVG;
  element.append(fallback);
  element.dataset.renderer = "svg";
  const motion = window.matchMedia("(prefers-reduced-motion: reduce)");
  let dispose: (() => void) | undefined;
  let generation = 0;
  const load = async () => {
    const current = ++generation;
    dispose?.();
    dispose = undefined;
    fallback.hidden = false;
    element.dataset.renderer = "svg";
    if (motion.matches) return;
    try {
      const module = await import("./coach-3d");
      if (current !== generation) return;
      dispose = module.mountCoach(
        element,
        coach,
        () => {
          fallback.hidden = false;
          element.dataset.renderer = "svg";
        },
        () => {
          fallback.hidden = true;
          element.dataset.renderer = "webgl";
        },
      );
    } catch {
      /* SVG stays visible when WebGL cannot be created. */
    }
  };
  motion.addEventListener("change", () => {
    void load();
  });
  window.addEventListener(
    "pointermove",
    (event) => {
      const bounds = element.getBoundingClientRect();
      coach.pointer.x = Math.max(
        -1,
        Math.min(
          1,
          (event.clientX - bounds.left - bounds.width / 2) / bounds.width,
        ),
      );
      coach.pointer.y = Math.max(
        -1,
        Math.min(
          1,
          (event.clientY - bounds.top - bounds.height / 2) / bounds.height,
        ),
      );
    },
    { passive: true },
  );
  // Start after the first paint; the character code is a separate network chunk.
  requestAnimationFrame(() => {
    void load();
  });
  return coach;
}
