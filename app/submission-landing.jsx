import SubmissionDemo from './submission-demo';

const demoUrl = 'https://dante-blue.vercel.app/';

const steps = [
  ['01', 'Approve the source', 'Keep trusted product facts and brand rules in one reviewed library.'],
  ['02', 'Link the content', 'Connect drafts and published copy to the guidance they rely on.'],
  ['03', 'Review what changed', 'When a source changes, Dante surfaces affected claims with their evidence.'],
];

export default function SubmissionLanding() {
  return <main className="submission-page">
    <header className="submission-nav">
      <a className="submission-brand" href="#top" aria-label="Dante home"><span className="submission-mark">d.</span><span>Dante<small>BRAND INTELLIGENCE</small></span></a>
      <nav aria-label="Main navigation"><a href="#how-it-works">How it works</a><a href="#capabilities">Capabilities</a><a className="submission-nav-cta" href={demoUrl} target="_blank" rel="noreferrer">Open the live app <span aria-hidden="true">↗</span></a></nav>
    </header>

    <section className="submission-hero" id="top">
      <div className="submission-hero-copy">
        <div className="submission-eyebrow"><span /> BRAND GUIDANCE THAT STAYS CURRENT</div>
        <h1>When the facts change,<br /><em>your content should know.</em></h1>
        <p>Dante connects approved brand and product information to the content that uses it—then brings meaningful changes to a human reviewer.</p>
        <div className="submission-actions"><a className="submission-button" href="#demo">Try the interactive demo <span aria-hidden="true">→</span></a><a className="submission-text-link" href={demoUrl} target="_blank" rel="noreferrer">Open full app ↗</a></div>
        <div className="submission-proof"><span className="submission-proof-icon">✓</span> Evidence-linked review, with people making the final call</div>
      </div>

      <div className="submission-visual" aria-label="Illustration of Dante linking approved product facts to content review">
        <div className="submission-visual-top"><span>CHANGE IMPACT PREVIEW</span><span className="submission-live-dot">ILLUSTRATIVE EXAMPLE</span></div>
        <div className="submission-change"><div><small>APPROVED FACT</small><b>100 <i>GB</i></b><span>Pro plan storage · v1</span></div><span className="submission-arrow">→</span><div className="submission-change-next"><small>PROPOSED UPDATE</small><b>200 <i>GB</i></b><span>Review linked claims</span></div></div>
        <div className="submission-visual-divider"><span>LINKED CONTENT</span><span>REVIEW STATUS</span></div>
        <div className="submission-content-row"><div className="submission-doc-icon">Aa</div><div className="submission-doc-copy"><b>Website pricing page</b><span>“Includes 100 GB of storage”</span></div><span className="submission-review-pill">Needs review</span></div>
        <div className="submission-evidence"><span className="submission-evidence-mark">“</span><div><small>WHY IT WAS FLAGGED</small><p>The claim differs from the proposed approved fact. A reviewer checks the evidence and decides what happens next.</p></div></div>
        <div className="submission-visual-foot"><span className="submission-avatar">D</span><span>Decision stays with your team</span><span className="submission-foot-check">✓</span></div>
      </div>
    </section>

    <SubmissionDemo />

    <section className="submission-strip" aria-label="Dante workflow summary"><span>APPROVED SOURCES</span><b>→</b><span>LINKED CONTENT</span><b>→</b><span>EVIDENCE-LED REVIEW</span><b>→</b><span>HUMAN DECISION</span></section>

    <section className="submission-how" id="how-it-works">
      <div className="submission-section-heading"><div className="submission-eyebrow">A CLEAR PATH FROM FACT TO ACTION</div><h2>Make every change traceable.</h2><p>Dante helps teams understand what changed, which content may be affected, and where a person needs to review.</p></div>
      <div className="submission-steps">{steps.map(([number, title, description]) => <article className="submission-step" key={number}><span className="submission-step-number">{number}</span><h3>{title}</h3><p>{description}</p></article>)}</div>
    </section>

    <section className="submission-capabilities" id="capabilities">
      <div><div className="submission-eyebrow">BUILT FOR RESPONSIBLE CONTENT OPERATIONS</div><h2>Useful signals.<br /><em>Accountable decisions.</em></h2></div>
      <div className="submission-capability-list"><article><span>01</span><div><h3>Source library</h3><p>Keep approved facts, ownership, and version history together.</p></div></article><article><span>02</span><div><h3>Evidence-linked checks</h3><p>See the claim and the source behind a review finding.</p></div></article><article><span>03</span><div><h3>Human review workflow</h3><p>Revise, resolve, or document an exception with a clear audit trail.</p></div></article></div>
    </section>

    <footer className="submission-footer"><a className="submission-brand" href="#top"><span className="submission-mark">d.</span><span>Dante<small>BRAND INTELLIGENCE</small></span></a><span>From approved guidance to content people can trust.</span><a href={demoUrl} target="_blank" rel="noreferrer">Open the working app <span aria-hidden="true">↗</span></a></footer>
  </main>;
}
