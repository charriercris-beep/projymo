// Utilitaires partagés des fonctions serverless (le préfixe "_" empêche Vercel d'en faire un endpoint).

import Anthropic from '@anthropic-ai/sdk';

export const MODEL = process.env.ANTHROPIC_MODEL || 'claude-opus-5-5';
// Modèles qui acceptent la reprise automatique côté serveur en cas de refus (paramètre « fallbacks »)
const AVEC_REPRISE = ['claude-opus-5-5', 'claude-opus-5', 'claude-fable-5-2', 'claude-fable-5-1', 'claude-sonnet-5-5'];
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

// Appel à Claude via le kit officiel (@anthropic-ai/sdk).
// - Le modèle réfléchit avant de répondre : la réponse contient alors un bloc « thinking » avant le texte.
//   On assemble donc les blocs de type « text » (l'ancienne version lisait le premier bloc : texte vide).
// - max_tokens large : la réflexion compte dans la limite ; seul ce qui est généré est facturé.
// - effort : « low » pour la rédaction, « medium » pour les analyses.
let client = null;
export async function callClaude({ content, effort = 'medium' }) {
  if (!process.env.ANTHROPIC_API_KEY) { const e = new Error('Clé API manquante côté serveur (ANTHROPIC_API_KEY)'); e.status = 500; throw e; }
  client ||= new Anthropic();
  const params = { model: MODEL, max_tokens: 16000, output_config: { effort }, messages: [{ role: 'user', content }] };
  if (AVEC_REPRISE.includes(MODEL)) Object.assign(params, { betas: ['server-side-fallback-2026-07-01'], fallbacks: 'default' });
  let r;
  try {
    r = AVEC_REPRISE.includes(MODEL) ? await client.beta.messages.create(params) : await client.messages.create(params);
  } catch (err) {
    console.error('Anthropic', err?.status, err?.message);
    let e;
    if (err instanceof Anthropic.AuthenticationError) e = new Error('Clé API invalide côté serveur');
    else if (err instanceof Anthropic.RateLimitError) e = new Error('Trop de demandes au service IA, réessayez dans une minute.');
    else if (err instanceof Anthropic.BadRequestError) e = new Error('Demande refusée par le service IA');
    else e = new Error('Le service IA est momentanément indisponible');
    e.status = err instanceof Anthropic.RateLimitError ? 429 : 502; throw e;
  }
  if (r.stop_reason === 'refusal') { const e = new Error('Le service IA n\'a pas pu traiter cette demande.'); e.status = 422; throw e; }
  return (r.content || []).filter(bk => bk.type === 'text').map(bk => bk.text).join('').trim();
}

export function fail(res, err) {
  console.error(err);
  res.status(err.status || 500).json({ error: err.status ? err.message : 'Erreur interne' });
}
