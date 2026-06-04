export default async function handler(req, res) {
  if(req.method !== 'POST') return res.status(405).json({error:'Method not allowed'});

  const { titre, surface, prix, desc, ton, plateforme, devise, pays, ville } = req.body;

  const tonDescriptions = {
    'Luxe & prestige': 'luxueux, raffiné, vocabulaire haut de gamme, met en valeur les prestations exceptionnelles',
    'Familial & chaleureux': 'chaleureux, proche, met en avant la vie de famille, le confort et le quartier',
    'Investisseur': 'factuel, chiffré, met en avant le rendement, la rentabilité et le potentiel locatif',
    'Moderne & dynamique': 'dynamique, court, moderne, cible les actifs et jeunes professionnels'
  };

  const tonDesc = tonDescriptions[ton] || tonDescriptions['Luxe & prestige'];
  const prixFormate = new Intl.NumberFormat('fr-FR').format(prix) + ' ' + (devise || 'F');

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
        max_tokens: 800,
        messages: [{
          role: 'user',
          content: `Tu es un expert en rédaction d'annonces immobilières pour la Nouvelle-Calédonie.

Rédige une annonce immobilière professionnelle avec ces informations :
- Titre souhaité : ${titre}
- Surface : ${surface} m²
- Prix : ${prixFormate}
- Ville : ${ville || 'Nouméa'}, ${pays || 'Nouvelle-Calédonie'}
- Description du vendeur : ${desc || 'Bien en bon état'}
- Ton souhaité : ${tonDesc}
- Plateforme cible : ${plateforme || 'Multi-plateformes'}

Règles :
- Commence directement par le texte de l'annonce, sans titre ni préambule
- Entre 120 et 200 mots
- Inclus les points forts du bien
- Termine par un appel à l'action adapté au marché NC
- N'invente pas de caractéristiques qui ne sont pas mentionnées
- Utilise le franc CFP (F) pour les prix si en NC`
        }]
      })

    });

    const data = await response.json();
    const annonce = data.content?.[0]?.text || 'Erreur de génération.';

    res.status(200).json({ annonce });

  } catch(err) {
    console.error('Generate error:', err);
    res.status(500).json({ error: err.message });
  }
}
