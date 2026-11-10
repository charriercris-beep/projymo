/* Immo360 NC — Recherche en langage naturel (« F3 vue lagon à Nouméa, moins de 40 M, avec parking »)
 * 1. Lecture immédiate de la phrase dans le navigateur (règles simples) : résultats instantanés.
 * 2. L'IA (/api/recherche) affine les critères ; les résultats sont recalculés. Si elle ne répond pas,
 *    la lecture locale reste affichée : la recherche fonctionne toujours.
 * Le classement et les explications (« ✓ Vue lagon · ✓ 3 chambres · budget +6 % ») sont calculés ici, sur
 * les annonces réelles : rien n'est inventé. Alertes enregistrées sur cet appareil.
 */
(function () {
  'use strict';

  const $ = id => document.getElementById(id);
  const E = s => String(s == null ? '' : s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const sansAccent = s => String(s || '').normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase();
  const AKEY = 'immo360.alertes.v1';
  const lire = () => { try { return JSON.parse(localStorage.getItem(AKEY) || '[]'); } catch (_) { return []; } };
  const ecrire = v => { try { localStorage.setItem(AKEY, JSON.stringify(v.slice(0, 5))); } catch (_) { /* stockage indisponible */ } };
  const M = n => n >= 1e6 ? (Math.round(n / 1e5) / 10).toLocaleString('fr-FR') + ' M F' : Math.round(n).toLocaleString('fr-FR') + ' F';

  /* ---------- Prestations : comment les reconnaître dans une annonce ---------- */
  const PR = {
    'Vue mer': /vue (sur (la )?)?mer|vue ocean|vue mer/, 'Vue lagon': /lagon/, 'Vue dégagée': /vue degagee|degage|panorami/,
    'Plage à pied': /plage/, 'Quartier calme': /calme|au calme|paisible/, 'Commerces à pied': /commerce/, 'Écoles à proximité': /ecole|college|lycee/,
    'Terrasse': /terrasse/, 'Balcon': /balcon|loggia/, 'Jardin': /jardin|terrain arbore/, 'Piscine': /piscine/, 'Spa / jacuzzi': /\bspa\b|jacuzzi/,
    'Garage': /garage/, 'Parking': /parking|stationnement|abri voiture|carport|garage/, 'Climatisation': /clim/, 'Cuisine équipée': /cuisine (americaine )?equipee|cuisine haut de gamme|cuisine moderne/,
    'Meublé': /meubl/, 'Ascenseur': /ascenseur/, 'Résidence sécurisée': /securis|gardien|digicode/, 'Plain-pied': /plain[- ]pied/,
    'Rénové / récent': /renove|renovation|neuf|recent|construction 20[12]\d/, 'Investissement locatif': /rendement|locataire en place|investis/
  };
  // Mots de la recherche → prestation
  const MOTS = [
    [/vue (sur (la )?)?mer|vue ocean/, 'Vue mer'], [/lagon/, 'Vue lagon'], [/vue degagee|panoram/, 'Vue dégagée'], [/plage/, 'Plage à pied'],
    [/calme/, 'Quartier calme'], [/commerce/, 'Commerces à pied'], [/ecole/, 'Écoles à proximité'], [/terrasse/, 'Terrasse'], [/balcon/, 'Balcon'],
    [/jardin/, 'Jardin'], [/piscine/, 'Piscine'], [/\bspa\b|jacuzzi/, 'Spa / jacuzzi'], [/garage/, 'Garage'], [/parking|stationnement|place de voiture/, 'Parking'],
    [/clim/, 'Climatisation'], [/meubl/, 'Meublé'], [/ascenseur/, 'Ascenseur'], [/securis|gardien/, 'Résidence sécurisée'], [/plain[- ]pied/, 'Plain-pied'],
    [/renove|neuf|recent/, 'Rénové / récent'], [/investi|rendement|locatif/, 'Investissement locatif'], [/cuisine equipee/, 'Cuisine équipée']
  ];
  const TYPES = [[/\bappart/, 'Appartement'], [/\bmaison/, 'Maison'], [/\bvilla/, 'Villa'], [/\bstudio/, 'Studio'], [/\bterrain/, 'Terrain'], [/local commercial|\bcommerce\b|bureau/, 'Local commercial']];
  const ZONES = ['Nouméa', 'Anse Vata', 'Baie des Citrons', 'Val Plaisance', 'Tina', 'Faubourg Blanchot', 'Centre Ville', 'Motor Pool', 'Magenta', 'Ouémo', 'Trianon',
    'Montravel', 'Tuband', 'Rivière Salée', 'Vallée du Tir', 'Normandie', 'Ducos', 'Dumbéa sur Mer', 'Dumbéa', 'Koutio', 'Mont-Dore', 'Boulari', 'Païta',
    'Boulouparis', 'La Foa', 'Bourail', 'Koné', 'Koumac', 'Poindimié', 'Lifou', 'Maré', 'Ouvéa', 'Île des Pins'];

  /* ---------- 1. Lecture locale de la phrase ---------- */
  function lectureLocale(q) {
    const s = sansAccent(q);
    const c = { types: [], zones: [], budget_max: 0, budget_min: 0, surface_min: 0, chambres_min: 0, pieces_min: 0, prestations: [], obligatoires: [], mots_cles: [], resume: '' };
    TYPES.forEach(([re, t]) => { if (re.test(s) && !c.types.includes(t)) c.types.push(t); });
    if (!c.types.length && /\b[ft][1-6]\b/.test(s)) c.types.push('Appartement'); // « F3 » seul : appartement
    // zones : la plus précise d'abord (« Dumbéa sur Mer » avant « Dumbéa »)
    ZONES.slice().sort((a, b) => b.length - a.length).forEach(z => { const zz = sansAccent(z); if (s.includes(zz) && !c.zones.some(x => sansAccent(x).includes(zz))) c.zones.push(z); });
    if (/noumea sud/.test(s)) c.zones = ['Anse Vata', 'Baie des Citrons', 'Val Plaisance', 'Tina'];
    const montant = t => { const m = t.match(/(\d+(?:[.,]\d+)?)\s*(m\b|millions?|mf|m\s*f|k\b|000\b)?/); if (!m) return 0; let n = parseFloat(m[1].replace(',', '.')); if (/^m|^mf/.test(m[2] || '') || /million/.test(m[2] || '') || n < 1000) n *= 1e6; else if (m[2] === 'k') n *= 1000; return Math.round(n); };
    let m = s.match(/(?:moins de|max(?:imum)?|jusqu'?a|budget(?: de)?|pas plus de|<)\s*([\d.,]+\s*(?:m\b|millions?|mf|m\s*f)?)/);
    if (m) c.budget_max = montant(m[1]);
    m = s.match(/(?:autour de|environ|vers)\s*([\d.,]+\s*(?:m\b|millions?|mf)?)/); if (m) { const v = montant(m[1]); c.budget_max = Math.round(v * 1.1); c.budget_min = Math.round(v * 0.9); }
    m = s.match(/\b[ft]([1-6])\b/); if (m) c.pieces_min = +m[1];
    m = s.match(/(\d+)\s*pieces?/); if (m) c.pieces_min = +m[1];
    m = s.match(/(\d+)\s*chambres?/); if (m) c.chambres_min = +m[1];
    if (!c.chambres_min && /famill/.test(s)) c.chambres_min = 3;
    m = s.match(/(\d+)\s*m2|(\d+)\s*m²/); if (m) c.surface_min = +(m[1] || m[2]);
    MOTS.forEach(([re, p]) => { if (re.test(s) && !c.prestations.includes(p)) c.prestations.push(p); });
    c.obligatoires = c.prestations.filter(p => { const re = MOTS.find(x => x[1] === p)[0]; return new RegExp('(avec|indispensable|obligatoire|absolument)[^,.;]{0,25}(' + re.source + ')').test(s); });
    return c;
  }

  /* ---------- Classement et explications ---------- */
  function noter(b, c) {
    const txt = sansAccent([b.titre, b.desc || b.description, (b.features || []).join(' '), b.quartier].join(' '));
    const oui = [], presque = [], non = [];
    let pts = 0, max = 0, bloque = false;
    if (c.types.length) { max += 3; const ok = c.types.includes(b.type) || (c.types.includes('Maison') && b.type === 'Villa'); if (ok) { pts += 3; oui.push(b.type); } else bloque = true; }
    if (c.zones.length) {
      max += 3; const lieu = sansAccent((b.quartier || '') + ' ' + (b.ville || ''));
      const ok = c.zones.some(z => lieu.includes(sansAccent(z)));
      if (ok) { pts += 3; oui.push(b.quartier || b.ville); } else bloque = true;
    }
    if (c.budget_max) {
      max += 3; const r = b.prix / c.budget_max;
      if (b.prix && r <= 1) { pts += 3; oui.push('dans le budget'); } else if (b.prix && r <= 1.1) { pts += 1; presque.push('budget +' + Math.round((r - 1) * 100) + ' %'); } else bloque = true;
    }
    if (c.budget_min && b.prix && b.prix < c.budget_min * 0.85) bloque = true;
    if (c.chambres_min) { max += 2; if ((b.chambres || 0) >= c.chambres_min) { pts += 2; oui.push(b.chambres + ' chambres'); } else if ((b.chambres || 0) === c.chambres_min - 1) presque.push(b.chambres + ' chambre' + (b.chambres > 1 ? 's' : '')); else bloque = true; }
    if (c.pieces_min) { max += 2; if ((b.pieces || 0) >= c.pieces_min) { pts += 2; oui.push(b.pieces + ' pièces'); } else if ((b.pieces || 0) === c.pieces_min - 1) presque.push(b.pieces + ' pièces'); else bloque = true; }
    if (c.surface_min) { max += 2; if ((b.surface || 0) >= c.surface_min) { pts += 2; oui.push(b.surface + ' m²'); } else if ((b.surface || 0) >= c.surface_min * 0.9) presque.push(b.surface + ' m²'); else bloque = true; }
    c.prestations.forEach(p => {
      const ob = c.obligatoires.includes(p); max += ob ? 3 : 1.5;
      if (PR[p] && PR[p].test(txt)) { pts += ob ? 3 : 1.5; oui.push(p); } else { non.push(p); if (ob) bloque = true; }
    });
    c.mots_cles.forEach(k => { max += 1; if (txt.includes(sansAccent(k))) { pts += 1; oui.push(k); } });
    return { b, pct: max ? Math.round(pts / max * 100) : 100, oui, presque, non, bloque };
  }
  function chercher(c) {
    const liste = (typeof BIENS_DATA !== 'undefined' ? BIENS_DATA : []).filter(b => b.statut === 'En vente');
    const notes = liste.map(b => noter(b, c));
    const exacts = notes.filter(n => !n.bloque).sort((a, b) => b.pct - a.pct || (a.b.prix || 0) - (b.b.prix || 0));
    return { exacts, total: liste.length };
  }

  /* ---------- Affichage ---------- */
  let courant = null; // { q, c, source }
  function chipsCriteres(c) {
    const ch = [];
    c.types.forEach(t => ch.push(['types', t, t]));
    c.zones.forEach(z => ch.push(['zones', z, z]));
    if (c.budget_max) ch.push(['budget_max', '', 'max ' + M(c.budget_max)]);
    if (c.budget_min) ch.push(['budget_min', '', 'min ' + M(c.budget_min)]);
    if (c.pieces_min) ch.push(['pieces_min', '', c.pieces_min + ' pièces et +']);
    if (c.chambres_min) ch.push(['chambres_min', '', c.chambres_min + ' chambres et +']);
    if (c.surface_min) ch.push(['surface_min', '', c.surface_min + ' m² et +']);
    c.prestations.forEach(p => ch.push(['prestations', p, (c.obligatoires.includes(p) ? 'avec ' : '') + p]));
    c.mots_cles.forEach(k => ch.push(['mots_cles', k, k]));
    return ch.map(([k, v, l]) => `<button type="button" class="rq-c" data-k="${E(k)}" data-v="${E(v)}" title="Retirer ce critère">${E(l)} <span aria-hidden="true">×</span></button>`).join('');
  }
  function afficher() {
    const grid = $('landing-biens-grid'), count = $('ld-simple-count'), head = $('rq-head');
    if (!grid || !courant) return;
    const { exacts, total } = chercher(courant.c);
    if (head) {
      head.hidden = false;
      head.innerHTML = `<div class="rq-q"><svg class="i" aria-hidden="true"><use href="#i-sparkle"/></svg><span>${courant.c.resume ? E(courant.c.resume) : '« ' + E(courant.q) + ' »'}</span>${courant.source === 'ia' ? '<em>compris par l\'IA</em>' : courant.source === 'attente' ? '<em class="wait">l\'IA affine…</em>' : ''}</div>
        <div class="rq-cs">${chipsCriteres(courant.c) || '<span class="rq-none">Aucun critère reconnu : précisez un lieu, un budget ou un type de bien.</span>'}</div>
        <div class="rq-acts"><button type="button" class="lp-btn sec sm" id="rq-alerte">M'alerter des nouveaux biens</button><button type="button" class="lp-link" id="rq-clear">Effacer la recherche</button></div>`;
    }
    if (count) count.textContent = exacts.length ? exacts.length + ' bien' + (exacts.length > 1 ? 's' : '') + ' correspond' + (exacts.length > 1 ? 'ent' : '') + ' sur ' + total : '';
    const t = $('section-annonces')?.querySelector('h2'); if (t) t.textContent = 'Résultats de votre recherche';
    if (!exacts.length) {
      grid.innerHTML = `<div class="pc-empty"><svg class="i" aria-hidden="true"><use href="#i-search"/></svg><b>Aucun bien ne correspond encore</b><span>Retirez un critère ci-dessus, ou créez une alerte : nous vous montrerons les nouveaux biens qui correspondent.</span></div>`;
      return;
    }
    grid.innerHTML = exacts.slice(0, 24).map(n => `<div class="rq-it">${IMMO_CARDS.html(n.b, { open: 'openLandingBien' })}<div class="rq-why"><b class="rq-pct">${n.pct} %</b>${n.oui.slice(0, 4).map(x => `<span class="y">${E(x)}</span>`).join('')}${n.presque.map(x => `<span class="p">${E(x)}</span>`).join('')}${n.non.slice(0, 2).map(x => `<span class="n">sans ${E(x.toLowerCase())}</span>`).join('')}</div></div>`).join('');
  }

  async function rechercher(q) {
    q = String(q || '').trim(); if (q.length < 3) return;
    courant = { q, c: lectureLocale(q), source: 'attente' };
    afficher();
    $('section-annonces')?.scrollIntoView({ behavior: 'smooth', block: 'start' });
    if (window.IMMO_EVT) IMMO_EVT.track('recherche', (courant.c.types[0] || '') + '|' + (courant.c.zones[0] || ''));
    const moi = courant;
    try {
      const ctrl = new AbortController(); const to = setTimeout(() => ctrl.abort(), 20000);
      const r = await fetch('/api/recherche', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ q }), signal: ctrl.signal });
      clearTimeout(to);
      const d = await r.json();
      if (courant !== moi) return; // une autre recherche a été lancée entre-temps
      if (r.ok && !d.error) { courant = { q, c: d, source: 'ia' }; } else courant.source = 'local';
    } catch (_) { if (courant === moi) courant.source = 'local'; }
    if (courant && courant.q === q) afficher();
  }

  function effacer() {
    courant = null;
    const head = $('rq-head'); if (head) { head.hidden = true; head.innerHTML = ''; }
    const t = $('section-annonces')?.querySelector('h2'); if (t) t.textContent = 'Annonces récentes';
    const i = $('lp-ai-q'); if (i) i.value = '';
    if (typeof buildLandingBiensSimple === 'function') buildLandingBiensSimple();
  }

  /* ---------- Alertes (sur cet appareil) ---------- */
  function creerAlerte() {
    if (!courant) return;
    const ids = chercher(courant.c).exacts.map(n => n.b.id);
    const al = lire().filter(a => a.q !== courant.q);
    al.unshift({ q: courant.q, c: courant.c, vus: ids, date: new Date().toISOString().slice(0, 10) });
    ecrire(al);
    const b = $('rq-alerte'); if (b) { b.textContent = 'Alerte enregistrée'; b.disabled = true; }
  }
  function verifierAlertes() {
    const al = lire(); if (!al.length || typeof BIENS_DATA === 'undefined') return;
    const box = $('rq-alertes'); if (!box) return;
    const nouv = al.map(a => ({ a, n: chercher(a.c).exacts.filter(x => !a.vus.includes(x.b.id)) })).filter(x => x.n.length);
    if (!nouv.length) { box.hidden = true; return; }
    box.hidden = false;
    box.innerHTML = nouv.map(({ a, n }, i) => `<div class="rq-al"><svg class="i" aria-hidden="true"><use href="#i-bell"/></svg><span><b>${n.length} nouveau${n.length > 1 ? 'x' : ''} bien${n.length > 1 ? 's' : ''}</b> pour « ${E(a.q)} »</span><button type="button" class="lp-btn pri sm" data-al="${i}">Voir</button></div>`).join('');
    box.querySelectorAll('[data-al]').forEach(b => b.addEventListener('click', () => {
      const x = nouv[+b.dataset.al]; const all = lire(); const k = all.find(z => z.q === x.a.q);
      if (k) { k.vus = k.vus.concat(x.n.map(z => z.b.id)); ecrire(all); }
      const i = $('lp-ai-q'); if (i) i.value = x.a.q;
      courant = { q: x.a.q, c: x.a.c, source: 'ia' }; afficher(); box.hidden = true;
      $('section-annonces')?.scrollIntoView({ behavior: 'smooth' });
    }));
  }

  /* ---------- Branchements ---------- */
  document.addEventListener('click', e => {
    const c = e.target.closest && e.target.closest('.rq-c');
    if (c && courant) {
      const k = c.dataset.k, v = c.dataset.v;
      if (Array.isArray(courant.c[k])) { courant.c[k] = courant.c[k].filter(x => x !== v); if (k === 'prestations') courant.c.obligatoires = courant.c.obligatoires.filter(x => x !== v); }
      else courant.c[k] = 0;
      courant.c.resume = ''; afficher(); return;
    }
    if (e.target.closest && e.target.closest('#rq-clear')) return effacer();
    if (e.target.closest && e.target.closest('#rq-alerte')) return creerAlerte();
    const ex = e.target.closest && e.target.closest('[data-rq]');
    if (ex) { const i = $('lp-ai-q'); if (i) i.value = ex.dataset.rq; rechercher(ex.dataset.rq); }
  });
  function init() {
    const f = $('lp-ai'); if (!f || f.dataset.ok) return; f.dataset.ok = '1';
    f.addEventListener('submit', e => { e.preventDefault(); rechercher($('lp-ai-q').value); });
    // Les filtres classiques reprennent la main : la recherche en phrase s'efface
    ['ld-zone-simple', 'ld-type-simple', 'ld-budget-simple'].forEach(id => $(id) && $(id).addEventListener('change', () => { if (courant) { courant = null; const h = $('rq-head'); if (h) h.hidden = true; const t = $('section-annonces')?.querySelector('h2'); if (t) t.textContent = 'Annonces récentes'; } }));
    setTimeout(verifierAlertes, 2500); setTimeout(verifierAlertes, 7000); // après chargement des annonces publiées
  }
  if (document.readyState !== 'loading') init(); else document.addEventListener('DOMContentLoaded', init);
  window.IMMO_RECHERCHE = { rechercher, lectureLocale, chercher, noter, effacer, verifierAlertes };
})();
