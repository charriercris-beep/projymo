/* Immo360 NC — Dépôt, étape « Prix » (en dernier, quand tout est rempli)
 * 1. Prix conseillé : prix au m² CONCLU du quartier (js/estimation.js : observatoire Immo360 ou barème calé
 *    sur l'ISEE) × surface, ajusté par l'état (déclaré, sinon vu sur les photos par l'IA), l'année, le
 *    diagnostic énergétique et les prestations cochées. Détail ligne par ligne, fourchette, bouton « Prendre ce prix ».
 * 2. Le marché : biens comparables en vente sur Immo360 ; liens pour comparer sur d'autres sites calédoniens
 *    (aucune donnée de ces sites n'est copiée).
 * 3. Baromètre du quartier : niveau du quartier par rapport à la commune et au territoire, tendance officielle
 *    des ventes conclues (ISEE) et, dès qu'il y a assez d'annonces, l'évolution propre au quartier (observatoire).
 * La personne reste libre de son prix : l'écart avec le prix conseillé est simplement indiqué.
 */
(function () {
  'use strict';

  const $ = id => document.getElementById(id);
  const val = id => ($(id) && $(id).value || '').trim();
  const num = id => parseInt(val(id), 10) || 0;
  const E = s => String(s == null ? '' : s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const M = n => (typeof conv === 'function' ? conv(n) : (n >= 1e6 ? (Math.round(n / 1e5) / 10).toLocaleString('fr-FR') + ' M F' : Math.round(n).toLocaleString('fr-FR') + ' F'));
  const F = n => Math.round(n).toLocaleString('fr-FR') + ' F';
  const pc = v => (v >= 0 ? '+' : '−') + Math.abs(Math.round(v * 1000) / 10).toLocaleString('fr-FR') + ' %';
  const coche = id => !!($('df-' + id) && $('df-' + id).checked);
  const APPART = () => /Appartement|Studio/.test(val('d-type'));

  // Repères indicatifs, cohérents avec l'estimation détaillée (js/valorisation.js)
  const ETAT = { neuf: ['Neuf / récent', 0.05], excellent: ['Excellent état', 0.03], bon: ['Bon état', 0], moyen: ['État moyen', -0.05], travaux: ['À rénover', -0.12] };
  const IA_ETAT = { neuf: 'neuf', excellent: 'excellent', bon: 'bon', moyen: 'moyen', travaux: 'travaux' };
  const DPE = { A: 0.015, B: 0.01, C: 0, D: 0, E: -0.015, F: -0.03 };
  const age = a => !a ? 0 : a >= 2015 ? 0.03 : a >= 2005 ? 0.01 : a >= 1990 ? 0 : a >= 1975 ? -0.02 : -0.04;
  const PRESTA = [
    ['vue-mer', 'Vue mer', 0.07, 'vue'], ['vue-lagon', 'Vue lagon', 0.07, 'vue'], ['vue-deg', 'Vue dégagée', 0.02], ['plage', 'Plage à pied', 0.03],
    ['piscine', 'Piscine', 0.05], ['piscine-res', 'Piscine de la résidence', 0.02], ['jacuzzi', 'Spa / jacuzzi', 0.015], ['pool-house', 'Pool house / faré', 0.015],
    ['dependance', 'Studio indépendant', 0.06], ['terrasse', 'Terrasse', 0.02], ['balcon', 'Balcon', 0.01], ['jardin', 'Jardin', 0.02],
    ['garage', 'Garage fermé', 0.03], ['parking-secu', 'Parking sécurisé', 0.02], ['parking', 'Place de parking', 0.015], ['carport', 'Carport', 0.01],
    ['clim', 'Climatisation', 0.02], ['cuisine-eq', 'Cuisine équipée', 0.01], ['solaire', 'Solaire', 0.01], ['gardien', 'Résidence sécurisée', 0.02],
    ['ascenseur', 'Ascenseur', 0.01], ['alarme', 'Alarme', 0.005], ['dressing', 'Dressing', 0.005], ['buanderie', 'Buanderie', 0.005], ['cave', 'Cave', 0.005]
  ];
  const PRESTA_MAX = 0.25;

  /* ---------- 1. Prix conseillé ---------- */
  function calcul() {
    const s = num('d-surface'); if (!s || !window.IMMO_EST) return null;
    const q = val('d-quartier') !== 'Autre' ? val('d-quartier') : val('d-ville');
    const e = IMMO_EST.pm2(q, val('d-type'), val('d-ville'));
    const base = e.value * s, lignes = [];
    let etat = val('d-etat'), src = 'déclaré';
    const ia = window.IMMO_PHOTOS_IA && IA_ETAT[IMMO_PHOTOS_IA.etat];
    if (!etat && ia) { etat = ia; src = 'vu sur vos photos'; }
    let k1 = 0;
    if (etat && ETAT[etat] && ETAT[etat][1]) { k1 += ETAT[etat][1]; lignes.push([ETAT[etat][0] + ' (' + src + ')', ETAT[etat][1], base * ETAT[etat][1]]); }
    const a = age(num('d-annee')); if (a) { k1 += a; lignes.push(['Construit en ' + num('d-annee'), a, base * a]); }
    const d = DPE[val('d-dpe')] || 0; if (d) { k1 += d; lignes.push(['Diagnostic énergétique ' + val('d-dpe'), d, base * d]); }
    // prestations : une seule « vue mer / lagon », plafond global
    let vue = false; const pr = [];
    PRESTA.forEach(([id, l, up, g]) => { if (!coche(id)) return; if (g === 'vue') { if (vue) return; vue = true; } if ((id === 'jardin' && !APPART()) || (id === 'piscine-res' && !APPART())) return; pr.push([l, up]); });
    const brutP = pr.reduce((t, x) => t + x[1], 0), kP = Math.min(PRESTA_MAX, brutP);
    pr.forEach(([l, up]) => { const k = brutP ? up * kP / brutP : 0; lignes.push([l, k, base * (1 + k1) * k]); });
    const V = base * (1 + k1) * (1 + kP);
    const decrits = [val('d-etat') || ia, num('d-annee'), val('d-dpe')].filter(Boolean).length;
    const spread = (e.source === 'observatoire' ? 0.08 : 0.11) - 0.01 * decrits;
    const arr = v => Math.round(v / 100000) * 100000;
    return { e, s, q, base, lignes, V: arr(V), lo: arr(V * (1 - spread)), hi: arr(V * (1 + spread)), plafond: brutP > PRESTA_MAX };
  }

  /* ---------- 2. Biens comparables sur Immo360 ---------- */
  function comparables(c) {
    const cls = window.IMMO_EST ? IMMO_EST.classe(val('d-type')) : null;
    return (typeof BIENS_DATA !== 'undefined' ? BIENS_DATA : []).filter(b => b && b.statut === 'En vente' && b.prix > 0 && b.surface > 0
      && (!cls || IMMO_EST.classe(b.type) === cls) && (b.ville === val('d-ville') || b.quartier === c.q) && b.surface >= c.s * 0.6 && b.surface <= c.s * 1.5)
      .sort((x, y) => (y.quartier === c.q) - (x.quartier === c.q) || Math.abs(x.surface - c.s) - Math.abs(y.surface - c.s)).slice(0, 4);
  }

  /* ---------- 3. Baromètre du quartier ---------- */
  function observatoireMensuel(q) {
    const cls = IMMO_EST.classe(val('d-type')), now = new Date(), mois = [];
    for (let i = 11; i >= 0; i--) { const d = new Date(now.getFullYear(), now.getMonth() - i, 1); mois.push(d.toISOString().slice(0, 7)); }
    const par = {}; (typeof BIENS_DATA !== 'undefined' ? BIENS_DATA : []).forEach(b => {
      if (!b || !b._ann || !b.date || !(b.prix > 0) || !(b.surface > 0) || b.quartier !== q || IMMO_EST.classe(b.type) !== cls) return;
      (par[b.date.slice(0, 7)] = par[b.date.slice(0, 7)] || []).push(b.prix / b.surface);
    });
    const med = v => { const t = v.slice().sort((a, b) => a - b); return t[Math.floor(t.length / 2)]; };
    return mois.map(m => ({ m, n: (par[m] || []).length, v: (par[m] || []).length >= 3 ? med(par[m]) * IMMO_EST.decote() : null }));
  }
  function barometre(c) {
    const I = IMMO_EST.ISEE, appart = IMMO_EST.classe(val('d-type')) !== 'maison';
    const com = IMMO_EST.pm2(val('d-ville'), val('d-type'), val('d-ville')).value;
    const terr = I.aptMedianM2, niveaux = [['Quartier ' + c.q, c.e.value], val('d-ville') !== c.q ? ['Commune ' + val('d-ville'), com] : null, ['Nouvelle-Calédonie (ventes 2025)', terr]].filter(Boolean);
    const max = Math.max(...niveaux.map(x => x[1])) * 1.08;
    const ecart = c.e.value / terr - 1;
    const serie = appart ? [['2014-2023', 406000], ['2024', 395000], ['2025', 280000]] : [['2023', 31.1e6], ['2025', 23.0e6]];
    const sMax = Math.max(...serie.map(x => x[1])), evol = serie[serie.length - 1][1] / serie[serie.length - 2][1] - 1;
    const obs = observatoireMensuel(c.q), pts = obs.filter(x => x.v);
    let local = '<p class="bp-n">L\'évolution propre au quartier s\'affichera ici dès que suffisamment d\'annonces y auront été publiées sur Immo360 (au moins 3 par mois).</p>';
    if (pts.length >= 2) {
      const lo = Math.min(...pts.map(x => x.v)) * 0.95, hi = Math.max(...pts.map(x => x.v)) * 1.05, W = 300, H = 70;
      const xy = obs.map((x, i) => x.v ? [i / 11 * W, H - (x.v - lo) / (hi - lo || 1) * H] : null).filter(Boolean);
      const d1 = pts[pts.length - 1].v / pts[0].v - 1;
      local = `<p class="bp-t">Annonces Immo360 du quartier, ramenées au prix de vente : <b class="${d1 >= 0 ? 'up' : 'down'}">${pc(d1)}</b> sur la période</p>
        <svg viewBox="0 0 ${W} ${H + 4}" class="bp-svg" role="img" aria-label="Évolution du prix au m² dans le quartier"><polyline points="${xy.map(p => p.join(',')).join(' ')}" fill="none" stroke="var(--gold)" stroke-width="2.5"/>${xy.map(p => `<circle cx="${p[0]}" cy="${p[1]}" r="3" fill="var(--gold)"/>`).join('')}</svg>`;
    }
    return `<div class="bp"><h3>Baromètre du quartier</h3>
      <div class="bp-niv">${niveaux.map(([l, v], i) => `<div class="bp-r${i ? '' : ' me'}"><span>${E(l)}</span><span class="bp-bar"><i style="width:${(v / max * 100).toFixed(1)}%"></i></span><b>${F(v)}/m²</b></div>`).join('')}</div>
      <p class="bp-t">${E(c.q)} se situe <b class="${ecart >= 0 ? 'up' : 'down'}">${pc(ecart)}</b> par rapport au prix médian des ${appart ? 'appartements' : 'biens'} vendus en Nouvelle-Calédonie.</p>
      <div class="bp-g"><div><p class="bp-h">Tendance des ventes conclues (ISEE, ${appart ? 'prix médian au m² des appartements' : 'montant médian des maisons'})</p>
        <div class="bp-cols">${serie.map(([l, v]) => `<div><span>${appart ? F(v) : M(v)}</span><i style="height:${Math.round(v / sMax * 64)}px"></i><em>${E(l)}</em></div>`).join('')}</div>
        <p class="bp-t">Dernière évolution : <b class="${evol >= 0 ? 'up' : 'down'}">${pc(evol)}</b>. Marché en baisse depuis 2023, avec peu de transactions : un prix juste fait la différence.</p></div>
        <div><p class="bp-h">Dans le quartier</p>${local}</div></div>
      <p class="bp-s">Sources : ISEE, synthèse des transactions immobilières 2025 (offices notariaux, DSF) ; ${c.e.source === 'observatoire' ? c.e.n + ' annonces Immo360 du secteur' : 'barème Immo360 calé sur ces ventes'}.</p></div>`;
  }

  /* ---------- Affichage ---------- */
  let dernier = null;
  function analyser() {
    const box = $('dp-prix-ana'); if (!box) return;
    const c = calcul(); dernier = c;
    if (!c) { box.innerHTML = '<p class="dp-hint">Indiquez la surface à l\'étape 1 pour obtenir un prix conseillé.</p>'; return; }
    const comp = comparables(c);
    const photos = typeof depotPhotos !== 'undefined' ? depotPhotos.length : 0;
    const ia = window.IMMO_PHOTOS_IA;
    const manque = [!val('d-etat') && !(ia && ia.etat) && 'l\'état général', !num('d-annee') && 'l\'année', !val('d-dpe') && 'le diagnostic énergétique'].filter(Boolean);
    box.innerHTML = `<div class="pc-box">
      <div class="pc-top"><div><small>Prix conseillé</small><b id="dp-conseil">${M(c.V)}</b><span>Fourchette ${M(c.lo)} – ${M(c.hi)}</span></div>
        <button type="button" class="btn btn-outline btn-sm" id="dp-prendre">Prendre ce prix</button></div>
      <details class="pc-det"${c.lignes.length ? ' open' : ''}><summary>Comment ce prix est calculé</summary>
        <div class="pc-l"><span>Prix du quartier : ${F(c.e.value)}/m² × ${c.s} m²</span><b>${M(c.base)}</b></div>
        ${c.lignes.map(([l, k, m]) => `<div class="pc-l ${m < 0 ? 'neg' : 'pos'}"><span>${E(l)} <small>${pc(k)}</small></span><b>${m < 0 ? '−' : '+'}${M(Math.abs(m))}</b></div>`).join('')}
        ${c.plafond ? '<p class="pc-n">Prestations plafonnées à +25 % : au-delà, le bien sort du marché de référence du quartier.</p>' : ''}
        <div class="pc-l tot"><span>Prix conseillé</span><b>${M(c.V)}</b></div></details>
      <ul class="pc-q">
        <li class="${photos ? 'ok' : ''}">${photos ? photos + ' photo' + (photos > 1 ? 's' : '') + (ia && ia.etat ? ', état lu par l\'IA' : '') : 'Aucune photo : les acheteurs voient le prix sans pouvoir juger le bien'}</li>
        <li class="${manque.length ? '' : 'ok'}">${manque.length ? 'Précisez ' + manque.join(', ') + ' (étape Présentation) pour affiner' : 'État, année et diagnostic pris en compte'}</li>
      </ul></div>
      <div class="pc-mk"><h3>Le marché autour de vous</h3>
        ${comp.length ? `<div class="pc-cmp">${comp.map(b => `<button type="button" onclick="openLandingBien(${Number(b.id)})"><b>${M(b.prix)}</b><span>${E(b.type)} · ${E(b.surface)} m² · ${E(b.quartier || b.ville)}</span><small>${F(b.prix / b.surface)}/m² affiché</small></button>`).join('')}</div>
          <p class="pc-n">Prix affichés, généralement 10 à 20 % au-dessus des prix de vente réels.</p>` : '<p class="pc-n">Pas encore de bien comparable en vente sur Immo360 dans votre secteur.</p>'}
        <p class="pc-ext">Comparer aussi : <a href="https://www.immobilier.nc/" target="_blank" rel="noopener">immobilier.nc</a> · <a href="https://www.combienlakaz.nc/" target="_blank" rel="noopener">CombienLaKaz</a></p></div>
      ${barometre(c)}`;
    $('dp-prendre').onclick = () => { const i = $('d-prix'); i.value = c.V; i.dispatchEvent(new Event('input', { bubbles: true })); i.focus(); };
    if (!val('d-prix')) $('d-prix').placeholder = 'ex. ' + c.V;
  }

  // Écart du prix saisi avec le prix conseillé (remplace la comparaison au simple prix du secteur)
  function updateDepotEstim() {
    const p = num('d-prix'), lis = $('dp-prix-lisible'), cmp = $('depot-estim-compare'), de = $('depot-ecart');
    if (lis) lis.textContent = p ? 'Soit ' + p.toLocaleString('fr-FR') + ' F' : '';
    const c = dernier || calcul();
    if (!p || !c || !cmp) { if (cmp) cmp.style.display = 'none'; return; }
    const ecart = Math.round((p / c.V - 1) * 100);
    cmp.style.display = 'block';
    if ($('depot-prix-user')) $('depot-prix-user').textContent = M(p);
    if ($('depot-prix-ia')) $('depot-prix-ia').textContent = M(c.V);
    if (de) {
      de.textContent = (ecart >= 0 ? '+' : '') + ecart + ' %' + (p > c.hi ? ' — au-dessus de la fourchette : la vente risque d\'être plus longue' : p < c.lo ? ' — en dessous de la fourchette : vérifiez votre saisie' : ' — dans la fourchette du marché');
      de.style.color = p > c.hi * 1.1 || p < c.lo * 0.9 ? 'var(--red)' : p > c.hi || p < c.lo ? 'var(--accent)' : 'var(--green)';
    }
  }
  window.updateDepotEstim = updateDepotEstim;
  window.IMMO_PRIX = { analyser, calcul, conseil: () => dernier };
})();
