import { expect, test, type Page } from "@playwright/test";
import AxeBuilder from "@axe-core/playwright";
import { mkdir } from "node:fs/promises";
const FAKE_KEY = "fake-browser-test-token";
const delta = (text: string) =>
  `event: content_block_delta\ndata: ${JSON.stringify({ type: "content_block_delta", delta: { type: "text_delta", text } })}\n\n`;
const sse = (text: string) =>
  delta(text) + 'event: message_stop\ndata: {"type":"message_stop"}\n\n';
async function start(page: Page, renderer = "webgl") {
  await page.goto("./");
  await page.getByRole("button", { name: "Try the demo", exact: true }).click();
  await expect(page.locator("#coach")).toHaveAttribute(
    "data-renderer",
    renderer,
  );
}
async function send(page: Page, text: string) {
  await page
    .getByRole("textbox", { name: "Message Coach", exact: true })
    .fill(text);
  await page.getByRole("button", { name: "Send message", exact: true }).click();
}
async function idle(page: Page) {
  await expect(page.locator("#coach")).toHaveAttribute("data-state", "idle");
}
async function checkAxe(page: Page) {
  const result = await new AxeBuilder({ page }).analyze();
  expect(
    result.violations.filter(
      (v) => v.impact === "serious" || v.impact === "critical",
    ),
  ).toEqual([]);
}

test("first run, keyboard, settings and accessibility", async ({ page }) => {
  const errors: string[] = [];
  page.on("pageerror", (e) => errors.push(e.message));
  await page.goto("./");
  await expect(
    page.getByRole("dialog", {
      name: "Everybody needs someone in their corner.",
    }),
  ).toBeVisible();
  await checkAxe(page);
  await mkdir("screenshots", { recursive: true });
  await page.screenshot({
    path: `screenshots/${test.info().project.name}-welcome.png`,
    fullPage: true,
  });
  await page.getByRole("button", { name: "Try the demo", exact: true }).click();
  await expect(
    page.getByRole("button", { name: "Demo replies" }),
  ).toBeVisible();
  await checkAxe(page);
  await page.getByRole("button", { name: "Demo replies" }).click();
  await page.getByLabel("Conversation mode").selectOption("friends");
  await expect(
    page.getByLabel("Friends password", { exact: true }),
  ).toBeVisible();
  await expect(page.getByLabel("Claude model")).toBeHidden();
  await checkAxe(page);
  await page.getByRole("button", { name: "Close settings" }).click();
  await page.getByRole("button", { name: "Open settings" }).click();
  await checkAxe(page);
  await expect(page.getByLabel("Conversation mode")).toHaveValue("demo");
  await page.screenshot({
    path: `screenshots/${test.info().project.name}-settings.png`,
    fullPage: true,
  });
  await page.getByLabel("Appearance").selectOption("light");
  await page.getByRole("button", { name: "Save setup" }).click();
  await expect(page.locator("html")).toHaveAttribute("data-theme", "light");
  await checkAxe(page);
  await page.getByRole("button", { name: "What Coach remembers" }).click();
  await checkAxe(page);
  await page.keyboard.press("Escape");
  const input = page.getByRole("textbox", {
    name: "Message Coach",
    exact: true,
  });
  await input.fill("hello");
  await input.press("Shift+Enter");
  await expect(input).toHaveValue("hello\n");
  await input.press("Enter");
  await expect(page.locator("#messages")).toContainText("hello");
  await idle(page);
  expect(errors).toEqual([]);
});

test("light welcome keeps the password prominent and accessible", async ({
  page,
}, info) => {
  await page.addInitScript(() =>
    localStorage.setItem("led-tasso.theme", "light"),
  );
  await page.goto("./");
  await expect(
    page.getByRole("button", { name: "I have a password", exact: true }),
  ).toBeVisible();
  await expect(page.locator("#coach")).toHaveAttribute(
    "data-renderer",
    "webgl",
  );
  await checkAxe(page);
  await expect(page.locator(".welcome-art h2")).toBeVisible();
  // Let the compositor paint again after axe's contrast inspection and WebGL startup.
  await page.evaluate(async () => {
    await document.fonts.ready;
    await new Promise(requestAnimationFrame);
    await new Promise(requestAnimationFrame);
  });
  await mkdir("screenshots", { recursive: true });
  await page.screenshot({
    path: `screenshots/${info.project.name}-light-welcome.png`,
    fullPage: true,
  });
});

