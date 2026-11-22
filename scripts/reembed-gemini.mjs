// Run from a trusted administrator environment. Never commit credentials.
import { createHash } from 'node:crypto';

const url = process.env.SUPABASE_URL;
const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
const geminiKey = process.env.GEMINI_API_KEY;
if (!url || !serviceKey || !geminiKey) throw new Error('Set SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY and GEMINI_API_KEY.');
const model = 'gemini-embedding-001';
const dbHeaders = { apikey: serviceKey, Authorization: `Bearer ${serviceKey}`, 'Content-Type': 'application/json' };
const hash = text => createHash('md5').update(text).digest('hex');
const sleep = ms => new Promise(resolve => setTimeout(resolve, ms));

async function request(url, options) {
  for (let attempt = 0; ; attempt++) {
    const response = await fetch(url, { ...options, signal: AbortSignal.timeout(60000) });
    if ([429, 500, 502, 503, 504].includes(response.status) && attempt < 5) {
      await response.body?.cancel();
      await sleep(Math.min(60000, 2000 * 2 ** attempt));
      continue;
    }
    if (!response.ok) throw new Error(`Request failed (${response.status}); checkpoint preserved. Check service logs.`);
    return response;
  }
}

let cursor = 0, completed = 0;
while (true) {
  const page = await (await request(`${url}/rest/v1/knowledge_chunks?select=id,content,embedding_gemini_content_hash&id=gt.${cursor}&order=id&limit=50`, { headers: dbHeaders })).json();
  if (!page.length) break;
  const pending = page.filter(row => row.embedding_gemini_content_hash !== hash(row.content));
  if (pending.length) {
    const data = await (await request(`https://generativelanguage.googleapis.com/v1beta/models/${model}:batchEmbedContents`, {
      method: 'POST', headers: { 'Content-Type': 'application/json', 'x-goog-api-key': geminiKey },
      body: JSON.stringify({ requests: pending.map(row => ({ model: `models/${model}`, content: { parts: [{ text: row.content }] }, taskType: 'RETRIEVAL_DOCUMENT', outputDimensionality: 768 })) }),
    })).json();
    if (data.embeddings?.length !== pending.length) throw new Error('Embedding count mismatch');
    for (let i = 0; i < pending.length; i++) {
      const row = pending[i], vector = data.embeddings[i].values;
      if (!Array.isArray(vector) || vector.length !== 768 || !vector.every(Number.isFinite) || !vector.some(x => x !== 0)) throw new Error('Invalid embedding');
      // Compare original content so a concurrent edit cannot receive a stale vector.
      const filter = new URLSearchParams({ id: `eq.${row.id}`, content: `eq.${row.content}` });
      const saved = await (await request(`${url}/rest/v1/knowledge_chunks?${filter}`, {
        method: 'PATCH', headers: { ...dbHeaders, Prefer: 'return=representation' },
        body: JSON.stringify({ embedding_gemini_768: vector, embedding_gemini_content_hash: hash(row.content) }),
      })).json();
      completed += saved.length;
    }
    console.log(`Updated ${completed} chunks`);
  }
  cursor = page.at(-1).id;
}
console.log('Re-embedding complete. Rerun to process newly added or edited chunks.');
