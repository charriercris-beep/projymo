/* Immo360 NC — Journal d'événements ANONYMES (pour les entonnoirs du back office)
 * Envoyé : le nom de l'action (liste fermée), le profil (vendeur, acheteur… ou « visiteur ») et le type
 * d'appareil ; pour la visite : un identifiant ALÉATOIRE du navigateur (visiteurs uniques, renouvelé au plus
 * tard après 13 mois), la provenance (Google, Facebook, direct…), la zone déduite du fuseau horaire
 * (Calédonie, Europe, autre) et « nouveau visiteur » ; pour une recherche : le type et la commune choisis
 * dans les listes du site ; pour une fiche : le numéro de l'annonce.
 * Présence en direct : chaque onglet ouvert et visible signale sa présence toutes les minutes.
 * Jamais : identité, compte, email, adresse IP, texte saisi.
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
  const alea = () => Array.from(crypto.getRandomValues(new Uint8Array(12)), b => 'abcdefghijklmnopqrstuvwxyz0123456789'[b % 36]).join('');
  // Identifiant aléatoire du navigateur (aucun lien avec la personne), renouvelé après 13 mois
  let nouveau = false;
  function visiteur() {
    try {
      const v = JSON.parse(localStorage.getItem('immo360.vid') || 'null');
      if (v && /^[a-z0-9]{12}$/.test(v.id) && Date.now() - v.t < 395 * 864e5) return v.id;
      const id = alea(); localStorage.setItem('immo360.vid', JSON.stringify({ id, t: Date.now() })); nouveau = true; return id;
    } catch (_) { return null; }
  }
  function source() {
    try {
      const u = new URLSearchParams(location.search).get('utm_source');
      const r = (u || (document.referrer ? new URL(document.referrer).hostname : '')).toLowerCase();
      if (!r || r === location.hostname) return 'direct';
      if (/google|bing|qwant|duckduckgo|ecosia|yahoo/.test(r)) return 'google';
      if (/facebook|fb\.|messenger/.test(r)) return 'facebook';
      if (/instagram/.test(r)) return 'instagram';
      if (/whatsapp|tiktok|linkedin|t\.co|twitter|x\.com|youtube|snapchat/.test(r)) return 'autre_reseau';
      return 'autre_site';
    } catch (_) { return null; }
  }
  function zone() {
    try { const tz = Intl.DateTimeFormat().resolvedOptions().timeZone || ''; return tz === 'Pacific/Noumea' ? 'nc' : /^Europe\//.test(tz) ? 'europe' : 'autre'; } catch (_) { return null; }
  }
  const propre = d => d == null ? null : String(d).replace(/[<>\u0000-\u001f]/g, '').slice(0, 60) || null;

  function client() { return (typeof sb !== 'undefined' && sb) ? sb : null; }
  function track(nom, detail) { try { track0(nom, detail); } catch (_) { /* ignoré */ } }
  function track0(nom, detail) {
    if (UNE_FOIS.includes(nom)) { const v = vus(); if (v.includes(nom)) return; v.push(nom); try { sessionStorage.setItem('immo360.evt', JSON.stringify(v)); } catch (_) { /* ignoré */ } }
    const now = Date.now(); if (dernier[nom] && now - dernier[nom] < 3000) return; dernier[nom] = now; // pas de rafales (double clic…)
    const loggedIn = typeof APP_STATE !== 'undefined' && APP_STATE.loggedIn;
    const profil = loggedIn && typeof S !== 'undefined' && PROFILS.includes(S.profile) ? S.profile : 'visiteur';
    const appareil = (window.matchMedia && matchMedia('(max-width: 760px)').matches) ? 'mobile' : 'ordinateur';
    const e = { nom, profil, appareil };
    if (nom === 'visite') Object.assign(e, { visiteur: visiteur(), source: source(), zone: zone(), nouveau });
    if (detail != null) e.detail = propre(detail);
    file.push(e); if (file.length > 50) file.shift(); envoyer();
  }
  // La base peut ne pas être prête au premier événement (configuration chargée en différé) : on garde en file
  function envoyer() {
    const c = client(); if (!c || !file.length) return;
    const lot = file.splice(0);
    // la mesure ne doit jamais perturber l'action de l'utilisateur : toute erreur est ignorée
    try { const p = c.from('evenements').insert(lot); if (p && p.then) p.then(() => {}, () => {}); } catch (_) { /* ignoré */ }
  }
  setInterval(envoyer, 4000);

  /* ---------- Présence en direct ---------- */
  let sid = null; try { sid = sessionStorage.getItem('immo360.sid'); if (!/^[a-z0-9]{12}$/.test(sid || '')) { sid = alea(); sessionStorage.setItem('immo360.sid', sid); } } catch (_) { sid = alea(); }
  // Page en cours : fiche d'un bien, accueil, ou rubrique de l'espace (clé technique, jamais de contenu)
  function pageEnCours() {
    if (document.querySelector('.fiche-ov')) return 'fiche';
    const l = document.getElementById('landing-page'); if (l && l.style.display !== 'none' && l.offsetParent !== null) return 'accueil';
    const p = document.querySelector('.panel.active'); const k = p && p.id ? p.id.replace(/^panel-/, '') : '';
    return /^[a-z0-9-]{1,30}$/.test(k) ? k : 'accueil';
  }
  let srcOnglet = null; try { srcOnglet = sessionStorage.getItem('immo360.src'); if (!srcOnglet) { srcOnglet = source(); sessionStorage.setItem('immo360.src', srcOnglet || ''); } } catch (_) { srcOnglet = source(); }
  let dernierPing = 0;
  function present() {
    const c = client(); if (!c || !c.rpc || document.visibilityState === 'hidden') return;
    dernierPing = Date.now();
    const loggedIn = typeof APP_STATE !== 'undefined' && APP_STATE.loggedIn;
    try {
      const p = c.rpc('presence_ping', { p_sid: sid, p_appareil: (window.matchMedia && matchMedia('(max-width: 760px)').matches) ? 'mobile' : 'ordinateur',
        p_page: pageEnCours(), p_zone: zone(), p_source: srcOnglet || null, p_profil: loggedIn && typeof S !== 'undefined' && PROFILS.includes(S.profile) ? S.profile : 'visiteur' });
      if (p && p.then) p.then(() => {}, () => {});
    } catch (_) { /* ignoré */ }
  }
  // Changement de page : signalé aussitôt (au plus une fois toutes les 5 secondes)
  const bouge = () => setTimeout(() => { if (Date.now() - dernierPing > 5000) present(); }, 300);
  setTimeout(present, 3000); setInterval(present, 60000);
  document.addEventListener('visibilitychange', () => { if (document.visibilityState === 'visible') present(); });

  /* ---------- Branchements ---------- */
  function wrap(name, test) {
    const f = window[name]; if (typeof f !== 'function') return;
    window[name] = function () { const r = f.apply(this, arguments); try { test.apply(this, [r].concat([].slice.call(arguments))); } catch (_) { /* ignoré */ } return r; };
  }
  wrap('go', bouge); wrap('showLanding', bouge);
  wrap('openLandingBien', (r, id) => { bouge(); track('fiche_vue', /^\d+$/.test(String(id)) ? String(id) : null); });
  wrap('contactVendeur', () => track('contact_vendeur'));
  wrap('contactFromLanding', () => track('contact_vendeur'));
  wrap('planifierVisite', () => track('demande_visite'));
  wrap('simulerFinancement', () => track('simulation_financement'));
  wrap('simulerFinancementPublic', () => track('simulation_financement'));
  wrap('lpQuick', (r, zone, type) => track('recherche', (type || '') + '|' + (zone || '')));
  wrap('goDepotStep', (r, n) => { if (n === 2) track('depot_debut'); });
  if (window.IMMO_CARDS && IMMO_CARDS.fav) { const f0 = IMMO_CARDS.fav; IMMO_CARDS.fav = function () { const on = f0.apply(this, arguments); if (on) track('favori'); return on; }; }
  if (window.IMMO_OPT && IMMO_OPT.order) { const o0 = IMMO_OPT.order; IMMO_OPT.order = async function () { const r = await o0.apply(this, arguments); if (r && r.ok) track('option_commande'); return r; }; }
  // Recherche depuis le bandeau de l'accueil
  document.addEventListener('click', e => { if (e.target.closest && e.target.closest('.lp-search .go')) { const v = id => (document.getElementById(id) || {}).value || ''; track('recherche', v('ld-type-simple') + '|' + v('ld-zone-simple')); } }, true);

  window.IMMO_EVT = { track };
  track('visite');
})();
