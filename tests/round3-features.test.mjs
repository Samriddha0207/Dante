import test from 'node:test';
import assert from 'node:assert/strict';
import { handleRequest, seedState } from '../server.mjs';

function blankPdf() {
  const objects = [
    '1 0 obj\n<< /Type /Catalog /Pages 2 0 R >>\nendobj\n',
    '2 0 obj\n<< /Type /Pages /Kids [3 0 R] /Count 1 >>\nendobj\n',
    '3 0 obj\n<< /Type /Page /Parent 2 0 R /MediaBox [0 0 612 792] /Resources << >> /Contents 4 0 R >>\nendobj\n',
    '4 0 obj\n<< /Length 0 >>\nstream\n\nendstream\nendobj\n'
  ];
  let pdf = '%PDF-1.4\n';
  const offsets = [0];
  for (const object of objects) {
    offsets.push(Buffer.byteLength(pdf));
    pdf += object;
  }
  const xref = Buffer.byteLength(pdf);
  pdf += `xref\n0 ${objects.length + 1}\n0000000000 65535 f \n`;
  pdf += offsets.slice(1).map(offset => `${String(offset).padStart(10, '0')} 00000 n \n`).join('');
  pdf += `trailer\n<< /Size ${objects.length + 1} /Root 1 0 R >>\nstartxref\n${xref}\n%%EOF`;
  return Buffer.from(pdf);
}

function makeAdapter(state = seedState(), role = 'admin', withStorage = false) {
  let current = structuredClone(state);
  const adapter = {
    role, actor: 'test@example.org', userId: 'user-test', userEmail: 'test@example.org', workspaceId: 'workspace-test',
    async load() { return structuredClone(current); },
    async save(next) { current = structuredClone(next); },
    read() { return structuredClone(current); }
  };
  if (withStorage) {
    adapter.service = { storage: { from: () => ({
      async upload() { return { error: null }; },
      async createSignedUrl() { return { data: { signedUrl: 'https://storage.example/signed-test' }, error: null }; }
    }) } };
  }
  return adapter;
}

async function apiRequest(path, { adapter, body, method = 'POST' }) {
  const payload = body === undefined ? '' : JSON.stringify(body);
  const req = {
    method, url: path, headers: { host: 'localhost' },
    async *[Symbol.asyncIterator]() { if (payload) yield payload; }
  };
  let status = 200;
  let text = '';
  const res = {
    writeHead(code) { status = code; return this; },
    end(value = '') { text = String(value); }
  };
  await handleRequest(req, res, adapter);
  return { status, body: text ? JSON.parse(text) : null };
}

test('exact product-fact conflict is saved with evidence and routed for review', async () => {
  const adapter = makeAdapter();
  const result = await apiRequest('/api/content/analyze', { adapter, body: {
    title: 'Pricing page', channel: 'Website', sourceId: 'pro-storage', language: 'en',
    body: 'The Pro plan includes 200 GB of cloud storage.', aiConsent: false
  } });
  assert.equal(result.status, 201);
  const item = result.body.content.find(row => row.title === 'Pricing page');
  assert.equal(item.status, 'needs_review');
  assert.equal(item.finding.result, 'conflict');
  assert.match(item.finding.evidenceText, /200 GB/);
});

