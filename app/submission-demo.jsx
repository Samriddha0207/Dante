'use client';

import { useState } from 'react';

const initial = { stage: 'synced', sourceValue: 100, contentValue: 100, version: 1, note: '' };

export default function SubmissionDemo() {
  const [demo, setDemo] = useState(initial);
  const update = (patch) => setDemo((current) => ({ ...current, ...patch }));
  const reviewed = demo.stage === 'review' || demo.stage === 'exception-note';
  const status = demo.stage === 'review' || demo.stage === 'exception-note' ? 'Needs review' : demo.stage === 'exception' ? 'Exception recorded' : 'In sync';

  return <section className="submission-demo" id="demo" aria-labelledby="submission-demo-title">
    <div className="submission-demo-heading"><div><div className="submission-eyebrow"><span /> INTERACTIVE PROTOTYPE</div><h2 id="submission-demo-title">Try a source change.</h2><p>Run the review loop with sample product copy. You can reset and replay it anytime.</p></div><span className="submission-demo-note">Sample data · no sign-in</span></div>
    <div className="submission-demo-grid">
      <article className="submission-demo-card">
        <div className="submission-demo-card-head"><div><small>APPROVED SOURCE</small><h3>Pro plan storage</h3></div><span className="submission-demo-version">VERSION {demo.version}</span></div>
        <div className="submission-demo-fact"><span>Current approved value</span><b>{demo.sourceValue} GB</b></div>
        {demo.stage === 'preview' && <div className="submission-demo-preview"><span>PROPOSED CHANGE</span><b>100 GB <i>→</i> 200 GB</b><p>One linked content claim would need a human review.</p></div>}
        {demo.stage === 'synced' && <p className="submission-demo-description">This approved fact is linked to the website pricing copy.</p>}
        {demo.stage === 'preview' && <div className="submission-demo-actions"><button className="submission-demo-button secondary" onClick={() => update({ stage: 'synced' })}>Cancel</button><button className="submission-demo-button" onClick={() => update({ stage: 'review', sourceValue: 200, version: 2 })}>Approve source update</button></div>}
        {demo.stage === 'synced' && <button className="submission-demo-button" onClick={() => update({ stage: 'preview' })}>Propose 200 GB update <span aria-hidden="true">→</span></button>}
        <div className="submission-demo-history"><span>v1 · 100 GB</span><span className={demo.version === 2 ? 'active' : ''}>{demo.version === 2 ? 'v2 · 200 GB · Approved now' : 'Next source version appears here'}</span></div>
      </article>

      <article className="submission-demo-card content">
        <div className="submission-demo-card-head"><div><small>LINKED CONTENT</small><h3>Website pricing page</h3></div><span className={`submission-demo-status ${reviewed ? 'review' : demo.stage === 'exception' ? 'exception' : ''}`}>{status}</span></div>
        <blockquote>“Our Pro plan includes <mark className={reviewed ? 'highlight' : ''}>{demo.contentValue} GB</mark> of storage.”</blockquote>
        {reviewed && <div className="submission-demo-evidence"><b>WHY IT NEEDS REVIEW</b><p>Content says {demo.contentValue} GB; approved source v{demo.version} says {demo.sourceValue} GB.</p><span>Source: Pro plan storage · version {demo.version}</span></div>}
        {demo.stage === 'review' && <div className="submission-demo-actions"><button className="submission-demo-button" onClick={() => update({ stage: 'resolved', contentValue: 200 })}>Revise to 200 GB</button><button className="submission-demo-button secondary" onClick={() => update({ stage: 'exception-note' })}>Approve exception</button></div>}
        {demo.stage === 'exception-note' && <div className="submission-demo-exception"><label htmlFor="submission-exception-note">Why should this claim remain?</label><textarea id="submission-exception-note" value={demo.note} onChange={(event) => update({ note: event.target.value })} placeholder="Add a short reviewer note" rows="2"/><button className="submission-demo-button secondary" disabled={!demo.note.trim()} onClick={() => update({ stage: 'exception' })}>Record exception</button></div>}
        {demo.stage === 'resolved' && <p className="submission-demo-outcome"><b>Revision verified.</b> The claim now matches approved source v{demo.version}.</p>}
        {demo.stage === 'exception' && <p className="submission-demo-outcome"><b>Exception recorded.</b> Reviewer note: {demo.note}</p>}
        {(demo.stage === 'resolved' || demo.stage === 'exception') && <button className="submission-demo-reset" onClick={() => setDemo(initial)}>Reset and replay</button>}
        {demo.stage === 'synced' && <p className="submission-demo-description">Claim: {demo.contentValue} GB · linked to approved source v{demo.version}</p>}
      </article>
    </div>
    <p className="submission-demo-disclaimer" aria-live="polite">{demo.stage === 'synced' ? 'Start by proposing a change to the approved fact.' : demo.stage === 'preview' ? 'Review the impact preview before approving a new source version.' : demo.stage === 'review' || demo.stage === 'exception-note' ? 'The claim is flagged with its source evidence. Choose how a reviewer should resolve it.' : 'Demo complete. Reset to try the workflow again.'}</p>
  </section>;
}
