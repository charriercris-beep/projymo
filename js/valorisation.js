/* Immo360 NC — Assistant de valorisation
 * Analyse du bien, prix en l'état / après travaux (par paliers), simulation en direct,
 * génération d'annonce et demande de devis aux artisans inscrits.
 * Dépend des globales de l'application : NC_PM2, ARTISANS_DATA, devisEnCours, APP_STATE, S, sb, conv, esc, go.
 */
(function () {
  'use strict';

  /* ---------- Moteur de calcul (déterministe, transparent) ---------- */
  const ETAT_COEF = { a_renover: 0.80, correct: 0.92, bon: 1.0, tres_bon: 1.08 };
  const ETAT_LABEL = { a_renover: 'À rénover', correct: 'Correct', bon: 'Bon état', tres_bon: 'Très bon état' };
  // Les travaux lourds rapportent plus sur un bien dégradé que sur un bien déjà en bon état
  const SENSI = { a_renover: 1.5, correct: 1.1, bon: 0.8, tres_bon: 0.5 };

  const GRADES = [
    { id: 'rangement', label: 'Rangement & remise en état', short: 'Rangement', desc: 'Désencombrer, nettoyer, petites réparations.' },
    { id: 'staging', label: 'Home staging', short: 'Home staging', desc: 'Mise en scène, déco, photos professionnelles.' },
    { id: 'rafraichissement', label: 'Rafraîchissement', short: 'Rafraîchissement', desc: 'Peinture, sols, luminaires.' },
    { id: 'renovation', label: 'Rénovation lourde', short: 'Rénovation', desc: 'Cuisine, salle de bain, électricité, menuiseries, climatisation.' }
  ];

  const POSTES = [
    { id: 'desencombrement', grade: 'rangement', label: 'Désencombrement & tri', metier: 'homestaging', cost: s => 40000 + s * 500, up: 0.006, jours: 2 },
    { id: 'nettoyage', grade: 'rangement', label: 'Nettoyage professionnel', metier: 'nettoyage', cost: s => s * 1500, up: 0.008, jours: 1 },
    { id: 'reparations', grade: 'rangement', label: 'Petites réparations (joints, poignées, prises)', metier: 'plomberie', cost: s => 50000 + s * 800, up: 0.010, jours: 3 },
    { id: 'exterieur', grade: 'rangement', label: 'Entretien du jardin / extérieur', metier: 'jardin', cost: s => 60000 + s * 300, up: 0.008, jours: 2 },
    { id: 'staging', grade: 'staging', label: 'Home staging (mobilier, déco, mise en scène)', metier: 'homestaging', cost: s => 120000 + s * 2500, up: 0.030, jours: 5 },
    { id: 'photos', grade: 'staging', label: 'Photos professionnelles & visite', metier: 'photo', cost: () => 55000, up: 0.012, jours: 1 },
    { id: 'peinture', grade: 'rafraichissement', label: 'Peinture intérieure', metier: 'peinture', cost: s => s * 9000, up: 0.035, jours: 6 },
    { id: 'sols', grade: 'rafraichissement', label: 'Sols (ponçage, remplacement partiel)', metier: 'menuiserie', cost: s => s * 11000, up: 0.025, jours: 6 },
    { id: 'luminaires', grade: 'rafraichissement', label: 'Luminaires & électricité courante', metier: 'electricite', cost: s => 80000 + s * 1500, up: 0.012, jours: 2 },
    { id: 'cuisine', grade: 'renovation', label: 'Cuisine neuve', metier: 'cuisine', cost: s => 1400000 + s * 5000, up: 0.060, jours: 15 },
    { id: 'sdb', grade: 'renovation', label: 'Salle de bain rénovée', metier: 'plomberie', cost: s => 900000 + s * 3000, up: 0.040, jours: 12 },
    { id: 'electricite', grade: 'renovation', label: 'Mise aux normes électriques', metier: 'electricite', cost: s => s * 7500, up: 0.030, jours: 8 },
    { id: 'clim', grade: 'renovation', label: 'Climatisation', metier: 'climatisation', cost: s => Math.max(1, Math.round(s / 30)) * 330000, up: 0.030, jours: 3 },
    { id: 'menuiseries', grade: 'renovation', label: 'Menuiseries & volets', metier: 'menuiserie', cost: s => s * 10000, up: 0.035, jours: 10 }
  ];

  const METIER_LABEL = {
    peinture: 'Peintre', plomberie: 'Plombier', electricite: 'Électricien', cuisine: 'Cuisiniste', climatisation: 'Climatisation',
    jardin: 'Paysagiste', photo: 'Photographe', menuiserie: 'Menuisier', nettoyage: 'Entreprise de nettoyage', homestaging: 'Home stager'
  };

  const st = {
    bien: { type: 'appartement', surface: 80, quartier: 'Magenta', annee: 2005, etat: 'correct', prixSouhaite: 0, description: '' },
    selected: new Set(),
    ai: null, aiLoading: false, photos: [], annonce: ''
  };

  window.addEventListener('immo360:purge', () => { st.bien = { type: 'appartement', surface: 80, quartier: 'Magenta', annee: 2005, etat: 'correct', prixSouhaite: 0, description: '' }; st.selected = new Set(); st.ai = null; st.photos = []; st.annonce = ''; });
  const pm2Of = q => (typeof NC_PM2 !== 'undefined' && NC_PM2[q]) || 340000;
  const money = v => (typeof conv === 'function' ? conv(v) : Math.round(v).toLocaleString('fr-FR') + ' F');
  const E = v => (typeof esc === 'function' ? esc(v) : String(v));
  const $ = id => document.getElementById(id);

  function posteCalc(p) {
    const s = st.bien.surface, V = baseValue();
    const sens = (p.grade === 'rafraichissement' || p.grade === 'renovation') ? (SENSI[st.bien.etat] || 1) : 1;
    const up = p.up * sens;
    return { ...p, cout: Math.round(p.cost(s) / 1000) * 1000, upEff: up, gain: Math.round(V * up / 1000) * 1000 };
  }
  function baseValue() { return pm2Of(st.bien.quartier) * st.bien.surface * (ETAT_COEF[st.bien.etat] || 1); }

  function compute(ids) {
    const V = baseValue();
    const list = POSTES.filter(p => ids.has(p.id)).map(posteCalc);
    const cout = list.reduce((a, p) => a + p.cout, 0);
    // rendements décroissants : 1 - Π(1 - u)
    const up = 1 - list.reduce((a, p) => a * (1 - p.upEff), 1);
    const apres = V * (1 + up);
    const gainBrut = apres - V, gainNet = gainBrut - cout;
    const jours = Math.round(list.reduce((a, p) => a + p.jours, 0) * 0.7);
    return { V, list, cout, apres, gainBrut, gainNet, roi: cout ? gainNet / cout : 0, jours, up };
  }
  function idsUpTo(gradeId) {
    const idx = GRADES.findIndex(g => g.id === gradeId);
    return new Set(POSTES.filter(p => GRADES.findIndex(g => g.id === p.grade) <= idx).map(p => p.id));
  }
  function scenarios() {
    return [{ id: 'etat', label: 'En l\'état', ids: new Set() }, ...GRADES.map(g => ({ id: g.id, label: g.short, ids: idsUpTo(g.id) }))]
      .map(sc => ({ ...sc, r: compute(sc.ids) }));
  }

  /* ---------- Styles ---------- */
  function injectStyle() {
    if ($('val-style')) return;
    const c = document.createElement('style'); c.id = 'val-style';
    c.textContent = `
.val-wrap{max-width:1180px;margin:0 auto}
.val-head h2{font-family:'Playfair Display',serif;font-size:24px;margin:0 0 4px}
.val-head p{color:var(--mid);font-size:13px;margin:0 0 18px}
.val-grid{display:grid;grid-template-columns:330px 1fr;gap:20px;align-items:start}
.val-side{position:sticky;top:8px}
.val-f{display:flex;flex-direction:column;gap:4px;margin-bottom:11px}
.val-f label{font-size:11px;font-weight:600;color:var(--mid);text-transform:uppercase;letter-spacing:.06em}
.val-f input,.val-f select,.val-f textarea{border:1px solid rgba(28,26,22,.15);border-radius:8px;padding:8px 10px;font:14px 'DM Sans',sans-serif;background:#fff;width:100%;box-sizing:border-box}
.val-row2{display:grid;grid-template-columns:1fr 1fr;gap:10px}
.val-photos{display:flex;flex-wrap:wrap;gap:6px;margin:6px 0 10px}
.val-photos img{width:58px;height:58px;object-fit:cover;border-radius:6px;border:1px solid rgba(28,26,22,.12)}
.val-hero{display:grid;grid-template-columns:repeat(3,1fr);gap:12px;margin-bottom:16px}
.val-kpi{background:#fff;border:1px solid rgba(28,26,22,.08);border-radius:12px;padding:14px 16px}
.val-kpi small{display:block;font-size:11px;color:var(--mid);text-transform:uppercase;letter-spacing:.06em;margin-bottom:6px}
.val-kpi b{font:700 22px 'Playfair Display',serif;color:var(--dark)}
.val-kpi em{display:block;font-style:normal;font-size:12px;color:var(--mid);margin-top:3px}
.val-kpi.pos b{color:var(--green)}.val-kpi.neg b{color:var(--red)}.val-kpi.gold{background:var(--dark)}.val-kpi.gold small,.val-kpi.gold em{color:rgba(255,255,255,.6)}.val-kpi.gold b{color:var(--gold-light)}
.val-presets{display:flex;flex-wrap:wrap;gap:8px;margin-bottom:14px}
.val-chip{border:1px solid rgba(28,26,22,.15);background:#fff;border-radius:999px;padding:7px 14px;font:500 13px 'DM Sans',sans-serif;cursor:pointer;transition:.15s}
.val-chip:hover{border-color:var(--gold)}.val-chip.on{background:var(--dark);color:#fff;border-color:var(--dark)}
.val-grade{border:1px solid rgba(28,26,22,.1);border-radius:12px;margin-bottom:12px;background:#fff;overflow:hidden}
.val-grade>header{display:flex;justify-content:space-between;align-items:center;padding:12px 16px;background:var(--cream);cursor:pointer}
.val-grade>header b{font-size:14px}.val-grade>header span{font-size:12px;color:var(--mid)}
.val-poste{display:grid;grid-template-columns:22px 1fr auto auto;gap:12px;align-items:center;padding:10px 16px;border-top:1px solid rgba(28,26,22,.06);font-size:13px}
.val-poste input{width:17px;height:17px;accent-color:var(--gold)}
.val-poste .c{color:var(--mid);text-align:right;min-width:70px}.val-poste .g{color:var(--green);font-weight:600;text-align:right;min-width:78px}
.val-poste .tip{grid-column:2/5;font-size:12px;color:var(--mid);margin-top:-4px}
.val-prio{display:inline-block;font-size:10px;font-weight:700;padding:1px 7px;border-radius:99px;margin-left:6px;text-transform:uppercase}
.val-prio.haute{background:#FDE8E4;color:#B83A2A}.val-prio.moyenne{background:#FEF3C7;color:#92400E}.val-prio.basse{background:#EEF2F6;color:#475569}
.val-bars{display:flex;flex-direction:column;gap:9px}
.val-bar{display:grid;grid-template-columns:120px 1fr 120px;gap:10px;align-items:center;font-size:12px}
.val-bar .t{height:22px;background:var(--warm);border-radius:6px;position:relative;overflow:hidden}
.val-bar .f{position:absolute;inset:0 auto 0 0;background:var(--soft);border-radius:6px 0 0 6px}
.val-bar .k{position:absolute;inset:0 auto 0 0;background:var(--gold);border-radius:6px 0 0 6px}
.val-bar.cur .lbl{font-weight:700}
.val-ai h4{margin:12px 0 4px;font-size:12px;text-transform:uppercase;letter-spacing:.06em;color:var(--mid)}
.val-ai ul{margin:0;padding-left:18px;font-size:13px;line-height:1.6}
.val-note{font-size:12px;color:var(--mid);background:var(--warm);border-radius:8px;padding:9px 12px;margin-top:10px;line-height:1.5}
.val-mod{position:fixed;inset:0;background:rgba(0,0,0,.5);z-index:2000;display:flex;align-items:center;justify-content:center;padding:16px}
.val-mod>div{background:#fff;border-radius:14px;max-width:620px;width:100%;max-height:90vh;overflow:auto;padding:22px}
.val-mod label.val-art{display:flex;flex-direction:row;justify-content:flex-start;gap:10px;align-items:center;padding:8px 10px;border:1px solid rgba(28,26,22,.1);border-radius:8px;margin:6px 0;font:400 13px 'DM Sans',sans-serif;text-transform:none;letter-spacing:0;color:var(--dark);cursor:pointer}
.val-mod label.val-art input{width:17px;height:17px;flex:none;margin:0;accent-color:var(--gold)}
.val-mod label.val-art span{text-align:left;text-transform:none;letter-spacing:0}
.val-mod label.val-art small{color:var(--mid);display:block;text-transform:none;letter-spacing:0;font-size:12px}
.val-mod .val-f label{display:block}
@media(max-width:980px){.val-grid{grid-template-columns:1fr}.val-side{position:static}.val-hero{grid-template-columns:1fr}.val-bar{grid-template-columns:90px 1fr 90px}}
`;
    document.head.appendChild(c);
  }

  /* ---------- Rendu ---------- */
  function buildValorisation() {
    injectStyle();
    const el = $('panel-valorisation'); if (!el) return;
    const quartiers = Object.keys(typeof NC_PM2 !== 'undefined' ? NC_PM2 : {}).sort();
    const b = st.bien;
    el.innerHTML = `
<div class="val-wrap">
  <div class="val-head"><h2>Assistant de valorisation</h2>
    <p>Estimez votre bien en l'état, comparez des niveaux de travaux et suivez en direct l'effet sur le prix de vente.</p></div>
  <div class="val-grid">
    <aside class="val-side card">
      <div class="card-title">Votre bien</div>
      <div class="val-f"><label>Type</label><select id="val-type"><option value="appartement">Appartement</option><option value="maison">Maison</option><option value="villa">Villa</option><option value="studio">Studio</option></select></div>
      <div class="val-row2">
        <div class="val-f"><label>Surface (m²)</label><input id="val-surface" type="number" min="10" max="2000" value="${b.surface}"></div>
        <div class="val-f"><label>Année</label><input id="val-annee" type="number" min="1900" max="2030" value="${b.annee}"></div>
      </div>
      <div class="val-f"><label>Quartier</label><select id="val-quartier">${quartiers.map(q => `<option${q === b.quartier ? ' selected' : ''}>${E(q)}</option>`).join('')}</select></div>
      <div class="val-f"><label>État général</label><select id="val-etat">${Object.keys(ETAT_LABEL).map(k => `<option value="${k}"${k === b.etat ? ' selected' : ''}>${ETAT_LABEL[k]}</option>`).join('')}</select></div>
      <div class="val-f"><label>Prix souhaité (F, facultatif)</label><input id="val-prix" type="number" min="0" step="100000" value="${b.prixSouhaite || ''}" placeholder="ex. 45000000"></div>
      <div class="val-f"><label>Description</label><textarea id="val-desc" rows="3" placeholder="Atouts, particularités, travaux déjà faits…">${E(b.description)}</textarea></div>
      <div class="val-f"><label>Photos (jusqu'à 4, pour l'analyse IA)</label><input id="val-files" type="file" accept="image/*" multiple></div>
      <div class="val-photos" id="val-photos"></div>
      <button type="button" class="btn btn-gold btn-full" id="val-ai-btn">Lancer l'analyse IA</button>
      <div class="val-note">Les montants sont calculés par notre barème NC (prix au m² du quartier, coût des travaux selon la surface). L'IA apporte le diagnostic, l'état détecté sur photos et la priorité des travaux.</div>
    </aside>
    <section>
      <div class="val-hero" id="val-hero"></div>
      <div class="card"><div class="card-title">Niveau de préparation</div>
        <div class="val-presets" id="val-presets"></div>
        <div id="val-grades"></div>
      </div>
      <div class="card"><div class="card-title">Comparaison des scénarios</div><div class="val-bars" id="val-bars"></div></div>
      <div class="card val-ai" id="val-ai"></div>
      <div class="card"><div class="card-title">Annonce</div>
        <div class="val-row2">
          <div class="val-f"><label>Ton</label><select id="val-ton"><option>Moderne &amp; dynamique</option><option>Familial &amp; chaleureux</option><option>Luxe &amp; prestige</option><option>Investisseur</option></select></div>
          <div class="val-f"><label>&nbsp;</label><button type="button" class="btn btn-outline btn-full" id="val-ann-btn">Générer l'annonce pour ce scénario</button></div>
        </div>
        <textarea id="val-ann" rows="7" style="width:100%;box-sizing:border-box;border:1px solid rgba(28,26,22,.15);border-radius:8px;padding:10px;font:14px 'DM Sans',sans-serif" placeholder="L'annonce générée apparaîtra ici…"></textarea>
        <div style="display:flex;gap:8px;margin-top:10px;flex-wrap:wrap">
          <button type="button" class="btn btn-sm btn-outline" id="val-copy">Copier</button>
          <button type="button" class="btn btn-sm btn-dark" id="val-depot">Utiliser dans « Déposer une annonce »</button>
        </div>
      </div>
      <div class="card"><div class="card-title">Devis</div>
        <p style="font-size:13px;color:var(--mid);margin:0 0 12px" id="val-devis-info"></p>
        <button type="button" class="btn btn-gold" id="val-devis-btn">Demander des devis aux artisans</button>
      </div>
    </section>
  </div>
</div>`;
    $('val-type').value = b.type;
    bind();
    if (!st.selected.size && !st._init) { st._init = true; }
    renderAll();
  }

  function bind() {
    const rd = () => {
      st.bien.type = $('val-type').value;
      st.bien.surface = Math.min(2000, Math.max(10, parseInt($('val-surface').value) || 80));
      st.bien.annee = parseInt($('val-annee').value) || 2000;
      st.bien.quartier = $('val-quartier').value;
      st.bien.etat = $('val-etat').value;
      st.bien.prixSouhaite = parseInt($('val-prix').value) || 0;
      st.bien.description = $('val-desc').value.slice(0, 800);
      renderAll();
    };
    ['val-type', 'val-surface', 'val-annee', 'val-quartier', 'val-etat', 'val-prix', 'val-desc'].forEach(id => $(id).addEventListener('input', rd));
    $('val-files').addEventListener('change', onFiles);
    $('val-ai-btn').addEventListener('click', runAI);
    $('val-ann-btn').addEventListener('click', genAnnonce);
    $('val-copy').addEventListener('click', () => { const t = $('val-ann').value; if (t && navigator.clipboard) navigator.clipboard.writeText(t); });
    $('val-depot').addEventListener('click', toDepot);
    $('val-devis-btn').addEventListener('click', openDevis);
  }

  function renderAll() {
    const cur = compute(st.selected), base = compute(new Set());
    const lo = base.V * 0.93, hi = base.V * 1.07;
    const sou = st.bien.prixSouhaite;
    let souTxt = '';
    if (sou) { const d = (sou - base.V) / base.V * 100; souTxt = `Votre prix : ${money(sou)} (${d >= 0 ? '+' : ''}${d.toFixed(0)} % vs estimation)`; }
    $('val-hero').innerHTML = `
      <div class="val-kpi"><small>Prix en l'état</small><b>${money(base.V)}</b><em>Fourchette ${money(lo)} – ${money(hi)}</em></div>
      <div class="val-kpi gold"><small>Prix après travaux</small><b>${money(cur.apres)}</b><em>${st.selected.size ? 'Coût des travaux : ' + money(cur.cout) + ' · environ ' + cur.jours + ' j' : 'Choisissez un niveau de préparation'}</em></div>
      <div class="val-kpi ${cur.gainNet >= 0 ? 'pos' : 'neg'}"><small>Gain net estimé</small><b>${st.selected.size ? (cur.gainNet >= 0 ? '+' : '−') + money(Math.abs(cur.gainNet)) : '—'}</b><em>${st.selected.size ? 'Rendement des travaux : ' + (cur.roi * 100).toFixed(0) + ' %' : (souTxt || '&nbsp;')}</em></div>`;

    // préréglages
    const matches = id => { const ids = id === 'etat' ? new Set() : idsUpTo(id); return ids.size === st.selected.size && [...ids].every(x => st.selected.has(x)); };
    $('val-presets').innerHTML = [{ id: 'etat', label: 'En l\'état' }, ...GRADES.map(g => ({ id: g.id, label: g.short }))]
      .map(p => `<button type="button" class="val-chip${matches(p.id) ? ' on' : ''}" data-pre="${p.id}">${E(p.label)}</button>`).join('');
    $('val-presets').querySelectorAll('[data-pre]').forEach(b => b.onclick = () => { st.selected = b.dataset.pre === 'etat' ? new Set() : idsUpTo(b.dataset.pre); renderAll(); });

    // postes par grade
    const adv = {}; (st.ai?.conseils || []).forEach(c => { adv[c.poste_id] = c; });
    $('val-grades').innerHTML = GRADES.map(g => {
      const ps = POSTES.filter(p => p.grade === g.id).map(posteCalc);
      const tot = ps.filter(p => st.selected.has(p.id)).reduce((a, p) => a + p.cout, 0);
      return `<div class="val-grade"><header><div><b>${E(g.label)}</b><br><span>${E(g.desc)}</span></div><span>${tot ? money(tot) : ps.reduce((a, p) => a + p.cout, 0) ? 'jusqu\'à ' + money(ps.reduce((a, p) => a + p.cout, 0)) : ''}</span></header>
        ${ps.map(p => { const c = adv[p.id]; return `<label class="val-poste"><input type="checkbox" data-p="${p.id}"${st.selected.has(p.id) ? ' checked' : ''}>
          <span>${E(p.label)}${c ? `<span class="val-prio ${E(c.priorite)}">${E(c.priorite)}</span>` : ''}</span><span class="c">${money(p.cout)}</span><span class="g">+${money(p.gain)}</span>
          ${c ? `<span class="tip">${E(c.conseil)}</span>` : ''}</label>`; }).join('')}</div>`;
    }).join('');
    $('val-grades').querySelectorAll('input[data-p]').forEach(i => i.onchange = () => { i.checked ? st.selected.add(i.dataset.p) : st.selected.delete(i.dataset.p); renderAll(); });

    // barres
    const sc = scenarios(), max = Math.max(...sc.map(s => s.r.apres)) * 1.02;
    $('val-bars').innerHTML = sc.map(s => {
      const isCur = s.ids.size === st.selected.size && [...s.ids].every(x => st.selected.has(x));
      return `<div class="val-bar${isCur ? ' cur' : ''}"><span class="lbl">${E(s.label)}</span>
        <div class="t"><div class="f" style="width:${(s.r.apres / max * 100).toFixed(1)}%"></div><div class="k" style="width:${(s.r.V / max * 100).toFixed(1)}%"></div></div>
        <span>${money(s.r.apres)}${s.r.cout ? ` <small style="color:var(--mid)">(net ${s.r.gainNet >= 0 ? '+' : '−'}${money(Math.abs(s.r.gainNet))})</small>` : ''}</span></div>`;
    }).join('') + '<div style="font-size:11px;color:var(--mid)">Barre dorée : valeur en l\'état · barre grise : valeur après travaux · net = gain − coût des travaux.</div>';

    // IA
    $('val-ai').innerHTML = st.aiLoading ? '<div class="card-title">Analyse IA</div><div style="color:var(--mid);font-size:13px">Analyse en cours…</div>' :
      st.ai ? `<div class="card-title">Analyse IA</div>
        ${st.ai.synthese ? `<p style="margin:0 0 6px;font-size:14px;line-height:1.6">${E(st.ai.synthese)}</p>` : ''}
        ${st.ai.avis_prix ? `<p style="margin:0;font-size:13px;color:var(--mid)">${E(st.ai.avis_prix)}</p>` : ''}
        ${(st.ai.points_forts || []).length ? `<h4>Points forts</h4><ul>${st.ai.points_forts.map(x => `<li>${E(x)}</li>`).join('')}</ul>` : ''}
        ${(st.ai.points_faibles || []).length ? `<h4>Points d'amélioration</h4><ul>${st.ai.points_faibles.map(x => `<li>${E(x)}</li>`).join('')}</ul>` : ''}
        ${st.ai.strategie ? `<div class="val-note">Stratégie conseillée : <b>${E({ en_l_etat: 'vendre en l\'état', rangement: 'rangement', home_staging: 'home staging', rafraichissement: 'rafraîchissement', renovation: 'rénovation' }[st.ai.strategie] || st.ai.strategie)}</b></div>` : ''}`
      : `<div class="card-title">Analyse IA</div><div style="color:var(--mid);font-size:13px">${st.aiError ? E(st.aiError) : 'Lancez l\'analyse pour obtenir un diagnostic, l\'état détecté sur vos photos et la priorité de chaque poste.'}</div>`;

    // devis
    const metiers = [...new Set(cur.list.map(p => p.metier))];
    $('val-devis-info').textContent = st.selected.size
      ? `${cur.list.length} poste(s) sélectionné(s) · budget estimé ${money(cur.cout)} · métiers concernés : ${metiers.map(m => METIER_LABEL[m] || m).join(', ')}.`
      : 'Sélectionnez des travaux ci-dessus pour demander des devis aux artisans inscrits.';
    $('val-devis-btn').disabled = !st.selected.size;
  }

  /* ---------- Photos & IA ---------- */
  function resizeToB64(file, max = 1024) {
    return new Promise((resolve, reject) => {
      const img = new Image(), url = URL.createObjectURL(file);
      img.onload = () => {
        const k = Math.min(1, max / Math.max(img.width, img.height));
        const c = document.createElement('canvas'); c.width = Math.round(img.width * k); c.height = Math.round(img.height * k);
        c.getContext('2d').drawImage(img, 0, 0, c.width, c.height);
        URL.revokeObjectURL(url);
        resolve({ data: c.toDataURL('image/jpeg', 0.8).split(',')[1], mediaType: 'image/jpeg', url: c.toDataURL('image/jpeg', 0.5) });
      };
      img.onerror = reject; img.src = url;
    });
  }
  async function onFiles(e) {
    const files = [...e.target.files].slice(0, 4);
    st.photos = [];
    for (const f of files) { try { st.photos.push(await resizeToB64(f)); } catch (_) { /* image illisible : ignorée */ } }
    $('val-photos').innerHTML = st.photos.map(p => `<img alt="" src="${p.url}">`).join('');
  }

  async function runAI() {
    if (st.aiLoading) return;
    st.aiLoading = true; st.aiError = ''; renderAll();
    const b = st.bien;
    try {
      const r = await fetch('/api/valorisation', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          ...b, pm2: pm2Of(b.quartier),
          postes: POSTES.map(posteCalc).map(p => ({ id: p.id, label: p.label, grade: p.grade, cout: p.cout, gain: p.gain })),
          images: st.photos.map(p => ({ data: p.data, mediaType: p.mediaType }))
        })
      });
      const d = await r.json();
      if (!r.ok || d.error) throw new Error(d.error || 'Erreur ' + r.status);
      st.ai = d;
      if (ETAT_COEF[d.etat_detecte] && st.photos.length) { st.bien.etat = d.etat_detecte; $('val-etat').value = d.etat_detecte; }
      const pre = { en_l_etat: null, rangement: 'rangement', home_staging: 'staging', rafraichissement: 'rafraichissement', renovation: 'renovation' }[d.strategie];
      if (pre && !st.selected.size) st.selected = idsUpTo(pre);
    } catch (e) {
      st.ai = null; st.aiError = "L'analyse IA est momentanément indisponible. Les simulations ci-dessus restent valables.";
    }
    st.aiLoading = false; renderAll();
  }

  /* ---------- Annonce ---------- */
  async function genAnnonce() {
    const btn = $('val-ann-btn'), out = $('val-ann'), cur = compute(st.selected);
    btn.disabled = true; out.value = 'Rédaction en cours…';
    const trav = cur.list.map(p => p.label).join(', ');
    try {
      const r = await fetch('/api/generate-annonce', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          titre: `${st.bien.type} ${st.bien.surface} m² — ${st.bien.quartier}`, surface: st.bien.surface,
          prix: Math.round(cur.apres / 100000) * 100000,
          desc: (st.bien.description || '') + (trav ? ` Travaux de valorisation réalisés : ${trav}.` : ''),
          ton: $('val-ton').value.replace('&amp;', '&'), plateforme: 'Multi-plateformes', devise: 'F', pays: 'Nouvelle-Calédonie', ville: st.bien.quartier
        })
      });
      const d = await r.json();
      if (!r.ok || d.error) throw new Error(d.error || 'Erreur');
      out.value = d.annonce;
    } catch (e) { out.value = ''; alert("La génération d'annonce est momentanément indisponible. Réessayez dans un instant."); }
    btn.disabled = false;
  }
  function toDepot() {
    const cur = compute(st.selected), set = (id, v) => { const e = $(id); if (e) e.value = v; };
    set('d-titre', `${st.bien.type.charAt(0).toUpperCase() + st.bien.type.slice(1)} ${st.bien.surface} m² — ${st.bien.quartier}`);
    set('d-surface', st.bien.surface); set('d-prix', Math.round(cur.apres / 100000) * 100000); set('d-desc', $('val-ann').value || st.bien.description);
    go('depot');
  }

  /* ---------- Devis aux artisans ---------- */
  function artisansFor(metier) {
    return (typeof ARTISANS_DATA !== 'undefined' ? ARTISANS_DATA : []).filter(a => a.categorie === metier).sort((a, b) => b.note - a.note);
  }
  function openDevis() {
    const cur = compute(st.selected); if (!cur.list.length) return;
    const metiers = [...new Set(cur.list.map(p => p.metier))];
    const u = (typeof APP_STATE !== 'undefined' && APP_STATE.user) || {};
    const m = document.createElement('div'); m.className = 'val-mod'; m.id = 'val-devis-modal';
    m.innerHTML = `<div role="dialog" aria-modal="true" aria-label="Demande de devis">
      <div class="card-title" style="justify-content:space-between">Demande de devis <button type="button" class="btn btn-sm btn-outline" id="vd-x">Fermer</button></div>
      ${metiers.map(me => {
        const arts = artisansFor(me), postes = cur.list.filter(p => p.metier === me);
        return `<div style="margin-bottom:14px"><b style="font-size:14px">${E(METIER_LABEL[me] || me)}</b>
          <div style="font-size:12px;color:var(--mid);margin:2px 0 4px">${postes.map(p => E(p.label)).join(' · ')} — budget ${money(postes.reduce((a, p) => a + p.cout, 0))}</div>
          ${arts.length ? arts.map((a, i) => `<label class="val-art"><input type="checkbox" data-art="${a.id}" data-m="${me}"${i < 3 ? ' checked' : ''}>
              <span><b>${E(a.nom)}</b> · ${a.note}/5 (${a.avis} avis)${a.certifie ? ' · certifié' : ''}<small>${E(a.delai_moyen || '')}</small></span></label>`).join('')
            : `<div class="val-note">Aucun artisan inscrit pour ce métier pour l'instant. Votre demande sera publiée et transmise dès qu'un professionnel s'inscrira.</div>`}</div>`;
      }).join('')}
      <div class="val-row2"><div class="val-f"><label>Nom *</label><input id="vd-nom" value="${E(u.nom || '')}"></div><div class="val-f"><label>Téléphone *</label><input id="vd-tel" value="${E(u.tel || '')}"></div></div>
      <div class="val-f"><label>Délai souhaité</label><select id="vd-delai"><option>Dès que possible</option><option>Sous 1 mois</option><option>Sous 3 mois</option></select></div>
      <div class="val-f"><label>Message aux artisans</label><textarea id="vd-msg" rows="3" placeholder="Précisions, accès au bien, contraintes…"></textarea></div>
      <button type="button" class="btn btn-gold btn-full" id="vd-send">Envoyer la demande</button></div>`;
    document.body.appendChild(m);
    m.addEventListener('click', e => { if (e.target === m) m.remove(); });
    $('vd-x').onclick = () => m.remove();
    $('vd-send').onclick = () => sendDevis(m, cur);
  }

  async function sendDevis(m, cur) {
    const nom = $('vd-nom').value.trim(), tel = $('vd-tel').value.trim();
    if (!nom || !tel) { alert('Veuillez renseigner votre nom et votre téléphone.'); return; }
    const artIds = [...m.querySelectorAll('input[data-art]:checked')].map(i => parseInt(i.dataset.art));
    const desc = cur.list.map(p => `• ${p.label} (budget ~${Math.round(p.cout).toLocaleString('fr-FR')} F)`).join('\n') + ($('vd-msg').value ? '\n' + $('vd-msg').value.slice(0, 500) : '');
    const devis = {
      id: Date.now(), type: 'Valorisation — ' + [...new Set(cur.list.map(p => METIER_LABEL[p.metier] || p.metier))].join(', '),
      desc, nom, tel, budget: Math.round(cur.cout), delai: $('vd-delai').value, adresse: st.bien.quartier,
      statut: 'En attente', date: new Date().toLocaleDateString('fr-FR'), artisansContactes: artIds.length, artisanIds: artIds, postes: cur.list.map(p => p.id),
      message: ($('vd-msg').value || '').slice(0, 500),
      lignes: cur.list.map(p => ({ id: p.id, label: p.label, metier: p.metier, cout: p.cout })),
      bien: { type: st.bien.type, surface: st.bien.surface, quartier: st.bien.quartier }, metiers: [...new Set(cur.list.map(p => p.metier))], reponses: []
    };
    if (typeof devisEnCours !== 'undefined') devisEnCours.push(devis);
    // Enregistrement local + synchronisation (si connecté) via js/sync.js
    if (window.IMMO_ART) IMMO_ART.saveDevis();
    m.remove();
    const t = document.createElement('div');
    t.style.cssText = 'position:fixed;bottom:20px;right:20px;background:var(--dark);color:#fff;padding:12px 18px;border-radius:10px;font-size:13px;z-index:3000';
    t.textContent = artIds.length ? `Demande envoyée à ${artIds.length} artisan(s).` : 'Demande enregistrée. Elle sera transmise aux artisans inscrits.';
    document.body.appendChild(t); setTimeout(() => t.remove(), 4000);
    go('artisans'); setTimeout(() => { try { switchArtisanTab('devis'); } catch (_) { /* onglet absent */ } }, 80);
  }

  window.buildValorisation = buildValorisation;
  window.IMMO_VAL = { compute, POSTES, GRADES, METIER_LABEL, state: st }; // exposé pour les tests
})();
