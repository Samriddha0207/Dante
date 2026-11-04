'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { createClient } from '@supabase/supabase-js';
import {
  Bar, BarChart, CartesianGrid, Cell, Legend, Pie, PieChart, ResponsiveContainer,
  Tooltip, XAxis, YAxis
} from 'recharts';

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL || '',
  process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY || ''
);

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
      : await supabase.auth.signUp({ email, password });
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
  return {rows,status,channels};
}

function Analytics({state,range,setRange}) {
  const data=useMemo(()=>buildAnalytics(state,range),[state,range]);
  return <section className="dante-analytics" aria-label="Workspace analytics">
    <div className="dante-analytics-head"><div><h1>Workspace signals</h1><p>Activity and content status from this workspace’s saved review history.</p></div><div className="dante-range"><button aria-pressed={range===7} onClick={()=>setRange(7)}>7 days</button><button aria-pressed={range===30} onClick={()=>setRange(30)}>30 days</button></div></div>
    <div className="dante-chart-grid">
      <section className="dante-chart-card"><h2>Review activity</h2><p>Recorded checks, findings, and completed reviews</p><div className="dante-chart"><ResponsiveContainer width="100%" height="100%"><BarChart data={data.rows} margin={{top:8,right:8,left:-22,bottom:0}}><CartesianGrid stroke="#edf0ee" vertical={false}/><XAxis dataKey="day" tick={{fontSize:10,fill:'#7b8189'}} tickLine={false} axisLine={false} interval={range===30?4:0}/><YAxis allowDecimals={false} tick={{fontSize:10,fill:'#7b8189'}} tickLine={false} axisLine={false}/><Tooltip/><Legend wrapperStyle={{fontSize:10}}/><Bar dataKey="findings" name="Sent to review" stackId="activity" fill={CHART_COLORS.findings} radius={[2,2,0,0]}/><Bar dataKey="resolved" name="Resolved" stackId="activity" fill={CHART_COLORS.resolved}/><Bar dataKey="passed" name="Passed check" stackId="activity" fill={CHART_COLORS.passed}/></BarChart></ResponsiveContainer></div></section>
      <section className="dante-chart-card"><h2>Content status</h2><p>Current disposition of monitored items</p><div className="dante-chart"><ResponsiveContainer width="100%" height="100%"><PieChart><Pie data={data.status} dataKey="value" nameKey="name" innerRadius={48} outerRadius={72} paddingAngle={3}>{data.status.map(row=><Cell key={row.name} fill={row.color}/>)}</Pie><Tooltip/><Legend wrapperStyle={{fontSize:10}}/></PieChart></ResponsiveContainer></div></section>
      <section className="dante-chart-card"><h2>Content by channel</h2><p>Items currently linked to approved guidance</p><div className="dante-chart"><ResponsiveContainer width="100%" height="100%"><BarChart data={data.channels} layout="vertical" margin={{top:4,right:10,left:0,bottom:0}}><CartesianGrid stroke="#edf0ee" horizontal={false}/><XAxis type="number" allowDecimals={false} tick={{fontSize:10,fill:'#7b8189'}} tickLine={false} axisLine={false}/><YAxis type="category" dataKey="name" width={74} tick={{fontSize:10,fill:'#626974'}} tickLine={false} axisLine={false}/><Tooltip/><Bar dataKey="count" name="Content items" fill={CHART_COLORS.channel} radius={[0,4,4,0]}/></BarChart></ResponsiveContainer></div></section>
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
    const response=await fetch('/api/state',{headers:{Authorization:`Bearer ${current.access_token}`},cache:'no-store'});
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
      if(event.data?.type==='dante-auth-request') frame.current?.contentWindow?.postMessage({type:'dante-auth-session',accessToken:session?.access_token||null},window.location.origin);
      if(event.data?.type==='dante-workspace-updated' && session) refreshState(session).catch(e=>setError(e.message));
    };
    window.addEventListener('message',listener); return()=>window.removeEventListener('message',listener);
  },[session,refreshState]);
  if(!ready) return <main className="dante-loading">Loading Dante…</main>;
  if(!session) return <AuthForm/>;
  if(error) return <main className="dante-loading"><b>Workspace setup needed</b><p>{error}</p><p>Apply <code>supabase/schema.sql</code> in the Supabase SQL Editor, then refresh this page.</p><button className="dante-button secondary" onClick={()=>supabase.auth.signOut()}>Sign out</button></main>;
  return <main>
    <header className="dante-topbar"><div className="dante-topbrand"><span className="dante-mark">d.</span><span>Dante<small>brand intelligence</small></span></div><div className="dante-user-actions"><span className="dante-user-email">{session.user.email}</span><button className="dante-button secondary" onClick={()=>supabase.auth.signOut()}>Sign out</button></div></header>
    <Analytics state={state} range={range} setRange={setRange}/>
    <div className="dante-frame-shell"><iframe ref={frame} className="dante-frame" title="Dante review workspace" src="/index.html" onLoad={()=>frame.current?.contentWindow?.postMessage({type:'dante-auth-session',accessToken:session.access_token},window.location.origin)}/></div>
  </main>;
}