test("demo streams, saves facts, reloads and forgets context", async ({
  page,
}) => {
  await start(page);
  await send(page, "My name is Rowan. I'm training for a 5K.");
  await expect(page.locator("#coach")).toHaveAttribute(
    "data-state",
    "thinking",
  );
  await expect(page.locator("#coach")).toHaveAttribute("data-state", "talking");
  const first = await page
    .locator(".coach-message .bubble")
    .last()
    .textContent();
  await expect(page.locator(".coach-message .bubble").last()).not.toHaveText(
    first || "",
  );
  await expect(page.locator("#coach")).toHaveAttribute("data-state", "cheer");
  await expect(page.locator("#memory-count")).toHaveText("2 facts");
  await expect(page.locator("#messages")).not.toContainText("coach-memory");
  await page.reload();
  await expect(page.locator("#memory-count")).toHaveText("2 facts");
  await expect(page.locator("#messages")).toContainText("Rowan");
  await send(page, "What goal should I work on?");
  await idle(page);
  await expect(page.locator(".coach-message .bubble").last()).toContainText(
    "Rowan",
  );
  await expect(page.locator(".coach-message .bubble").last()).toContainText(
    "a 5K",
  );
  await page.getByRole("button", { name: "What Coach remembers" }).click();
  await page
    .getByRole("button", { name: "Forget fact 1", exact: true })
    .click();
  await expect(page.locator("#facts")).not.toContainText("Rowan");
  await page.getByRole("button", { name: "Clear all memories" }).click();
  await expect(page.locator("#memory-count")).toHaveText("0 facts");
  await page.keyboard.press("Escape");
  await page.reload();
  await expect(page.locator("#memory-count")).toHaveText("0 facts");
  await expect(page.locator("#messages")).not.toContainText("Rowan");
});

test("own key uses direct streaming, exact headers, plain text and no key leaks", async ({
  page,
}) => {
  const consoleText: string[] = [];
  const urls: string[] = [];
  page.on("console", (m) => consoleText.push(m.text()));
  page.on("request", (r) => urls.push(r.url()));
  let requests = 0;
  await page.route("https://api.anthropic.com/v1/messages", async (route) => {
    requests++;
    const request = route.request(),
      headers = request.headers();
    expect(headers["x-api-key"] === FAKE_KEY).toBe(true);
    expect(headers["anthropic-version"]).toBe("2023-06-01");
    expect(headers["anthropic-dangerous-direct-browser-access"]).toBe("true");
    expect(request.postDataJSON()).toMatchObject({
      model: "claude-haiku-5-5",
      stream: true,
      max_tokens: 800,
    });
    await route.fulfill({
      status: 200,
      contentType: "text/event-stream",
      body: sse(
        'Take one small step. <img src=x onerror=alert(1)>\n<coach-memory>["Name: Rowan"]</coach-memory>',
      ),
    });
  });
  await page.goto("./");
  await page
    .getByRole("button", { name: "Use your Claude API key", exact: true })
    .click();
  await page.getByLabel("Claude API key", { exact: true }).fill(FAKE_KEY);
  await page.getByRole("button", { name: "Save setup" }).click();
  await send(page, "My name is Rowan.");
  await expect(page.locator("#coach")).toHaveAttribute("data-state", "cheer");
  await expect(page.locator("#messages")).toContainText(
    "<img src=x onerror=alert(1)>",
  );
  expect(await page.locator("#messages img").count()).toBe(0);
  expect(requests).toBe(1);
  expect((await page.content()).includes(FAKE_KEY)).toBe(false);
  expect(urls.some((url) => url.includes(FAKE_KEY))).toBe(false);
  expect(consoleText.some((text) => text.includes(FAKE_KEY))).toBe(false);
  expect(await page.locator("#api-key").inputValue()).toBe("");
  await page.reload();
  await expect(
    page.getByRole("button", { name: "Your API key", exact: true }),
  ).toBeVisible();
  await page.getByRole("button", { name: "Open settings" }).click();
  await page.getByRole("button", { name: "Forget saved key" }).click();
  expect(await page.evaluate(() => localStorage.getItem("led-tasso.key"))).toBe(
    null,
  );
  await page.getByRole("button", { name: "Close settings" }).click();
  await expect(
    page.getByRole("button", { name: "Demo replies" }),
  ).toBeVisible();
});

