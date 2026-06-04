export default async function handler(req, res) {
  if(req.method !== 'POST') return res.status(405).json({error:'Method not allowed'});

  const { image, mediaType, nbPhotos, context } = req.body;
  if(!image) return res.status(400).json({error:'No image provided'});

  try {
    const response = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': process.env.ANTHROPIC_API_KEY,
        'anthropic-version': '2023-06-01'
      },
      body: JSON.stringify({
        model: 'claude-opus-4-5',
        max_tokens: 1024,
        messages: [{
          role: 'user',
          content: [
            {
              type: 'image',
              source: { type: 'base64', media_type: mediaType || 'image/jpeg', data: image }
            },
            {
              type: 'text',
              text: `Tu es un expert immobilier en Nouvelle-Calédonie. Analyse cette photo de bien immobilier.
Contexte : type="${context?.type||'appartement'}", quartier="${context?.quartier||'Nouméa'}", état déclaré="${context?.etat||'bon'}".

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
}`
            }
          ]
        }]
      })

    });

    const data = await response.json();
    const text = data.content?.[0]?.text || '{}';

    let parsed;
    try {
      parsed = JSON.parse(text);
    } catch {
      const match = text.match(/\{[\s\S]*\}/);
      parsed = match ? JSON.parse(match[0]) : { score: 65, items: [], summary: text };
    }

    res.status(200).json(parsed);

  } catch(err) {
    console.error('Analyze error:', err);
    res.status(500).json({ error: err.message });
  }
}
