# UNUVIA — Next.js, TypeScript & shadcn/ui

UNUVIA uses Next.js 16 App Router, React 19, strict TypeScript, Tailwind CSS 4, and the official shadcn/ui components. The product, pricing, authentication, and assistant interfaces are in English. Light and dark themes share one persistent preference.

## Run locally

Use Node.js 22 or later.

```bash
npm ci
npm run dev
```

Open `http://127.0.0.1:4200`. Email/password registration works immediately in development. A random signing secret is generated in `.data/auth-secret` on first use; it is never committed. The SQLite database and its migrations initialize on first authentication request.

For another port, set `BETTER_AUTH_URL` to the matching origin and run `npm run dev -- --port 4210`. The auth origin must match the URL you open in the browser. Use `127.0.0.1`, rather than `localhost`, with the default configuration.

## Authentication

[Better Auth](https://better-auth.com/docs/installation) handles password hashing, server sessions, HttpOnly cookies, origin checks, and persisted rate limits. Users can register with any valid email address and an 8–128 character password. The assistant checks the session on the server, including direct visits, and displays a centered login/register dialog when signed out. The requested role and prompt remain in the URL through email login. Logout invalidates the server session.

Email verification, password reset emails, and account deletion are not implemented. There is no transactional mail provider configured. Do not represent these features as available.

### Enable Google

Copy `.env.example` to `.env.local`, then configure:

```dotenv
BETTER_AUTH_URL=http://127.0.0.1:4200
BETTER_AUTH_SECRET=your-random-secret-of-at-least-32-characters
GOOGLE_CLIENT_ID=your-google-oauth-client-id
GOOGLE_CLIENT_SECRET=your-google-oauth-client-secret
```

Create a **Web application** OAuth client in Google Cloud. Register `http://127.0.0.1:4200/api/auth/callback/google` as the authorized redirect URI, and use the production origin for production. Run `npm run auth:check` to check which credentials are missing and display the exact callback URL, without printing secrets. Restart the server after changing credentials. The Google button checks the provider when the dialog opens; it is enabled only when both credentials exist. A failed configuration request can be retried. Real Google login requires those credentials and has not been tested against a live Google account. See [Better Auth’s Google guide](https://better-auth.com/docs/authentication/google).

Never place provider secrets in a `NEXT_PUBLIC_*` variable or commit `.env.local`.

## Product and pricing

- **Free — $0:** personal workspace, local history, text attachments, and model picker. Assistant responses require a connected model service.
- **Pro — planned $12/month in USD:** an authenticated waitlist. Planned features are explicitly labeled. Joining records the user ID and date in SQLite, with one entry per account.
- **Team — custom proposal:** a contact-sales email link to `contact@univa.ai`.

These are provisional product prices, rather than configured subscriptions. There is no checkout, payment collection, or paid entitlement. Edit the pricing section in `src/components/landing.tsx` to change the offers. Product FAQ content lives in `src/lib/landing-data.ts`.

The privacy and usage dialogs describe the current implementation. They are informational product copy, rather than a substitute for production legal documents.

## Assistant

Links from the site open the assistant in a separate window or tab with `noopener`. Without a session, the assistant first asks the visitor to log in or register.

The composer expands with the text, accepts file attachments and drag-and-drop, and has a shadcn model picker. Desktop Enter sends and Shift+Enter inserts a line; on touch devices Enter inserts a line. Attachments support `.txt`, `.md`, and `.csv`, up to 2 MB and 60,000 characters.

Models include Sonnet 5.5, Opus 5.5, Fable 5.1, Haiku 4.5, Sonnet 4.6, and Sonnet 4.6 Free. IDs and descriptions are in `src/lib/chat-models.ts`. On authenticated page loads, UNUVIA reads the APMIX catalog for the configured key, cached on the server for one minute. Models outside that catalog are disabled in the picker. If a saved model is unavailable, a supported model is visibly selected with an explanatory notice; the server never substitutes a different model during a request.

Standalone UNUVIA calls its authenticated `/api/assistant` server endpoint, which forwards requests to [APMIX Chat Completions](https://apmix.ai/docs). Configure `APMIX_API_KEY` in `.env.local`, then restart Next.js. Keep this key on the server; it must never use a `NEXT_PUBLIC_*` variable. Run `npm run apmix:check` to read the models available to your key without generating a response. The API key is obtained from APMIX Dashboard → API keys; Billing manages the plan and allowance.

The provider receives the selected model, conversation text, attached document text, and a role-specific system prompt. Model permissions and usage limits depend on the APMIX plan. Sonnet 4.6 Free is provided as a separate choice; the app never silently substitutes a different model. Requests require a signed-in session and the configured site origin, validate model/role/message inputs, limit payloads to 512 KB and 240,000 content characters, and enforce ten requests per account per minute in SQLite. Responses have a 60-second timeout. Quota, authentication, model-access, and temporary-provider failures have distinct user-facing messages; upstream error details and keys are never returned to the browser. If the key is absent, the draft and attachment are restored without adding a conversation. Other failed requests retain the message and attachment in the conversation and offer retry.

The original `window.claude.complete()` bridge remains supported for embedded workspaces and tests. A real browser request using Claude Sonnet 4.6 Free was validated locally on 2026-10-08. The configured key’s catalog included only that model at the time; other model access still depends on the provider plan. The application never generates a fake response.

New replies appear with a client-side typewriter effect after the provider returns a complete response. Full content is saved immediately, and “Show full response” skips the animation. Saved conversations open without replaying it. Reduced-motion preferences and background tabs display the complete response immediately. The conversation follows new text until the reader scrolls up; Markdown, accents, and emoji remain supported.

The sidebar uses shadcn/ui menus and dialogs with a searchable history, local renaming, confirmation before deletion, and an account menu. The desktop sidebar can collapse to an icon rail; its search control expands the sidebar and focuses the search field. Below 1,024 px, the same actions appear in the Chats drawer, opened from the bottom navigation. History stays on this device and is not synchronized.

The assistant has a neutral conversation layout with blue and green UNUVIA accents, a compact composer that expands with the message, and uncluttered university prompt shortcuts. On mobile, attachment, model, and send controls sit below the textarea with 44 px touch targets. Conversations have a return-to-latest button and a local Markdown download in the header menu. Assistant-only styles are scoped in `src/app/assistant/workspace.css`.

Conversation history is stored under `univa-chats-v2:<user-id>` on this device, limited to 30 conversations per account. Legacy anonymous history is not imported into new accounts. This prevents another account’s conversations from appearing in the UI. Browser storage remains local and unencrypted; it does not sync across devices. Attachments sent in conversations are part of that history. Deleting a conversation removes its stored attachment text too.

## Branding

The public brand is **UNUVIA**, with the descriptor **AI Workspace for Universities**. The landing page and SEO metadata use the supplied university positioning. The maximum desktop content width is 1,320 px. Below 1,024 px, the site and assistant use a fixed bottom navigation with labeled touch controls and space for the home indicator. Inter is self-hosted under the SIL Open Font License for the interface; Georgia provides the wordmark, FAQ title and assistant welcome heading.

Existing asset filenames, legacy HTML URLs, `UNIVA_*` script settings, browser history keys, the SQLite filename, and `contact@univa.ai` are preserved for compatibility. These are technical or contact identifiers, not the displayed product name. Historical screenshot files are reference artifacts.

## Design system

Official shadcn/ui sources live in `src/components/ui`: Button, Card, Badge, Dialog, Sheet, Tabs, Accordion, Input, Label, Select, Textarea, Alert, Tooltip, and Separator. `components.json` configures the `new-york` style and Tailwind 4.

Themes use `next-themes` with CSS variables, a saved browser preference, and a script to apply the theme before painting. Fonts are self-hosted in `public/fonts`; no Google Fonts network request is needed.

## Checks

```bash
npm run check
npm run build
npm run test:api
npx playwright install chromium
npm run test:e2e -- --workers=1
```

Playwright covers centered authentication at four widths, real email signup/login/logout, server access control, separate assistant windows, English content, responsive pages, theme persistence, authenticated Pro waitlist and origin rejection, model routing, attachments, account-separated history, history search and persisted renaming, deletion confirmations, desktop collapse, account menus, server API requests and retries, safe Markdown, and Axe accessibility in both themes. Isolated server tests exercise the actual APMIX handler with a mock provider and temporary SQLite database, including input validation, auth/origin checks, rate limits, and redacted provider errors. AI responses are mocked only in tests. Test accounts are stored in the local development database.

To test without using the live APMIX configuration, stop the existing development server first, then start the test server with an empty key:

```bash
APMIX_API_KEY= BETTER_AUTH_URL=http://127.0.0.1:4217 UNIVA_TEST_PORT=4217 npm run test:e2e -- --workers=1
```

The suite mocks generation requests and the empty server key keeps the live provider catalog out of these tests. Next.js permits only one development server per checkout. Do not point this run at an already running server configured with a live key.

Set `PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH` if Chromium is already installed. `UNIVA_TEST_PORT` selects the test port; `BETTER_AUTH_URL` must match it. Use `node scripts/screenshots.mjs` for screenshots, with optional `UNIVA_PREVIEW_URL` and `UNIVA_SCREENSHOT_DIR`. The screenshot script creates a local preview account.

## Production

```bash
npm run build
npm start
```

Set a stable `BETTER_AUTH_SECRET` and the public `BETTER_AUTH_URL` before starting production. Generate a secret locally with `node -e "console.log(require('crypto').randomBytes(48).toString('hex'))"` and save it in your host’s secret settings. Keep `.env.local` out of version control.

Use a Node.js host with a **persistent writable disk** for `AUTH_DATABASE_PATH` (default `.data/univa.sqlite`). This SQLite implementation is for a single application instance; do not use an ephemeral filesystem or multiple replicas sharing this file. For serverless or multi-instance hosting, configure a supported remote database adapter and migrations first. Back up the database with SQLite-aware tooling.

The old HTML URLs redirect to `/` and `/assistant`. Original HTML files and assets remain in the repository for reference; the active application is in `src/`.
