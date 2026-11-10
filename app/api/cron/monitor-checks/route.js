import { createClient } from '@supabase/supabase-js';
import { handleRequest } from '../../../../server.mjs';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function GET(request) {
  const secret = process.env.CRON_SECRET;
  const authorization = request.headers.get('authorization') || '';
  if (!secret || authorization !== `Bearer ${secret}`) return Response.json({ error: 'Unauthorized.' }, { status: 401 });
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !serviceKey) return Response.json({ error: 'Workspace persistence is not configured.' }, { status: 503 });

  const supabase = createClient(url, serviceKey, { auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false } });
  const { data: rows, error } = await supabase.from('dante_workspace_state').select('user_id,workspace_id,state').limit(100);
  if (error) return Response.json({ error: 'Could not load workspaces for scheduled checks.' }, { status: 500 });
  let checked = 0;
  const errors = [];
  for (const row of rows || []) {
    if (!(row.state?.monitors || []).some(monitor => !monitor.pending && monitor.approvedHash && Date.parse(monitor.nextCheckAt || 0) <= Date.now())) continue;
    const adapter = {
      role: 'admin', actor: 'Dante scheduled monitor', workspaceId: row.workspace_id, service: supabase, cron: true,
      async load() { return row.state || {}; },
      async save(state) {
        row.state = state;
        const { error: saveError } = await supabase.from('dante_workspace_state').upsert({ user_id: row.user_id, workspace_id: row.workspace_id, state, updated_at: new Date().toISOString() }, { onConflict: 'workspace_id' });
        if (saveError) throw saveError;
      }
    };
    const payload = '{}';
    const req = { method: 'POST', url: '/api/monitors/check-due', headers: { host: 'localhost' }, async *[Symbol.asyncIterator]() { yield payload; } };
    let status = 200;
    let responseBody = '';
    const res = { writeHead(code) { status = code; return this; }, end(value = '') { responseBody = String(value); } };
    await handleRequest(req, res, adapter);
    if (status >= 400) errors.push({ workspaceId: row.workspace_id, status });
    else checked += JSON.parse(responseBody || '{}').checked || 0;
  }
  return Response.json({ workspaces: rows?.length || 0, checked, errors }, { headers: { 'Cache-Control': 'no-store' } });
}