test("friends passcode streams via configured proxy, never Anthropic", async ({
  page,
}) => {
  let count = 0;
  const direct: string[] = [];
  page.on("request", (r) => {
    if (r.url().includes("api.anthropic.com")) direct.push(r.url());
  });
  await page.route("https://friends.example.test/", async (route) => {
    count++;
    expect(
      route.request().headers().authorization === "Bearer fake-friends-pass",
    ).toBe(true);
    expect(route.request().headers()["x-api-key"]).toBeUndefined();
    expect(route.request().postDataJSON()).not.toHaveProperty("system");
    expect(route.request().postDataJSON()).toMatchObject({
      model: "claude-haiku-5-5",
      max_tokens: 400,
      stream: true,
      memory: [],
    });
    await route.fulfill({
      contentType: "text/event-stream",
      body: sse("You have a place to start.\n<coach-memory>[]</coach-memory>"),
    });
  });
  await page.goto("./");
  await page.getByRole("button", { name: "I have a password" }).click();
  await page
    .getByLabel("Friends password", { exact: true })
    .fill("fake-friends-pass");
  await expect(page.getByLabel("Claude model")).toBeHidden();
  await page.getByRole("button", { name: "Save setup" }).click();
  await send(page, "hello");
  await idle(page);
  await expect(page.locator("#messages")).toContainText(
    "You have a place to start.",
  );
  expect(count).toBe(1);
  expect(direct).toEqual([]);
  expect((await page.content()).includes("fake-friends-pass")).toBe(false);
  await page.reload();
  await send(page, "I am in immediate danger");
  await idle(page);
  await expect(page.locator("#messages")).toContainText(
    "local emergency services",
  );
  expect(count).toBe(1);
  await send(page, "hello again");
  await expect(page.getByRole("dialog", { name: "Your setup" })).toBeVisible();
});

test("password path reports proxy 401 inline, retries with Enter, and is reachable from header", async ({
  page,
}) => {
  // Disposable test credentials; never the deployed password.
  const right = "fake-friends-password";
  let requests = 0;
  await page.route("https://friends.example.test/", async (route) => {
    requests++;
    if (route.request().headers().authorization !== `Bearer ${right}`) {
      await route.fulfill({
        status: 401,
        contentType: "application/json",
        body: JSON.stringify({
          error: "That password was not accepted. Check it and try again.",
        }),
      });
    } else
      await route.fulfill({
        contentType: "text/event-stream",
        body: sse(
          "One small step is a strong start.\n<coach-memory>[]</coach-memory>",
        ),
      });
  });
  await page.goto("./");
  const passwordButton = page.getByRole("button", {
    name: "I have a password",
    exact: true,
  });
  await expect(passwordButton).toHaveClass(/primary-button/);
  await passwordButton.click();
  await expect(page.getByLabel("Claude model")).toBeHidden();
  const password = page.getByLabel("Friends password", { exact: true });
  await password.fill("fake-incorrect-password");
  await page
    .getByRole("button", { name: "Show password", exact: true })
    .click();
  await expect(password).toHaveAttribute("type", "text");
  await page
    .getByRole("button", { name: "Hide password", exact: true })
    .click();
  await expect(password).toHaveAttribute("type", "password");
  await password.press("Enter");
  await send(page, "Help me begin.");
  await expect(page.locator("#password-error")).toHaveText(
    "That password was not accepted. Check it and try again.",
  );
  await expect(password).toHaveAttribute("aria-invalid", "true");
  await checkAxe(page);
  await password.fill(right);
  await expect(page.locator("#password-error")).toBeEmpty();
  await password.press("Enter");
  await expect(page.locator("#message")).toHaveValue("Help me begin.");
  await page.getByRole("button", { name: "Send message", exact: true }).click();
  await idle(page);
  await expect(page.locator(".coach-message .bubble").last()).toHaveText(
    "One small step is a strong start.",
  );
  expect(requests).toBe(2);
  expect((await page.content()).includes(right)).toBe(false);
  expect(await page.evaluate(() => JSON.stringify(localStorage))).not.toContain(
    right,
  );
  await page
    .getByRole("button", { name: "Friends passcode", exact: true })
    .click();
  await expect(password).toBeVisible();
  await expect(page.getByLabel("Claude model")).toBeHidden();
});

test("crisis reply is caring and offline even with a real-provider mode", async ({
  page,
}) => {
  let network = 0;
  await page.route("https://api.anthropic.com/**", (route) => {
    network++;
    return route.abort();
  });
  await page.goto("./");
  await page
    .getByRole("button", { name: "Use your Claude API key", exact: true })
    .click();
  await page.getByLabel("Claude API key", { exact: true }).fill(FAKE_KEY);
  await page.getByRole("button", { name: "Save setup" }).click();
  await send(page, "I want to hurt myself");
  await idle(page);
  await expect(page.locator("#messages")).toContainText(
    "local emergency services",
  );
  await expect(page.locator("#messages")).toContainText("right now");
  expect(network).toBe(0);
  await expect(page.locator("#memory-count")).toHaveText("0 facts");
});

test("stop cancels a reply without saving partial memory", async ({ page }) => {
  await start(page);
  await send(page, "My name is Rowan.");
  await expect(page.locator("#coach")).toHaveAttribute("data-state", "talking");
  await page.getByRole("button", { name: "Stop", exact: true }).click();
  await idle(page);
  await expect(page.locator("#messages")).toContainText("Reply stopped");
  await expect(page.locator("#memory-count")).toHaveText("0 facts");
  await expect(
    page.getByRole("button", { name: "Send message" }),
  ).toBeDisabled();
});

