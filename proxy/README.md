# Optional friends service

This Cloudflare Worker lets friends use the owner's Anthropic account with a shared passcode. The static app's demo and own-key modes do not need it. No real credentials belong in this repository.

## Deploy

From the repository root, use Node 22.12+ and an account with Workers access:

```sh
cd proxy
npm ci
npx wrangler login
npx wrangler secret put ANTHROPIC_API_KEY
# Paste the owner's Anthropic API key at the hidden prompt.
npx wrangler secret put PASSCODE
# Paste a long, random passcode at the hidden prompt. Share it privately.
npx wrangler deploy
```

The default public endpoint is `https://led-tasso-proxy.harinaralasetty.workers.dev`. Check `wrangler.jsonc` before deploying. The `LIMITS` KV binding uses the existing namespace `92d6136a90994cf1bd0fb7aae6024458`. Each request increments a counter keyed by SHA-256 of the client IP plus a UTC day bucket, with a two-day TTL. At 100 messages the Worker returns a friendly 429 with the time left until the next UTC day and a `Retry-After` header. Failed password attempts count too. Raw IPs are not stored in KV. The allowance lives in `site/src/limits.ts` so the Worker and the settings copy quote the same number.

KV is eventually consistent: concurrent read/modify/write increments can overwrite each other and other locations can read stale counts, so this daily limit is approximate. KV also allows only one write per key per second; rapid requests may fail closed with a friendly temporary-unavailability error. The native `RATE_LIMITER` binding (namespace `1001`) remains as a burst guard at 6 requests per IP per 60 seconds, including failed passwords. Its 429 asks visitors to try again in 60 seconds. Native limits are local to a Cloudflare location, so neither limit is an exact global billing cap. Missing/unavailable bindings fail closed. Rotate the password with `npx wrangler secret put PASSCODE` when needed.

Set a monthly API spend limit as well: sign in to the [Claude Console](https://platform.claude.com), choose the owner's organization, open **Settings → Billing**, and set a monthly spend limit at or below its available cap. Review usage there regularly. See [Anthropic's spend-limit documentation](https://platform.claude.com/docs/en/api/rate-limits). This is separate from a Claude chat subscription and from the proxy's approximate per-IP limits.

To connect the site locally:

```sh
cd ../site
cp .env.example .env.local
# Set VITE_PROXY_URL in .env.local to the URL Wrangler printed, including https://.
npm ci
npm run build
npm run preview
```

Production builds default to the public endpoint in `site/.env.production`. The Pages workflow uses that same URL unless the repository Actions variable `LED_TASSO_PROXY_URL` overrides it. Local development can set `VITE_PROXY_URL` in `.env.local`. Never put an API key or password in `VITE_` variables, repository variables, source code or a URL. Vite includes public variables in the browser bundle.

## Request contract and limits

The endpoint is `/`. Only `POST` and its `OPTIONS` preflight are allowed. The exact allowed Origin is `https://harinaralasetty.github.io`, because browsers send an origin without the `/led-tasso/` path. Requests also need `Authorization: Bearer <passcode>` and `Content-Type: application/json`. CORS is not authentication; the passcode is required even for non-browser clients. Passcodes are SHA-256 hashed to a fixed size and compared across all bytes without an early return.

The body has `model`, `max_tokens`, `stream: true`, `messages`, and optional `memory`. The only allowed model is `claude-haiku-5-5`; other models are rejected. Integer `max_tokens` values are clamped to 1–400, and friends mode asks for 400. The actual request stream is capped at 32,768 bytes even if Content-Length is missing or false. Messages must alternate user/assistant, start and end with user, retain only the last 10 completed exchanges plus the current message (21 messages), and truncate user content to 2,000 and assistant content to 6,000 characters. Memory is normalized to 50 facts of 200 characters. Caller system prompts and extra fields are discarded. The Worker supplies the original persona itself, and sets `output_config.effort` to `low`: coach replies are short and warm, so low effort keeps them fast and keeps the owner's bill down. A caller cannot raise it.

The upstream Anthropic response is streamed through without buffering. Error responses are generic and never echo provider error bodies, credentials or request content. Neither the app nor the Worker writes chat, keys, passcodes or IPs to logs. Do not enable request body/header logging in separate infrastructure. A friends request sends the text and memories through the owner's service and then Anthropic. The browser stores facts and conversation history locally; the passcode is held only in the current tab's memory.

## Why an API key secret

Anthropic Workload Identity Federation is for server workloads with an OIDC identity. A browser cannot use it, and Workers do not issue OIDC tokens natively. This proxy therefore authenticates upstream using an API key held as a Worker secret.

References: [Cloudflare KV consistency](https://developers.cloudflare.com/kv/reference/faq/), [KV writes and TTL](https://developers.cloudflare.com/kv/api/write-key-value-pairs/), [Cloudflare rate-limiting binding](https://developers.cloudflare.com/workers/runtime-apis/bindings/rate-limit/), [Wrangler secrets](https://developers.cloudflare.com/workers/configuration/secrets/), [Anthropic streaming events](https://platform.claude.com/docs/en/build-with-claude/streaming).

## Verify without deploying

```sh
cd ../site
npm ci
npm test
cd ../proxy
npm ci
npm run check
npx wrangler deploy --dry-run --outdir /tmp/led-tasso-worker-build
```

The shared Vitest run includes plain-mock Worker tests for origin restrictions, authentication, rate limits, size/model/token limits, errors and streamed forwarding. Real provider billing and live deployment are separate from these offline checks.
