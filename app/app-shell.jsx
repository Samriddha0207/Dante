'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { createClient } from '@supabase/supabase-js';
import {
  Bar, BarChart, CartesianGrid, Cell, Legend, Pie, PieChart, ResponsiveContainer,
  Tooltip, XAxis, YAxis
} from 'recharts';

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL || '';
const supabasePublishableKey = process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY || '';
const supabase = supabaseUrl && supabasePublishableKey
  ? createClient(supabaseUrl, supabasePublishableKey)
  : null;

const CHART_COLORS = { findings: '#d94b45', resolved: '#329665', passed: '#a8b6ac', current: '#329665', review: '#d94b45', exception: '#dfad42', channel: '#62866e' };

function AuthForm() {
  const [mode, setMode] = useState('signin');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [message, setMessage] = useState('');
  const [busy, setBusy] = useState(false);
  const submit = async (event) => {
    event.preventDefault(); setBusy(true); setMessage('');
    const result = mode === 'signin'
      ? await supabase.auth.signInWithPassword({ email, password })
      : await supabase.auth.signUp({ email, password, options:{emailRedirectTo:`${window.location.origin}${window.location.pathname}${window.location.search}`} });
    setBusy(false);
    if (result.error) setMessage(result.error.message);
    else if (mode === 'signup' && !result.data.session) setMessage('Check your inbox to confirm your email, then sign in.');
    else setMessage('Signed in. Loading your workspace…');
  };
  return <main className="dante-auth-wrap"><section className="dante-auth-card">
    <div className="dante-topbrand"><span className="dante-mark">d.</span><span>Dante<small>brand intelligence</small></span></div>
    <h1>{mode === 'signin' ? 'Welcome back' : 'Create your workspace'}</h1>
    <p>Sign in to review evidence-linked guidance and monitor content changes.</p>
    <form onSubmit={submit}>
      <label htmlFor="auth-email">Email</label><input id="auth-email" type="email" autoComplete="email" required value={email} onChange={e=>setEmail(e.target.value)} />
      <label htmlFor="auth-password">Password</label><input id="auth-password" type="password" autoComplete={mode==='signin'?'current-password':'new-password'} minLength={8} required value={password} onChange={e=>setPassword(e.target.value)} />
      <button className="dante-button" disabled={busy}>{busy ? 'Please wait…' : mode === 'signin' ? 'Sign in' : 'Create account'}</button>
    </form>
    {message && <div className={`dante-message ${message.startsWith('Check')||message.startsWith('Signed')?'ok':''}`} role="status">{message}</div>}
    {mode === 'signin' && <aside className="dante-demo-credentials" aria-label="Judge demo credentials">
      <strong>Judge demo login</strong>
      <span>Email: <code>textemaildante@gmail.com</code></span>
      <span>Password: <code>abcd1234</code></span>
    </aside>}
    <p style={{marginTop:18,marginBottom:0}}>{mode==='signin'?'New to Dante?':'Already have an account?'} <button className="dante-auth-toggle" onClick={()=>{setMode(mode==='signin'?'signup':'signin');setMessage('');}}>{mode==='signin'?'Create an account':'Sign in'}</button></p>
  </section></main>;
}

