/* Immo360 NC — Tarifs et monétisation : TOUT se règle ici.
 *
 * MODE (l'interrupteur) :
 *   'off'       → rien de payant n'apparaît : site entièrement gratuit (réglage actuel)
 *   'lancement' → options et abonnements visibles mais OFFERTS (pour habituer les utilisateurs)
 *   'payant'    → les prix s'appliquent : commandes « à régler », activées après paiement
 *
 * Les prix sont en francs CFP, TTC. Ce sont des propositions de départ, à fixer ensemble.
 * Le jour où le trafic est là : passer MODE à 'payant' (ou 'lancement'), vérifier les prix, publier.
 * Détails et procédure d'activation après paiement : docs/monetisation.md
 */
(function () {
  'use strict';

  const MODE_SITE = 'off';
  // Aperçu sans rien mettre en ligne : ajouter ?tarifs=payant (ou lancement, off) à l'adresse.
  // Sans risque : l'activation réelle d'une option ou d'un abonnement se fait uniquement côté base, après paiement.
  const MODE = (() => {
    try {
      const q = new URLSearchParams(location.search).get('tarifs');
      if (q && ['off', 'lancement', 'payant'].includes(q)) sessionStorage.setItem('immo360.tarifs.apercu', q);
      return sessionStorage.getItem('immo360.tarifs.apercu') || MODE_SITE;
    } catch (_) { return MODE_SITE; }
  })();

  /* ---------- Options d'annonce (particuliers et pros) ---------- */
  const OPTIONS = {
    urgent:     { nom: 'Bulle « Urgent »',              prix: 1500, jours: 30, desc: 'Pastille « Urgent » sur l\'annonce dans les listes et la fiche.' },
    negociable: { nom: 'Bulle « Prix négociable »',     prix: 1000, jours: 30, desc: 'Pastille « Négociable » : attire les acheteurs qui hésitent.' },
    remontee:   { nom: 'Remontée en tête de liste',      prix: 1200, jours: 1,  desc: 'Votre annonce repasse en premier, comme si elle venait d\'être publiée.' },
    remontee7:  { nom: 'Remontée quotidienne · 7 jours', prix: 4900, jours: 7,  desc: 'Repasse en tête de liste chaque jour pendant 7 jours.' },
    une:        { nom: 'À la une · 7 jours',             prix: 5900, jours: 7,  desc: 'Toujours affichée avant les autres annonces, avec la pastille « À la une ».' },
    couleur:    { nom: 'Annonce en couleur',             prix: 2000, jours: 30, desc: 'Carte encadrée aux couleurs du lagon : elle se détache dans la liste.' },
    portes:     { nom: 'Bulle « Portes ouvertes »',      prix: 1000, jours: 30, desc: 'Pastille avec la date de vos portes ouvertes.', date: true }
  };
  const PACKS = {
    express: { nom: 'Pack « Vente express » · 7 jours', prix: 9900, options: ['une', 'urgent', 'remontee7'], desc: 'À la une + Urgent + remontée chaque jour.' }
  };

  /* ---------- Abonnements des professionnels (prix par mois) ---------- */
  // limites : nombre maximum (Infinity = illimité) ; fonctions : accès aux fonctions avancées
  const ABONNEMENTS = {
    agt: [
      { id: 'decouverte', nom: 'Découverte', prix: 0,     limites: { annonces: 5 },        fonctions: [], desc: '5 annonces, fiches clients, rendez-vous.' },
      { id: 'pro',        nom: 'Agence',     prix: 19900, limites: { annonces: 30 },       fonctions: ['stats', 'logo', 'estimation_marque'], desc: '30 annonces, statistiques, logo de l\'agence, estimations à votre nom.', conseille: true },
      { id: 'premium',    nom: 'Agence+',    prix: 39900, limites: { annonces: Infinity }, fonctions: ['stats', 'logo', 'estimation_marque', 'une_mensuelle'], desc: 'Annonces illimitées + 2 annonces à la une chaque mois.' }
    ],
    art: [
      { id: 'decouverte', nom: 'Découverte', prix: 0,    limites: { demandes: 3 },        fonctions: [], desc: '3 demandes de devis par mois.' },
      { id: 'pro',        nom: 'Artisan',    prix: 6900, limites: { demandes: Infinity }, fonctions: ['badge_verifie', 'zones'], desc: 'Demandes illimitées dans vos zones, badge « Vérifié ».', conseille: true }
    ],
    bnk: [
      { id: 'decouverte', nom: 'Découverte', prix: 0,     limites: { dossiers: 2 },        fonctions: [], desc: '2 dossiers d\'acheteurs par mois.' },
      { id: 'pro',        nom: 'Partenaire', prix: 24900, limites: { dossiers: Infinity }, fonctions: ['baremes'], desc: 'Dossiers illimités, barèmes de votre établissement.', conseille: true }
    ],
    not:  [{ id: 'decouverte', nom: 'Gratuit', prix: 0, limites: {}, fonctions: [], desc: 'Espace notaire gratuit (aucune rémunération liée aux clients : règle déontologique).' }],
    diag: [
      { id: 'decouverte', nom: 'Découverte', prix: 0,    limites: { missions: 3 },        fonctions: [], desc: '3 missions par mois.' },
      { id: 'pro',        nom: 'Pro',        prix: 5900, limites: { missions: Infinity }, fonctions: [], desc: 'Missions illimitées dans vos zones.', conseille: true }
    ],
    geo: [
      { id: 'decouverte', nom: 'Découverte', prix: 0,    limites: { missions: 3 },        fonctions: [], desc: '3 missions par mois.' },
      { id: 'pro',        nom: 'Pro',        prix: 5900, limites: { missions: Infinity }, fonctions: [], desc: 'Missions illimitées dans vos zones.', conseille: true }
    ],
    ass: [
      { id: 'decouverte', nom: 'Découverte', prix: 0,     limites: { missions: 3 },        fonctions: [], desc: '3 demandes par mois.' },
      { id: 'pro',        nom: 'Partenaire', prix: 14900, limites: { missions: Infinity }, fonctions: [], desc: 'Demandes illimitées.', conseille: true }
    ]
  };
  const ESSAI_JOURS = 30; // période d'essai offerte à l'inscription d'un pro

  /* ---------- Services aux particuliers ---------- */
  const SERVICES = {
    rapport: { nom: 'Rapport d\'estimation détaillé', prix: 2900, desc: 'Document complet à télécharger : estimation, état, scénarios de travaux, comparaison.' },
    photos:  { nom: 'Photos professionnelles',        prix: 15000, desc: 'Un photographe partenaire vient chez vous (Grand Nouméa).' }
  };

  /* ---------- Outils ---------- */
  const fmt = n => n ? Math.round(n).toLocaleString('fr-FR') + ' F' : 'Gratuit';
  const actif = () => MODE !== 'off';               // la partie payante est-elle visible ?
  const offert = () => MODE === 'lancement';        // visible mais offerte
  const prixDe = n => (offert() ? 0 : n);
  function totalOptions(ids) {
    // si toutes les options d'un pack sont choisies, le prix du pack s'applique
    let t = 0; const rest = new Set(ids);
    Object.values(PACKS).forEach(p => { if (p.options.every(o => rest.has(o))) { t += p.prix; p.options.forEach(o => rest.delete(o)); } });
    rest.forEach(o => { t += (OPTIONS[o] ? OPTIONS[o].prix : 0); });
    return prixDe(t);
  }
  const plans = profil => ABONNEMENTS[profil] || [];

  window.IMMO_TARIFS = { MODE, OPTIONS, PACKS, ABONNEMENTS, ESSAI_JOURS, SERVICES, fmt, actif, offert, prixDe, totalOptions, plans };
})();
