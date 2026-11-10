import { cors, rateLimit, validImage, str, num, extractJson, callClaude, fail } from './_lib.js';

// Estimation d'un bien à partir de ses caractéristiques et (optionnellement) de photos.
export default async function handler(req, res) {
  if (!cors(req, res)) return;
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });
  if (!rateLimit(req, res, { max: 5, key: 'estimate' })) return;

  const b = req.body || {};
  const typeBien = str(b.typeBien, 40, 'appartement');
  const quartier = str(b.quartier, 60, 'Nouméa');
  const annee = str(b.annee, 10, '2000');
  const surface = num(b.surface, 80, 5, 5000);
  const pm2 = num(b.pm2, 340000, 10000, 5_000_000);
  const equipements = (Array.isArray(b.equipements) ? b.equipements : []).slice(0, 20).map(e => str(e, 80)).join(', ') || 'aucun déclaré';
  const images = (Array.isArray(b.images) ? b.images : []).slice(0, 6);
  if (!images.every(i => validImage(i?.data, i?.mediaType))) return res.status(400).json({ error: 'Photo invalide ou trop volumineuse' });

  const vb = Math.round(pm2 * surface * 0.88), vc = Math.round(pm2 * surface), vh = Math.round(pm2 * surface * 1.12);
  const prompt = `Tu es expert immobilier en Nouvelle-Calédonie. Analyse ${images.length ? 'ces photos' : 'les caractéristiques'} d'un ${typeBien} de ${surface} m² à ${quartier} (${annee}). Prix marché: ${pm2} F/m². Équipements: ${equipements}.
Réponds UNIQUEMENT en JSON: {"score_global":84,"scores":{"marche":85,"presentation":72,"etat_general":88,"attractivite":79,"luminosite":82,"entretien":78},"valeur_basse":${vb},"valeur_centrale":${vc},"valeur_haute":${vh},"positionnement":"texte position marché","positionnement_pct":68,"points_forts":["f1","f2","f3"],"points_faibles":["w1","w2"],"recommandations":[{"piece":"Nom","score_actuel":65,"actions":["action1","action2"],"cout_xpf":150000,"gain_xpf":800000,"roi":5.3}],"potentiel_total_xpf":3200000}`;

  try {
    const content = [
      ...images.map(i => ({ type: 'image', source: { type: 'base64', media_type: i.mediaType || 'image/jpeg', data: i.data } })),
      { type: 'text', text: prompt }
    ];
    const parsed = extractJson(await callClaude({ content, effort: 'medium' }));
    if (!parsed) return res.status(502).json({ error: 'Réponse IA illisible' });
    res.status(200).json(parsed);
  } catch (err) { fail(res, err); }
}
