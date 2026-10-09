# UNUVIA — Next.js, TypeScript & shadcn/ui

UNUVIA uses Next.js 16 App Router, React 19, strict TypeScript, Tailwind CSS 4, shadcn/ui and PostgreSQL. The interface is in English, with light, dark and system appearance preferences.

## Run locally

Use Node.js 22 or later and a reachable PostgreSQL database. Local checks have been run on PostgreSQL 15.17.

```bash
npm ci
cp .env.example .env.local
# Configure DATABASE_URL and the optional providers in .env.local.
npm run dev
```

Open `http://127.0.0.1:4200`. `DATABASE_URL` is required, for example `postgresql://unuvia:password@127.0.0.1:5432/unuvia`. The database role needs permission to create tables and indexes. Better Auth and application tables initialize on the first authentication request, with an advisory lock to serialize concurrent initialization. Application SQL is bundled in `src/lib/schema.ts`; no separate SQL file is needed by the production bundle.

Development generates a signing secret in `.data/auth-secret` if `BETTER_AUTH_SECRET` is absent. Set a stable secret of at least 32 characters before starting production. Never commit `.env.local` or expose credentials through `NEXT_PUBLIC_*`.

For another port, set `BETTER_AUTH_URL` to the matching origin and run `npm run dev -- --port 4210`. The configured auth origin must match the browser URL; the default uses `127.0.0.1`.

The previous SQLite file is left intact as a backup. Its test accounts are not imported into PostgreSQL. SQLite is no longer used by the application.

## Authentication and accounts