function buildAnalytics(state, daysCount) {
  const now = new Date();
  const rows = Array.from({length:daysCount},(_,i)=>{
    const date = new Date(now); date.setDate(now.getDate() - (daysCount - i - 1)); date.setHours(0,0,0,0);
    return { key:date.toDateString(), day:date.toLocaleDateString(undefined,{month:'short',day:'numeric'}), findings:0,resolved:0,passed:0 };
  });
  for (const event of state?.audit || []) {
    const row=rows.find(item=>item.key===new Date(event.at).toDateString()); if(!row) continue;
    if(event.type==='finding_created') row.findings++;
    if(event.type==='review_resolved') row.resolved++;
    if(event.type==='content_reviewed' && event.result==='supported') row.passed++;
  }
  const status=[
    {name:'In sync',value:(state?.content||[]).filter(item=>item.status==='current').length,color:CHART_COLORS.current},
    {name:'Needs review',value:(state?.content||[]).filter(item=>item.status==='needs_review').length,color:CHART_COLORS.review},
    {name:'Exception',value:(state?.content||[]).filter(item=>item.status==='exception').length,color:CHART_COLORS.exception}
  ].filter(item=>item.value>0);
  const channelMap=new Map();
  for(const item of state?.content||[]) channelMap.set(item.channel||'Other',(channelMap.get(item.channel||'Other')||0)+1);
  const channels=[...channelMap].map(([name,count])=>({name,count})).sort((a,b)=>b.count-a.count).slice(0,5);
  const campaignMap=new Map(), ownerMap=new Map();
  for(const item of state?.content||[]){
    const add=(map,key)=>{const row=map.get(key)||{name:key,current:0,review:0,exception:0};row[item.status==='needs_review'?'review':item.status==='exception'?'exception':'current']++;map.set(key,row);};
    add(campaignMap,item.campaign||'Unassigned'); add(ownerMap,item.createdBy||'Unassigned');
  }
  const campaigns=[...campaignMap.values()].sort((a,b)=>b.review-a.review||b.current-a.current).slice(0,6);
  const owners=[...ownerMap.values()].sort((a,b)=>b.review-a.review||b.current-a.current).slice(0,6);
  const contentById=new Map((state?.content||[]).map(item=>[item.id,item]));
  const trend=(field)=>{
    const activity=(state?.audit||[]).filter(event=>event.type==='finding_created'&&rows.some(day=>day.key===new Date(event.at).toDateString()));
    const totals=new Map(); for(const event of activity){const item=contentById.get(event.contentId);if(!item)continue;const name=item[field]||'Unassigned';totals.set(name,(totals.get(name)||0)+1);}
    const series=[...totals].sort((a,b)=>b[1]-a[1]).slice(0,4).map(([name],index)=>({name,key:`series${index}`}));
    const chartRows=rows.map(day=>({day:day.day,key:day.key,...Object.fromEntries(series.map(item=>[item.key,0]))}));
    const seriesIndex=new Map(series.map(item=>[item.name,item.key]));
    for(const event of activity){const item=contentById.get(event.contentId);const key=seriesIndex.get(item?.[field]||'Unassigned');const row=chartRows.find(day=>day.key===new Date(event.at).toDateString());if(key&&row)row[key]++;}
    return {series,rows:chartRows};
  };
  return {rows,status,channels,campaigns,owners,driftCampaign:trend('campaign'),driftChannel:trend('channel'),driftOwner:trend('createdBy')};
}

function DriftChart({title,subtitle,data}) { return <section className="dante-chart-card"><h2>{title}</h2><p>{subtitle}</p><div className="dante-chart"><ResponsiveContainer width="100%" height="100%"><BarChart data={data.rows} margin={{top:8,right:8,left:-22,bottom:0}}><CartesianGrid stroke="#edf0ee" vertical={false}/><XAxis dataKey="day" tick={{fontSize:9,fill:'#7b8189'}} tickLine={false} axisLine={false}/><YAxis allowDecimals={false} tick={{fontSize:9,fill:'#7b8189'}} tickLine={false} axisLine={false}/><Tooltip/><Legend wrapperStyle={{fontSize:9}}/>{data.series.map((series,index)=><Bar key={series.key} dataKey={series.key} name={series.name} stackId="findings" fill={[CHART_COLORS.findings,CHART_COLORS.resolved,CHART_COLORS.channel,CHART_COLORS.exception][index]}/>)}</BarChart></ResponsiveContainer></div></section>; }

