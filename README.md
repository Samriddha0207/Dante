# Dante

Dante connects approved brand and product guidance to the content that uses it. It flags changed or conflicting claims with source evidence, routes decisions to a reviewer, and records the outcome.

## Live deployments

- **Authenticated workspace:** [dante-blue.vercel.app](https://dante-blue.vercel.app/) - Supabase sign-in required.
- **Public landing page and sample interaction:** [dante-submission.vercel.app](https://dante-submission.vercel.app/) - no sign-in; the embedded 100 GB to 200 GB walkthrough uses sample data and does not write to the workspace.

The sign-in page displays shared judge-demo credentials. They are public: use the associated account only for the demo and do not store private data in it. The matching Supabase Auth user must also exist; displaying credentials does not create that account.

## Requirements

- Git
- Node.js **22.13.x** (22.13 or later, below 23) or **24 or later**
- npm
- A Supabase project for the authenticated workspace

## Run locally

```bash
git clone https://github.com/Samriddha0207/Dante.git
cd Dante
npm install
```

Create `.env.local` from the example file:

```bash
cp .env.example .env.local
```

On Windows PowerShell, use `Copy-Item .env.example .env.local` instead. Set the required Supabase values described below, then start the app:

```bash
npm run dev
```

Open [http://localhost:3000](http://localhost:3000). The sign-in page supports Supabase email/password sign-in and account creation.

### Run the local JSON prototype

To explore the separate no-login prototype without configuring Supabase, use:

```bash
npm run dev:local-json
```

Open [http://localhost:3000](http://localhost:3000). It serves the vanilla JavaScript app from `public/` and stores state locally in `data/demo-state.json`; it is not the authenticated Next.js workspace and its data is not shared with Vercel.

### Environment variables

| Variable | Required? | Purpose |
| --- | --- | --- |
| `NEXT_PUBLIC_SUPABASE_URL` | Yes for the authenticated app | Supabase project URL. |
| `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY` | Yes for the authenticated app | Browser-safe Supabase publishable key (or legacy anon key). |
| `SUPABASE_SERVICE_ROLE_KEY` | Yes for workspace data | Server-only Supabase secret key (`sb_secret_...`) or legacy `service_role` key. Despite the variable name, the current `sb_secret_...` key is accepted here. |
| `GEMINI_API_KEY` | Optional | Enables consent-based Gemini semantic review, policy extraction/OCR, and image review. Without it, deterministic checks remain available. |
| `GEMINI_MODEL` | Optional | Gemini model name; defaults to `gemini-3.6-flash` in the current code. |
| `DANTE_INTEGRATION_ENCRYPTION_KEY` | Optional | Required to save webhook bearer credentials. Must be 64 hexadecimal characters (32 bytes). |
| `CRON_SECRET` | Required for scheduled page monitoring | Random server-only bearer secret protecting the Vercel Cron endpoint. |
| `NEXT_PUBLIC_APP_URL` | Optional | Canonical app URL for invitation links. Set to `http://localhost:3000` for local testing and the production URL when deployed. |
| `DANTE_SUBMISSION_LANDING` | Optional | Set to `1` only for the public landing deployment. It renders the sample landing and interactive walkthrough instead of the authenticated workspace. |

Generate server secrets with:

```bash
node -e "console.log(require('node:crypto').randomBytes(32).toString('hex'))"
node -e "console.log(require('node:crypto').randomBytes(32).toString('base64url'))"
```

Use the 64-character hex output for `DANTE_INTEGRATION_ENCRYPTION_KEY` and the base64url output for `CRON_SECRET`. Never put `SUPABASE_SERVICE_ROLE_KEY`, `GEMINI_API_KEY`, `DANTE_INTEGRATION_ENCRYPTION_KEY`, or `CRON_SECRET` in a `NEXT_PUBLIC_` variable, commit them, or expose them in browser code. `.env.local` is ignored by Git. The Supabase secret key bypasses Row Level Security and must stay server-side.

## Supabase setup

For a new Supabase project:

1. Copy the project URL, publishable key, and secret key from **Project Settings > API Keys** into `.env.local` using the variable names above.
2. In the Supabase SQL Editor, run `supabase/schema.sql`, then run `supabase/round3_migration.sql`. Run these in order on a new database. The migration converts existing per-user state into admin-owned workspaces, adds roles and invitations, and creates the private `dante-sources` Storage bucket. Do not rerun a migration on a database that has already been migrated.
3. In **Authentication > URL Configuration**, add `http://localhost:3000/**` and `https://dante-blue.vercel.app/**` to the Redirect URLs allowlist. Set the Site URL to the canonical URL for the environment you are testing: localhost for local-only work, or the deployed app URL for production.
4. Start Dante with `npm run dev` and create or sign in to a Supabase Auth account. If email confirmation is enabled in Supabase, confirm the account before signing in.

The Supabase URL, publishable key, and secret key must all belong to the same project. Without the database scripts or server secret, the app shows a workspace setup error after sign-in.

## What the product includes

- **Approved source library:** facts, rules, required terms, and logo assets with versions and reviewer approval.
- **Evidence-linked review:** deterministic quantity and exact-term checks; optional Gemini semantic assistance with source and draft excerpts for human review.
- **Change impact:** find linked content that may need review after a source update.
- **Policy intake:** PDF and DOCX extraction with page or paragraph references; optional consent-based OCR for scanned PDF pages. Extracted rules stay pending until an administrator approves them.
- **Image review:** opt-in text transcription and advisory logo/contrast checks, including comparison to an approved logo reference.
- **Page monitor:** on-demand and Vercel-scheduled checks of server-delivered public page text (15-minute, hourly, or daily intervals). A reviewer approves the baseline and resolves every detected change; JavaScript-rendered pages may not be captured.
- **Team review:** workspace roles, reviewer assignment, and an in-app assigned-first review queue. Dante does not send email or push notifications.
- **Accuracy evaluation:** a small curated baseline plus reviewer-labeled workspace examples; reports review precision, recall, false alarms, and missed review flags. Metrics are prototype-scale and do not claim production accuracy or automatically retrain the checker.
- **Workspace operations:** Supabase Auth, PostgreSQL, private Storage, workspace roles, invitations, audit history, JSON/CSV export, and Recharts activity analytics.
- **Publishing gate:** reviewer-approved dispatch to a configured HTTPS webhook; this is a generic webhook contract, not a native connector for a particular CMS.

## Architecture

- **UI:** Next.js 16, React 19, JavaScript, and CSS.
- **API and authorization:** Next.js Route Handler (`app/api/[...path]/route.js`) and shared server logic in `server.mjs`. Routes validate the Supabase user and workspace membership before accessing workspace data.
- **Data and files:** Supabase Auth, PostgreSQL, and private Storage.
- **AI:** Gemini GenerateContent API, called server-side only after explicit consent. Results are advisory; server-side evidence checks and human decisions remain in the workflow.
- **Charts and hosting:** Recharts for workspace activity; Vercel for deployment.

## Verify a local build

```bash
node --test tests/round3-features.test.mjs
npm run build
```

Start the production build locally with `npm run start` after `npm run build`.

## Data handling and limitations

Workspace state is stored in Supabase PostgreSQL; original policy and logo files stay in private Storage. Gemini receives submitted text, documents, or images only when the relevant reviewer/uploader consent is given. Gemini output is advisory and does not approve rules or publish content automatically. Image contrast findings are visual estimates, not WCAG contrast measurements. The public landing walkthrough is sample-only; its state is held in the page and is not the shared Supabase workspace.
