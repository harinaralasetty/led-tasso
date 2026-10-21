# Led Tasso browser app

A Vite + TypeScript static app. No Python server, account, runtime CDN, external font or analytics is required. The demo replies locally after the first page load. There is no service worker, so a first visit or offline reload still requires the static assets to be available in the browser cache.

```sh
cd site
npm ci
npm run dev
# Open the printed localhost URL, including /led-tasso/.
npm test
npx playwright install chromium
npm run test:e2e
npm run build
npm run preview
```

Use Node 22.12+ or a newer supported Node version. `base` is `/led-tasso/`. The Pages workflow builds and deploys `site/dist` on pushes to main, after running browser, unit, Worker and Python checks. Pull requests run checks without deploying. Configure Pages to use GitHub Actions in the repository settings. No API key is needed in CI.

## Modes and privacy

- **Demo replies.** Free, offline after loading, original scripted replies for greetings, nerves, goals, setbacks, motivation, work, sport and thanks. It recognizes explicit name, training goal and preference statements, and uses remembered names/goals in later replies. It is deliberately labelled demo replies.
- **Your API key.** Paste an Anthropic API key in Settings. It stays in localStorage on this browser and is sent only to `https://api.anthropic.com/v1/messages`, with direct-browser-access opt-in and API version `2023-06-01`. Usage is billed to the visitor's Anthropic account. The saved key never fills the input again. “Forget saved key” removes it and returns to demo mode. Anyone with access to this browser profile can inspect localStorage, so use a trusted browser. If browser storage is unavailable, the key is held for the tab only and a message explains this.
- **Friends passcode.** Uses the public `VITE_PROXY_URL` build config and a passcode held in this tab only. The owner pays for usage. Messages and memories go through the owner's Worker, then Anthropic. The welcome screen has a full “I have a password” button alongside the demo, and the header mode menu also opens password settings. The password has show/hide and Enter submission. It is checked on the first message; a proxy 401 reopens the field with a clear inline error and preserves the message for retry. Production builds default to `https://led-tasso-proxy.harinaralasetty.workers.dev` from `.env.production`; the Pages workflow includes that default and accepts an Actions variable override. See [proxy setup](../proxy/README.md). When unconfigured, Settings explains that it is unavailable.

Own-key mode offers `claude-haiku-5-5` and `claude-sonnet-5-5`. Friends mode uses Haiku only, with its model selector hidden. Tests mock both services and do not assert live account/model availability. Crisis keywords bypass all provider calls and use a caring, non-joking local reply that urges immediate human support.

## Memory and streaming

`led-tasso.memory.v1` in localStorage contains at most 50 normalized, case-insensitively unique facts, 200 characters each, and the last 10 exchanges. At most five new facts are accepted per successful reply. Corrupt data is validated and reset safely. Forgetting a fact resets recent conversation context; clearing memory removes facts and exchanges. A fresh chat clears exchanges while keeping facts. The memory panel explains these controls.

The system prompt preserves the rules in `led_tasso/persona.md` and replaces its JSON-only output format with plain text followed by `<coach-memory>["fact"]</coach-memory>`. The streaming extractor holds incomplete marker prefixes back before updating the DOM. Facts are accepted only after a complete successful stream and a valid trailing JSON array. Absent, partial, malformed or non-trailing metadata saves no new facts. The demo extracts only explicit user statements; API modes rely on the persona to extract facts, so visitors can inspect and forget the results.

Anthropic SSE decoding handles UTF-8 byte splits, CRLF, multiline data, keepalives, error events, aborts and missing message completion. A stopped or broken reply can remain visible but is never stored as a completed exchange. All chat/fact text uses textContent. Only fixed, locally authored UI/SVG markup uses innerHTML.

## Coach and accessibility

`coach-3d.ts` builds an original character entirely from Three.js geometry. Cap and star, round head and body, navy/red jacket, sneakers, whistle and soft shadows share a silhouette with the SVG fallback. Its blended states cover idle breathing/blinks/glances, listening lean, thinking hand pose, text-driven mouth movement and gestures, and a cheer with jump/fist pump/confetti when a new fact is saved. Eyes track pointer position. Three.js is dynamically imported after the first paint. There are no remote textures or models.

When WebGL initialization fails or its context is lost, the SVG remains visible. Reduced motion skips the 3D import and uses a still SVG. The preference also removes CSS animations. The UI uses native modal dialogs with focus trapping and Escape, labelled form fields, keyboard sending, starter buttons and a complete-reply screen-reader announcement instead of announcing each token.

## Verification artifacts

`npm test` covers the demo, memory, persona parity, SSE, metadata protocol, Anthropic client and Worker. `npm run test:e2e` runs Chromium at 1280×800 and 390×844 against a production preview, with provider routes intercepted. It checks first run, persistence, modes, secret handling, settings, keyboard, stopping/error recovery, reduced motion, WebGL and axe serious/critical violations. No test sends a real credential. The proxy URL used during browser tests is a reserved `.test` address; the CI workflow rebuilds with the owner's config before publishing.

Real screenshots are saved to `screenshots/` for all five coach states, both themes, and both viewports, plus reduced-motion views. The script in `scripts/size-report.mjs` prints exact uncompressed and gzip byte sizes for entry JS and lazy 3D JS on every build, and saves `dist/size-report.txt`.

If a managed macOS shell denies Chromium's MachPortRendezvous registration, run the same tests in Docker from the repository root. This was used for the local browser verification, with the image version matching the Playwright lockfile:

```sh
docker run --rm --ipc=host \
  --mount "type=bind,source=$PWD,target=/work" \
  --mount type=volume,target=/work/site/node_modules \
  --mount type=volume,target=/work/proxy/node_modules \
  -w /work/site mcr.microsoft.com/playwright:v1.64.1-noble \
  bash -lc 'npm ci --cache /tmp/npm-cache && npm run test:e2e'
```

The anonymous volumes keep Linux dependencies separate from macOS dependencies. Screenshots and reports are written back to this checkout. Browser tests use one worker so software WebGL rendering does not compete between browser instances. State screenshots pause the app's real timers after each transition and resume afterward; they do not inject state attributes or substitute coach images.