test('scanned-PDF OCR requires consent, preserves page citations, and stays pending approval', async t => {
  const oldKey = process.env.GEMINI_API_KEY;
  const oldFetch = globalThis.fetch;
  process.env.GEMINI_API_KEY = 'test-only-key';
  let geminiCalls = 0;
  globalThis.fetch = async (_url, options) => {
    geminiCalls += 1;
    const request = JSON.parse(options.body);
    assert.equal(request.contents[0].parts[1].inline_data.mime_type, 'application/pdf');
    return { ok: true, async json() { return { candidates: [{ content: { parts: [{ text: JSON.stringify({ pages: [{ pageNumber: 1, text: 'El contenido debe ser claro para todas las personas.' }] }) }] } }] }; } };
  };
  t.after(() => { globalThis.fetch = oldFetch; if (oldKey === undefined) delete process.env.GEMINI_API_KEY; else process.env.GEMINI_API_KEY = oldKey; });

  const adapter = makeAdapter(seedState(), 'admin', true);
  const data = blankPdf().toString('base64');
  const blocked = await apiRequest('/api/documents/ingest', { adapter, body: { name: 'policy.pdf', data, language: 'es-MX', ocrConsent: false } });
  assert.equal(blocked.status, 409);
  assert.match(blocked.body.error, /has not been sent to Gemini/);
  assert.equal(geminiCalls, 0);

  const ingested = await apiRequest('/api/documents/ingest', { adapter, body: { name: 'policy.pdf', data, language: 'es-MX', ocrConsent: true } });
  assert.equal(ingested.status, 201);
  const doc = ingested.body.documents[0];
  assert.equal(doc.ocrUsed, true);
  assert.equal(doc.language, 'es-MX');
  assert.equal(doc.candidates[0].pageNumber, 1);
  assert.equal(doc.candidates[0].quote, 'El contenido debe ser claro para todas las personas.');
  assert.equal(doc.status, 'pending_review');
  assert.match(doc.extractionWarnings[0], /Verify every extracted quote/);
  assert.equal(geminiCalls, 1);

  const opened = await apiRequest('/api/documents/open-original', { adapter, body: { documentId: doc.id } });
  assert.equal(opened.status, 200);
  assert.equal(opened.body.expiresInSeconds, 60);
  assert.match(opened.body.url, /signed-test/);
});

test('only an admin can open the private original policy document', async () => {
  const state = seedState();
  state.documents = [{ id: 'doc-private', storagePath: 'workspace-test/policies/doc-private/policy.pdf' }];
  const adapter = makeAdapter(state, 'creator', true);
  const result = await apiRequest('/api/documents/open-original', { adapter, body: { documentId: 'doc-private' } });
  assert.equal(result.status, 403);
});

test('cross-language rule review uses normalized tags and verifies original-script quotes', async t => {
  const oldKey = process.env.GEMINI_API_KEY;
  const oldFetch = globalThis.fetch;
  process.env.GEMINI_API_KEY = 'test-only-key';
  let prompt = '';
  globalThis.fetch = async (_url, options) => {
    prompt = JSON.parse(options.body).contents[0].parts[0].text;
    return { ok: true, async json() { return { candidates: [{ content: { parts: [{ text: JSON.stringify({
      verdict: 'conflict', contentQuote: 'The product must not collect location data.', sourceQuote: 'El producto no debe recopilar datos de ubicación.', rationale: 'The draft removes the source prohibition.', suggestedFix: 'Keep the prohibition.'
    }) }] } }] }; } };
  };
  t.after(() => { globalThis.fetch = oldFetch; if (oldKey === undefined) delete process.env.GEMINI_API_KEY; else process.env.GEMINI_API_KEY = oldKey; });

  const state = seedState();
  state.sources.push({ id: 'rule-es', title: 'Location privacy', language: 'ES-mx', kind: 'rule', guidance: 'El producto no debe recopilar datos de ubicación.', version: 1, status: 'approved' });
  const adapter = makeAdapter(state);
  const result = await apiRequest('/api/content/analyze', { adapter, body: {
    title: 'English privacy notice', channel: 'Website', sourceId: 'rule-es', language: 'en-us',
    body: 'The product must not collect location data.', aiConsent: true
  } });
  assert.equal(result.status, 201);
  const item = result.body.content.find(row => row.title === 'English privacy notice');
  assert.equal(item.language, 'en-US');
  assert.equal(item.status, 'needs_review');
  assert.equal(item.finding.aiVerdict, 'conflict');
  assert.equal(item.finding.sourceEvidence, 'El producto no debe recopilar datos de ubicación.');
  assert.match(prompt, /es-MX/);
  assert.match(prompt, /en-US/);
  assert.match(prompt, /negation, obligation, exceptions, and idioms/);
});

test('persistent workspace reset is blocked even for an admin', async () => {
  const adapter = makeAdapter(seedState(), 'admin', true);
  const result = await apiRequest('/api/reset', { adapter, body: {} });
  assert.equal(result.status, 409);
});
