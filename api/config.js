import { cors } from './_lib.js';

// Expose uniquement la configuration PUBLIQUE (clé anon Supabase). Ne jamais y mettre de secret.
// L'adresse du projet se déduit de la clé anon (champ « ref ») : seule NEXT_PUBLIC_SUPABASE_ANON_KEY
// est nécessaire ; SUPABASE_URL reste prioritaire si elle est renseignée.
export function urlDepuisCle(key) {
  try {
    const p = JSON.parse(Buffer.from(String(key).split('.')[1].replace(/-/g, '+').replace(/_/g, '/'), 'base64').toString('utf8'));
    return /^[a-z0-9]{10,40}$/.test(p.ref || '') ? `https://${p.ref}.supabase.co` : '';
  } catch (_) { return ''; }
}

export default function handler(req, res) {
  if (!cors(req, res, 'GET, OPTIONS')) return;
  res.setHeader('Cache-Control', 'public, max-age=300');
  const supabaseKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || process.env.SUPABASE_ANON_KEY || '';
  res.status(200).json({
    supabaseUrl: process.env.SUPABASE_URL || urlDepuisCle(supabaseKey),
    supabaseKey
  });
}
