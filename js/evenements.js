/* Immo360 NC — Journal d'événements ANONYMES (pour les entonnoirs du back office)
 * Envoyé : le nom de l'action (liste fermée), le profil (vendeur, acheteur… ou « visiteur ») et le type
 * d'appareil. Jamais : identité, compte, email, adresse IP, contenu saisi, annonce consultée.
 * Certaines actions ne comptent qu'une fois par onglet (visite, estimation, dépôt commencé).
 * Rien n'est envoyé en démonstration hors ligne ni si la base n'est pas configurée.
 * Chargé en dernier : enveloppe quelques fonctions de l'application.
 */
(function () {
  'use strict';

  const UNE_FOIS = ['visite', 'estimation', 'depot_debut'];
  const PROFILS = ['sell', 'buy', 'agt', 'art', 'bnk', 'not', 'diag', 'geo', 'ass'];
  const vus = () => { try { return JSON.parse(sessionStorage.getItem('immo360.evt') || '[]'); } catch (_) { return []; } };
  let file = [], dernier = {};

  function client() { return (typeof sb !== 'undefined' && sb) ? sb : null; }
  function track(nom) { try { track0(nom); } catch (_) { /* ignoré */ } }
  function track0(nom) {
    if (UNE_FOIS.includes(nom)) { const v = vus(); if (v.includes(nom)) return; v.push(nom); try { sessionStorage.setItem('immo360.evt', JSON.stringify(v)); } catch (_) { /* ignoré */ } }
    const now = Date.now(); if (dernier[nom] && now - dernier[nom] < 3000) return; dernier[nom] = now; // pas de rafales (double clic…)
    const loggedIn = typeof APP_STATE !== 'undefined' && APP_STATE.loggedIn;
    const profil = loggedIn && typeof S !== 'undefined' && PROFILS.includes(S.profile) ? S.profile : 'visiteur';
    const appareil = (window.matchMedia && matchMedia('(max-width: 760px)').matches) ? 'mobile' : 'ordinateur';
    file.push({ nom, profil, appareil }); if (file.length > 50) file.shift(); envoyer();
  }
  // La base peut ne pas être prête au premier événement (configuration chargée en différé) : on garde en file
  function envoyer() {
    const c = client(); if (!c || !file.length) return;
    const lot = file.splice(0);
    // la mesure ne doit jamais perturber l'action de l'utilisateur : toute erreur est ignorée
    try { const p = c.from('evenements').insert(lot); if (p && p.then) p.then(() => {}, () => {}); } catch (_) { /* ignoré */ }
  }
  setInterval(envoyer, 4000);

  /* ---------- Branchements ---------- */
  function wrap(name, test) {
    const f = window[name]; if (typeof f !== 'function') return;
    window[name] = function () { const r = f.apply(this, arguments); try { test.apply(this, [r].concat([].slice.call(arguments))); } catch (_) { /* ignoré */ } return r; };
  }
  wrap('openLandingBien', () => track('fiche_vue'));
  wrap('contactVendeur', () => track('contact_vendeur'));
  wrap('contactFromLanding', () => track('contact_vendeur'));
  wrap('planifierVisite', () => track('demande_visite'));
  wrap('simulerFinancement', () => track('simulation_financement'));
  wrap('simulerFinancementPublic', () => track('simulation_financement'));
  wrap('lpQuick', () => track('recherche'));
  wrap('goDepotStep', (r, n) => { if (n === 2) track('depot_debut'); });
  if (window.IMMO_CARDS && IMMO_CARDS.fav) { const f0 = IMMO_CARDS.fav; IMMO_CARDS.fav = function () { const on = f0.apply(this, arguments); if (on) track('favori'); return on; }; }
  if (window.IMMO_OPT && IMMO_OPT.order) { const o0 = IMMO_OPT.order; IMMO_OPT.order = async function () { const r = await o0.apply(this, arguments); if (r && r.ok) track('option_commande'); return r; }; }
  // Recherche depuis le bandeau de l'accueil
  document.addEventListener('click', e => { if (e.target.closest && e.target.closest('.lp-search .go')) track('recherche'); }, true);

  window.IMMO_EVT = { track };
  track('visite');
})();
