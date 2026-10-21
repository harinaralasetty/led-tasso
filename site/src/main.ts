import "./style.css";
import { createCoach } from "./coach";
import {
  addReply,
  emptyMemory,
  forgetFact,
  loadMemory,
  saveMemory,
} from "./memory";
import { demoReply, isCrisis, crisisReply } from "./demo";
import { streamReply, ServiceError } from "./client";
import { extractReply, MEMORY_OPEN, MEMORY_CLOSE } from "./protocol";
import {
  isRecord,
  type CoachState,
  type Connection,
  type Mode,
  type Model,
} from "./types";

const icon = (name: string) => {
  const paths: Record<string, string> = {
    arrow: '<path d="M5 12h14m-6-6 6 6-6 6"/>',
    settings:
      '<path d="M4 7h16M4 17h16"/><circle cx="9" cy="7" r="3"/><circle cx="15" cy="17" r="3"/>',
    sun: '<circle cx="12" cy="12" r="4"/><path d="M12 2v2m0 16v2M2 12h2m16 0h2M5 5l1 1m12 12 1 1M5 19l1-1M18 6l1-1"/>',
    moon: '<path d="M20 15A9 9 0 0 1 9 4a9 9 0 1 0 11 11Z"/>',
    book: '<path d="M4 3h6q2 0 2 2v16q0-2-3-2H4zm16 0h-6q-2 0-2 2v16q0-2 3-2h5z"/>',
    close: '<path d="m6 6 12 12M6 18 18 6"/>',
    plus: '<path d="M12 5v14M5 12h14"/>',
    star: '<path d="m12 3 2.7 5.5 6.1.9-4.4 4.3 1 6.1-5.4-2.9-5.4 2.9 1-6.1-4.4-4.3 6.1-.9z"/>',
    lock: '<rect x="5" y="10" width="14" height="11" rx="3"/><path d="M8 10V7a4 4 0 0 1 8 0v3"/>',
    check: '<path d="m5 12 4 4L19 6"/>',
  };
  return `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${paths[name] || paths.star}</svg>`;
};
const root = document.querySelector<HTMLDivElement>("#app");
if (!root) throw Error("App root missing");
root.innerHTML = `
<div class="app-shell">
  <header class="topbar"><a class="brand" href="./"><span class="brand-mark" aria-hidden="true">LT<span>★</span></span><span>led tasso<span class="brand-sub" aria-hidden="true">IN YOUR CORNER</span></span></a><div class="header-actions"><button class="mode-badge" id="mode-button"><span class="live-dot"></span><span id="mode-label">Demo replies</span><span aria-hidden="true">⌄</span></button><span class="header-divider"></span><button class="icon-button" id="theme-button" aria-label="Switch to light theme">${icon("sun")}</button><button class="icon-button" id="settings-button" aria-label="Open settings">${icon("settings")}</button></div></header>
  <main class="workspace">
    <section class="coach-stage" aria-labelledby="stage-heading"><div class="stage-grid" aria-hidden="true"></div><div class="stage-heading"><p class="eyebrow"><span></span> A COACH FOR YOUR EVERYDAY</p><h1 id="stage-heading">A little courage.<br><em>A next step.</em></h1><p class="stage-description">Big feelings. Small wins.<br>Whatever's on your mind, let's talk it through.</p></div><div class="stage-orbit orbit-one" aria-hidden="true"></div><div class="stage-orbit orbit-two" aria-hidden="true"></div><div id="coach" class="coach" data-state="idle" aria-label="Coach Led Tasso" role="img"></div><span class="stage-spark spark-one" aria-hidden="true">✦</span><span class="stage-spark spark-two" aria-hidden="true">✧</span><div class="stage-bottom"><span class="coach-name">COACH LED TASSO <span>01</span></span><p id="coach-status"><span class="live-dot"></span><span id="state-label">Ready when you are</span></p></div></section>
    <section class="chat-panel" aria-labelledby="chat-heading"><header class="chat-header"><div><p class="eyebrow">YOUR SPACE TO RESET</p><h2 id="chat-heading">Take a seat, teammate.</h2></div><button class="icon-button" id="new-chat" aria-label="Start a fresh chat">${icon("plus")}</button></header>
      <div id="messages" class="messages" role="region" aria-label="Conversation" tabindex="0"></div>
      <div class="chat-bottom"><div class="starters" id="starters" aria-label="Conversation starters"><button data-prompt="Can you give me a quick pep talk?">A little pep talk ${icon("arrow")}</button><button data-prompt="I'm nervous about this week.">Feeling nervous ${icon("arrow")}</button><button data-prompt="Help me pick one small goal for today.">Find my next step ${icon("arrow")}</button></div><form id="chat-form"><div class="composer"><label class="sr-only" for="message">Message Coach</label><textarea id="message" rows="2" maxlength="2000" placeholder="What's on your mind?" aria-describedby="input-hint"></textarea><button id="send" class="send-button" type="submit" aria-label="Send message" disabled>${icon("arrow")}</button><button id="stop" class="stop-button" type="button" hidden>Stop</button></div><div class="composer-note"><span id="input-hint">Enter to send <span aria-hidden="true">·</span> Shift + Enter for a new line</span><span id="char-count">0 / 2000</span></div></form><button id="memory-button" class="memory-button">${icon("book")}<span>What Coach remembers</span><span id="memory-count">0 facts</span><span aria-hidden="true">↗</span></button><p class="privacy-note">${icon("lock")} Your conversations stay in this browser.</p></div>
    </section>
  </main><footer class="footer"><span>A little encouragement goes a long way.</span><span>Original character. Not affiliated with any show, studio or streaming service.</span></footer>
</div>
<p id="storage-notice" class="storage-notice" hidden></p>
<div id="announcer" class="sr-only" role="status" aria-live="polite" aria-atomic="true"></div>
<dialog id="welcome" class="welcome-dialog" aria-labelledby="welcome-heading"><div class="welcome-art" aria-hidden="true"><span class="welcome-star">★</span><span class="eyebrow">WELCOME TO YOUR CORNER</span><h2>A fresh start<br>starts here.</h2><span class="welcome-line"></span><p>You bring what's on your mind.<br>Coach brings a little perspective.</p></div><div class="welcome-content"><p class="eyebrow">HEY THERE, TEAMMATE</p><h2 id="welcome-heading">Everybody needs<br>someone in their corner.</h2><p>Meet Led Tasso. An original, encouraging coach for small steps and everyday wins.</p><button id="try-demo" class="primary-button">Try the demo ${icon("arrow")}</button><button id="use-key" class="secondary-button">Use your Claude API key</button><button id="use-friends" class="primary-button friends-button">I have a password ${icon("lock")}</button><p class="fine-print">The demo is free, scripted and works offline after loading. No account needed.</p></div></dialog>
<dialog id="settings" class="sheet" aria-labelledby="settings-heading"><header class="sheet-header"><div><p class="eyebrow">MAKE YOURSELF AT HOME</p><h2 id="settings-heading">Your setup</h2></div><button class="icon-button" data-close="settings" aria-label="Close settings">${icon("close")}</button></header><form id="settings-form"><label for="mode-select">Conversation mode</label><select id="mode-select"><option value="demo">Demo replies</option><option value="key">Your API key</option><option value="friends">Friends passcode</option></select><div id="demo-fields" class="mode-fields"><div class="info-card">${icon("star")}<div><strong>A little encouragement, on the house.</strong><p>Original, scripted replies for goals, nerves, work and setbacks. Free and offline after this page loads.</p></div></div></div><div id="key-fields" class="mode-fields" hidden><label for="api-key">Claude API key</label><input id="api-key" type="password" autocomplete="off" spellcheck="false" placeholder="Paste your key" maxlength="512"><p class="field-help">Your key stays only in this browser and is sent only to api.anthropic.com. Usage is billed to your Anthropic account. Only use a browser you trust.</p><p id="key-saved" class="saved-note" hidden>A key is saved in this browser.</p><button id="forget-key" type="button" class="text-button danger" hidden>Forget saved key</button></div><div id="friends-fields" class="mode-fields" hidden><label for="passcode">Friends password</label><div class="password-control"><input id="passcode" type="password" autocomplete="off" maxlength="512" placeholder="Enter the owner's password" aria-describedby="password-error friends-help"><button id="toggle-password" type="button" aria-controls="passcode" aria-pressed="false">Show password</button></div><p id="password-error" class="form-error" role="alert"></p><p id="friends-help" class="field-help">The owner's service pays for usage. Your messages and remembered facts are sent through their proxy. Your passcode is kept for this tab only.</p></div><div id="model-fields" hidden><label for="model-select">Claude model</label><select id="model-select"><option value="claude-haiku-5-5">Haiku 5.5 · Fast & light</option><option value="claude-sonnet-5-5">Sonnet 5.5 · More capable</option></select></div><label for="theme-select">Appearance</label><select id="theme-select"><option value="dark">Dark · Evening practice</option><option value="light">Light · Morning session</option></select><p id="settings-error" class="form-error" role="alert"></p><button class="primary-button" type="submit">Save setup ${icon("check")}</button><p class="fine-print">No analytics. No trackers. All chat text is displayed as plain text.</p></form></dialog>
<dialog id="memory-dialog" class="sheet" aria-labelledby="memory-heading"><header class="sheet-header"><div><p class="eyebrow">THE COACH'S NOTEBOOK</p><h2 id="memory-heading">What Coach remembers</h2></div><button class="icon-button" data-close="memory-dialog" aria-label="Close memories">${icon("close")}</button></header><p class="sheet-description">Things you've shared, saved only in this browser. Forgetting a fact also clears recent conversation context so it won't be sent again.</p><ol id="facts" class="facts"></ol><p id="empty-memory" class="empty-memory">A fresh notebook.<br><span>Tell Coach your name or what you're working toward.</span></p><button id="clear-memory" class="secondary-button danger" type="button">Clear all memories</button><p class="fine-print">Up to 50 facts and your last 10 exchanges. Closing this browser does not erase them.</p></dialog>`;
function el<T extends HTMLElement>(
  selector: string,
  type: { new (...args: never[]): T },
): T {
  const node = document.querySelector(selector);
  if (!(node instanceof type)) throw Error(`Missing ${selector}`);
  return node;
}
const input = el("#message", HTMLTextAreaElement),
  send = el("#send", HTMLButtonElement),
  stop = el("#stop", HTMLButtonElement),
  messages = el("#messages", HTMLDivElement),
  coachElement = el("#coach", HTMLDivElement);
