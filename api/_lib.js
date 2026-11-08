// Utilitaires partagés des fonctions serverless (le préfixe "_" empêche Vercel d'en faire un endpoint).

export const MODEL = process.env.ANTHROPIC_MODEL || 'claude-sonnet-5-5';
const ALLOWED_MEDIA = ['image/jpeg', 'image/png', 'image/webp', 'image/gif'];
const MAX_IMAGE_B64 = 5 * 1024 * 1024; // ~3,7 Mo d'image binaire par photo

// Limiteur de débit en mémoire (par instance serverless : protection de base, pas absolue).
const hits = new Map();
export function rateLimit(req, res, { max = 10, windowMs = 60_000, key = 'default' } = {}) {
  const ip = String(req.headers['x-forwarded-for'] || req.socket?.remoteAddress || 'unknown').split(',')[0].trim();
  const k = key + ':' + ip;
  const now = Date.now();
  const arr = (hits.get(k) || []).filter(t => now - t < windowMs);
  if (arr.length >= max) {
    res.setHeader('Retry-After', Math.ceil(windowMs / 1000));
    res.status(429).json({ error: 'Trop de requêtes, réessayez dans une minute.' });
    return false;
  }
  arr.push(now);
  hits.set(k, arr);
  if (hits.size > 5000) for (const [kk, v] of hits) if (!v.some(t => now - t < windowMs)) hits.delete(kk);
  return true;
}

// CORS : même origine par défaut ; ALLOWED_ORIGIN (liste séparée par des virgules) pour autoriser d'autres domaines.
export function cors(req, res, methods = 'POST, OPTIONS') {
  const origin = req.headers.origin;
  const allowed = (process.env.ALLOWED_ORIGIN || '').split(',').map(s => s.trim()).filter(Boolean);
  if (origin && allowed.includes(origin)) {
    res.setHeader('Access-Control-Allow-Origin', origin);
    res.setHeader('Vary', 'Origin');
  }
  res.setHeader('Access-Control-Allow-Methods', methods);
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  if (req.method === 'OPTIONS') { res.status(204).end(); return false; }
  return true;
}

export function validImage(data, mediaType) {
  return typeof data === 'string' && data.length > 0 && data.length <= MAX_IMAGE_B64
    && /^[A-Za-z0-9+/=]+$/.test(data) && ALLOWED_MEDIA.includes(mediaType || 'image/jpeg');
}

export const str = (v, max = 200, def = '') => (typeof v === 'string' ? v : v == null ? def : String(v)).replace(/[\u0000-\u001f]/g, ' ').slice(0, max);
export const num = (v, def, min = 0, max = 1e12) => { const n = Number(v); return Number.isFinite(n) ? Math.min(max, Math.max(min, n)) : def; };

export function extractJson(text) {
  try { return JSON.parse(text); } catch {}
  const m = String(text || '').match(/\{[\s\S]*\}/);
  if (m) { try { return JSON.parse(m[0]); } catch {} }
  return null;
}

export async function callClaude({ content, max_tokens }) {
  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) { const e = new Error('Clé API manquante côté serveur'); e.status = 500; throw e; }
  const r = await fetch('https://api.anthropic.com/v1/messages', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'x-api-key': apiKey, 'anthropic-version': '2023-06-01' },
    body: JSON.stringify({ model: MODEL, max_tokens, messages: [{ role: 'user', content }] })
  });
  if (!r.ok) {
    console.error('Anthropic error', r.status, await r.text().catch(() => ''));
    const e = new Error('Le service IA est momentanément indisponible'); e.status = 502; throw e;
  }
  const data = await r.json();
  return data.content?.[0]?.text || '';
}

export function fail(res, err) {
  console.error(err);
  res.status(err.status || 500).json({ error: err.status ? err.message : 'Erreur interne' });
}
