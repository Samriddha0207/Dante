# Dante

Dante is a brand-guidance and content-review prototype. It links approved source facts to content, flags claims that need attention, and keeps evidence alongside reviewer decisions.

## Run locally

Requires Node.js 20.9 or later.

```powershell
npm install
npm run dev
```

Open <http://localhost:3000>.

Copy `.env.example` to `.env.local` and set the Supabase URL, publishable key, and Gemini API key. The Gemini key is only used server-side; submitted draft text is sent to Gemini only when the reviewer opts in.

## Supabase setup

Run the `dante_workspace_state` table and row-level security policy from `supabase/schema.sql` in the Supabase SQL Editor. The Next.js API validates each signed-in Supabase user and stores the current prototype state in one JSONB row per user, protected by RLS. The larger normalized schema in the same file is the planned next migration; shared multi-member workspaces are not implemented yet.

## Deployment

Vercel detects the Next.js app. Add these project environment variables before deployment:

- `NEXT_PUBLIC_SUPABASE_URL`
- `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY`
- `GEMINI_API_KEY`
- `GEMINI_MODEL` (optional; defaults to `gemini-3.6-flash`)

After deployment, add the Vercel production URL to Supabase Auth's allowed redirect URLs.

The dashboard's Recharts show daily review activity, content disposition, and content volume by channel from the saved workspace state.

## Public webpage monitoring (prototype)

In the authenticated app, the Approved sources view can capture a public HTTPS webpage for reviewer approval, check it again on demand, and show multiple changed text blocks. The first snapshot is not a baseline until a reviewer approves it. If the reviewer routes a change to linked content review, the monitor stays pending and does not accept the new baseline until all linked review items are resolved. The fetcher rejects non-HTTPS and private addresses, validates each redirect target, pins every HTTPS connection to a DNS-validated public IP, applies a timeout, and caps response size. Checks read server-delivered HTML, so client-rendered content may be missed. Scheduled crawling, CMS integrations, and document ingestion are not implemented yet. The public no-login sample workspace does not support server-side webpage fetches.

## Public no-login demo

Keep `dante-blue` as the authenticated, Supabase-backed app. The separate `dante-submission` Vercel project serves the interactive workspace directly from `dante-submission-site/` without a login screen. Its standalone mode uses sample data and saves changes in that visitor's browser only; Gemini and shared database writes are disabled. To refresh that deployment, upload the contents of `dante-submission-site/` to the existing `dante-submission` Vercel project.
