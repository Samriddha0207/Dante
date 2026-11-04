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