const welcome = el("#welcome", HTMLDialogElement),
  settings = el("#settings", HTMLDialogElement),
  memoryDialog = el("#memory-dialog", HTMLDialogElement);
const modeSelect = el("#mode-select", HTMLSelectElement),
  modelSelect = el("#model-select", HTMLSelectElement),
  keyInput = el("#api-key", HTMLInputElement),
  passInput = el("#passcode", HTMLInputElement),
  themeSelect = el("#theme-select", HTMLSelectElement);
const storageGet = (key: string) => {
  try {
    return localStorage.getItem(key);
  } catch {
    return null;
  }
};
const storageSet = (key: string, value: string) => {
  try {
    localStorage.setItem(key, value);
    return true;
  } catch {
    return false;
  }
};
const storageRemove = (key: string) => {
  try {
    localStorage.removeItem(key);
  } catch {
    /* Storage can be unavailable in private browsing. */
  }
};
let memory = (() => {
  try {
    return loadMemory(localStorage);
  } catch {
    return emptyMemory();
  }
})();
let key = storageGet("led-tasso.key") || "";
let passcode = "";
let mode: Mode = "demo";
let model: Model = "claude-haiku-5-5";
try {
  const config: unknown = JSON.parse(storageGet("led-tasso.config") || "{}");
  if (isRecord(config)) {
    if (
      config.mode === "demo" ||
      config.mode === "key" ||
      config.mode === "friends"
    )
      mode = config.mode;
    if (config.model === "claude-sonnet-5-5") model = config.model;
  }
} catch {
  /* Reset invalid preferences. */
}
const configuredProxy: string = import.meta.env.VITE_PROXY_URL || "";
const proxyURL = (() => {
  try {
    const url = new URL(configuredProxy);
    return url.protocol === "https:" && !url.username && !url.password
      ? url.href
      : "";
  } catch {
    return "";
  }
})();
let theme = storageGet("led-tasso.theme") === "light" ? "light" : "dark";
const coach = createCoach(coachElement);
let busy = false;
let abortController: AbortController | undefined;
let cheerTimer: ReturnType<typeof setTimeout> | undefined;
const reducedMotion = matchMedia("(prefers-reduced-motion: reduce)");
function announce(text: string) {
  el("#announcer", HTMLDivElement).textContent = text;
}
function setState(state: CoachState) {
  clearTimeout(cheerTimer);
  coach.state = state;
  coachElement.dataset.state = state;
  el("#state-label", HTMLSpanElement).textContent = {
    idle: "Ready when you are",
    listening: "You have my attention",
    thinking: "Thinking it through",
    talking: "A thought for you",
    cheer: "A little win, remembered!",
  }[state];
}
function setTheme(value: string) {
  theme = value === "light" ? "light" : "dark";
  document.documentElement.dataset.theme = theme;
  coach.theme = theme;
  themeSelect.value = theme;
  el("#theme-button", HTMLButtonElement).innerHTML = icon(
    theme === "dark" ? "sun" : "moon",
  );
  el("#theme-button", HTMLButtonElement).setAttribute(
    "aria-label",
    `Switch to ${theme === "dark" ? "light" : "dark"} theme`,
  );
  storageSet("led-tasso.theme", theme);
}
function updateMode() {
  el("#mode-label", HTMLSpanElement).textContent = {
    demo: "Demo replies",
    key: "Your API key",
    friends: "Friends passcode",
  }[mode];
  el(".privacy-note", HTMLParagraphElement).innerHTML = icon("lock");
  el(".privacy-note", HTMLParagraphElement).append(
    document.createTextNode(
      mode === "demo"
        ? "Your conversations stay in this browser."
        : mode === "key"
          ? "Replies use Anthropic. Memory stays in this browser."
          : "Replies use the owner's proxy. Memory stays here.",
    ),
  );
}
function save() {
  let saved = false;
  try {
    saved = saveMemory(localStorage, memory);
  } catch {
    /* private browser */
  }
  if (!saved) {
    const notice = el("#storage-notice", HTMLParagraphElement);
    notice.textContent =
      "Browser storage is unavailable. This conversation will not persist after reloading.";
    notice.hidden = false;
    announce(notice.textContent);
  }
  renderFacts();
}
function scroll() {
  messages.scrollTop = messages.scrollHeight;
}
function bubble(text: string, who: "user" | "coach", error = false) {
  const article = document.createElement("article");
  article.className = `message ${who}-message${error ? " error-message" : ""}`;
  const label = document.createElement("p");
  label.className = "speaker";
  label.textContent = who === "user" ? "YOU" : "COACH LED";
  const body = document.createElement("p");
  body.className = "bubble";
  body.textContent = text;
  article.append(label, body);
  messages.append(article);
  scroll();
  return body;
}
function renderChat() {
  messages.replaceChildren();
  if (!memory.turns.length) {
    const intro = document.createElement("div");
    intro.className = "conversation-intro";
    intro.innerHTML = `<span class="intro-icon" aria-hidden="true">${icon("star")}</span><p class="eyebrow">NO PERFECT WORDS NEEDED</p><h3>Let's start<br> where you are.</h3><p>Good day, tough day, or somewhere in between.<br>There's room for all of it here.</p>`;
    messages.append(intro);
    bubble(
      "Hey there. Pull up a spot on the bench. What's one thing you'd like to work through today?",
      "coach",
    );
  } else
    for (const turn of memory.turns) {
      bubble(turn.user, "user");
      bubble(turn.coach, "coach");
    }
  el("#starters", HTMLDivElement).hidden = memory.turns.length > 0;
  scroll();
}
function renderFacts() {
  const facts = el("#facts", HTMLOListElement);
  facts.replaceChildren();
  memory.facts.forEach((fact, index) => {
    const li = document.createElement("li");
    const text = document.createElement("span");
    text.textContent = fact;
    const button = document.createElement("button");
    button.type = "button";
    button.className = "text-button";
    button.textContent = "Forget";
    button.setAttribute("aria-label", `Forget fact ${index + 1}`);
    button.disabled = busy;
    button.addEventListener("click", () => {
      memory = forgetFact(memory, index);
      save();
      renderChat();
      announce("Fact forgotten. Recent context cleared.");
    });
    li.append(text, button);
    facts.append(li);
  });
  el("#memory-count", HTMLSpanElement).textContent =
    `${memory.facts.length} ${memory.facts.length === 1 ? "fact" : "facts"}`;
  el("#empty-memory", HTMLParagraphElement).hidden = memory.facts.length > 0;
  el("#clear-memory", HTMLButtonElement).disabled =
    busy || (memory.facts.length === 0 && memory.turns.length === 0);
}
function controls() {
  send.disabled = busy || !input.value.trim();
  send.hidden = busy;
  stop.hidden = !busy;
  el("#new-chat", HTMLButtonElement).disabled = busy;
  input.readOnly = busy;
  el("#char-count", HTMLSpanElement).textContent =
    `${input.value.length} / 2000`;
  renderFacts();
}
function setupFields() {
  const selected = modeSelect.value;
  for (const value of ["demo", "key", "friends"])
    el(`#${value}-fields`, HTMLDivElement).hidden = selected !== value;
  el("#model-fields", HTMLDivElement).hidden = selected !== "key";
  el("#key-saved", HTMLParagraphElement).hidden = !key;
  el("#forget-key", HTMLButtonElement).hidden = !key;
  el("#settings-error", HTMLParagraphElement).textContent = "";
  if (!proxyURL)
    el("#friends-help", HTMLParagraphElement).textContent =
      "The owner hasn't connected a friends service yet. You can try the demo or use your own API key.";
}
function openSettings(selected: Mode = mode) {
  modeSelect.value = selected;
  modelSelect.value = model;
  keyInput.value = "";
  passInput.value = "";
  passInput.type = "password";
  passInput.removeAttribute("aria-invalid");
  el("#password-error", HTMLParagraphElement).textContent = "";
  el("#toggle-password", HTMLButtonElement).textContent = "Show password";
  el("#toggle-password", HTMLButtonElement).setAttribute(
    "aria-pressed",
    "false",
  );
  setupFields();
  settings.showModal();
}
function finishWelcome() {
  storageSet("led-tasso.started", "yes");
  welcome.close();
  input.focus();
}
function connection(): Connection | null {
  if (mode === "demo") return { mode };
  if (mode === "key" && key) return { mode, key, model };
  if (mode === "friends" && proxyURL && passcode)
    return { mode, passcode, model: "claude-haiku-5-5", url: proxyURL };
  return null;
}
function delay(ms: number, signal: AbortSignal) {
  return new Promise<void>((resolve, reject) => {
    signal.throwIfAborted();
    const onAbort = () => {
      clearTimeout(timer);
      reject(new DOMException("Stopped", "AbortError"));
    };
    const timer = setTimeout(() => {
      signal.removeEventListener("abort", onAbort);
      resolve();
    }, ms);
    signal.addEventListener("abort", onAbort, { once: true });
  });
}
async function submit(text: string) {
  if (busy || !text.trim()) return;
  // Safety support is available even when an API key or friends passcode is missing.
  const active: Connection | null = isCrisis(text)
    ? { mode: "demo" }
    : connection();
  if (!active) {
    openSettings();
    return;
  }
  busy = true;
  abortController = new AbortController();
  const signal = abortController.signal;
  setState("thinking");
  input.value = "";
  controls();
  el("#starters", HTMLDivElement).hidden = true;
  document.querySelector(".conversation-intro")?.remove();
  bubble(text, "user");
  const body = bubble("", "coach");
  body.classList.add("typing");
  body.setAttribute("aria-label", "Coach is thinking");
  body.innerHTML = "<span></span><span></span><span></span>";
  let raw = "";
  let started = false;
  const show = (chunk: string) => {
    raw += chunk;
    if (raw.length > 16000)
      throw Error("That reply was too long. Please try a shorter question.");
    const visible = extractReply(raw).text;
    if (!visible) return;
    if (!started) {
      started = true;
      body.classList.remove("typing");
      body.removeAttribute("aria-label");
      setState("talking");
    }
    body.textContent = visible;
    coach.speech = visible.length;
    scroll();
  };
  try {
    if (active.mode === "demo" || isCrisis(text)) {
      await delay(reducedMotion.matches ? 30 : 650, signal);
      const result = isCrisis(text)
        ? { reply: crisisReply, facts: [] }
        : demoReply(text, memory);
      const scripted =
        result.reply +
        "\n" +
        MEMORY_OPEN +
        JSON.stringify(result.facts) +
        MEMORY_CLOSE;
      for (
        let i = 0;
        i < scripted.length;
        i += reducedMotion.matches ? scripted.length : 7
      ) {
        signal.throwIfAborted();
        show(
          scripted.slice(i, i + (reducedMotion.matches ? scripted.length : 7)),
        );
        await delay(reducedMotion.matches ? 0 : 24, signal);
      }
    } else {
      for await (const chunk of streamReply(active, memory, text, signal))
        show(chunk);
    }
    const result = extractReply(raw, true);
    if (!result.text)
      throw Error("Coach sent an empty reply. Please try again.");
    body.textContent = result.text;
    body.classList.remove("typing");
    body.removeAttribute("aria-label");
    const before = memory.facts.length;
    memory = addReply(memory, text, result.text, result.facts);
    save();
    announce(`Coach: ${result.text}`);
    if (memory.facts.length > before) {
      setState("cheer");
      cheerTimer = setTimeout(
        () => setState(input.value ? "listening" : "idle"),
        2600,
      );
    } else setState("idle");
  } catch (error) {
    body.classList.remove("typing");
    body.removeAttribute("aria-label");
    const message = signal.aborted
      ? "Reply stopped. Send another message when you are ready."
      : error instanceof Error
        ? error.message
        : "Coach hit a snag. Please try again.";
    body.textContent =
      (extractReply(raw).text ? extractReply(raw).text + "\n\n" : "") + message;
    body.parentElement?.classList.add("error-message");
    if (
      active.mode === "friends" &&
      error instanceof ServiceError &&
      error.status === 401
    ) {
      passcode = "";
      input.value = text;
      openSettings("friends");
      el("#password-error", HTMLParagraphElement).textContent = message;
      passInput.setAttribute("aria-invalid", "true");
      passInput.focus();
    }
    announce(message);
    setState("idle");
  } finally {
    busy = false;
    abortController = undefined;
    controls();
    scroll();
    if (!settings.open) input.focus();
  }
}
el("#chat-form", HTMLFormElement).addEventListener("submit", (event) => {
  event.preventDefault();
  void submit(input.value.trim());
});
input.addEventListener("input", () => {
  controls();
  if (!busy) setState(input.value.trim() ? "listening" : "idle");
});
input.addEventListener("keydown", (event) => {
  if (event.key === "Enter" && !event.shiftKey && !event.isComposing) {
    event.preventDefault();
    void submit(input.value.trim());
  }
});
stop.addEventListener("click", () => abortController?.abort());
document
  .querySelectorAll<HTMLButtonElement>("[data-prompt]")
  .forEach((button) =>
    button.addEventListener("click", () => {
      void submit(button.dataset.prompt || "");
    }),
  );
