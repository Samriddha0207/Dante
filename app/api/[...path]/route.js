import { createClient } from '@supabase/supabase-js';
import { handleRequest, seedState } from '../../../server.mjs';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

async function dispatch(request) {
  const url = new URL(request.url);
  if (url.pathname === '/api/config') {
    return Response.json({
      geminiConfigured: Boolean(process.env.GEMINI_API_KEY),
      geminiModel: process.env.GEMINI_MODEL || 'gemini-3.6-flash',
      supabaseConnected: true,
      persistence: 'supabase-postgres'
    }, { headers: { 'Cache-Control': 'no-store' } });
  }

  const token = request.headers.get('authorization')?.match(/^Bearer\s+(.+)$/i)?.[1];
  if (!token) return Response.json({ error: 'Sign in to open this workspace.' }, { status: 401 });
  const projectUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const publishableKey = process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY;
  if (!projectUrl || !publishableKey) return Response.json({ error: 'Supabase is not configured for this deployment.' }, { status: 503 });

  const supabase = createClient(projectUrl, publishableKey, {
    auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false },
    global: { headers: { Authorization: `Bearer ${token}` } }
  });
  const { data: authData, error: authError } = await supabase.auth.getUser(token);
  if (authError || !authData.user) return Response.json({ error: 'Your session is no longer valid. Sign in again.' }, { status: 401 });
  const userId = authData.user.id;

  const adapter = {
    async load() {
      const { data, error } = await supabase.from('dante_workspace_state').select('state').eq('user_id', userId).maybeSingle();
      if (error) throw error;
      if (data?.state) return data.state;
      const initialState = seedState();
      const { error: insertError } = await supabase.from('dante_workspace_state').upsert({ user_id: userId, state: initialState, updated_at: new Date().toISOString() });
      if (insertError) throw insertError;
      return initialState;
    },
    async save(state) {
      const { error } = await supabase.from('dante_workspace_state').upsert({ user_id: userId, state, updated_at: new Date().toISOString() });
      if (error) throw error;
    }
  };

  const body = request.method === 'GET' || request.method === 'HEAD' ? null : Buffer.from(await request.arrayBuffer());
  const nodeRequest = {
    method: request.method,
    url: `${url.pathname}${url.search}`,
    headers: { host: url.host },
    async *[Symbol.asyncIterator]() { if (body?.length) yield body; }
  };

  return new Promise(resolve => {
    let status = 200;
    let headers = { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store' };
    const nodeResponse = {
      writeHead(code, nextHeaders = {}) { status = code; headers = { ...headers, ...nextHeaders }; return this; },
      end(value = '') { resolve(new Response(value, { status, headers })); }
    };
    void handleRequest(nodeRequest, nodeResponse, adapter).catch(() => {
      resolve(Response.json({ error: 'The workspace request failed. Check the Supabase schema and try again.' }, { status: 500 }));
    });
  });
}

export const GET = dispatch;
export const POST = dispatch;
