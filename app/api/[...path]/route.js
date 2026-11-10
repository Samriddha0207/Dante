import { createClient } from '@supabase/supabase-js';
import { createHash } from 'node:crypto';
import { handleRequest, seedState } from '../../../server.mjs';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

async function dispatch(request) {
  const url = new URL(request.url);
  if (url.pathname === '/api/config') {
    return Response.json({
      geminiConfigured: Boolean(process.env.GEMINI_API_KEY),
      geminiModel: process.env.GEMINI_MODEL || 'gemini-3.6-flash',
      supabaseConnected: Boolean(process.env.NEXT_PUBLIC_SUPABASE_URL && process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY),
      persistence: process.env.NEXT_PUBLIC_SUPABASE_URL && process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY ? 'supabase-postgres' : 'unconfigured'
    }, { headers: { 'Cache-Control': 'no-store' } });
  }

  const token = request.headers.get('authorization')?.match(/^Bearer\s+(.+)$/i)?.[1];
  if (!token) return Response.json({ error: 'Sign in to open this workspace.' }, { status: 401 });
  const projectUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const publishableKey = process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY;
  if (!projectUrl || !publishableKey) return Response.json({ error: 'Supabase is not configured for this deployment.' }, { status: 503 });

  const authClient = createClient(projectUrl, publishableKey, {
    auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false },
    global: { headers: { Authorization: `Bearer ${token}` } }
  });
  const { data: authData, error: authError } = await authClient.auth.getUser(token);
  if (authError || !authData.user) return Response.json({ error: 'Your session is no longer valid. Sign in again.' }, { status: 401 });
  const userId = authData.user.id;
  if (url.pathname === '/api/workspace/accept' && request.method === 'POST') {
    const body = await request.json();
    const rawToken = String(body.token || '').trim();
    if (!rawToken || rawToken.length > 200) return Response.json({ error: 'Invalid invitation token.' }, { status: 400 });
    const inviteHash = createHash('sha256').update(rawToken).digest('hex');
    const { data, error } = await authClient.rpc('accept_dante_workspace_invite', { invite_hash: inviteHash });
    if (error) return Response.json({ error: error.message }, { status: 400 });
    return Response.json({ workspace: data?.[0] || null }, { headers: { 'Cache-Control': 'no-store' } });
  }

  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!serviceRoleKey) return Response.json({ error: 'Workspace backend setup needed: configure SUPABASE_SERVICE_ROLE_KEY as a server-only Vercel environment variable.' }, { status: 503 });
  const supabase = createClient(projectUrl, serviceRoleKey, { auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false } });

  let { data: memberships, error: membershipError } = await supabase.from('workspace_members')
    .select('workspace_id,user_id,email,role,created_at,workspaces(name,created_at)').eq('user_id', userId).order('created_at');
  if (membershipError) return Response.json({ error: 'Apply supabase/round3_migration.sql before using shared workspaces.' }, { status: 503 });
  if (!memberships?.length) {
    const { data: workspace, error: workspaceError } = await supabase.from('workspaces').insert({ name: 'Dante Workspace' }).select('id,name,created_at').single();
    if (workspaceError) return Response.json({ error: 'Could not create your workspace.' }, { status: 500 });
    const { error: memberError } = await supabase.from('workspace_members').insert({ workspace_id: workspace.id, user_id: userId, email: authData.user.email || '', role: 'admin' });
    if (memberError) return Response.json({ error: 'Could not create your workspace membership.' }, { status: 500 });
    memberships = [{ workspace_id: workspace.id, user_id: userId, email: authData.user.email || '', role: 'admin', created_at: workspace.created_at, workspaces: { name: workspace.name, created_at: workspace.created_at } }];
  }
  const requestedWorkspaceId = request.headers.get('x-dante-workspace') || '';
  const membership = memberships.find(row => row.workspace_id === requestedWorkspaceId) || memberships[0];
  if (requestedWorkspaceId && !memberships.some(row => row.workspace_id === requestedWorkspaceId)) return Response.json({ error: 'You are not a member of that workspace.' }, { status: 403 });
  const workspaceId = membership.workspace_id;
  const [{ data: members, error: membersError }, { data: workspaceData, error: workspaceError }] = await Promise.all([
    supabase.from('workspace_members').select('workspace_id,user_id,email,role,created_at').eq('workspace_id', workspaceId).order('created_at'),
    supabase.from('workspaces').select('id,name,created_at').eq('id', workspaceId).single()
  ]);
  if (membersError || workspaceError) return Response.json({ error: 'Could not load workspace membership.' }, { status: 500 });

  const adapter = {
    role: membership.role,
    actor: authData.user.email || userId,
    userId,
    userEmail: authData.user.email || '',
    workspaceId,
    service: supabase,
    members,
    workspaceChoices: memberships,
    workspace: workspaceData,
    async load() {
      const { data, error } = await supabase.from('dante_workspace_state').select('state').eq('workspace_id', workspaceId).maybeSingle();
      if (error) throw error;
      if (data?.state) return data.state;
      const initialState = seedState();
      initialState.workspace = { name: workspaceData.name, institution: 'NSEC' };
      const { error: insertError } = await supabase.from('dante_workspace_state').upsert({ user_id: userId, workspace_id: workspaceId, state: initialState, updated_at: new Date().toISOString() }, { onConflict: 'workspace_id' });
      if (insertError) throw insertError;
      return initialState;
    },
    async save(state) {
      const stored = structuredClone(state);
      delete stored.workspaceAccess; delete stored.workspaceMembers; delete stored.currentUser;
      delete stored.workspaceChoices;
      const { error } = await supabase.from('dante_workspace_state').upsert({ user_id: userId, workspace_id: workspaceId, state: stored, updated_at: new Date().toISOString() }, { onConflict: 'workspace_id' });
      if (error) throw error;
    }
  };

  const contentLength = Number(request.headers.get('content-length') || 0);
  if (contentLength > 12_000_000) return Response.json({ error: 'Upload is too large. The current limit is 10 MB.' }, { status: 413 });
  const body = request.method === 'GET' || request.method === 'HEAD' ? null : Buffer.from(await request.arrayBuffer());
  if (body?.length > 12_000_000) return Response.json({ error: 'Upload is too large. The current limit is 10 MB.' }, { status: 413 });
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