test("friendly API errors allow another message without exposing provider data", async ({
  page,
}) => {
  await page.route("https://api.anthropic.com/v1/messages", (route) =>
    route.fulfill({ status: 401, body: "private upstream details" }),
  );
  await page.goto("./");
  await page
    .getByRole("button", { name: "Use your Claude API key", exact: true })
    .click();
  await page.getByLabel("Claude API key", { exact: true }).fill(FAKE_KEY);
  await page.getByRole("button", { name: "Save setup" }).click();
  await send(page, "hello");
  await idle(page);
  await expect(page.locator("#messages")).toContainText("not accepted");
  await expect(page.locator("#messages")).not.toContainText(
    "private upstream details",
  );
  await expect(
    page.getByRole("textbox", { name: "Message Coach", exact: true }),
  ).toBeEditable();
});

test("reduced motion uses a calm SVG coach", async ({ page }, info) => {
  await page.emulateMedia({ reducedMotion: "reduce" });
  await start(page, "svg");
  await expect(page.locator("#coach")).toHaveAttribute("data-renderer", "svg");
  expect(await page.locator("#coach canvas").count()).toBe(0);
  await send(page, "hello");
  await idle(page);
  await checkAxe(page);
  await mkdir("screenshots", { recursive: true });
  await page.screenshot({
    path: `screenshots/${info.project.name}-reduced-motion.png`,
    fullPage: true,
  });
});

for (const theme of ["dark", "light"])
  test(`coach state screenshots in ${theme} theme`, async ({ page }, info) => {
    test.setTimeout(120000);
    await page.clock.install();
    await start(page);
    if (theme === "light")
      await page.getByRole("button", { name: "Switch to light theme" }).click();
    await expect(page.locator("#coach")).toHaveAttribute(
      "data-renderer",
      "webgl",
    );
    // Pause actual app timers after reaching each state. No state attributes are injected.
    // This keeps slow software-rendered screenshots from skipping short-lived states.
    await page.clock.pauseAt(await page.evaluate(() => Date.now() + 1000));
    await page.clock.runFor(100);
    await mkdir("screenshots", { recursive: true });
    const shot = async (state: string) => {
      await expect(page.locator("#coach")).toHaveAttribute("data-state", state);
      await page.screenshot({
        path: `screenshots/${info.project.name}-${theme}-${state}.png`,
        fullPage: true,
      });
      await expect(page.locator("#coach")).toHaveAttribute("data-state", state);
    };
    await shot("idle");
    await page
      .getByRole("textbox", { name: "Message Coach", exact: true })
      .fill("My name is River.");
    await page.clock.runFor(350);
    await shot("listening");
    await page.getByRole("button", { name: "Send message" }).click();
    await page.clock.runFor(300);
    await shot("thinking");
    await page.clock.runFor(450);
    await shot("talking");
    await page.clock.runFor(2000);
    await shot("cheer");
    await page.clock.resume();
    await checkAxe(page);
    expect(
      await page.evaluate(
        () => document.documentElement.scrollWidth <= innerWidth,
      ),
    ).toBe(true);
    expect(
      await page.evaluate(
        () => document.documentElement.scrollHeight <= innerHeight,
      ),
    ).toBe(true);
  });

test("WebGL unavailable keeps the SVG coach and chat usable", async ({
  page,
}) => {
  await page.addInitScript(() => {
    const original = HTMLCanvasElement.prototype.getContext;
    Object.defineProperty(HTMLCanvasElement.prototype, "getContext", {
      value: function (
        this: HTMLCanvasElement,
        kind: string,
        ...args: unknown[]
      ) {
        if (
          kind === "webgl" ||
          kind === "webgl2" ||
          kind === "experimental-webgl"
        )
          return null;
        return Reflect.apply(original, this, [kind, ...args]);
      },
    });
  });
  await start(page, "svg");
  await expect(page.locator("#coach")).toHaveAttribute("data-renderer", "svg");
  await expect(page.locator(".coach-fallback")).toBeVisible();
  await send(page, "hello");
  await idle(page);
  await expect(page.locator(".coach-message .bubble").last()).toContainText(
    "Hey there",
  );
});

test("loaded demo works with network offline", async ({ page, context }) => {
  await start(page);
  await expect(page.locator("#coach")).toHaveAttribute(
    "data-renderer",
    "webgl",
  );
  await context.setOffline(true);
  await send(page, "My name is Rowan. I'm training for a 5K.");
  await expect(page.locator("#coach")).toHaveAttribute("data-state", "cheer");
  await expect(page.locator("#memory-count")).toHaveText("2 facts");
  await page.getByRole("button", { name: "What Coach remembers" }).click();
  await expect(page.locator("#facts")).toContainText("Rowan");
});