[Better Auth](https://better-auth.com/docs/installation) handles password hashing, HttpOnly session cookies, Google OAuth and persisted authentication rate limits. Users can register with any valid email address and an 8–128 character password. The assistant and `/account` require a server session and show the login/register dialog when signed out.

`/account` has Profile, Settings and Plan tabs:

- Profile: name, photo, university role, institution and country. Uploaded photos are cropped and resized locally before saving.
- Settings: appearance, default model and supported reasoning preference. Defaults are saved on the server and read when opening the assistant. The theme toggle also saves a signed-in user's appearance preference.
- Password changes use Better Auth and revoke other sessions. Account deletion requires explicit confirmation plus the current password for password accounts, or a recent sign-in for Google-only accounts. Server profile/subscription records and local chat files on the current device are removed.

Email is sent over SMTP when `SMTP_HOST`, `SMTP_USER` and `SMTP_PASSWORD` are set (`src/lib/mail.ts`): a verification link on registration, a password-reset link from the Log in screen (`/reset-password`), and a message when an administrator approves or rejects a payment. Without SMTP these emails and the “Forgot your password?” link are disabled. Verification is not required to use the workspace. Google verifies its sign-in email. There is no reminder before a Pro period ends. Account IDs and paid entitlements supplied in browser requests cannot change account ownership or privileges.

### Enable Google and Drive

Configure `GOOGLE_CLIENT_ID` and `GOOGLE_CLIENT_SECRET` in `.env.local`. Create a Web application OAuth client in Google Cloud and authorize `http://127.0.0.1:4200/api/auth/callback/google`; use the public origin for production. Run `npm run auth:check` to inspect configuration without printing secrets. Restart Next.js after changes.

For the Drive connector, enable Google Drive API and allow `drive.readonly` in the consent screen. The application can connect a Google account for Drive independently of the password account's email. Connecting another address does not verify the original email.

Actual Google sign-in depends on valid Google Console credentials and has not been tested against a live Google account in this change. See [Better Auth's Google guide](https://better-auth.com/docs/authentication/google).

## Plans and manual payments

`src/lib/plans.ts` defines entitlements used by both the server and UI:

| Plan | Models                                     | Requests per minute | Usage allowance |
| ---- | ------------------------------------------ | ------------------- | --------------- |
| Free | Claude Haiku 5.5                           | 10                  | $0.03 per day   |
| Pro  | Claude Haiku, Sonnet, Opus 5.5 & Fable 5.1 | 30                  | $8 per 30 days  |

The allowance is the Claude API cost an account may consume over a rolling window. Each request records its input, output and cache tokens per account, day and model in `assistant_usage`, priced with the list prices in `src/lib/chat-models.ts`. A request is refused with `usage_limit` once the allowance is used; the Plan tab shows the percentage used, never a dollar amount. Update the prices and allowances when Anthropic's pricing or the Pro price changes. Claude Haiku 5.5 prompts above 100K tokens are billed at a higher rate that this estimate ignores.

Pro lasts 30 days, with no automatic renewal. Regional prices are €12 for euro-area countries and $12 otherwise. The proposed Madagascar price is **not enabled until confirmed**: set `PRO_PRICE_MGA` to the whole-ariary amount after agreement. Until then, Madagascar also uses the default USD price. Country is saved in the profile; language supplies only a suggestion that the user can accept. USD/EUR amounts are stored in minor units; MGA amounts are stored as whole ariary.

Payments happen **outside UNUVIA**. Configure the instructions to enable each method:

```dotenv
PAYMENT_MOBILE_MONEY_INSTRUCTIONS="Your merchant name, number and payment instructions"
PAYMENT_CARD_INSTRUCTIONS="Your external merchant payment link and instructions"
PRO_PRICE_MGA=
ADMIN_EMAILS=
```

Empty instructions disable that method. The app does not collect card numbers, initiate charges or invent an online checkout. The user pays externally and submits a transaction reference in the Plan tab. The server records the price, currency and method, and an administrator checks that the payment was received before approving or rejecting it. Rejection requires a note shown to the user.

One pending request is permitted per account. References cannot be reused for the same payment method. Transactions and row locks prevent duplicate approval and concurrent renewal errors. Approval adds 30 days to an active period, or starts a new period from now if expired/cancelled. Expiry returns the account to Free immediately on access checks, without a scheduled job. Cancellation removes Pro immediately.

### Subscription administration

Set `ADMIN_EMAILS` to a comma-separated list of trusted account emails. **An allowlisted email must also be verified** before it can access `/admin/subscriptions`. Sign in using Google with that exact email; simply registering a password account with an administrator's email does not grant admin rights.

The administration page lists payment requests, Pro periods and an activity log. It can approve/reject payments, extend a period or cancel access. All changes require an authenticated, verified administrator and the configured site origin. Non-admin access returns 404. Ordinary account endpoints cannot grant Pro or administrator access.

`/api/waitlist` has been removed. Pricing links now lead to the account's Plan tab. Team features remain available only by separate agreement.

## Assistant, streaming and files

Assistant links open a separate tab/window. The composer supports drag-and-drop, document attachments, dictation where supported by the browser, a model picker and generation stop. Desktop Enter sends; Shift+Enter inserts a line. On touch devices Enter inserts a line.

Supported attachments: TXT, MD, CSV, PDF, DOCX, XLSX, JPG and PNG, up to 10 MB. Text is extracted in the browser; images and scanned PDF pages use OCR in French/English, rather than vision-model inputs. Scanned PDF OCR reads up to the first ten pages. Document text is truncated at 190,000 characters with a notice. The originals are stored in IndexedDB on the current device, scoped to the signed-in account; the extracted text is sent with the question.

Standalone chat uses authenticated `/api/assistant`, which calls the [Claude API](https://platform.claude.com/docs) (Messages API) with the official `@anthropic-ai/sdk`. Create a key in the Claude Console, set the server-only `ANTHROPIC_API_KEY`, then restart. `npm run claude:check` reads the key's model catalog without generating an answer. `src/lib/claude.ts` is the only module that talks to Anthropic.

Each request streams, caches the conversation prefix (`cache_control`), sends the chosen reasoning level as `output_config.effort`, and allows up to 16,000 output tokens. An answer cut off at that limit ends with a visible notice. A request declined by Claude's safeguards returns `refused`; on Sonnet 5.5, Opus 5.5 and Fable 5.1 the server-side refusal fallback (`fallbacks: "default"`) is enabled.

The endpoint checks the session, origin, input bounds and account's plan; it limits JSON to 2 MB, total message content to 400,000 characters, each message to 200,000 characters and history to 100 messages. Per-account minute counters are atomic PostgreSQL updates. UNUVIA does not substitute the selected model. Claude API errors are mapped to safe user messages without returning credentials or internal details.

Responses stream as UTF-8 text while generation is in progress. Stop cancels generation and retains the received text. Markdown/code/document artifacts can open in a resizable side panel and be downloaded. The conversation follows the response until the reader scrolls up. The `window.claude.complete()` bridge remains supported for embedded workspaces and tests; the product does not fabricate responses.

Conversation history remains local under `univa-chats-v2:<user-id>`, limited to 30 conversations, with local search, rename, deletion confirmation and Markdown export. History is not synchronized across devices. Legacy anonymous history is not imported. Original attachment files belonging to deleted conversations are pruned. Server profile and preferences are separate from this local history.

## UI and branding

The public brand is UNUVIA, with the descriptor AI Workspace for Universities. It is published by GasyCoder at `https://unuvia.gasycoder.com`; the contact address is `contact@gasycoder.com`. Both live in `src/lib/site.ts`.

All pages use shadcn/ui: buttons, inputs, native selects, cards, tabs, dialogs, sheets, menus, tooltips, avatars, sidebars, resizable panels, tables, toggle groups, empty states, skeletons, scroll areas, spinners and keyboard hints. Sources live in `src/components/ui`; `components.json` configures the New York style with the neutral palette and Lucide icons. Add missing components with `npx shadcn add <component>`.

`src/app/globals.css` defines the shared semantic tokens for light and dark mode. The neutral palette uses a slightly darker muted foreground in light mode to meet text contrast requirements on muted surfaces. Page layouts use Tailwind utilities and the components CSS layer, leaving shadcn variants, focus rings and disabled states to the primitives. There are no separate account or assistant palette overrides. File content rendering and syntax highlighting retain their specialized styles.

Below 1,024 px, the assistant has bottom navigation and a Chats drawer. The desktop sidebar collapses to an icon rail. Account/admin forms work at 320 px, and primary mobile controls have touch targets of at least 44 px.

Existing asset filenames, old HTML redirects, browser storage keys and `UNIVA_*` script options remain technical identifiers for compatibility. The live UI uses UNUVIA.

## Checks

```bash
npm run check
npm run build
npm run test:api
npx playwright install chromium
npm run test:e2e
```

A local PostgreSQL connection is required. API tests use temporary schemas in the configured database, run the real SQL/routes with mocked auth/provider HTTP, and remove their schemas afterward. Browser tests start the compiled app on port 4217 (override `UNIVA_TEST_PORT`), use a separate temporary PostgreSQL schema and mocked payment instructions, disable the live Claude API key and clean up afterward. They do not create accounts in the development schema or use real model credits. Build before browser tests; no existing development server needs to be stopped.

The suite covers profile persistence and photo resizing, account isolation, password changes/deletion, manual payment review, duplicate protection, verified administrator access, expiry, model/rate entitlements, responsive UI, streaming, documents/images, chat artifacts, local history, Google configuration flows and Axe accessibility. Actual Google OAuth and real payment collection are outside these automated tests.

Set `PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH` to use an existing Chromium installation. Screenshots can be generated with `scripts/screenshots.mjs`; that separate script creates a preview account on its target server.

## Production

Set `DATABASE_URL`, a stable `BETTER_AUTH_SECRET`, the public `BETTER_AUTH_URL` and provider credentials in the host's private environment. Use a PostgreSQL database reachable from the Node.js host, with backups and appropriate table permissions. Application credentials must not be bundled into client code. Authentication/application tables initialize on first access.

```bash
npm run build
npm start
```

For o2switch (cPanel “Setup Node.js App”), `app.js` is the startup file and `npm run deploy:pack` builds `unuvia-deploy.tar.gz` to upload. `npm run prod:check` verifies a production configuration (database, Claude API key, SMTP) without printing secrets. The step-by-step guide, in French, is `docs/deploiement-o2switch.md`.
