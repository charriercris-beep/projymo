import { cors } from './_lib.js';

// Expose uniquement la configuration PUBLIQUE (clé anon Supabase). Ne jamais y mettre de secret.
export default function handler(req, res) {
  if (!cors(req, res, 'GET, OPTIONS')) return;
  res.setHeader('Cache-Control', 'public, max-age=300');
  res.status(200).json({
    supabaseUrl: process.env.SUPABASE_URL || '',
    supabaseKey: process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || process.env.SUPABASE_ANON_KEY || ''
  });
}
