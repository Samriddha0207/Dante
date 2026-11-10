# Dante

Dante keeps approved brand guidance connected to the content that uses it. It checks claims, routes uncertain or conflicting copy to a person, and records the evidence and decision.

## Run locally

Use Node.js 22.13 or newer (or Node.js 24), because the PDF parser requires it.

```powershell
npm install
npm run dev
```

Open <http://localhost:3000>. Copy `.env.example` to `.env.local`. Set the Supabase URL and publishable key for sign-in and shared workspaces. Add the server-only keys below as needed. Never put the Supabase service role key or webhook encryption key in a `NEXT_PUBLIC_` variable or commit `.env.local`.

## Supabase and deployment setup

Run `supabase/schema.sql` and then `supabase/round3_migration.sql` in the Supabase SQL Editor. The second migration upgrades the prototype state table to shared workspaces, adds member roles and one-use invitations, and creates private upload storage. Existing per-user workspaces are migrated as their own admin-owned workspaces.

Set these Vercel environment variables and redeploy:

- `NEXT_PUBLIC_SUPABASE_URL`
- `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY`
- `SUPABASE_SERVICE_ROLE_KEY` (server only; required for shared state, member management, and private uploads)
- `GEMINI_API_KEY` (server only; optional, enables Gemini assistance after per-submission consent)
- `GEMINI_MODEL` (optional; defaults to `gemini-3.6-flash`)
- `DANTE_INTEGRATION_ENCRYPTION_KEY` (server only; 32-byte hex key, required to save webhook credentials)
- `NEXT_PUBLIC_APP_URL` (optional; used when creating invitation links)

Generate an encryption key locally with `node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"`; add the output only in Vercel's server environment settings. Set the Supabase Auth Site URL and redirect allowlist to the deployed app URL. If either migration or the service role key is missing, the authenticated workspace shows a setup error rather than silently falling back to local data.

## Implemented workflows

- **Source library:** submit facts, rules, required terms, logo assets, and language-tagged guidance. Changes require reviewer approval and retain versions.
- **Content review:** link a draft to an approved source; run deterministic quantity and exact-term checks; optionally send brand rules and the draft to Gemini for evidence-linked semantic assistance. Language tags are validated and cross-language rule checks account for negation, obligation, exceptions, and idioms. Quotes must match the original Unicode text exactly; Gemini's output remains advisory and never makes the final decision. Exact required-term checks remain literal by design.
- **PDF/DOCX policy intake:** extract text from up to 100 PDF pages or a DOCX under 8 MB. Likely rule sentences retain page or paragraph citations. English, Hindi, Bengali, Spanish, French, and German instruction terms are recognized by the candidate filter; other languages may need manual rule entry. If PDF pages have little or no selectable text, uploaders can explicitly opt in to Gemini OCR; page-level OCR candidates remain unapproved and must be checked against the original. Scanned pages are not sent to Gemini without that consent.
- **Image review:** upload PNG, JPEG, or WebP under 4 MB; opt in to sending it to Gemini for text transcription and advisory logo/contrast findings. Logo references are private uploads and new versions wait for administrator approval. Contrast findings are visual estimates, not measured WCAG contrast ratios.
- **Drift analytics:** Recharts summarize saved review events by date, campaign, channel, submitter, and content status. These are workspace data, not external benchmark figures.
- **Publishing gate:** configure an HTTPS webhook for a CMS or automation endpoint. A reviewer must authorize current content before Dante dispatches it; webhook secrets are encrypted at rest and requests are DNS-validated, pinned, and idempotency-keyed. This is a generic webhook contract, not a built-in connector for a specific CMS. The receiving endpoint must understand Dante's `dante.content.approved` JSON event.
- **Workspace access:** admins invite email-bound users through seven-day links and assign admin, reviewer, or creator roles. Server routes enforce the permissions; creators submit and view, reviewers decide, and admins manage members and source assets.
- **Audit:** export the workspace event history to JSON or CSV. Exports include actor, action, time, and related content/source IDs.

## Data and limits

The interactive app persists workspace state in Supabase Postgres. Original policy and logo files use the private `dante-sources` Storage bucket. The app does not auto-publish or auto-approve guidance. The page monitor reads server-delivered HTML on demand; client-rendered text and scheduled checks are not supported. Gemini image and text analysis is advisory and is sent to Google only after explicit consent. The unauthenticated `dante-submission-site/` remains a separate, sample-data demonstration and does not write to the Supabase workspace.
