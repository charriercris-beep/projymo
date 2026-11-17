// Lien de partage d'une annonce : /a/<numéro> (réécrit vers cette fonction par vercel.json).
// - Pour Facebook, WhatsApp, Messenger… : une page avec le titre, le prix, le lieu et la photo de
//   l'annonce (balises Open Graph), afin que le lien s'affiche avec un bel aperçu.
// - Pour la personne qui clique : redirection immédiate vers la fiche sur le site, en gardant la
//   provenance (?s=facebook) pour les statistiques du back office.
// - ?img=1 : la photo principale de l'annonce (servie comme image).
// Lecture seule, avec la clé publique : seules les annonces publiées sont visibles (règles de la base).
import { urlDepuisCle } from './config.js';
import { rateLimit } from './_lib.js';

const SOURCES = ['facebook', 'instagram', 'whatsapp', 'messenger', 'email', 'sms', 'lien'];
const E = s => String(s == null ? '' : s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const IMG = /^data:image\/(jpeg|png|webp);base64,([A-Za-z0-9+/=]+)$/;

async function lire(collection, id) {
  const key = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || process.env.SUPABASE_ANON_KEY || '';
  const base = process.env.SUPABASE_URL || urlDepuisCle(key);
  if (!key || !base) return null;
  const r = await fetch(`${base}/rest/v1/records?collection=eq.${collection}&id=eq.${id}&select=data&limit=1`,
    { headers: { apikey: key, Authorization: 'Bearer ' + key }, signal: AbortSignal.timeout(8000) });
  if (!r.ok) return null;
  const rows = await r.json();
  return rows && rows[0] ? rows[0].data : null;
}

export function page({ id, a, origine, s }) {
  const cible = `${origine}/immo360-global.html?bien=${id}${s ? '&utm_source=' + s : ''}`;
  if (!a) return { cible, html: `<!doctype html><html lang="fr"><head><meta charset="utf-8"><meta name="robots" content="noindex"><meta http-equiv="refresh" content="0; url=${E(origine)}/immo360-global.html"><title>Immo360 NC</title></head><body><p>Cette annonce n'est plus en ligne. <a href="${E(origine)}/immo360-global.html">Voir les annonces</a></p></body></html>` };
  const prix = Number(a.prix) > 0 ? new Intl.NumberFormat('fr-FR').format(Number(a.prix)) + ' F' : '';
  const lieu = [a.quartier, a.ville].filter(Boolean).filter((x, i, l) => l.indexOf(x) === i).join(', ');
  const titre = [String(a.titre || a.type || 'Bien à vendre').slice(0, 90), prix].filter(Boolean).join(' — ');
  const desc = [[a.type, Number(a.surface) > 0 ? a.surface + ' m²' : '', Number(a.pieces) > 0 ? a.pieces + ' pièces' : '', lieu].filter(Boolean).join(' · '),
    String(a.desc || '').replace(/\s+/g, ' ').slice(0, 160)].filter(Boolean).join('. ');
  const image = `${origine}/api/partage?id=${id}&img=1`;
  return { cible, html: `<!doctype html><html lang="fr"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1">
<title>${E(titre)} · Immo360 NC</title><meta name="description" content="${E(desc)}">
<meta property="og:type" content="website"><meta property="og:site_name" content="Immo360 NC"><meta property="og:locale" content="fr_FR">
<meta property="og:title" content="${E(titre)}"><meta property="og:description" content="${E(desc)}">
<meta property="og:url" content="${E(origine)}/a/${id}">${Number(a.nbPhotos) > 0 || a.thumb ? `<meta property="og:image" content="${E(image)}"><meta name="twitter:card" content="summary_large_image">` : ''}
<link rel="canonical" href="${E(origine)}/a/${id}"><meta http-equiv="refresh" content="0; url=${E(cible)}">
</head><body><p><a href="${E(cible)}">${E(titre)}</a> — voir l'annonce sur Immo360 NC</p></body></html>` };
}

export default async function handler(req, res) {
  if (req.method !== 'GET' && req.method !== 'HEAD') return res.status(405).end();
  if (!rateLimit(req, res, { max: 60, key: 'partage' })) return;
  const id = String((req.query || {}).id || '');
  const hote = String(req.headers['x-forwarded-host'] || req.headers.host || '360immo.nc').replace(/[^a-z0-9.:-]/gi, '');
  const origine = 'https://' + hote;
  if (!/^\d{1,20}$/.test(id)) { res.setHeader('Location', origine + '/immo360-global.html'); return res.status(302).end(); }
  const s = SOURCES.includes((req.query || {}).s) ? req.query.s : '';

  try {
    if (req.query.img) {
      const ph = await lire('annonce_photos', id);
      let src = ph && ph.publie !== false && Array.isArray(ph.photos) ? ph.photos[0] : null;
      if (!IMG.test(src || '')) { const a = await lire('annonce', id); src = a && a.publie === true ? a.thumb : null; }
      const m = IMG.exec(src || '');
      if (!m) return res.status(404).end();
      res.setHeader('Content-Type', 'image/' + m[1]); res.setHeader('Cache-Control', 'public, max-age=3600');
      return res.status(200).send(Buffer.from(m[2], 'base64'));
    }
    const a = await lire('annonce', id);
    const p = page({ id, a: a && a.publie === true ? a : null, origine, s });
    res.setHeader('Content-Type', 'text/html; charset=utf-8'); res.setHeader('Cache-Control', 'public, max-age=300');
    res.status(200).send(p.html);
  } catch (_) { res.setHeader('Location', `${origine}/immo360-global.html?bien=${id}`); res.status(302).end(); }
}
