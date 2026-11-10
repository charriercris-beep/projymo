/* Immo360 NC — Assistant de valorisation
 * Analyse du bien, prix en l'état / après travaux (par paliers), simulation en direct,
 * génération d'annonce et demande de devis aux artisans inscrits.
 * Dépend des globales de l'application : NC_PM2, ARTISANS_DATA, devisEnCours, APP_STATE, S, sb, conv, esc, go.
 */
(function () {
  'use strict';

  /* ---------- Moteur de calcul (déterministe, transparent) ---------- */
  // L'état n'est plus choisi d'un bloc : il se déduit du diagnostic élément par élément (voir COND)
  const ETAT_COEF = { a_renover: 0.80, correct: 0.92, bon: 1.0, tres_bon: 1.08 }; // utilisé seulement pour l'état détecté par l'IA
  const ETAT_LABEL = { a_renover: 'à rénover', correct: 'correct', bon: 'bon', tres_bon: 'très bon' };

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
    { id: 'exterieur', grade: 'rangement', label: 'Entretien du jardin / extérieur', metier: 'jardin', cost: (s, b) => 40000 + Math.min(5000, (b && (b.jardin || 0) + (b.terrasse || 0)) || s) * 200, up: 0.008, jours: 2 },
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
  // Effet de l'état de chaque élément sur la valeur en l'état, par rapport à un bien « moyen » du secteur
  // (le barème est une médiane de ventes : un élément non décrit est supposé dans la moyenne, effet 0)
  const COND = {
    presentation: { vide: 0, meuble: 0, encombre: -0.015 },
    defauts: { aucun: 0.005, quelques: -0.005, nombreux: -0.015 },
    murs: { bon: 0.01, defraichi: -0.015, abime: -0.03 },
    sols: { bon: 0.01, use: -0.015, abime: -0.03 },
    cuisine: { recente: 0.03, correcte: 0, datee: -0.04 },
    sdb: { recente: 0.02, correcte: 0, datee: -0.03 },
    electricite: { normes: 0.01, ancienne: -0.03, inconnue: -0.01 },
    clim: { complete: 0.02, partielle: 0, aucune: -0.02 },
    menuiseries: { bon: 0.01, fatigue: -0.015, changer: -0.03 },
    exterieur: { sans: 0, entretenu: 0.005, a_entretenir: -0.01 },
    photos: {}
  };
  // Année de construction (facultative)
  const ageCoef = a => { a = parseInt(a, 10); if (!a) return 0; return a >= 2015 ? 0.03 : a >= 2005 ? 0.01 : a >= 1990 ? 0 : a >= 1975 ? -0.02 : -0.04; };

  // Prestations, regroupées comme sur les grands portails ; ajustements indicatifs de la valeur en l'état
  const APPART = t => t === 'appartement' || t === 'studio';
  const PRESTA = [
    { g: 'Vue et situation', id: 'vue_mer', label: 'Vue mer ou lagon', up: 0.07 },
    { g: 'Vue et situation', id: 'vue_degagee', label: 'Vue dégagée', up: 0.02 },
    { g: 'Vue et situation', id: 'plage', label: 'Plage à pied', up: 0.03 },
    { g: 'Piscine et bien-être', id: 'piscine', label: 'Piscine privée', up: 0.05 },
    { g: 'Piscine et bien-être', id: 'piscine_res', label: 'Piscine de la résidence', up: 0.02, only: APPART },
    { g: 'Piscine et bien-être', id: 'spa', label: 'Spa ou jacuzzi', up: 0.015 },
    { g: 'Piscine et bien-être', id: 'pool_house', label: 'Pool house ou faré', up: 0.015, only: t => !APPART(t) },
    { g: 'Stationnement', id: 'garage', label: 'Garage ou box fermé', up: 0.03 },
    { g: 'Stationnement', id: 'parking_secu', label: 'Parking sécurisé', up: 0.02 },
    { g: 'Stationnement', id: 'parking', label: 'Place de parking', up: 0.015 },
    { g: 'Stationnement', id: 'carport', label: 'Carport', up: 0.01, only: t => !APPART(t) },
    { g: 'Sécurité et accès', id: 'securise', label: 'Résidence sécurisée ou gardien', up: 0.02 },
    { g: 'Sécurité et accès', id: 'ascenseur', label: 'Ascenseur', up: 0.01, only: APPART },
    { g: 'Sécurité et accès', id: 'alarme', label: 'Alarme ou vidéosurveillance', up: 0.005 },
    { g: 'Confort et annexes', id: 'dependance', label: 'Studio ou logement indépendant', up: 0.06, only: t => !APPART(t) },
    { g: 'Confort et annexes', id: 'solaire', label: 'Chauffe-eau ou panneaux solaires', up: 0.01 },
    { g: 'Confort et annexes', id: 'buanderie', label: 'Buanderie ou cellier', up: 0.005 },
    { g: 'Confort et annexes', id: 'dressing', label: 'Dressing', up: 0.005 },
    { g: 'Confort et annexes', id: 'cave', label: 'Cave ou local de rangement', up: 0.005 }
  ];
  const PRESTA_MAX = 0.25; // plafond : au-delà, le bien sort du marché de référence du secteur
  // Extérieurs en surface pondérée (usage des professionnels), sans double compte :
  // - terrasse ou balcon : 30 % du prix au m² en appartement, 15 % en maison (souvent déjà dans le prix du secteur) ;
  // - maison ou villa : le prix au m² du secteur inclut un terrain courant (~600 m²) ; seul le surplus compte (3 %) ;
  // - appartement : jardin privatif à 3 % jusqu'à 200 m², puis 1 %.
  const TERRAIN_INCLUS = 600;
  const extValue = (b, pm2) => {
    const t = Math.min(300, Math.max(0, +b.terrasse || 0)), j = Math.min(10000, Math.max(0, +b.jardin || 0));
    if (APPART(b.type)) return pm2 * (t * 0.30 + Math.min(j, 200) * 0.03 + Math.max(0, j - 200) * 0.01);
    return pm2 * (t * 0.15 + Math.max(0, j - TERRAIN_INCLUS) * 0.03);
  };
  const diagLabel = (k, v) => { const d = DIAG.find(x => x.key === k); const o = d && d.opts.find(x => x[0] === v); return o ? o[1].toLowerCase() : ''; };

  const METIER_LABEL = {
    peinture: 'Peintre', plomberie: 'Plombier', electricite: 'Électricien', cuisine: 'Cuisiniste', climatisation: 'Climatisation',
    jardin: 'Paysagiste', photo: 'Photographe', menuiserie: 'Menuisier', nettoyage: 'Entreprise de nettoyage', homestaging: 'Home stager'
  };

  const st = {
    bien: { type: '', surface: 0, quartier: '', annee: '', etat: '', prixSouhaite: 0, description: '' }, // on part de zéro : aucune valeur pré-remplie
    selected: new Set(), diag: {}, diagSrc: {}, presta: new Set(),
    ai: null, aiLoading: false, photos: [], annonce: ''
  };

  // Saisie conservée pour l'onglet en cours : une actualisation ne fait pas tout perdre
  const SKEY = 'immo360.val.v1';
  try {
    const sv = JSON.parse(sessionStorage.getItem(SKEY) || 'null');
    if (sv && sv.bien) { Object.assign(st.bien, sv.bien); st.selected = new Set(sv.selected || []); st.diag = sv.diag || {}; st.diagSrc = sv.diagSrc || {}; st.presta = new Set(sv.presta || []); }
  } catch (_) { /* rien à reprendre */ }
  function persist() { try { sessionStorage.setItem(SKEY, JSON.stringify({ bien: st.bien, selected: [...st.selected], diag: st.diag, diagSrc: st.diagSrc, presta: [...st.presta] })); } catch (_) { /* ignoré */ } }
  window.addEventListener('immo360:purge', () => { try { sessionStorage.removeItem(SKEY); } catch (_) { /* ignoré */ } });
  window.addEventListener('immo360:purge', () => { st.bien = { type: '', surface: 0, quartier: '', annee: '', etat: '', prixSouhaite: 0, description: '' }; st.selected = new Set(); st.diag = {}; st.diagSrc = {}; st.presta = new Set(); st.ai = null; st.photos = []; st.annonce = ''; });
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
    return { ...p, cout: Math.round(p.cost(s, st.bien) / 1000) * 1000, upEff: up, gain: Math.round(V * up / 1000) * 1000, statut, need, diagKey: nd && nd.key, diagVal: v };
  }
  const prestaOk = x => !x.only || x.only(st.bien.type);
  function prestaCoef() { return Math.min(PRESTA_MAX, PRESTA.filter(x => prestaOk(x) && st.presta.has(x.id)).reduce((a, x) => a + x.up, 0)); }
  function condCoef() { return DIAG.reduce((a, d) => a + ((COND[d.key] || {})[st.diag[d.key]] || 0), 0) + ageCoef(st.bien.annee); }
  // Valeur en l'état : prix au m² du secteur × surface, ajusté par l'état décrit, l'année, les prestations ; + extérieurs
  function parts() {
    const pm2 = pm2Of(st.bien.quartier, st.bien.type), brut = pm2 * st.bien.surface;
    const etat = condCoef(), presta = prestaCoef(), ext = extValue(st.bien, pm2);
    return { pm2, brut, etat, presta, ext, V: brut * (1 + etat) * (1 + presta) + ext };
  }
  function baseValue() { return parts().V; }
  // Détail du prix, facteur par facteur (la somme des montants redonne exactement la valeur en l'état)
  function facteurs() {
    const pt = parts(), out = [];
    DIAG.forEach(d => { const v = st.diag[d.key], pct = (COND[d.key] || {})[v] || 0; if (pct) out.push({ label: d.label + ' : ' + diagLabel(d.key, v), pct, montant: pt.brut * pct }); });
    const ag = ageCoef(st.bien.annee); if (ag) out.push({ label: 'Construit en ' + st.bien.annee, pct: ag, montant: pt.brut * ag });
    const pr = PRESTA.filter(x => prestaOk(x) && st.presta.has(x.id)), brutP = pr.reduce((a, x) => a + x.up, 0);
    pr.forEach(x => { const pct = brutP ? x.up * pt.presta / brutP : 0; out.push({ label: x.label, pct, montant: pt.brut * (1 + pt.etat) * pct, plafond: brutP > PRESTA_MAX }); });
    if (pt.ext) out.push({ label: 'Extérieurs (' + [st.bien.terrasse ? 'terrasse ' + st.bien.terrasse + ' m²' : '', st.bien.jardin ? 'jardin ' + st.bien.jardin + ' m²' : ''].filter(Boolean).join(', ') + ')', pct: 0, montant: pt.ext });
    return out;
  }
  // Ce qui ferait monter le prix : travaux rentables, puis informations qui resserrent la fourchette
  function leviers() {
    const l = POSTES.map(posteCalc).filter(p => (p.statut === 'utile' || p.statut === 'conseille') && p.gain - p.cout > 0)
      .sort((a, b) => (b.gain - b.cout) - (a.gain - a.cout)).slice(0, 3)
      .map(p => ({ txt: p.label, d: '+' + money(p.gain) + ' de valeur pour ' + money(p.cout) + ' de travaux' }));
    const reste = DIAG.length - diagCount();
    if (reste) l.push({ txt: 'Décrire encore ' + reste + ' élément' + (reste > 1 ? 's' : '') + ' de l\'état', d: 'la fourchette se resserre jusqu\'à ±5 %' });
    return l;
  }
  // État déduit (transmis à l'IA et utilisé pour la rédaction)
  function etatDeduit() { const c = condCoef(); return c <= -0.08 ? 'a_renover' : c < 0 ? 'correct' : c < 0.05 ? 'bon' : 'tres_bon'; }
  // Estimation possible seulement quand le vendeur a décrit son bien (type, surface, quartier, état)
  const MANQUE = { type: 'le type', surface: 'la surface', quartier: 'le quartier' };
  const manque = () => Object.keys(MANQUE).filter(k => !st.bien[k]).map(k => MANQUE[k]);
  const ready = () => !manque().length;
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
.val-head p{color:var(--mid);font-size:16px;margin:0 0 18px}
.val-head h2{font-size:28px;color:var(--ocean)}
.val-grid{display:grid;grid-template-columns:330px 1fr;gap:20px;align-items:start}
.val-side{position:sticky;top:8px}
.val-f{display:flex;flex-direction:column;gap:4px;margin-bottom:11px}
.val-f label{font-size:15px;font-weight:700;color:var(--dark)}
.val-f input,.val-f select,.val-f textarea{border:1.5px solid var(--line-strong);font-size:16px!important;border-radius:8px;padding:8px 10px;font:14px 'Source Sans 3',sans-serif;background:#fff;width:100%;box-sizing:border-box}
.val-row2{display:grid;grid-template-columns:1fr 1fr;gap:10px}
.val-photos{display:flex;flex-wrap:wrap;gap:6px;margin:6px 0 10px}
.val-photos img{width:58px;height:58px;object-fit:cover;border-radius:6px;border:1px solid rgba(28,26,22,.12)}
.val-hero{display:grid;grid-template-columns:repeat(3,1fr);gap:12px;margin-bottom:16px}
.val-kpi{background:#fff;border:1px solid #D3DEE2;border-top:4px solid var(--gold);border-radius:12px;padding:16px 18px;box-shadow:0 4px 14px rgba(15,42,56,.06)}
.val-kpi small{display:block;font-size:14px;font-weight:700;color:var(--ocean);margin-bottom:6px}
.val-kpi b{font:700 30px 'Source Sans 3',sans-serif;color:var(--dark);letter-spacing:-.02em}
.val-kpi em{display:block;font-style:normal;font-size:14px;color:var(--mid);margin-top:4px}
.val-kpi.pos{border-top-color:var(--green)}.val-kpi.pos b{color:var(--green)}.val-kpi.neg{border-top-color:var(--red)}.val-kpi.neg b{color:var(--red)}
.val-kpi.gold{background:var(--ocean);border-color:var(--ocean);border-top-color:var(--lagoon)}.val-kpi.gold small{color:#9BEAE3}.val-kpi.gold em{color:rgba(255,255,255,.85)}.val-kpi.gold b{color:#fff}
.val-presets{display:flex;flex-wrap:wrap;gap:8px;margin-bottom:14px}
.val-chip{border:1.5px solid var(--line-strong);background:#fff;border-radius:999px;padding:8px 16px;font:600 15px 'Source Sans 3',sans-serif;color:var(--dark);cursor:pointer;transition:.15s}
.val-chip:hover{border-color:var(--gold)}.val-chip.on{background:var(--gold);color:#fff;border-color:var(--gold)}
.val-grade{border:1px solid #C9D6DB;border-radius:12px;margin-bottom:12px;background:#fff;overflow:hidden}
.val-grade>header{display:flex;justify-content:space-between;align-items:center;padding:12px 16px;background:var(--lagoon-pale);border-bottom:1px solid #CDE9E6}
.val-grade>header b{font-size:16px;color:var(--ocean)}.val-grade>header span{font-size:14px;color:var(--mid)}
.val-poste{display:grid;grid-template-columns:22px 1fr auto auto;gap:12px;align-items:center;padding:11px 16px;border-top:1px solid #E1E9EC;font-size:15px}
.val-poste input{width:17px;height:17px;accent-color:var(--gold)}
.val-poste .c{color:var(--dark);text-align:right;min-width:80px}.val-poste .g{color:var(--green);font-weight:700;text-align:right;min-width:88px}
.val-poste .tip{grid-column:2/5;font-size:12px;color:var(--mid);margin-top:-4px}
.val-prio{display:inline-block;font-size:10px;font-weight:700;padding:1px 7px;border-radius:99px;margin-left:6px;}
.val-prio.haute{background:#FDE8E4;color:#B83A2A}.val-prio.moyenne{background:#FEF3C7;color:#92400E}.val-prio.basse{background:#EEF2F6;color:#475569}
.val-lead{margin:-4px 0 12px;color:var(--mid);font-size:16px}
.val-diag{display:flex;flex-direction:column;border:1px solid #C9D6DB;border-radius:12px;overflow:hidden}
.val-dl{display:grid;grid-template-columns:minmax(150px,1fr) auto;gap:10px;align-items:center;padding:10px 14px;border-top:1px solid var(--line)}
.val-dl:nth-child(even){background:#F4F8F9}
.val-dl:first-child{border-top:0}.val-dl .l{font-weight:600;font-size:14px}
.val-ia{font-style:normal;font-weight:600;font-size:12px;color:var(--gold);background:var(--gold-light);padding:1px 7px;border-radius:99px;margin-left:4px}
.val-seg{display:inline-flex;flex-wrap:wrap;gap:4px}
.val-seg button{border:1.5px solid var(--line-strong);font-weight:500;background:#fff;border-radius:8px;padding:6px 11px;font-family:inherit;font-size:13.5px;cursor:pointer;color:var(--dark)}
.val-seg button:hover{border-color:var(--gold)}.val-seg button[aria-pressed=true]{background:var(--gold);border-color:var(--gold);color:#fff;font-weight:600}
.val-sub{font-weight:700;font-size:14px;margin:16px 0 8px}
.val-presta{display:flex;flex-direction:column;gap:12px}
.val-vente{border:2px solid var(--gold)!important}
.val-px{display:flex;flex-direction:column;gap:8px;margin:4px 0 14px}
.val-pxo{display:flex!important;flex-direction:row!important;align-items:center;gap:12px;border:1.5px solid var(--line-strong);border-radius:10px;padding:12px 14px;cursor:pointer;margin:0!important;font-weight:500!important}
.val-pxo input{width:18px;height:18px;accent-color:var(--gold);margin:0}.val-pxo span{flex:1;font-size:16px}.val-pxo b{font-size:20px;color:var(--ocean)}
.val-pxo.on{border-color:var(--gold);background:var(--lagoon-pale)}
.val-txt{margin:0 0 14px}.val-txt summary{cursor:pointer;font-weight:600;color:var(--gold);padding:6px 0;font-size:15px}
.val-go{font-size:17px!important;padding:13px 26px!important}
.val-acts{display:flex;gap:10px;flex-wrap:wrap;align-items:center}
.val-hint{margin:-4px 0 0;font-size:13.5px;color:var(--mid)}
.val-ext{display:grid;grid-template-columns:1fr 1fr;gap:12px;max-width:520px}
.val-pg>b{display:block;font-size:14px;color:var(--ocean);margin-bottom:6px}.val-pg>div{display:flex;flex-wrap:wrap;gap:8px}
.val-det{font-size:13px!important;color:var(--dark)!important;margin-top:6px!important}
.val-pc{display:inline-flex!important;flex-direction:row!important;align-items:center;gap:6px;border:1px solid var(--line);border-radius:8px;padding:7px 11px;font-weight:500!important;font-size:14px!important;cursor:pointer;margin:0!important}
.val-pc input{width:16px;height:16px;accent-color:var(--gold);margin:0}.val-pc small{color:var(--green);font-weight:600}
.val-poste .why{display:block;font-size:12.5px;color:var(--mid);font-weight:400;margin-top:2px}
.val-poste.inutile{opacity:.55}.val-poste.inutile input{cursor:not-allowed}
.val-poste .g.q{color:var(--mid);font-weight:500;font-style:italic}.val-poste .g.z{color:var(--mid)}
.val-wait{margin:0;padding:16px;background:var(--cream);border-radius:10px;color:var(--mid);font-size:15px}
.val-opt{color:var(--mid);font-size:12.5px}
.val-bars{display:flex;flex-direction:column;gap:9px}
.val-bar{display:grid;grid-template-columns:120px 1fr 120px;gap:10px;align-items:center;font-size:12px}
.val-bar .t{height:22px;background:var(--warm);border-radius:6px;position:relative;overflow:hidden}
.val-bar .f{position:absolute;inset:0 auto 0 0;background:var(--soft);border-radius:6px 0 0 6px}
.val-bar .k{position:absolute;inset:0 auto 0 0;background:var(--gold);border-radius:6px 0 0 6px}
.val-bar.cur .lbl{font-weight:700}
.val-ai h4{margin:12px 0 4px;font-size:12px;color:var(--mid)}
.val-ai ul{margin:0;padding-left:18px;font-size:13px;line-height:1.6}
.val-why .card-title{display:flex;justify-content:space-between;gap:10px;align-items:baseline}
.val-why .vw-ia{background:var(--lagoon-pale);border-radius:10px;padding:10px 12px;margin:0 0 12px;font-size:15px;line-height:1.55}.val-why .vw-ia small{display:block;font-size:12px;font-weight:700;color:var(--gold-dark);text-transform:uppercase;letter-spacing:.04em;margin-bottom:2px}
.vw-row{display:grid;grid-template-columns:minmax(0,1.3fr) minmax(60px,1fr) auto;gap:10px;align-items:center;padding:6px 0;border-top:1px solid var(--line);font-size:14.5px}
.vw-row:first-of-type{border-top:0}.vw-row .b{height:10px;border-radius:99px;background:var(--warm);position:relative;overflow:hidden}.vw-row .b i{position:absolute;inset:0 auto 0 0;border-radius:99px;background:var(--green)}
.vw-row.neg .b i{background:var(--red)}.vw-row.base .b i{background:var(--gold)}.vw-row .m{text-align:right;white-space:nowrap;font-weight:600}.vw-row .m small{display:block;font-weight:400;color:var(--mid);font-size:12px}
.vw-row.neg .m{color:var(--red)}.vw-row.tot{border-top:2px solid var(--dark);font-weight:700}.vw-row.tot .m{font-size:17px}
.vw-lev{margin:12px 0 0;padding:0;list-style:none;display:grid;gap:6px}.vw-lev li{background:var(--cream);border-radius:8px;padding:7px 10px;font-size:14.5px}.vw-lev small{display:block;color:var(--mid);font-size:13px}
.vw-h{font-size:13px;font-weight:700;text-transform:uppercase;letter-spacing:.04em;color:var(--mid);margin:14px 0 0}
.val-note{font-size:14px;color:var(--dark);background:var(--lagoon-pale);border-radius:8px;padding:9px 12px;margin-top:10px;line-height:1.5}
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
      <div class="val-f"><label>Type</label><select id="val-type"><option value="">Choisir…</option><option value="appartement">Appartement</option><option value="maison">Maison</option><option value="villa">Villa</option><option value="studio">Studio</option></select></div>
      <div class="val-row2">
        <div class="val-f"><label>Surface (m²)</label><input id="val-surface" type="number" min="10" max="2000" inputmode="numeric" value="${b.surface || ''}"></div>
        <div class="val-f"><label>Année</label><input id="val-annee" type="number" min="1900" max="2030" inputmode="numeric" value="${b.annee || ''}" aria-describedby="val-annee-f"><small id="val-annee-f" class="val-opt">Facultatif</small></div>
      </div>
      <div class="val-f"><label>Quartier</label><select id="val-quartier"><option value="">Choisir…</option>${quartiers.map(q => `<option${q === b.quartier ? ' selected' : ''}>${E(q)}</option>`).join('')}</select></div>
      <div class="val-f"><label>Prix souhaité (F, facultatif)</label><input id="val-prix" type="number" min="0" step="100000" value="${b.prixSouhaite || ''}" placeholder="ex. 45000000"></div>
      <div class="val-f"><label>Description</label><textarea id="val-desc" rows="3" placeholder="Atouts, particularités, travaux déjà faits…">${E(b.description)}</textarea></div>
      <div class="val-f"><label>Photos (jusqu'à 4, pour l'analyse IA)</label><input id="val-files" type="file" accept="image/*" multiple></div>
      <div class="val-photos" id="val-photos"></div>
      <button type="button" class="btn btn-gold btn-full" id="val-ai-btn">Lancer l'analyse IA</button>
      <div class="val-note">Les montants sont calculés par notre barème NC (prix au m² du quartier, coût des travaux selon la surface). L'IA apporte le diagnostic, l'état détecté sur photos et la priorité des travaux.</div>
    </aside>
    <section>
      <div class="val-hero" id="val-hero"></div>
      <div class="card val-why" id="val-why" hidden></div>
      <div class="card"><div class="card-title">1. L'état actuel de votre bien</div>
        <p class="val-lead">Décrivez chaque élément : un travail n'apporte de la valeur que s'il corrige un vrai défaut. <span id="val-diag-n"></span></p>
        <div class="val-diag" id="val-diag"></div>
        <div class="val-sub">Extérieurs et prestations</div>
        <div class="val-presta" id="val-presta"></div>
      </div>
      <div class="card"><div class="card-title">2. Travaux et préparation</div>
        <div class="val-presets" id="val-presets"></div>
        <div id="val-grades"></div>
      </div>
      <div class="card"><div class="card-title">Comparaison des scénarios</div><div class="val-bars" id="val-bars"></div></div>
      <div class="card"><div class="card-title">Devis d'artisans</div>
        <p style="font-size:15px;color:var(--mid);margin:0 0 12px" id="val-devis-info"></p>
        <button type="button" class="btn btn-outline" id="val-devis-btn">Demander des devis aux artisans</button>
      </div>
      <div class="card val-ai" id="val-ai"></div>
      <div class="card val-vente" id="val-vente"><div class="card-title">3. Mettre en vente</div>
        <p class="val-lead">Votre estimation est prête : déposez l'annonce, tout ce que vous avez saisi est repris (type, lieu, surface, prestations, prix).</p>
        <div class="val-px" id="val-px" role="radiogroup" aria-label="Prix de l'annonce"></div>
        <details class="val-txt"><summary>Rédiger le texte de l'annonce maintenant (facultatif)</summary>
          <div class="val-row2">
            <div class="val-f"><label>Ton</label><select id="val-ton"><option>Moderne &amp; dynamique</option><option>Familial &amp; chaleureux</option><option>Luxe &amp; prestige</option><option>Investisseur</option></select></div>
            <div class="val-f"><label>&nbsp;</label><button type="button" class="btn btn-outline btn-full" id="val-ann-btn">Rédiger le texte</button></div>
          </div>
          <textarea id="val-ann" rows="6" style="width:100%;box-sizing:border-box;border:1.5px solid var(--line-strong);border-radius:8px;padding:10px;font:15px 'Source Sans 3',sans-serif" placeholder="Le texte rédigé apparaîtra ici ; vous pourrez le modifier."></textarea>
          <button type="button" class="btn btn-sm btn-outline" id="val-copy" style="margin-top:8px">Copier</button>
        </details>
        <div class="val-acts"><button type="button" class="btn btn-gold val-go" id="val-depot">Déposer mon annonce</button>
          <button type="button" class="btn btn-outline" id="val-rapport" hidden>Rapport d'estimation (PDF)</button></div>
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
      const sf = parseInt($('val-surface').value, 10);
      st.bien.surface = sf >= 10 ? Math.min(2000, sf) : 0; // pas de surface par défaut
      st.bien.annee = parseInt($('val-annee').value, 10) || '';
      st.bien.quartier = $('val-quartier').value;
      st.bien.prixSouhaite = parseInt($('val-prix').value) || 0;
      st.bien.description = $('val-desc').value.slice(0, 800);
      renderAll();
    };
    ['val-type', 'val-surface', 'val-annee', 'val-quartier', 'val-prix', 'val-desc'].forEach(id => $(id).addEventListener('input', rd));
    $('val-files').addEventListener('change', onFiles);
    $('val-ai-btn').addEventListener('click', runAI);
    $('val-ann-btn').addEventListener('click', genAnnonce);
    $('val-copy').addEventListener('click', () => { const t = $('val-ann').value; if (t && navigator.clipboard) navigator.clipboard.writeText(t); });
    $('val-depot').addEventListener('click', toDepot);
    $('val-rapport').addEventListener('click', rapport);
    $('val-devis-btn').addEventListener('click', openDevis);
  }

  function renderDiag(keepInputs) {
    if (keepInputs) return; // saisie en cours dans un champ du diagnostic
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
    const groupes = [...new Set(PRESTA.map(x => x.g))];
    const jl = APPART(st.bien.type) ? 'Jardin privatif (m²)' : 'Jardin ou terrain (m²)';
    $('val-presta').innerHTML = `<div class="val-ext">
        <div class="val-f"><label for="val-terrasse">Terrasse ou balcon (m²)</label><input id="val-terrasse" type="number" min="0" max="300" inputmode="numeric" value="${st.bien.terrasse || ''}"></div>
        <div class="val-f"><label for="val-jardin">${jl}</label><input id="val-jardin" type="number" min="0" max="10000" inputmode="numeric" value="${st.bien.jardin || ''}"></div>
      </div><p class="val-hint">${APPART(st.bien.type) ? 'Comptés en surface pondérée : terrasse à 30 % du prix au m², jardin privatif à 3 %.' : 'Le prix du secteur comprend déjà un terrain d\'environ ' + TERRAIN_INCLUS + ' m² : seul le surplus est ajouté. Terrasse comptée à 15 % du prix au m².'}</p>` + groupes.map(g => {
        const items = PRESTA.filter(x => x.g === g && prestaOk(x)); if (!items.length) return '';
        return `<div class="val-pg"><b>${E(g)}</b><div>${items.map(x => `<label class="val-pc"><input type="checkbox" data-pr="${x.id}"${st.presta.has(x.id) ? ' checked' : ''}> ${E(x.label)} <small>+${(x.up * 100).toLocaleString('fr-FR')} %</small></label>`).join('')}</div></div>`;
      }).join('');
    $('val-presta').querySelectorAll('input[data-pr]').forEach(i => i.onchange = () => { i.checked ? st.presta.add(i.dataset.pr) : st.presta.delete(i.dataset.pr); renderAll(); });
    // Saisie des surfaces extérieures : mise à jour du prix sans redessiner les champs (le curseur reste en place)
    ['terrasse', 'jardin'].forEach(k => { const f = $('val-' + k); f.oninput = () => { st.bien[k] = Math.max(0, parseInt(f.value, 10) || 0); renderAll(true); }; });
  }

  function renderAI() {
    $('val-ai').innerHTML = st.aiLoading ? '<div class="card-title">Analyse IA</div><div style="color:var(--mid);font-size:13px">Analyse en cours…</div>' :
      st.ai ? `<div class="card-title">Analyse IA</div>
        ${st.ai.synthese ? `<p style="margin:0 0 6px;font-size:14px;line-height:1.6">${E(st.ai.synthese)}</p>` : ''}
        ${st.ai.avis_prix ? `<p style="margin:0;font-size:13px;color:var(--mid)">${E(st.ai.avis_prix)}</p>` : ''}
        ${(st.ai.points_forts || []).length ? `<h4>Points forts</h4><ul>${st.ai.points_forts.map(x => `<li>${E(x)}</li>`).join('')}</ul>` : ''}
        ${(st.ai.points_faibles || []).length ? `<h4>Points d'amélioration</h4><ul>${st.ai.points_faibles.map(x => `<li>${E(x)}</li>`).join('')}</ul>` : ''}
        ${st.ai.strategie ? `<div class="val-note">Stratégie conseillée : <b>${E({ en_l_etat: 'vendre en l\'état', rangement: 'rangement', home_staging: 'home staging', rafraichissement: 'rafraîchissement', renovation: 'rénovation' }[st.ai.strategie] || st.ai.strategie)}</b></div>` : ''}`
      : `<div class="card-title">Analyse IA</div><div style="color:var(--mid);font-size:13px">${st.aiError ? E(st.aiError) : 'Lancez l\'analyse pour obtenir un diagnostic, l\'état détecté sur vos photos et la priorité de chaque poste.'}</div>`;

  }

  function renderWhy(pt, V, spread) {
    const box = $('val-why'); if (!box) return;
    box.hidden = false;
    const f = facteurs(), max = Math.max(pt.brut, ...f.map(x => Math.abs(x.montant))) || 1;
    const pc = v => (v >= 0 ? '+' : '−') + Math.abs(Math.round(v * 1000) / 10).toLocaleString('fr-FR') + ' %';
    const row = (cls, lbl, m, sub) => `<div class="vw-row ${cls}"><span>${E(lbl)}</span><span class="b"><i style="width:${Math.max(2, Math.abs(m) / max * 100).toFixed(1)}%"></i></span><span class="m">${m < 0 ? '−' : cls === 'base' || cls === 'tot' ? '' : '+'}${money(Math.abs(m))}${sub ? `<small>${E(sub)}</small>` : ''}</span></div>`;
    const ia = st.ai && st.ai.explication_prix;
    const lev = leviers();
    box.innerHTML = `<div class="card-title"><span>Pourquoi ce prix ?</span><small style="font-weight:400;color:var(--mid);font-size:13px">fourchette ±${Math.round(spread * 100)} %</small></div>
      ${ia ? `<div class="vw-ia"><small>Expliqué par l'IA</small>${E(ia)}</div>` : ''}
      ${row('base', 'Prix du secteur : ' + money(pt.pm2) + '/m² × ' + st.bien.surface + ' m²', pt.brut, estOf(st.bien.quartier, st.bien.type).source === 'observatoire' ? 'annonces Immo360 du secteur' : 'ventes 2025 (ISEE)')}
      ${f.map(x => row(x.montant < 0 ? 'neg' : 'pos', x.label, x.montant, x.pct ? pc(x.pct) + (x.plafond ? ' (plafonné)' : '') : '')).join('')}
      ${row('tot', 'Valeur en l\'état', V, '')}
      ${f.length ? '' : '<p class="val-wait" style="margin:8px 0 0">Décrivez l\'état et les prestations : chaque élément ajustera le prix ici, avec son montant.</p>'}
      ${lev.length ? `<p class="vw-h">Pour faire monter le prix</p><ul class="vw-lev">${lev.map(l => `<li>${E(l.txt)}<small>${E(l.d)}</small></li>`).join('')}</ul>` : ''}`;
  }

  function renderAll(keepInputs) {
    persist();
    renderDiag(keepInputs);
    if (!ready()) {
      const m = manque(), txt = 'Indiquez ' + (m.length > 1 ? m.slice(0, -1).join(', ') + ' et ' + m[m.length - 1] : m[0]) + ' de votre bien.';
      $('val-hero').innerHTML = `
      <div class="val-kpi"><small>Prix en l'état</small><b>—</b><em>${E(txt)}</em></div>
      <div class="val-kpi gold"><small>Prix après travaux</small><b>—</b><em>Calculé après la description du bien</em></div>
      <div class="val-kpi"><small>Gain net estimé</small><b>—</b><em>&nbsp;</em></div>`;
      $('val-presets').innerHTML = '';
      $('val-grades').innerHTML = `<p class="val-wait">Commencez par « Votre bien » : ${E(txt.charAt(0).toLowerCase() + txt.slice(1))} Les travaux et leur effet sur le prix s'afficheront ensuite.</p>`;
      $('val-bars').innerHTML = '<p class="val-wait">Les scénarios apparaîtront une fois le bien décrit.</p>';
      $('val-devis-info').textContent = 'Décrivez votre bien puis choisissez les travaux utiles pour demander des devis.';
      $('val-devis-btn').disabled = true;
      ['val-ai-btn', 'val-ann-btn', 'val-depot'].forEach(id => { if ($(id)) $(id).disabled = true; });
      renderAI();
      if ($('val-why')) $('val-why').hidden = true;
      return;
    }
    ['val-ai-btn', 'val-ann-btn', 'val-depot'].forEach(id => { if ($(id)) $(id).disabled = false; });
    if (window.IMMO_EVT) IMMO_EVT.track('estimation'); // une fois par onglet (journal anonyme)
    if ($('val-rapport')) $('val-rapport').hidden = !rapportPermis();
    const cur = compute(st.selected), base = compute(new Set());
    // Plus le bien est décrit, plus la fourchette est étroite (±12 % sans description, ±5 % avec tout)
    const pt = parts(), spread = 0.12 - 0.07 * (diagCount() / DIAG.length) - (st.bien.annee ? 0.005 : 0);
    const lo = base.V * (1 - spread), hi = base.V * (1 + spread);
    const pc = v => (v >= 0 ? '+' : '−') + Math.abs(Math.round(v * 1000) / 10).toLocaleString('fr-FR') + ' %';
    const detail = [`Secteur : ${money(pt.pm2)}/m² × ${st.bien.surface} m²`, diagCount() || st.bien.annee ? 'état ' + pc(pt.etat) : '', pt.presta ? 'prestations ' + pc(pt.presta) : '', pt.ext ? 'extérieurs +' + money(pt.ext) : ''].filter(Boolean).join(' · ');
    const sou = st.bien.prixSouhaite;
    let souTxt = '';
    if (sou) { const d = (sou - base.V) / base.V * 100; souTxt = `Votre prix : ${money(sou)} (${d >= 0 ? '+' : ''}${d.toFixed(0)} % vs estimation)`; }
    $('val-hero').innerHTML = `
      <div class="val-kpi"><small>Prix en l'état</small><b>${money(base.V)}</b><em>Fourchette ${money(lo)} – ${money(hi)}</em><em class="val-det">${E(detail)}</em><em style="font-size:12px;margin-top:4px" title="${E(estOf(st.bien.quartier, st.bien.type).label)}">${E(estOf(st.bien.quartier, st.bien.type).source === 'observatoire' ? 'Base : annonces Immo360 du secteur' : 'Base : barème calé sur les ventes 2025 (ISEE)')}</em></div>
      <div class="val-kpi gold"><small>Prix après travaux</small><b>${money(cur.apres)}</b><em>${cur.list.length ? 'Coût des travaux : ' + money(cur.cout) + ' · environ ' + cur.jours + ' j' : diagCount() ? 'Choisissez les travaux utiles ci-dessous' : 'Décrivez d\'abord l\'état du bien'}</em></div>
      <div class="val-kpi ${cur.gainNet >= 0 ? 'pos' : 'neg'}"><small>Gain net estimé</small><b>${cur.list.length ? (cur.gainNet >= 0 ? '+' : '−') + money(Math.abs(cur.gainNet)) : '—'}</b><em>${cur.list.length ? 'Rendement des travaux : ' + (cur.roi * 100).toFixed(0) + ' %' : (souTxt || '&nbsp;')}</em></div>`;

    renderWhy(pt, base.V, spread);
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

    renderAI();
    // Mettre en vente : prix de l'annonce (en l'état, après travaux, ou prix souhaité)
    const choix = [['etat', 'Vendre en l\'état', base.V]].concat(cur.list.length ? [['travaux', 'Vendre après les travaux choisis', cur.apres]] : []).concat(st.bien.prixSouhaite ? [['souhaite', 'Mon prix souhaité', st.bien.prixSouhaite]] : []);
    // Par défaut le prix suit les travaux choisis ; un choix fait par le vendeur est respecté
    if (!st.prixManuel || !choix.some(c => c[0] === st.prixChoix)) { st.prixManuel = false; st.prixChoix = cur.list.length ? 'travaux' : 'etat'; }
    $('val-px').innerHTML = choix.map(c => `<label class="val-pxo${st.prixChoix === c[0] ? ' on' : ''}"><input type="radio" name="val-px" value="${c[0]}"${st.prixChoix === c[0] ? ' checked' : ''}><span>${E(c[1])}</span><b>${money(Math.round(c[2] / 100000) * 100000)}</b></label>`).join('');
    $('val-px').querySelectorAll('input').forEach(i => i.onchange = () => { st.prixChoix = i.value; st.prixManuel = true; renderAll(); });
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
          ...b, etat: etatDeduit(), pm2: pm2Of(b.quartier, b.type),
          diagnostic: Object.fromEntries(DIAG.filter(d => st.diag[d.key] !== undefined).map(d => [d.key, st.diag[d.key]])),
          prestations: PRESTA.filter(x => prestaOk(x) && st.presta.has(x.id)).map(x => x.label).concat(b.terrasse ? ['terrasse ' + b.terrasse + ' m²'] : [], b.jardin ? ['jardin ' + b.jardin + ' m²'] : []),
          postes: POSTES.map(posteCalc).map(p => ({ id: p.id, label: p.label, grade: p.grade, cout: p.cout, gain: p.statut === 'inconnu' ? null : p.gain, statut: p.statut })),
          images: st.photos.map(p => ({ data: p.data, mediaType: p.mediaType })),
          facteurs: [{ label: 'Prix du secteur ' + Math.round(pm2Of(b.quartier, b.type)) + ' F/m² × ' + b.surface + ' m²', montant: Math.round(parts().brut) }].concat(facteurs().map(x => ({ label: x.label, montant: Math.round(x.montant) }))).concat([{ label: 'Valeur en l\'état', montant: Math.round(baseValue()) }])
        })
      });
      const d = await r.json();
      if (!r.ok || d.error) throw new Error(d.error || 'Erreur ' + r.status);
      st.ai = d;
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
    } catch (e) { out.value = ''; if (typeof showToast === 'function') showToast('Rédaction automatique indisponible : ' + e.message); }
    btn.disabled = false;
  }
  // Dépôt de l'annonce à partir de l'estimation : tout ce qui a été saisi est repris
  const TYPE_DEPOT = { appartement: 'Appartement', maison: 'Maison', villa: 'Villa', studio: 'Studio' };
  const PRESTA_DEPOT = { vue_mer: 'df-vue-mer', vue_degagee: 'df-vue-deg', plage: 'df-plage', piscine: 'df-piscine', piscine_res: 'df-piscine-res', spa: 'df-jacuzzi', pool_house: 'df-pool-house',
    garage: 'df-garage', parking_secu: 'df-parking-secu', parking: 'df-parking', carport: 'df-carport', securise: 'df-gardien', ascenseur: 'df-ascenseur', alarme: 'df-alarme',
    dependance: 'df-dependance', solaire: 'df-solaire', buanderie: 'df-buanderie', dressing: 'df-dressing', cave: 'df-cave' };
  function toDepot() {
    if (!ready()) return;
    const cur = compute(st.selected), b = st.bien, set = (id, v) => { const e = $(id); if (e) e.value = v; };
    const prix = st.prixChoix === 'souhaite' ? b.prixSouhaite : st.prixChoix === 'travaux' ? cur.apres : compute(new Set()).V;
    go('depot');
    // type (vignette), commune puis quartier
    const tile = document.querySelector(`#panel-depot .dp-tile[data-type="${TYPE_DEPOT[b.type] || ''}"]`); if (tile) tile.click();
    const Q = (window.IMMO_DEPOT && IMMO_DEPOT.QUARTIERS) || {};
    const commune = Object.keys(Q).find(c => Q[c].includes(b.quartier)) || (Q[b.quartier] ? b.quartier : null);
    if (commune) { set('d-ville', commune); if (typeof updateQuartiers === 'function') updateQuartiers(); set('d-quartier', Q[b.quartier] ? Q[commune][0] : b.quartier); }
    set('d-surface', b.surface); set('d-prix', Math.round(prix / 100000) * 100000);
    if (b.annee) set('d-annee', b.annee);
    const txt = ($('val-ann') && $('val-ann').value.trim()) || b.description; if (txt) set('d-desc', txt);
    // prestations et extérieurs → points forts de l'annonce
    const ids = new Set(Object.keys(PRESTA_DEPOT).filter(k => st.presta.has(k)).map(k => PRESTA_DEPOT[k]));
    if (b.terrasse) ids.add('df-terrasse'); if (b.jardin) ids.add('df-jardin'); if (st.diag.clim === 'complete' || st.diag.clim === 'partielle') ids.add('df-clim');
    ids.forEach(id => { const c = $(id); if (c && !c.checked) { c.checked = true; c.dispatchEvent(new Event('change', { bubbles: true })); } });
    if (window.IMMO_DEPOT && IMMO_DEPOT.fromEstimation) IMMO_DEPOT.fromEstimation({ prix, choix: st.prixChoix });
  }

  /* ---------- Rapport d'estimation à imprimer / enregistrer en PDF ----------
   * Gratuit pour tous tant que la partie payante est éteinte. En mode payant : agences dont la formule
   * inclut « estimation_marque » (en-tête de l'agence) ; pour les particuliers, service payant (commande à venir). */
  function rapportPermis() {
    const t = window.IMMO_TARIFS; if (!t || t.MODE !== 'payant') return true;
    return typeof S !== 'undefined' && S.profile === 'agt' && (!window.IMMO_ABO || IMMO_ABO.a('agt', 'estimation_marque'));
  }
  function rapport() {
    if (!ready() || !rapportPermis()) return;
    if (window.IMMO_EVT) IMMO_EVT.track('rapport_estimation');
    const b = st.bien, pt = parts(), base = compute(new Set()), cur = compute(st.selected), sc = scenarios();
    const ag = window.IMMO_AGENCE ? IMMO_AGENCE.marque('estimation_marque') : null;
    const spread = 0.12 - 0.07 * (diagCount() / DIAG.length) - (b.annee ? 0.005 : 0);
    const r1 = v => Math.round(v / 100000) * 100000, pc = v => (v >= 0 ? '+' : '−') + Math.abs(Math.round(v * 1000) / 10).toLocaleString('fr-FR') + ' %';
    const TYPES = { appartement: 'Appartement', maison: 'Maison', villa: 'Villa', studio: 'Studio' };
    const diagRows = DIAG.filter(d => st.diag[d.key] !== undefined).map(d => `<tr><td>${E(d.label)}</td><td>${E(diagLabel(d.key, st.diag[d.key]))}${st.diagSrc[d.key] === 'ia' ? ' <i>(vu sur photo)</i>' : ''}</td></tr>`).join('');
    const presta = PRESTA.filter(x => prestaOk(x) && st.presta.has(x.id)).map(x => E(x.label));
    const est = estOf(b.quartier, b.type);
    const date = new Date().toLocaleDateString('fr-FR', { day: 'numeric', month: 'long', year: 'numeric' });
    const head = ag ? `<div class="hd">${ag.logo ? `<img src="${E(ag.logo)}" alt="">` : ''}<div><b>${E(ag.nom)}</b><br>${[ag.adresse, ag.tel, ag.email].filter(Boolean).map(E).join(' · ')}${ag.carte ? '<br>Carte professionnelle n° ' + E(ag.carte) : ''}</div></div>`
      : '<div class="hd"><div><b style="font-size:20px">Immo<span style="color:#0A7A84">360</span></b> · Nouvelle-Calédonie</div></div>';
    const html = `<!doctype html><html lang="fr"><head><meta charset="utf-8"><title>Estimation — ${E(TYPES[b.type] || b.type)} ${E(b.surface)} m² — ${E(b.quartier)}</title>
<style>body{font:14px/1.5 'Source Sans 3',system-ui,sans-serif;color:#0F2A38;max-width:780px;margin:24px auto;padding:0 24px}
h1{font-size:26px;margin:18px 0 2px;color:#0B3954}h2{font-size:17px;color:#0B3954;margin:22px 0 8px;border-bottom:2px solid #35C3BC;padding-bottom:4px}
.hd{display:flex;gap:16px;align-items:center;border-bottom:1px solid #D3DEE2;padding-bottom:12px}.hd img{max-height:64px;max-width:200px}
.big{display:flex;gap:14px;flex-wrap:wrap;margin:14px 0}.big div{flex:1;min-width:180px;border:1px solid #D3DEE2;border-top:4px solid #0A7A84;border-radius:10px;padding:12px}
.big b{display:block;font-size:26px}.big span{color:#3E5462}table{width:100%;border-collapse:collapse}td,th{padding:6px 8px;border-bottom:1px solid #E1E9EC;text-align:left;vertical-align:top}
th{font-size:13px;color:#3E5462}td.n,th.n{text-align:right;white-space:nowrap}.small{font-size:12.5px;color:#3E5462}.no-print{margin:16px 0}
@media print{.no-print{display:none}body{margin:0}}</style></head><body>
<div class="no-print"><button onclick="print()" style="font:600 15px sans-serif;padding:10px 18px;border-radius:8px;border:0;background:#0A7A84;color:#fff;cursor:pointer">Imprimer ou enregistrer en PDF</button></div>
${head}
<h1>Estimation de votre bien</h1><div class="small">Établie le ${date}${ag ? ' par ' + E(ag.nom) : ''}</div>
<h2>Le bien</h2><table>
<tr><td>Type</td><td>${E(TYPES[b.type] || b.type)}</td></tr><tr><td>Lieu</td><td>${E(b.quartier)}</td></tr>
<tr><td>Surface habitable</td><td>${E(b.surface)} m²</td></tr>${b.annee ? `<tr><td>Année de construction</td><td>${E(b.annee)}</td></tr>` : ''}
${b.terrasse ? `<tr><td>Terrasse ou balcon</td><td>${E(b.terrasse)} m²</td></tr>` : ''}${b.jardin ? `<tr><td>Jardin ou terrain</td><td>${E(b.jardin)} m²</td></tr>` : ''}
${presta.length ? `<tr><td>Prestations</td><td>${presta.join(', ')}</td></tr>` : ''}</table>
<div class="big"><div><span>Valeur estimée en l'état</span><b>${money(r1(base.V))}</b><span>Fourchette ${money(r1(base.V * (1 - spread)))} – ${money(r1(base.V * (1 + spread)))}</span></div>
${cur.list.length ? `<div><span>Après les travaux retenus</span><b>${money(r1(cur.apres))}</b><span>Travaux ${money(cur.cout)} · gain net ${cur.gainNet >= 0 ? '+' : '−'}${money(Math.abs(cur.gainNet))}</span></div>` : ''}</div>
${st.ai && st.ai.explication_prix ? `<h2>En résumé</h2><p>${E(st.ai.explication_prix)}</p>` : ''}
<h2>Comment ce prix est calculé</h2><table>
<tr><td>Prix au m² du secteur</td><td class="n">${money(pt.pm2)}/m² × ${E(b.surface)} m² = ${money(pt.brut)}</td></tr>
${facteurs().map(x => `<tr><td>${E(x.label)}${x.pct ? ' <span class="small">(' + pc(x.pct) + ')</span>' : ''}</td><td class="n">${x.montant < 0 ? '−' : '+'}${money(Math.abs(x.montant))}</td></tr>`).join('')}
<tr><th>Valeur en l'état</th><th class="n">${money(base.V)}</th></tr></table>
${diagRows ? `<h2>État constaté</h2><table>${diagRows}</table>` : ''}
${diagCount() ? `<h2>Scénarios de préparation</h2><table><tr><th>Scénario</th><th class="n">Coût des travaux</th><th class="n">Valeur</th><th class="n">Gain net</th></tr>
${sc.map(s => `<tr><td>${E(s.label)}</td><td class="n">${s.r.cout ? money(s.r.cout) : '—'}</td><td class="n">${money(r1(s.r.apres))}</td><td class="n">${s.r.cout ? (s.r.gainNet >= 0 ? '+' : '−') + money(Math.abs(s.r.gainNet)) : '—'}</td></tr>`).join('')}</table>
${cur.list.length ? `<p>Travaux retenus : ${cur.list.map(p => E(p.label) + ' (' + money(p.cout) + ')').join(', ')}.</p>` : ''}` : ''}
<h2>Méthode et sources</h2>
<p class="small">${est.source === 'observatoire' ? 'Prix au m² issu des annonces Immo360 du secteur, ramenées au prix de vente.' : 'Prix au m² issu du barème Immo360, calé sur les ventes réellement conclues en 2025 (ISEE, synthèse des transactions immobilières, données des offices notariaux).'}
L'état, l'année, les prestations et les extérieurs ajustent ce prix selon des repères indicatifs. Les coûts de travaux sont des moyennes calédoniennes à confirmer par des devis.
Ce document est une estimation indicative : il ne constitue ni une expertise immobilière ni un avis de valeur opposable.</p>
<p class="small">Document établi avec Immo360 NC${ag ? ' pour ' + E(ag.nom) : ''}.</p></body></html>`;
    const w = window.open('', '_blank');
    if (!w) { alert('Autorisez l\'ouverture de fenêtres pour afficher le rapport.'); return; }
    w.document.open(); w.document.write(html); w.document.close();
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
    if (window.IMMO_EVT) IMMO_EVT.track('devis_demande');
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
