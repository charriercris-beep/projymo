import { cors, rateLimit, validImage, str, extractJson, callClaude, fail } from './_lib.js';

export default async function handler(req, res) {
  if (!cors(req, res)) return;
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });
  if (!rateLimit(req, res, { max: 10, key: 'analyze' })) return;

  const { image, mediaType, context } = req.body || {};
  if (!validImage(image, mediaType)) return res.status(400).json({ error: 'Image invalide ou trop volumineuse' });

  try {
    const text = await callClaude({
      max_tokens: 1024,
      content: [
        { type: 'image', source: { type: 'base64', media_type: mediaType || 'image/jpeg', data: image } },
        { type: 'text', text: `Tu es un expert immobilier en Nouvelle-Calédonie. Analyse cette photo de bien immobilier.
Contexte : type="${str(context?.type, 40, 'appartement')}", quartier="${str(context?.quartier, 60, 'Nouméa')}", état déclaré="${str(context?.etat, 40, 'bon')}".

Réponds UNIQUEMENT en JSON valide, sans texte avant ou après :
{
  "score": <nombre entre 0 et 100>,
  "items": [
    {"label": "Luminosité générale", "chip": "ai-ok|ai-warn|ai-bad", "val": "<observation courte>"},
    {"label": "État des murs", "chip": "ai-ok|ai-warn|ai-bad", "val": "<observation courte>"},
    {"label": "Sol / Revêtements", "chip": "ai-ok|ai-warn|ai-bad", "val": "<observation courte>"},
    {"label": "Cuisine", "chip": "ai-ok|ai-warn|ai-bad", "val": "<observation courte>"},
    {"label": "Salle de bain", "chip": "ai-ok|ai-warn|ai-bad", "val": "<observation courte>"},
    {"label": "Potentiel vente", "chip": "ai-ok|ai-warn|ai-bad", "val": "<observation courte>"}
  ],
  "summary": "<2-3 phrases résumant le bien et son potentiel de vente en NC>"
}` }
      ]
    });
    const parsed = extractJson(text);
    if (!parsed) return res.status(502).json({ error: "Réponse IA illisible" });
    res.status(200).json(parsed);
  } catch (err) { fail(res, err); }
}
