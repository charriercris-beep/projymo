import { rateLimit } from './_lib.js';
import { urlDepuisCle } from './config.js';

// Garde la base Supabase éveillée : en formule gratuite, un projet sans activité pendant 7 jours est mis
// en pause (le site retombe alors en mode démonstration). Vercel appelle cette adresse chaque jour
// (tâche planifiée « crons » de vercel.json) ; elle fait une petite lecture publique dans la base.
// Sert aussi de contrôle de santé : https://360immo.nc/api/ping
export default async function handler(req, res) {
  if (!rateLimit(req, res, { max: 20, key: 'ping' })) return;
  res.setHeader('Cache-Control', 'no-store');
  const key = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || process.env.SUPABASE_ANON_KEY || '';
  const url = process.env.SUPABASE_URL || urlDepuisCle(key);
  if (!key || !url) return res.status(200).json({ ok: false, base: 'non configurée' });
  const t0 = Date.now();
  try {
    const r = await fetch(`${url}/rest/v1/parametres?select=cle&limit=1`, {
      headers: { apikey: key, Authorization: `Bearer ${key}` },
      signal: AbortSignal.timeout(15000)
    });
    const ok = r.ok;
    res.status(ok ? 200 : 502).json({ ok, base: ok ? 'active' : 'erreur ' + r.status, ms: Date.now() - t0 });
  } catch (e) {
    res.status(502).json({ ok: false, base: 'injoignable (projet en pause ?)', ms: Date.now() - t0 });
  }
}
