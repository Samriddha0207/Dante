(() => {
  const standalone = window.parent === window;
  const storageKey = 'dante-public-workspace-v1';
  const actor = 'Public demo reviewer';
  let memoryState;

  const now = () => new Date().toISOString();
  const event = (type, details, extra = {}) => ({ id: `evt-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`, type, actor, at: now(), details, ...extra });
  function seed() {
    const stamp = now();
    const source = { id:'pro-storage',title:'Pro plan storage',category:'Product fact',kind:'fact',guidance:'The Pro plan includes 100 GB of storage.',subject:'Pro plan',subjectTerms:['Pro','Pro plan'],attribute:'Storage capacity',attributeTerms:['storage','cloud storage','storage space','capacity','disk space'],value:100,unit:'GB',version:1,status:'approved',history:[{version:1,value:100,unit:'GB',approvedAt:stamp,approvedBy:actor}],updatedAt:stamp };
    const content = [
      { id:'launch-email',title:'Spring product launch email',channel:'Email',body:'Get more room with Pro. Every Pro plan includes 100 GB of secure cloud storage.',linkedSourceIds:[source.id],sourceVersions:{[source.id]:1},status:'current',createdAt:stamp,reviewedAt:stamp,finding:null },
      { id:'pricing-page',title:'Plans and pricing page',channel:'Website',body:'Choose Pro for 2 GB RAM and 100 GB of secure cloud storage.',linkedSourceIds:[source.id],sourceVersions:{[source.id]:1},status:'current',createdAt:stamp,reviewedAt:stamp,finding:null },
      { id:'comparison-faq',title:'Plan comparison FAQ',channel:'Website',body:'Pro storage may be 100 GB or 80 GB depending on the account.',linkedSourceIds:[source.id],sourceVersions:{[source.id]:1},status:'current',createdAt:stamp,reviewedAt:stamp,finding:null }
    ];
    return { schemaVersion:4,workspace:{name:'Chrollo',institution:'NSEC'},sources:[source],content,audit:[event('source_approved','Approved Pro plan storage at 100 GB as version 1.',{sourceId:source.id,sourceVersion:1}),...content.map(item=>event('content_linked',`Linked ${item.title} to Pro plan storage v1.`,{contentId:item.id,sourceId:source.id,sourceVersion:1}))] };
  }
  function load() {
    if (memoryState) return memoryState;
    try { const saved = localStorage.getItem(storageKey); if (saved) { memoryState = JSON.parse(saved); if (memoryState.schemaVersion === 4) return memoryState; } } catch {}
    memoryState = seed(); save(memoryState); return memoryState;
  }
  function save(state) { memoryState = state; try { localStorage.setItem(storageKey, JSON.stringify(state)); } catch {} }
  function error(message, status = 400) { return Object.assign(new Error(message), { status }); }
  function spans(text, match) {
    if (!match) return null;
    let start = Math.max(text.lastIndexOf('.', match.start - 1) + 1, text.lastIndexOf('\n', match.start - 1) + 1);
    let end = text.indexOf('.', match.end); if (end < 0) end = text.length;
    return { before:text.slice(start,match.start),claim:match.exact,after:text.slice(match.end,end) };
  }
  function analyze(text, source, target = source.value) {
    const re = /(\d+(?:\.\d+)?)\s*(GB|TB|MB)\b/gi, matches = [];
    for (const m of text.matchAll(re)) matches.push({ exact:m[0],value:Number(m[1]),unit:m[2].toUpperCase(),start:m.index,end:m.index+m[0].length });
    if (!matches.length) return { result:'missing',claim:null,candidates:[],evidence:null,expected:target };
    const lower = text.toLowerCase();
    const score = (m) => {
      const positions = ['storage','cloud','capacity','space'].map(word => lower.indexOf(word)).filter(i => i >= 0);
      return positions.length ? Math.min(...positions.map(i => Math.abs(i - m.start))) : m.start;
    };
    matches.sort((a,b) => score(a)-score(b));
    const chosen = matches[0];
    const valueGb = chosen.unit === 'TB' ? chosen.value*1000 : chosen.unit === 'MB' ? chosen.value/1000 : chosen.value;
    if (matches.length > 1 && /\b(?:or|either)\b/i.test(text.slice(chosen.end, matches[1].start))) return { result:'ambiguous',claim:null,candidates:matches.slice(0,2).map(m=>({exact:m.exact,value:m.value,unit:m.unit,evidence:spans(text,m)})),evidence:null,expected:target };
    const claim = { ...chosen, value:chosen.value };
    return { result:Math.abs(valueGb-target)<0.000001?'supported':'conflict',claim,candidates:[],evidence:spans(text,claim),expected:target };
  }
  function priority(channel) { const key=String(channel).toLowerCase(); return ['website','social','email'].includes(key)?{label:'High priority',score:90}:key==='sales deck'?{label:'Review soon',score:70}:{label:'Standard',score:40}; }
  function finding(analysis, source, item) {
    const p=priority(item.channel), conflict=analysis.result==='conflict';
    return { type:conflict?'Conflicts with approved fact':analysis.result==='ambiguous'?'Multiple possible claims':'Approved claim not found',result:analysis.result,oldValue:analysis.claim?.value??null,oldUnit:analysis.claim?.unit||source.unit,newValue:analysis.expected,newUnit:source.unit,sourceId:source.id,sourceTitle:source.title,sourceVersion:source.version,sourceVersionAtReview:item.sourceVersions?.[source.id]||source.version,evidenceText:conflict?`This content states ${analysis.claim.exact}; the approved ${source.attribute.toLowerCase()} is ${analysis.expected} ${source.unit}.`:`A reviewer should confirm this claim against ${source.title}.`,evidenceSpan:analysis.evidence,candidates:analysis.candidates,sourceEvidence:source.guidance,suggestedFix:'',priority:p.label,priorityScore:p.score,createdAt:now() };
  }
  function preview(state, source, value) {
    const linked=state.content.filter(item=>item.linkedSourceIds?.includes(source.id));
    const items=linked.map(item=>{const result=analyze(item.body,source,value),p=priority(item.channel);return {contentId:item.id,title:item.title,channel:item.channel,status:result.result,claim:result.claim?.exact||null,evidenceSpan:result.evidence,candidates:result.candidates,expected:value,currentValue:source.value,priority:p.label,priorityScore:p.score,evidenceText:result.result==='supported'?`This content already states ${result.claim.exact}, matching the proposed value.`:result.result==='conflict'?`This content states ${result.claim.exact}; the proposed source value is ${value} ${source.unit}.`:`A reviewer should check this content against the proposed source value.`};});
    return {sourceId:source.id,sourceTitle:source.title,current:source.value,proposed:value,unit:source.unit,currentVersion:source.version,linkedCount:linked.length,affected:items.filter(i=>i.status!=='supported'),unchanged:items.filter(i=>i.status==='supported'),items};
  }
  async function api(url, body) {
    const state=load();
    if (url==='/api/config') return {geminiConfigured:false,geminiModel:'disabled in public demo',supabaseConnected:false,persistence:'browser-local'};
    if (url==='/api/state') return state;
    if (url==='/api/reset') { const fresh=seed();save(fresh);return fresh; }
    if (url==='/api/source/preview') {
      const source=state.sources.find(s=>s.id===body.sourceId)||state.sources[0],value=Number(body.value);
      if (!Number.isFinite(value)||value<=0) throw error('Enter a positive approved value.');
      if (value===source.value) throw error('The proposed value is already approved.');
      return preview(state,source,value);
    }
    if (url==='/api/source/approve') {
      const source=state.sources.find(s=>s.id===body.sourceId)||state.sources[0],value=Number(body.value);
      if (!Number.isFinite(value)||value<=0) throw error('Enter a positive approved value.');
      if (value===source.value) throw error('That value is already approved.');
      if (Number(body.expectedVersion)!==source.version) throw error('This source changed after the preview. Reopen the preview to review the latest impact.',409);
      const prior=source.value;source.value=value;source.version+=1;source.updatedAt=now();source.guidance=`The Pro plan includes ${value} ${source.unit} of storage.`;source.history.push({version:source.version,value,unit:source.unit,approvedAt:source.updatedAt,approvedBy:actor});
      const impact=preview(state,source,value);state.audit.push(event('source_approved',`Approved ${source.title} change from ${prior} to ${value} ${source.unit} as v${source.version}, after reviewing impact on ${impact.linkedCount} linked items.`,{sourceId:source.id,sourceVersion:source.version,priorValue:prior,newValue:value,affectedCount:impact.affected.length}));
      for (const item of state.content.filter(row=>row.linkedSourceIds?.includes(source.id))) {const result=analyze(item.body,source,value);item.reviewedAt=now();item.latestCheck={result:result.result,sourceVersion:source.version,evidenceSpan:result.evidence,checkedAt:item.reviewedAt};if(result.result==='supported'){item.status=item.status==='exception'?'exception':'current';item.sourceVersions[source.id]=source.version;}else{item.status='needs_review';item.finding=finding(result,source,item);state.audit.push(event('finding_created',`${item.title} requires review: ${item.finding.type.toLowerCase()}.`,{contentId:item.id,sourceId:source.id,sourceVersion:source.version,priority:item.finding.priority}));}}
      save(state);return state;
    }
    if (url==='/api/review/resolve') {
      const item=state.content.find(i=>i.id===body.contentId);if(!item)throw error('Content item not found.',404);
      if(item.status!=='needs_review'||!item.finding)throw error('This item no longer needs a decision.',409);
      const source=state.sources.find(s=>s.id===item.finding.sourceId);
      if(body.action==='revise') {const text=String(body.revisedText||'').trim();if(!text)throw error('Review the revised content before saving it.');const checked=analyze(text,source,source.value);if(checked.result!=='supported')throw error('The revised content still conflicts with the source. Update the claim or record an exception with a reason.');item.body=text;item.status='current';item.sourceVersions[source.id]=source.version;item.reviewedAt=now();item.latestCheck={result:'supported',sourceVersion:source.version,evidenceSpan:checked.evidence,checkedAt:item.reviewedAt};item.finding={...item.finding,resolvedAs:'Revised and reviewed against approved source',resolvedAt:item.reviewedAt,resolvedBy:actor,resolutionNote:String(body.note||`Saved a revision and checked it against ${source.title} v${source.version}.`)};
      } else if(body.action==='exception') {const note=String(body.note||'').trim();if(!note)throw error('Add a reason before approving an exception.');item.status='exception';item.reviewedAt=now();item.finding={...item.finding,resolvedAs:'Approved exception',resolvedAt:item.reviewedAt,resolvedBy:actor,resolutionNote:note};}
      else throw error('Choose revise or exception.');
      state.audit.push(event('review_resolved',`${item.title}: ${item.finding.resolvedAs}. ${item.finding.resolutionNote}`,{contentId:item.id,sourceId:source.id,sourceVersion:source.version,action:body.action}));save(state);return state;
    }
    if (url==='/api/content/analyze') {
      const title=String(body.title||'').trim(),text=String(body.body||'').trim();if(!title||!text)throw error('Add a title and content to review.');
      const source=state.sources.find(s=>s.id===String(body.sourceId||'')&&s.status==='approved');if(!source)throw error('Choose an approved source this content relies on.');
      const stamp=now(),item={id:`content-${Date.now()}`,title:title.slice(0,140),channel:String(body.channel||'Web'),body:text.slice(0,12000),linkedSourceIds:[source.id],sourceVersions:{[source.id]:source.version},status:'current',createdAt:stamp,reviewedAt:stamp,finding:null,aiConsent:false};
      const checked=analyze(item.body,source);if(checked.result!=='supported'){item.status='needs_review';item.finding=finding(checked,source,item);}item.latestCheck={result:checked.result,sourceVersion:source.version,evidenceSpan:checked.evidence,checkedAt:stamp};state.content.unshift(item);state.audit.push(event('content_reviewed',`${title} checked against ${source.title} v${source.version}: ${checked.result}.`,{contentId:item.id,sourceId:source.id,sourceVersion:source.version,result:checked.result,priority:item.finding?.priority||'No review needed'}));if(item.finding)state.audit.push(event('finding_created',`${title} added to review queue: ${item.finding.type.toLowerCase()}.`,{contentId:item.id,sourceId:source.id,sourceVersion:source.version,priority:item.finding.priority}));save(state);return state;
    }
    if(url==='/api/sources/create') {const title=String(body.title||'').trim(),guidance=String(body.guidance||'').trim(),kind=['rule','term'].includes(body.kind)?body.kind:'';if(!title||!guidance||!kind)throw error('Add a title, source type, and approved wording.');const id=`source-${Date.now()}`;state.sources.push({id,title,category:kind==='rule'?'Brand rule':'Required term',kind,guidance,version:0,status:'pending',history:[],updatedAt:now()});state.audit.push(event('source_submitted',`Submitted ${title} for source approval.`,{sourceId:id,sourceKind:kind}));save(state);return state;}
    if(url==='/api/sources/approve') {const source=state.sources.find(s=>s.id===body.sourceId);if(!source)throw error('Source not found.',404);if(source.status!=='pending')throw error('This source is not awaiting approval.',409);source.status='approved';source.version=1;source.updatedAt=now();source.history.push({version:1,approvedAt:source.updatedAt,approvedBy:actor,guidance:source.guidance});state.audit.push(event('source_approved',`Approved ${source.title} as version 1.`,{sourceId:source.id,sourceVersion:1}));save(state);return state;}
    throw error('Demo API route not found.',404);
  }

  window.DanteDemo = { standalone, api };
  if (standalone) {
    const banner=document.createElement('div');banner.className='public-demo-banner';banner.textContent='Public interactive demo · no login · sample workspace saves in this browser';
    document.addEventListener('DOMContentLoaded',()=>document.body.prepend(banner),{once:true});
  }
})();