function Analytics({state,range,setRange}) {
  const data=useMemo(()=>buildAnalytics(state,range),[state,range]);
  return <section className="dante-analytics" aria-label="Workspace analytics">
    <div className="dante-analytics-head"><div><h1>Workspace signals</h1><p>Activity and content status from this workspace’s saved review history.</p></div><div className="dante-range"><button aria-pressed={range===7} onClick={()=>setRange(7)}>7 days</button><button aria-pressed={range===30} onClick={()=>setRange(30)}>30 days</button></div></div>
    <div className="dante-chart-grid">
      <section className="dante-chart-card"><h2>Review activity</h2><p>Recorded checks, findings, and completed reviews</p><div className="dante-chart"><ResponsiveContainer width="100%" height="100%"><BarChart data={data.rows} margin={{top:8,right:8,left:-22,bottom:0}}><CartesianGrid stroke="#edf0ee" vertical={false}/><XAxis dataKey="day" tick={{fontSize:10,fill:'#7b8189'}} tickLine={false} axisLine={false} interval={range===30?4:0}/><YAxis allowDecimals={false} tick={{fontSize:10,fill:'#7b8189'}} tickLine={false} axisLine={false}/><Tooltip/><Legend wrapperStyle={{fontSize:10}}/><Bar dataKey="findings" name="Sent to review" stackId="activity" fill={CHART_COLORS.findings} radius={[2,2,0,0]}/><Bar dataKey="resolved" name="Resolved" stackId="activity" fill={CHART_COLORS.resolved}/><Bar dataKey="passed" name="Passed check" stackId="activity" fill={CHART_COLORS.passed}/></BarChart></ResponsiveContainer></div></section>
      <section className="dante-chart-card"><h2>Content status</h2><p>Current disposition of monitored items</p><div className="dante-chart"><ResponsiveContainer width="100%" height="100%"><PieChart><Pie data={data.status} dataKey="value" nameKey="name" innerRadius={48} outerRadius={72} paddingAngle={3}>{data.status.map(row=><Cell key={row.name} fill={row.color}/>)}</Pie><Tooltip/><Legend wrapperStyle={{fontSize:10}}/></PieChart></ResponsiveContainer></div></section>
      <section className="dante-chart-card"><h2>Content by channel</h2><p>Items currently linked to approved guidance</p><div className="dante-chart"><ResponsiveContainer width="100%" height="100%"><BarChart data={data.channels} layout="vertical" margin={{top:4,right:10,left:0,bottom:0}}><CartesianGrid stroke="#edf0ee" horizontal={false}/><XAxis type="number" allowDecimals={false} tick={{fontSize:10,fill:'#7b8189'}} tickLine={false} axisLine={false}/><YAxis type="category" dataKey="name" width={74} tick={{fontSize:10,fill:'#626974'}} tickLine={false} axisLine={false}/><Tooltip/><Bar dataKey="count" name="Content items" fill={CHART_COLORS.channel} radius={[0,4,4,0]}/></BarChart></ResponsiveContainer></div></section>
      <section className="dante-chart-card"><h2>Drift by campaign</h2><p>Current vs review-needed content in saved campaigns</p><div className="dante-chart"><ResponsiveContainer width="100%" height="100%"><BarChart data={data.campaigns} layout="vertical" margin={{top:4,right:10,left:0,bottom:0}}><CartesianGrid stroke="#edf0ee" horizontal={false}/><XAxis type="number" allowDecimals={false} tick={{fontSize:10,fill:'#7b8189'}} tickLine={false} axisLine={false}/><YAxis type="category" dataKey="name" width={88} tick={{fontSize:10,fill:'#626974'}} tickLine={false} axisLine={false}/><Tooltip/><Legend wrapperStyle={{fontSize:10}}/><Bar dataKey="review" name="Needs review" stackId="s" fill={CHART_COLORS.review}/><Bar dataKey="current" name="Current" stackId="s" fill={CHART_COLORS.current}/><Bar dataKey="exception" name="Exception" stackId="s" fill={CHART_COLORS.exception}/></BarChart></ResponsiveContainer></div></section>
      <section className="dante-chart-card"><h2>Team content ownership</h2><p>Saved items by submitter and review status</p><div className="dante-chart"><ResponsiveContainer width="100%" height="100%"><BarChart data={data.owners} layout="vertical" margin={{top:4,right:10,left:0,bottom:0}}><CartesianGrid stroke="#edf0ee" horizontal={false}/><XAxis type="number" allowDecimals={false} tick={{fontSize:10,fill:'#7b8189'}} tickLine={false} axisLine={false}/><YAxis type="category" dataKey="name" width={120} tick={{fontSize:9,fill:'#626974'}} tickLine={false} axisLine={false}/><Tooltip/><Legend wrapperStyle={{fontSize:10}}/><Bar dataKey="review" name="Needs review" stackId="s" fill={CHART_COLORS.review}/><Bar dataKey="current" name="Current" stackId="s" fill={CHART_COLORS.current}/><Bar dataKey="exception" name="Exception" stackId="s" fill={CHART_COLORS.exception}/></BarChart></ResponsiveContainer></div></section>
      <DriftChart title="Campaign drift over time" subtitle="New findings recorded per day, by campaign" data={data.driftCampaign}/><DriftChart title="Channel drift over time" subtitle="New findings recorded per day, by publishing channel" data={data.driftChannel}/><DriftChart title="Team drift over time" subtitle="New findings recorded per day, by submitter" data={data.driftOwner}/>
    </div>
  </section>;
}

