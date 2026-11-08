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

  /* ---------- Diagnostic d'abord : l'état de chaque élément décide si un poste rapporte ----------
   * Un poste n'apporte de la valeur que s'il corrige un défaut constaté : repeindre des murs en bon état,
   * refaire une cuisine récente ou entretenir un jardin qui n'existe pas ne rapporte rien.
   * Coefficient « besoin » : 0 = inutile, 1 = gain plein, > 1 = défaut marqué (gain renforcé). */
  const DIAG = [
    { key: 'presentation', label: 'Présentation actuelle', opts: [['vide', 'Vide et propre'], ['meuble', 'Meublé, rangé'], ['encombre', 'Encombré ou à nettoyer']] },
    { key: 'defauts', label: 'Petits défauts (joints, prises, poignées…)', opts: [['aucun', 'Aucun'], ['quelques', 'Quelques-uns'], ['nombreux', 'Nombreux']] },
    { key: 'murs', label: 'Murs et peintures', opts: [['bon', 'En bon état'], ['defraichi', 'Défraîchis'], ['abime', 'Abîmés']] },
    { key: 'sols', label: 'Sols', opts: [['bon', 'En bon état'], ['use', 'Usés'], ['abime', 'Abîmés']] },
    { key: 'cuisine', label: 'Cuisine', opts: [['recente', 'Récente'], ['correcte', 'Correcte'], ['datee', 'Datée']] },
    { key: 'sdb', label: 'Salle de bain', opts: [['recente', 'Récente'], ['correcte', 'Correcte'], ['datee', 'Datée']] },
    { key: 'electricite', label: 'Électricité', opts: [['normes', 'Aux normes'], ['ancienne', 'Ancienne'], ['inconnue', 'Je ne sais pas']] },
    { key: 'clim', label: 'Climatisation', opts: [['complete', 'Toutes les pièces'], ['partielle', 'Certaines pièces'], ['aucune', 'Aucune']] },
    { key: 'menuiseries', label: 'Fenêtres, baies et volets', opts: [['bon', 'En bon état'], ['fatigue', 'Fatigués'], ['changer', 'À changer']] },
    { key: 'exterieur', label: 'Jardin ou terrasse', opts: [['sans', 'Pas d\'extérieur'], ['entretenu', 'Entretenu'], ['a_entretenir', 'À entretenir']] },
    { key: 'photos', label: 'Photos pour l\'annonce', opts: [['aucune', 'Pas encore'], ['telephone', 'Au téléphone'], ['pro', 'Professionnelles']] }
  ];
  const NEED = {
    desencombrement: { key: 'presentation', m: { vide: 0, meuble: 0.4, encombre: 1 } },
    nettoyage: { key: 'presentation', m: { vide: 0.2, meuble: 0.5, encombre: 1 } },
    reparations: { key: 'defauts', m: { aucun: 0, quelques: 0.7, nombreux: 1.2 } },
    exterieur: { key: 'exterieur', m: { sans: 0, entretenu: 0, a_entretenir: 1 } },
    staging: { key: 'presentation', m: { vide: 0.9, meuble: 0.5, encombre: 1 } },
    photos: { key: 'photos', m: { aucune: 1, telephone: 0.8, pro: 0 } },
    peinture: { key: 'murs', m: { bon: 0, defraichi: 1, abime: 1.3 } },
    sols: { key: 'sols', m: { bon: 0, use: 1, abime: 1.3 } },
    luminaires: { key: 'electricite', m: { normes: 0.2, ancienne: 1, inconnue: 0.6 } },
    cuisine: { key: 'cuisine', m: { recente: 0, correcte: 0.35, datee: 1.3 } },
    sdb: { key: 'sdb', m: { recente: 0, correcte: 0.35, datee: 1.3 } },
    electricite: { key: 'electricite', m: { normes: 0, ancienne: 1.2, inconnue: 0.6 } },
    clim: { key: 'clim', m: { complete: 0, partielle: 0.6, aucune: 1.2 } },
    menuiseries: { key: 'menuiseries', m: { bon: 0, fatigue: 0.8, changer: 1.3 } }
  };
  // Prestations : ajustements indicatifs de la valeur en l'état (le barème donne un prix moyen du secteur)
  const PRESTA = [
    { id: 'vue_mer', label: 'Vue mer ou lagon', up: 0.07 },
    { id: 'piscine', label: 'Piscine', up: 0.04 },
    { id: 'parking', label: 'Parking ou garage', up: 0.03 },
    { id: 'terrasse', label: 'Grande terrasse ou jardin', up: 0.03 },
    { id: 'securise', label: 'Résidence sécurisée', up: 0.02 }
  ];
  const diagLabel = (k, v) => { const d = DIAG.find(x => x.key === k); const o = d && d.opts.find(x => x[0] === v); return o ? o[1].toLowerCase() : ''; };

  const METIER_LABEL = {
    peinture: 'Peintre', plomberie: 'Plombier', electricite: 'Électricien', cuisine: 'Cuisiniste', climatisation: 'Climatisation',
    jardin: 'Paysagiste', photo: 'Photographe', menuiserie: 'Menuisier', nettoyage: 'Entreprise de nettoyage', homestaging: 'Home stager'
  };

  const st = {
    bien: { type: 'appartement', surface: 80, quartier: 'Magenta', annee: 2005, etat: 'correct', prixSouhaite: 0, description: '' },
    selected: new Set(), diag: {}, diagSrc: {}, presta: new Set(),
    ai: null, aiLoading: false, photos: [], annonce: ''
  };

  window.addEventListener('immo360:purge', () => { st.bien = { type: 'appartement', surface: 80, quartier: 'Magenta', annee: 2005, etat: 'correct', prixSouhaite: 0, description: '' }; st.selected = new Set(); st.diag = {}; st.diagSrc = {}; st.presta = new Set(); st.ai = null; st.photos = []; st.annonce = ''; });
  // Prix au m² conclu estimé (observatoire Immo360 ou barème calé ISEE) — js/estimation.js
  const estOf = (q, t) => window.IMMO_EST ? IMMO_EST.pm2(q, t) : { value: (typeof NC_PM2 !== 'undefined' && NC_PM2[q]) || 340000, label: 'Barème de référence' };
  const pm2Of = (q, t) => estOf(q, t).value;
  const money = v => (typeof conv === 'function' ? conv(v) : Math.round(v).toLocaleString('fr-FR') + ' F');
  const E = v => (typeof esc === 'function' ? esc(v) : String(v));
  const $ = id => document.getElementById(id);

  // statut : 'inconnu' (état pas encore décrit), 'inutile' (rien à corriger), 'utile', 'conseille' (défaut marqué)
  function posteCalc(p) {
    const s = st.bien.surface, V = baseValue(), nd = NEED[p.id];
    const v = nd ? st.diag[nd.key] : undefined;
    const need = nd ? (v === undefined ? null : (nd.m[v] ?? 0)) : 1;
    const statut = need === null ? 'inconnu' : need === 0 ? 'inutile' : need >= 1 ? 'conseille' : 'utile';
    const up = (need || 0) * p.up;
    return { ...p, cout: Math.round(p.cost(s) / 1000) * 1000, upEff: up, gain: Math.round(V * up / 1000) * 1000, statut, need, diagKey: nd && nd.key, diagVal: v };
  }
  function prestaCoef() { return PRESTA.filter(x => st.presta.has(x.id)).reduce((a, x) => a + x.up, 0); }
  function baseValue() { return pm2Of(st.bien.quartier, st.bien.type) * st.bien.surface * (ETAT_COEF[st.bien.etat] || 1) * (1 + prestaCoef()); }
  const diagCount = () => DIAG.filter(d => st.diag[d.key] !== undefined).length;

  function compute(ids) {
    const V = baseValue();
    const list = POSTES.filter(p => ids.has(p.id)).map(posteCalc).filter(p => p.statut !== 'inutile');
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
    // Un niveau ne retient que les postes qui corrigent un défaut constaté
    return new Set(POSTES.filter(p => GRADES.findIndex(g => g.id === p.grade) <= idx).map(posteCalc).filter(p => p.statut === 'utile' || p.statut === 'conseille').map(p => p.id));
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
.val-head h2{font-family:'Source Sans 3',sans-serif;font-size:24px;margin:0 0 4px}
.val-head p{color:var(--mid);font-size:13px;margin:0 0 18px}
.val-grid{display:grid;grid-template-columns:330px 1fr;gap:20px;align-items:start}
.val-side{position:sticky;top:8px}
.val-f{display:flex;flex-direction:column;gap:4px;margin-bottom:11px}
.val-f label{font-size:14px;font-weight:600;color:var(--dark)}
.val-f input,.val-f select,.val-f textarea{border:1px solid rgba(28,26,22,.15);border-radius:8px;padding:8px 10px;font:14px 'Source Sans 3',sans-serif;background:#fff;width:100%;box-sizing:border-box}
.val-row2{display:grid;grid-template-columns:1fr 1fr;gap:10px}
.val-photos{display:flex;flex-wrap:wrap;gap:6px;margin:6px 0 10px}
.val-photos img{width:58px;height:58px;object-fit:cover;border-radius:6px;border:1px solid rgba(28,26,22,.12)}
.val-hero{display:grid;grid-template-columns:repeat(3,1fr);gap:12px;margin-bottom:16px}
.val-kpi{background:#fff;border:1px solid rgba(28,26,22,.08);border-radius:12px;padding:14px 16px}
.val-kpi small{display:block;font-size:11px;color:var(--mid);margin-bottom:6px}
.val-kpi b{font:700 22px 'Source Sans 3',sans-serif;color:var(--dark)}
.val-kpi em{display:block;font-style:normal;font-size:12px;color:var(--mid);margin-top:3px}
.val-kpi.pos b{color:var(--green)}.val-kpi.neg b{color:var(--red)}.val-kpi.gold{background:var(--dark)}.val-kpi.gold small,.val-kpi.gold em{color:rgba(255,255,255,.6)}.val-kpi.gold b{color:var(--gold-light)}
.val-presets{display:flex;flex-wrap:wrap;gap:8px;margin-bottom:14px}
.val-chip{border:1px solid rgba(28,26,22,.15);background:#fff;border-radius:999px;padding:7px 14px;font:500 13px 'Source Sans 3',sans-serif;cursor:pointer;transition:.15s}
.val-chip:hover{border-color:var(--gold)}.val-chip.on{background:var(--dark);color:#fff;border-color:var(--dark)}
.val-grade{border:1px solid rgba(28,26,22,.1);border-radius:12px;margin-bottom:12px;background:#fff;overflow:hidden}
.val-grade>header{display:flex;justify-content:space-between;align-items:center;padding:12px 16px;background:var(--cream);cursor:pointer}
.val-grade>header b{font-size:14px}.val-grade>header span{font-size:12px;color:var(--mid)}
.val-poste{display:grid;grid-template-columns:22px 1fr auto auto;gap:12px;align-items:center;padding:10px 16px;border-top:1px solid rgba(28,26,22,.06);font-size:13px}
.val-poste input{width:17px;height:17px;accent-color:var(--gold)}
.val-poste .c{color:var(--mid);text-align:right;min-width:70px}.val-poste .g{color:var(--green);font-weight:600;text-align:right;min-width:78px}
.val-poste .tip{grid-column:2/5;font-size:12px;color:var(--mid);margin-top:-4px}
.val-prio{display:inline-block;font-size:10px;font-weight:700;padding:1px 7px;border-radius:99px;margin-left:6px;}
.val-prio.haute{background:#FDE8E4;color:#B83A2A}.val-prio.moyenne{background:#FEF3C7;color:#92400E}.val-prio.basse{background:#EEF2F6;color:#475569}
.val-lead{margin:-4px 0 12px;color:var(--mid);font-size:15px}
.val-diag{display:flex;flex-direction:column;border:1px solid var(--line);border-radius:12px;overflow:hidden}
.val-dl{display:grid;grid-template-columns:minmax(150px,1fr) auto;gap:10px;align-items:center;padding:9px 14px;border-top:1px solid var(--line)}
.val-dl:first-child{border-top:0}.val-dl .l{font-weight:600;font-size:14px}
.val-ia{font-style:normal;font-weight:600;font-size:12px;color:var(--gold);background:var(--gold-light);padding:1px 7px;border-radius:99px;margin-left:4px}
.val-seg{display:inline-flex;flex-wrap:wrap;gap:4px}
.val-seg button{border:1px solid var(--line-strong);background:#fff;border-radius:8px;padding:6px 11px;font-family:inherit;font-size:13.5px;cursor:pointer;color:var(--dark)}
.val-seg button:hover{border-color:var(--gold)}.val-seg button[aria-pressed=true]{background:var(--gold);border-color:var(--gold);color:#fff;font-weight:600}
.val-sub{font-weight:700;font-size:14px;margin:16px 0 8px}
.val-presta{display:flex;flex-wrap:wrap;gap:8px}
.val-pc{display:inline-flex!important;flex-direction:row!important;align-items:center;gap:6px;border:1px solid var(--line);border-radius:8px;padding:7px 11px;font-weight:500!important;font-size:14px!important;cursor:pointer;margin:0!important}
.val-pc input{width:16px;height:16px;accent-color:var(--gold);margin:0}.val-pc small{color:var(--green);font-weight:600}
.val-poste .why{display:block;font-size:12.5px;color:var(--mid);font-weight:400;margin-top:2px}
.val-poste.inutile{opacity:.55}.val-poste.inutile input{cursor:not-allowed}
.val-poste .g.q{color:var(--mid);font-weight:500;font-style:italic}.val-poste .g.z{color:var(--mid)}
.val-bars{display:flex;flex-direction:column;gap:9px}
.val-bar{display:grid;grid-template-columns:120px 1fr 120px;gap:10px;align-items:center;font-size:12px}
.val-bar .t{height:22px;background:var(--warm);border-radius:6px;position:relative;overflow:hidden}
.val-bar .f{position:absolute;inset:0 auto 0 0;background:var(--soft);border-radius:6px 0 0 6px}
.val-bar .k{position:absolute;inset:0 auto 0 0;background:var(--gold);border-radius:6px 0 0 6px}
.val-bar.cur .lbl{font-weight:700}
.val-ai h4{margin:12px 0 4px;font-size:12px;color:var(--mid)}
.val-ai ul{margin:0;padding-left:18px;font-size:13px;line-height:1.6}
.val-note{font-size:12px;color:var(--mid);background:var(--warm);border-radius:8px;padding:9px 12px;margin-top:10px;line-height:1.5}
.val-mod{position:fixed;inset:0;background:rgba(0,0,0,.5);z-index:2000;display:flex;align-items:center;justify-content:center;padding:16px}
.val-mod>div{background:#fff;border-radius:14px;max-width:620px;width:100%;max-height:90vh;overflow:auto;padding:22px}
.val-mod label.val-art{display:flex;flex-direction:row;justify-content:flex-start;gap:10px;align-items:center;padding:8px 10px;border:1px solid rgba(28,26,22,.1);border-radius:8px;margin:6px 0;font:400 13px 'Source Sans 3',sans-serif;text-transform:none;color:var(--dark);cursor:pointer}
.val-mod label.val-art input{width:17px;height:17px;flex:none;margin:0;accent-color:var(--gold)}
.val-mod label.val-art span{text-align:left;text-transform:none;}
.val-mod label.val-art small{color:var(--mid);display:block;text-transform:none;font-size:12px}
.val-mod .val-f label{display:block}
@media(max-width:700px){.val-dl{grid-template-columns:1fr}}
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
      <div class="card"><div class="card-title">1. L'état actuel de votre bien</div>
        <p class="val-lead">Décrivez chaque élément : un travail n'apporte de la valeur que s'il corrige un vrai défaut. <span id="val-diag-n"></span></p>
        <div class="val-diag" id="val-diag"></div>
        <div class="val-sub">Prestations du bien</div>
        <div class="val-presta" id="val-presta"></div>
      </div>
      <div class="card"><div class="card-title">2. Travaux et préparation</div>
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
        <textarea id="val-ann" rows="7" style="width:100%;box-sizing:border-box;border:1px solid rgba(28,26,22,.15);border-radius:8px;padding:10px;font:14px 'Source Sans 3',sans-serif" placeholder="L'annonce générée apparaîtra ici…"></textarea>
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
    if (st.photos.length) $('val-photos').innerHTML = st.photos.map(p => `<img alt="" src="${p.url}">`).join('');
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

  function renderDiag() {
    const n = diagCount();
    $('val-diag-n').textContent = n < DIAG.length ? `${n} sur ${DIAG.length} renseignés.` : 'Diagnostic complet.';
    $('val-diag').innerHTML = DIAG.map(d => `<div class="val-dl"><span class="l">${E(d.label)}${st.diagSrc[d.key] === 'ia' ? ' <em class="val-ia">vu sur les photos</em>' : ''}</span>
      <span class="val-seg" role="group" aria-label="${E(d.label)}">${d.opts.map(o => `<button type="button" data-k="${d.key}" data-v="${o[0]}" aria-pressed="${st.diag[d.key] === o[0]}">${E(o[1])}</button>`).join('')}</span></div>`).join('');
    $('val-diag').querySelectorAll('button[data-k]').forEach(b => b.onclick = () => {
      st.diag[b.dataset.k] = b.dataset.v; delete st.diagSrc[b.dataset.k];
      // un poste devenu inutile est retiré de la sélection
      POSTES.map(posteCalc).forEach(p => { if (p.statut === 'inutile') st.selected.delete(p.id); });
      renderAll();
    });
    $('val-presta').innerHTML = PRESTA.map(x => `<label class="val-pc"><input type="checkbox" data-pr="${x.id}"${st.presta.has(x.id) ? ' checked' : ''}> ${E(x.label)} <small>+${Math.round(x.up * 100)} %</small></label>`).join('');
    $('val-presta').querySelectorAll('input[data-pr]').forEach(i => i.onchange = () => { i.checked ? st.presta.add(i.dataset.pr) : st.presta.delete(i.dataset.pr); renderAll(); });
  }

  function renderAll() {
    renderDiag();
    const cur = compute(st.selected), base = compute(new Set());
    const lo = base.V * 0.93, hi = base.V * 1.07;
    const sou = st.bien.prixSouhaite;
    let souTxt = '';
    if (sou) { const d = (sou - base.V) / base.V * 100; souTxt = `Votre prix : ${money(sou)} (${d >= 0 ? '+' : ''}${d.toFixed(0)} % vs estimation)`; }
    $('val-hero').innerHTML = `
      <div class="val-kpi"><small>Prix en l'état</small><b>${money(base.V)}</b><em>Fourchette ${money(lo)} – ${money(hi)}</em><em style="font-size:11px;margin-top:4px" title="${E(estOf(st.bien.quartier, st.bien.type).label)}">${E(estOf(st.bien.quartier, st.bien.type).source === 'observatoire' ? 'Base : annonces Immo360 du secteur' : 'Base : barème calé sur les ventes 2025 (ISEE)')}${st.presta.size ? ' · prestations +' + Math.round(prestaCoef() * 100) + ' %' : ''}</em></div>
      <div class="val-kpi gold"><small>Prix après travaux</small><b>${money(cur.apres)}</b><em>${cur.list.length ? 'Coût des travaux : ' + money(cur.cout) + ' · environ ' + cur.jours + ' j' : diagCount() ? 'Choisissez les travaux utiles ci-dessous' : 'Décrivez d\'abord l\'état du bien'}</em></div>
      <div class="val-kpi ${cur.gainNet >= 0 ? 'pos' : 'neg'}"><small>Gain net estimé</small><b>${cur.list.length ? (cur.gainNet >= 0 ? '+' : '−') + money(Math.abs(cur.gainNet)) : '—'}</b><em>${cur.list.length ? 'Rendement des travaux : ' + (cur.roi * 100).toFixed(0) + ' %' : (souTxt || '&nbsp;')}</em></div>`;

    // préréglages
    const matches = id => { const ids = id === 'etat' ? new Set() : idsUpTo(id); return ids.size === st.selected.size && [...ids].every(x => st.selected.has(x)); };
    $('val-presets').innerHTML = [{ id: 'etat', label: 'En l\'état' }, ...GRADES.map(g => ({ id: g.id, label: g.short }))]
      .map(p => `<button type="button" class="val-chip${matches(p.id) ? ' on' : ''}" data-pre="${p.id}">${E(p.label)}</button>`).join('');
    $('val-presets').querySelectorAll('[data-pre]').forEach(b => b.onclick = () => { st.selected = b.dataset.pre === 'etat' ? new Set() : idsUpTo(b.dataset.pre); renderAll(); });

    // postes par grade
    const adv = {}; (st.ai?.conseils || []).forEach(c => { adv[c.poste_id] = c; });
    $('val-grades').innerHTML = GRADES.map(g => {
      const ps = POSTES.filter(p => p.grade === g.id).map(posteCalc);
      const tot = ps.filter(p => st.selected.has(p.id) && p.statut !== 'inutile').reduce((a, p) => a + p.cout, 0);
      return `<div class="val-grade"><header><div><b>${E(g.label)}</b><br><span>${E(g.desc)}</span></div><span>${tot ? money(tot) : ps.filter(p => p.statut !== 'inutile').length ? ps.filter(p => p.statut !== 'inutile').length + ' poste(s) utile(s) possible(s)' : diagCount() ? 'rien à faire ici' : ''}</span></header>
        ${ps.map(p => { const c = adv[p.id];
          const why = p.statut === 'inconnu' ? `Indiquez l'état « ${E((DIAG.find(d => d.key === p.diagKey) || {}).label || '')} » ci-dessus`
            : p.statut === 'inutile' ? `Pas nécessaire : ${E((DIAG.find(d => d.key === p.diagKey) || {}).label || '').toLowerCase()} — ${E(diagLabel(p.diagKey, p.diagVal))}`
            : `${E((DIAG.find(d => d.key === p.diagKey) || {}).label || '')} : ${E(diagLabel(p.diagKey, p.diagVal))}`;
          const gainTxt = p.statut === 'inconnu' ? '<span class="g q">à évaluer</span>' : p.statut === 'inutile' ? '<span class="g z">0 F</span>' : `<span class="g">+${money(p.gain)}</span>`;
          return `<label class="val-poste ${p.statut}"><input type="checkbox" data-p="${p.id}"${st.selected.has(p.id) && p.statut !== 'inutile' ? ' checked' : ''}${p.statut === 'inutile' ? ' disabled' : ''}>
          <span>${E(p.label)}${p.statut === 'conseille' ? '<span class="val-prio haute">conseillé</span>' : ''}${c ? `<span class="val-prio ${E(c.priorite)}">${E(c.priorite)}</span>` : ''}<small class="why">${why}</small></span><span class="c">${money(p.cout)}</span>${gainTxt}
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
    $('val-devis-info').textContent = cur.list.length
      ? `${cur.list.length} poste(s) sélectionné(s) · budget estimé ${money(cur.cout)} · métiers concernés : ${metiers.map(m => METIER_LABEL[m] || m).join(', ')}.`
      : 'Sélectionnez des travaux ci-dessus pour demander des devis aux artisans inscrits.';
    $('val-devis-btn').disabled = !cur.list.length;
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
          ...b, pm2: pm2Of(b.quartier, b.type),
          diagnostic: Object.fromEntries(DIAG.filter(d => st.diag[d.key] !== undefined).map(d => [d.key, st.diag[d.key]])),
          prestations: PRESTA.filter(x => st.presta.has(x.id)).map(x => x.label),
          postes: POSTES.map(posteCalc).map(p => ({ id: p.id, label: p.label, grade: p.grade, cout: p.cout, gain: p.statut === 'inconnu' ? null : p.gain, statut: p.statut })),
          images: st.photos.map(p => ({ data: p.data, mediaType: p.mediaType }))
        })
      });
      const d = await r.json();
      if (!r.ok || d.error) throw new Error(d.error || 'Erreur ' + r.status);
      st.ai = d;
      if (ETAT_COEF[d.etat_detecte] && st.photos.length) { st.bien.etat = d.etat_detecte; $('val-etat').value = d.etat_detecte; }
      // État vu sur les photos : ne remplit que les éléments que le vendeur n'a pas décrits
      if (st.photos.length && d.diagnostic && typeof d.diagnostic === 'object') DIAG.forEach(x => {
        const v = d.diagnostic[x.key];
        if (st.diag[x.key] === undefined && x.opts.some(o => o[0] === v)) { st.diag[x.key] = v; st.diagSrc[x.key] = 'ia'; }
      });
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
  // Reconstruite à chaque visite (l'état est conservé) : l'estimation suit les nouvelles annonces et barèmes
  window.IMMO_PANELS = Object.assign(window.IMMO_PANELS || {}, { valorisation: () => buildValorisation() });
  window.IMMO_VAL = { compute, POSTES, GRADES, METIER_LABEL, state: st }; // exposé pour les tests
})();
