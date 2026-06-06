export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  if(req.method === 'OPTIONS') return res.status(200).end();
  if(req.method !== 'POST') return res.status(405).json({error:'Method not allowed'});

  const { titre, surface, prix, desc, ton, plateforme, devise, pays, ville } = req.body || {};

  const tonDescriptions = {
    'Luxe & prestige': 'luxueux, raffiné, vocabulaire haut de gamme',
    'Familial & chaleureux': 'chaleureux, proche, met en avant la vie de famille',
    'Investisseur': 'factuel, chiffré, met en avant le rendement locatif',
    'Moderne & dynamique': 'dynamique, court, moderne, cible les actifs'
  };

  const tonDesc = tonDescriptions[ton] || tonDescriptions['Luxe & prestige'];
  const prixNum = parseInt(prix) || 42500000;
  const prixFormate = new Intl.NumberFormat('fr-FR').format(prixNum) + ' ' + (devise || 'F');

  try {
    const apiKey = process.env.ANTHROPIC_API_KEY;
    if(!apiKey) return res.status(500).json({error: 'Clé API manquante'});

    const response = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': apiKey,
        'anthropic-version': '2023-06-01'
      },
      body: JSON.stringify({
        model: 'claude-opus-4-5',
        max_tokens: 800,
        messages: [{
          role: 'user',
          content: `Tu es expert en annonces immobilières pour la Nouvelle-Calédonie.

Rédige une annonce professionnelle :
- Titre : ${titre || 'Bien immobilier'}
- Surface : ${surface || 85} m²
- Prix : ${prixFormate}
- Ville : ${ville || 'Nouméa'}, ${pays || 'Nouvelle-Calédonie'}
- Description : ${desc || 'Beau bien en bon état'}
- Ton : ${tonDesc}
- Plateforme : ${plateforme || 'Multi-plateformes'}

Règles : 120-200 mots, commence directement par le texte, pas de titre, appel à l'action final.`
        }]
      })
    });

    if(!response.ok) {
      const errText = await response.text();
      return res.status(500).json({error: 'Anthropic error: ' + errText});
    }

    const data = await response.json();
    const annonce = data.content?.[0]?.text;

    if(!annonce) return res.status(500).json({error: 'Réponse vide de Claude'});

    return res.status(200).json({ annonce });

  } catch(err) {
    return res.status(500).json({ error: err.message });
  }
}