document.querySelectorAll<HTMLButtonElement>("[data-close]").forEach((button) =>
  button.addEventListener("click", () => {
    const dialog = document.getElementById(button.dataset.close || "");
    if (dialog instanceof HTMLDialogElement) dialog.close();
  }),
);
el("#settings-button", HTMLButtonElement).addEventListener("click", () =>
  openSettings(),
);
el("#mode-button", HTMLButtonElement).addEventListener("click", () =>
  openSettings(),
);
el("#theme-button", HTMLButtonElement).addEventListener("click", () =>
  setTheme(theme === "dark" ? "light" : "dark"),
);
el("#try-demo", HTMLButtonElement).addEventListener("click", () => {
  mode = "demo";
  updateMode();
  finishWelcome();
});
el("#use-key", HTMLButtonElement).addEventListener("click", () => {
  finishWelcome();
  openSettings("key");
});
el("#use-friends", HTMLButtonElement).addEventListener("click", () => {
  finishWelcome();
  openSettings("friends");
});
welcome.addEventListener("cancel", () => finishWelcome());
settings.addEventListener("close", () => {
  keyInput.value = "";
  passInput.value = "";
});
el("#toggle-password", HTMLButtonElement).addEventListener("click", () => {
  const show = passInput.type === "password";
  passInput.type = show ? "text" : "password";
  const button = el("#toggle-password", HTMLButtonElement);
  button.textContent = show ? "Hide password" : "Show password";
  button.setAttribute("aria-pressed", String(show));
});
passInput.addEventListener("input", () => {
  passInput.removeAttribute("aria-invalid");
  el("#password-error", HTMLParagraphElement).textContent = "";
});
modeSelect.addEventListener("change", setupFields);
el("#settings-form", HTMLFormElement).addEventListener("submit", (event) => {
  event.preventDefault();
  const selected = modeSelect.value;
  const error = el("#settings-error", HTMLParagraphElement);
  if (selected !== "demo" && selected !== "key" && selected !== "friends")
    return;
  let volatileKey = false;
  if (selected === "key") {
    const candidate = keyInput.value.trim() || key;
    if (!candidate || !/^[\x21-\x7E]{1,512}$/.test(candidate)) {
      error.textContent = "Paste a valid API key to continue.";
      keyInput.focus();
      return;
    }
    key = candidate;
    volatileKey = !storageSet("led-tasso.key", key);
  }
  if (selected === "friends") {
    if (!proxyURL) {
      error.textContent =
        "The friends service is not configured. Choose demo or your API key.";
      return;
    }
    const candidate = passInput.value.trim() || passcode;
    if (!candidate || !/^[\x21-\x7E]{1,512}$/.test(candidate)) {
      error.textContent = "Enter your friends password to continue.";
      passInput.focus();
      return;
    }
    passcode = candidate;
  }
  keyInput.value = "";
  passInput.value = "";
  mode = selected;
  model =
    modelSelect.value === "claude-sonnet-5-5"
      ? "claude-sonnet-5-5"
      : "claude-haiku-5-5";
  storageSet("led-tasso.config", JSON.stringify({ mode, model }));
  setTheme(themeSelect.value);
  updateMode();
  settings.close();
  if (volatileKey) {
    const notice = el("#storage-notice", HTMLParagraphElement);
    notice.textContent =
      "Browser storage is unavailable. Your key will be used for this tab only.";
    notice.hidden = false;
    announce(notice.textContent);
  } else announce("Your setup is saved.");
  input.focus();
});
el("#forget-key", HTMLButtonElement).addEventListener("click", () => {
  key = "";
  keyInput.value = "";
  storageRemove("led-tasso.key");
  if (mode === "key") {
    mode = "demo";
    storageSet("led-tasso.config", JSON.stringify({ mode, model }));
    updateMode();
  }
  setupFields();
  announce("Saved key forgotten.");
});
el("#memory-button", HTMLButtonElement).addEventListener("click", () => {
  renderFacts();
  memoryDialog.showModal();
});
el("#clear-memory", HTMLButtonElement).addEventListener("click", () => {
  if (busy) return;
  memory = emptyMemory();
  save();
  renderChat();
  announce("All memories and recent exchanges cleared.");
});
el("#new-chat", HTMLButtonElement).addEventListener("click", () => {
  memory = { ...memory, turns: [] };
  save();
  renderChat();
  setState("idle");
  input.focus();
  announce("Fresh chat started. Saved facts are still in your notebook.");
});
setTheme(theme);
updateMode();
renderChat();
controls();
if (!storageGet("led-tasso.started")) welcome.showModal();