export default function AppShell() {
  const [session,setSession]=useState(null);
  const [ready,setReady]=useState(false);
  const [state,setState]=useState(null);
  const [error,setError]=useState('');
  const [range,setRange]=useState(7);
  const frame=useRef(null);
  const refreshState=useCallback(async(current)=>{
    const headers={Authorization:`Bearer ${current.access_token}`};
    const invite=new URLSearchParams(window.location.search).get('invite');
    if(invite){const accepted=await fetch('/api/workspace/accept',{method:'POST',headers:{...headers,'Content-Type':'application/json'},body:JSON.stringify({token:invite})});const result=await accepted.json();if(!accepted.ok)throw new Error(result.error||'Could not accept workspace invitation.');if(result.workspace?.workspace_id)localStorage.setItem('dante-workspace-id',result.workspace.workspace_id);window.history.replaceState({},'',window.location.pathname+window.location.hash);}
    const workspaceId=localStorage.getItem('dante-workspace-id');if(workspaceId)headers['x-dante-workspace']=workspaceId;
    const response=await fetch('/api/state',{headers,cache:'no-store'});
    const result=await response.json();
    if(!response.ok) throw new Error(result.error||'Could not load workspace.');
    setState(result);
  },[]);
  useEffect(()=>{
    let live=true;
    supabase.auth.getSession().then(({data})=>{if(live){setSession(data.session);setReady(true);}});
    const {data:{subscription}}=supabase.auth.onAuthStateChange((_event,next)=>{if(live)setSession(next);});
    return()=>{live=false;subscription.unsubscribe();};
  },[]);
  useEffect(()=>{
    if(!session){setState(null);setError('');return;}
    refreshState(session).catch(e=>setError(e.message));
  },[session,refreshState]);
  useEffect(()=>{
    const listener=(event)=>{
      if(event.origin!==window.location.origin||event.source!==frame.current?.contentWindow) return;
      if(event.data?.type==='dante-auth-request') frame.current?.contentWindow?.postMessage({type:'dante-auth-session',accessToken:session?.access_token||null,workspaceId:state?.workspaceAccess?.workspaceId||localStorage.getItem('dante-workspace-id')||null},window.location.origin);
      if(event.data?.type==='dante-workspace-select'&&event.data.workspaceId){localStorage.setItem('dante-workspace-id',event.data.workspaceId);if(session)refreshState(session).catch(e=>setError(e.message));}
      if(event.data?.type==='dante-workspace-updated' && session) refreshState(session).catch(e=>setError(e.message));
    };
    window.addEventListener('message',listener); return()=>window.removeEventListener('message',listener);
  },[session,refreshState,state]);
  useEffect(()=>{if(session&&state?.workspaceAccess?.workspaceId)frame.current?.contentWindow?.postMessage({type:'dante-auth-session',accessToken:session.access_token,workspaceId:state.workspaceAccess.workspaceId},window.location.origin);},[session,state]);
  if(!ready) return <main className="dante-loading">Loading Dante…</main>;
  if(!supabase) return <main className="dante-loading"><b>Deployment setup needed</b><p>Add the Supabase URL and publishable key to this Vercel project’s environment variables, then redeploy.</p></main>;
  if(!session) return <AuthForm/>;
  if(error) return <main className="dante-loading"><b>Workspace setup needed</b><p>{error}</p><p>Apply <code>supabase/schema.sql</code> and <code>supabase/round3_migration.sql</code> in the Supabase SQL Editor, then refresh. Set the server-only Supabase service role key in Vercel.</p><button className="dante-button secondary" onClick={()=>supabase.auth.signOut()}>Sign out</button></main>;
  return <main>
    <header className="dante-topbar"><div className="dante-topbrand"><span className="dante-mark">d.</span><span>Dante<small>brand intelligence</small></span></div><div className="dante-user-actions"><span className="dante-user-email">{session.user.email}</span><button className="dante-button secondary" onClick={()=>supabase.auth.signOut()}>Sign out</button></div></header>
    <Analytics state={state} range={range} setRange={setRange}/>
    <div className="dante-frame-shell"><iframe ref={frame} className="dante-frame" title="Dante review workspace" src="/index.html" onLoad={()=>frame.current?.contentWindow?.postMessage({type:'dante-auth-session',accessToken:session.access_token,workspaceId:state?.workspaceAccess?.workspaceId||localStorage.getItem('dante-workspace-id')||null},window.location.origin)}/></div>
  </main>;
}
