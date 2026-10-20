"use strict";

const coach = document.getElementById("coach");
const coachStatus = document.getElementById("coach-status");
const messages = document.getElementById("messages");
const announcer = document.getElementById("announcer");
const form = document.getElementById("chat-form");
const input = document.getElementById("message");
const send = document.getElementById("send");
const factsList = document.getElementById("facts");
const clearButton = document.getElementById("clear-memory");
const confirmation = document.getElementById("clear-confirmation");
const confirmClear = document.getElementById("confirm-clear");
const cancelClear = document.getElementById("cancel-clear");
const reducedMotion = window.matchMedia("(prefers-reduced-motion: reduce)");
let busy = false;
let facts = [];
let cheerTimer;

function setCoach(state, status) {
  window.clearTimeout(cheerTimer);
  coach.setAttribute("class", state);
  coachStatus.textContent = status;
}

function cheer(status) {
  setCoach("cheer", status);
  cheerTimer = window.setTimeout(() => setCoach("idle", "Ready when you are"), 1600);
}

function scrollChat() {
  messages.scrollTop = messages.scrollHeight;
}

function bubble(text, who, error = false) {
  const article = document.createElement("article");
  article.className = `message ${who}-message${error ? " error-message" : ""}`;
  const speaker = document.createElement("p");
  speaker.className = "speaker";
  speaker.textContent = who === "user" ? "YOU" : "COACH";
  const body = document.createElement("p");
  body.className = "bubble";
  body.textContent = text;
  article.append(speaker, body);
  messages.append(article);
  scrollChat();
  return body;
}

function showError(error) {
  bubble(error.message, "coach", true);
  announcer.textContent = `Coach: ${error.message}`;
}

async function api(path, body) {
  let response;
  try {
    response = await fetch(path, body === undefined ? {cache: "no-store"} : {
      method: "POST",
      headers: {"Content-Type": "application/json"},
      body: JSON.stringify(body),
    });
  } catch {
    throw new Error("I can’t reach the local server. Check that Coach is still running, then try again.");
  }
  let data;
  try {
    data = await response.json();
  } catch {
    throw new Error("That reply didn’t arrive clearly. Please try again.");
  }
  if (!response.ok) throw new Error(data.error || "Coach hit a snag. Please try again.");
  return data;
}

function updateControls() {
  send.disabled = busy || !input.value.trim();
  for (const button of factsList.querySelectorAll("button")) button.disabled = busy;
  clearButton.disabled = busy || !facts.length;
  confirmClear.disabled = busy;
  cancelClear.disabled = busy;
}

function renderFacts(nextFacts) {
  facts = nextFacts;
  factsList.replaceChildren();
  document.getElementById("memory-count").textContent = `${facts.length} ${facts.length === 1 ? "fact" : "facts"}`;
  document.getElementById("empty-memory").hidden = facts.length > 0;
  facts.forEach((fact, index) => {
    const li = document.createElement("li");
    const row = document.createElement("div");
    row.className = "fact-row";
    const text = document.createElement("span");
    text.textContent = fact.text;
    const forget = document.createElement("button");
    forget.type = "button";
    forget.className = "quiet-button";
    forget.textContent = "Forget";
    forget.setAttribute("aria-label", `Forget fact ${index + 1}: ${fact.text}`);
    forget.addEventListener("click", () => mutateMemory("/api/memory/forget", {number: index + 1}));
    row.append(text, forget);
    li.append(row);
    factsList.append(li);
  });
  updateControls();
}

async function refreshState() {
  const state = await api("/api/state");
  document.getElementById("backend-badge").textContent = state.backend === "fake" ? "Offline demo" : `${state.backend} CLI`;
  renderFacts(state.facts);
}

async function typeReply(reply) {
  const body = bubble("", "coach");
  setCoach("talking", "Coach has a thought for you");
  // The visual bubble is not a live region. Announce the complete reply once.
  const characters = Array.from(reply);
  let position = 0;
  while (position < characters.length) {
    position = reducedMotion.matches ? characters.length : Math.min(position + 2, characters.length);
    body.textContent = characters.slice(0, position).join("");
    scrollChat();
    if (position < characters.length) await new Promise(resolve => window.setTimeout(resolve, 65));
  }
  announcer.textContent = `Coach: ${reply}`;
}

async function mutateMemory(path, body) {
  if (busy) return;
  busy = true;
  updateControls();
  try {
    const result = await api(path, body);
    renderFacts(result.facts);
    confirmation.hidden = true;
    clearButton.hidden = false;
    announcer.textContent = path.endsWith("clear") ? "Coach’s memory is cleared." : "Fact forgotten. Recent conversation context is reset.";
    document.querySelector("#memory-drawer summary").focus();
  } catch (error) {
    showError(error);
  } finally {
    busy = false;
    updateControls();
  }
}

input.addEventListener("input", () => {
  document.getElementById("character-count").textContent = `${input.value.length} / 2000`;
  updateControls();
});

input.addEventListener("keydown", event => {
  if (event.key === "Enter" && !event.shiftKey && !event.isComposing) {
    event.preventDefault();
    if (!send.disabled) form.requestSubmit();
  }
});

form.addEventListener("submit", async event => {
  event.preventDefault();
  const message = input.value.trim();
  if (busy || !message) return;
  busy = true;
  updateControls();
  confirmation.hidden = true;
  clearButton.hidden = false;
  bubble(message, "user");
  input.value = "";
  document.getElementById("character-count").textContent = "0 / 2000";
  setCoach("thinking", "Coach is thinking it through…");
  try {
    const result = await api("/api/chat", {message});
    await typeReply(result.reply);
    if (result.remembered.length) cheer("A little thing remembered");
    else setCoach("idle", "Ready when you are");
    await refreshState();
  } catch (error) {
    setCoach("idle", "A small snag. We can try again.");
    showError(error);
  } finally {
    busy = false;
    updateControls();
    input.focus();
  }
});

clearButton.addEventListener("click", () => {
  confirmation.hidden = false;
  clearButton.hidden = true;
  cancelClear.focus();
});
cancelClear.addEventListener("click", () => {
  confirmation.hidden = true;
  clearButton.hidden = false;
  clearButton.focus();
});
confirmClear.addEventListener("click", () => mutateMemory("/api/memory/clear", {confirm: true}));

updateControls();
cheer("Hey there. Good to see you!");
refreshState().catch(showError);
