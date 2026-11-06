/* Immo360 NC — Espace Artisan / entreprise du BTP
 * Profil de confiance (RIDET, décennale, qualification…) avec alertes d'expiration,
 * réception des demandes de devis (issues de l'assistant de valorisation), éditeur de devis
 * imprimable, suivi et tableau de bord.
 * Cadre réglementaire : voir docs/fiches-metiers.md (décennale obligatoire depuis la réforme de 2019,
 * RIDET sur tous les documents, qualification professionnelle, répertoire des métiers CMA-NC).
 * Dépend des globales : esc, go, sb, devisEnCours, APP_STATE, IMMO_VAL.
 */
(function () {
  'use strict';

  const KEY = 'immo360.art.v1', DKEY = 'immo360.devis.v1';
  const $ = id => document.getElementById(id);
  const E = v => (typeof esc === 'function' ? esc(v) : String(v == null ? '' : v));
  const F = n => Math.round(n || 0).toLocaleString('fr-FR') + ' F';
  const METIERS = (window.IMMO_VAL && IMMO_VAL.METIER_LABEL) || {
    peinture: 'Peintre', plomberie: 'Plombier', electricite: 'Électricien', cuisine: 'Cuisiniste', climatisation: 'Climatisation',
    jardin: 'Paysagiste', photo: 'Photographe', menuiserie: 'Menuisier', nettoyage: 'Nettoyage', homestaging: 'Home stager'
  };
  const ZONES = ['Nouméa', 'Dumbéa', 'Mont-Dore', 'Païta', 'Boulouparis', 'La Foa', 'Bourail', 'Koné', 'Voh', 'Poindimié', 'Hienghène', 'Lifou', 'Maré', 'Île des Pins'];

  // Pièces justificatives (cadre : docs/fiches-metiers.md §1)
  const JUSTIFS = [
    { id: 'ridet', label: 'RIDET', req: true, expire: false, hint: 'Numéro ISEE — obligatoire sur tous vos documents commerciaux.' },
    { id: 'decennale', label: 'Assurance décennale', req: true, expire: true, hint: 'Obligatoire depuis la réforme de 2019. Vérifiez que le contrat couvre la Nouvelle-Calédonie.' },
    { id: 'qualification', label: 'Qualification professionnelle', req: true, expire: false, hint: 'Obligatoire pour les métiers de la construction (liste fixée par le gouvernement, période transitoire).' },
    { id: 'rcpro', label: 'Responsabilité civile professionnelle', req: false, expire: true, hint: '' },
    { id: 'cma', label: 'Répertoire des métiers (CMA-NC)', req: false, expire: false, hint: 'Entreprises artisanales de moins de 10 salariés.' },
    { id: 'patente', label: 'Patente', req: false, expire: true, hint: 'Taxe annuelle (services fiscaux).' },
    { id: 'cafat', label: 'CAFAT / numéro employeur', req: false, expire: false, hint: '' }
  ];

  /* ---------- Stockage (navigateur ; synchronisé avec Supabase quand l'utilisateur est connecté) ---------- */
  const load = () => { try { return JSON.parse(localStorage.getItem(KEY)) || {}; } catch (_) { return {}; } };
  let S0 = load();
  window.addEventListener('immo360:purge', () => { S0 = { profil: { nom: '', forme: '', ridet: '', tel: '', email: '', bio: '', metiers: [], zones: [], effectif: '' }, justifs: {}, statuts: {} }; })
  S0.profil = S0.profil || { nom: '', forme: '', ridet: '', tel: '', email: '', bio: '', metiers: [], zones: [], effectif: '' };
  S0.justifs = S0.justifs || {};
  S0.statuts = S0.statuts || {};
  const save = () => { try { localStorage.setItem(KEY, JSON.stringify(S0)); } catch (_) { /* stockage indisponible */ } };
  function saveDevis() {
    try { if (typeof devisEnCours !== 'undefined') localStorage.setItem(DKEY, JSON.stringify(devisEnCours)); } catch (_) { /* ignoré */ }
    if (window.IMMO_SYNC && typeof devisEnCours !== 'undefined') IMMO_SYNC.saved(DKEY, devisEnCours);
  }
  function restoreDevis() {
    try { const d = JSON.parse(localStorage.getItem(DKEY)); if (Array.isArray(d) && typeof devisEnCours !== 'undefined' && !devisEnCours.length) d.forEach(x => devisEnCours.push(x)); } catch (_) { /* ignoré */ }
  }
  restoreDevis();
  window.addEventListener('pagehide', saveDevis);

  /* ---------- Justificatifs ---------- */
  function jStatus(def) {
    const j = S0.justifs[def.id];
    if (!j || !(j.ref || '').trim()) return { k: 'manquant', t: 'Manquant', c: def.req ? 'bad' : 'idle' };
    if (def.expire) {
      if (!j.exp) return { k: 'incomplet', t: 'Date d\'expiration à renseigner', c: 'warn' };
      const days = Math.floor((new Date(j.exp + 'T23:59:59') - new Date()) / 86400000);
      if (days < 0) return { k: 'expire', t: 'Expiré', c: 'bad' };
      if (days <= 60) return { k: 'bientot', t: 'Expire dans ' + days + ' j', c: 'warn' };
    }
    return { k: 'ok', t: 'Valide', c: 'ok' };
  }
  function conformite() {
    const req = JUSTIFS.filter(j => j.req), ok = req.filter(j => jStatus(j).k === 'ok').length;
    const complet = !!(S0.profil.nom && S0.profil.metiers.length && S0.profil.zones.length);
    return { ok, total: req.length, conforme: ok === req.length && complet, pct: Math.round((ok + (complet ? 1 : 0)) / (req.length + 1) * 100) };
  }

  /* ---------- Demandes ---------- */
  const metierOfPoste = id => { const p = (window.IMMO_VAL ? IMMO_VAL.POSTES : []).find(x => x.id === id); return p ? p.metier : null; };
  const labelOfPoste = id => { const p = (window.IMMO_VAL ? IMMO_VAL.POSTES : []).find(x => x.id === id); return p ? p.label : id; };

  const SEEDS = [
    { id: 'demo-1', demo: true, nom: 'Marie L.', tel: '+687 00 00 01', date: '—', delai: 'Sous 1 mois', adresse: 'Magenta', bien: { type: 'appartement', surface: 72, quartier: 'Magenta' }, budget: 650000, message: 'Appartement occupé, accès en semaine après 16 h.', metiers: ['peinture'], lignes: [{ label: 'Peinture intérieure', cout: 650000, metier: 'peinture' }] },
    { id: 'demo-2', demo: true, nom: 'Paul M.', tel: '+687 00 00 02', date: '—', delai: 'Dès que possible', adresse: 'Koutio', bien: { type: 'maison', surface: 110, quartier: 'Koutio' }, budget: 2100000, message: 'Rénovation avant mise en vente.', metiers: ['cuisine', 'plomberie'], lignes: [{ label: 'Cuisine neuve', cout: 1700000, metier: 'cuisine' }, { label: 'Petites réparations', cout: 400000, metier: 'plomberie' }] }
  ];

  function allRequests() {
    const real = (typeof devisEnCours !== 'undefined' ? devisEnCours : []).map(d => {
      const lignes = Array.isArray(d.lignes) && d.lignes.length ? d.lignes : (d.postes || []).map(id => ({ label: labelOfPoste(id), metier: metierOfPoste(id), cout: 0 }));
      const ct = d.contactAccepte || {};
      return { id: d.id, ref: d, nom: d.nom || ct.nom || '', tel: d.tel || ct.tel || '', date: d.date, delai: d.delai, adresse: d.adresse, bien: d.bien || { quartier: d.adresse }, budget: d.budget || 0, message: d.message != null ? d.message : (Array.isArray(d.lignes) ? '' : d.desc || ''), lignes, metiers: [...new Set(lignes.map(l => l.metier).filter(Boolean))], real: true };
    });
    return real.length ? real : SEEDS;
  }
  const matches = r => !S0.profil.metiers.length || !r.metiers.length || r.metiers.some(m => S0.profil.metiers.includes(m));
  // Un artisan ne voit que les postes qui relèvent de ses métiers (et le budget correspondant)
  function scoped(r) {
    const my = S0.profil.metiers;
    if (!my.length) return r;
    const lignes = r.lignes.filter(l => !l.metier || my.includes(l.metier));
    const sum = lignes.reduce((a, l) => a + (l.cout || 0), 0);
    return { ...r, lignes, metiers: r.metiers.filter(m => my.includes(m)), budget: sum || (lignes.length === r.lignes.length ? r.budget : 0) };
  }
  // Sans métier déclaré, aucune demande n'est montrée (on ne diffuse pas le détail des chantiers à l'aveugle)
  const myRequests = () => S0.profil.metiers.length ? allRequests().filter(matches).map(scoped) : [];
  const myReponse = r => r.ref && (r.ref.reponses || []).find(x => x.proKey === proKey());
  const proKey = () => (S0.profil.ridet || S0.profil.nom || 'artisan-demo').trim();
  const statutOf = r => { const rep = myReponse(r) || S0.statuts['rep-' + r.id]; if (rep && rep.statut) return rep.statut; return S0.statuts[r.id] || 'nouvelle'; };
  const STAT_LABEL = { nouvelle: 'Nouvelle', vue: 'Consultée', envoye: 'Devis envoyé', accepte: 'Accepté', refuse: 'Refusé' };

  /* ---------- Styles ---------- */
  function injectStyle() {
    if ($('art-style')) return;
    const c = document.createElement('style'); c.id = 'art-style';
    c.textContent = `
.art-wrap{max-width:1100px;margin:0 auto}.art-head h2{font-family:'Playfair Display',serif;font-size:24px;margin:0 0 4px}.art-head p{color:var(--mid);font-size:13px;margin:0 0 18px}
.art-kpis{display:grid;grid-template-columns:repeat(4,1fr);gap:12px;margin-bottom:16px}
.art-kpi{background:#fff;border:1px solid rgba(28,26,22,.08);border-radius:12px;padding:14px 16px}.art-kpi small{display:block;font-size:11px;color:var(--mid);text-transform:uppercase;letter-spacing:.06em;margin-bottom:6px}.art-kpi b{font:700 22px 'Playfair Display',serif}
.art-alert{border-radius:10px;padding:10px 14px;margin-bottom:12px;font-size:13px;line-height:1.5}.art-alert.bad{background:#FDE8E4;color:#8E2A1D}.art-alert.warn{background:#FEF3C7;color:#7A4A0A}.art-alert.ok{background:#E6F4EA;color:#1E6B3A}
.art-tag{display:inline-block;font-size:11px;font-weight:600;padding:2px 9px;border-radius:99px}.art-tag.ok{background:#E6F4EA;color:#1E6B3A}.art-tag.warn{background:#FEF3C7;color:#7A4A0A}.art-tag.bad{background:#FDE8E4;color:#8E2A1D}.art-tag.idle{background:#EEF2F6;color:#475569}.art-tag.new{background:#E8EEFB;color:#2A4A7A}
.art-req{display:grid;grid-template-columns:1fr auto;gap:10px;padding:14px 16px;border:1px solid rgba(28,26,22,.1);border-radius:12px;background:#fff;margin-bottom:10px;cursor:pointer;transition:.15s}.art-req:hover{border-color:var(--gold)}
.art-req h4{margin:0 0 4px;font-size:15px}.art-req p{margin:0;font-size:12px;color:var(--mid);line-height:1.5}.art-req .r{text-align:right}.art-req .r b{display:block;font:700 16px 'Playfair Display',serif;color:var(--gold-dark);margin-bottom:6px}
.art-f{display:flex;flex-direction:column;gap:4px;margin-bottom:11px}.art-f label{font-size:11px;font-weight:600;color:var(--mid);text-transform:uppercase;letter-spacing:.06em}
.art-f input,.art-f select,.art-f textarea{border:1px solid rgba(28,26,22,.15);border-radius:8px;padding:8px 10px;font:14px 'DM Sans',sans-serif;background:#fff;width:100%;box-sizing:border-box}
.art-2{display:grid;grid-template-columns:1fr 1fr;gap:12px}.art-3{display:grid;grid-template-columns:2fr 1fr 1fr;gap:12px}
.art-chips{display:flex;flex-wrap:wrap;gap:6px}.art-chips label{display:inline-flex;align-items:center;gap:6px;border:1px solid rgba(28,26,22,.15);border-radius:99px;padding:5px 12px;font:500 13px 'DM Sans',sans-serif;text-transform:none;letter-spacing:0;color:var(--dark);cursor:pointer;background:#fff}.art-chips input{width:auto;margin:0;accent-color:var(--gold)}.art-chips label:has(input:checked){background:var(--dark);color:#fff;border-color:var(--dark)}
.art-j{display:grid;grid-template-columns:1.2fr 1fr 150px 130px;gap:10px;align-items:center;padding:10px 0;border-top:1px solid rgba(28,26,22,.07);font-size:13px}.art-j small{display:block;color:var(--mid);font-size:11px;line-height:1.4;margin-top:2px}
.art-lines{width:100%;border-collapse:collapse;font-size:13px}.art-lines th{font-size:11px;text-transform:uppercase;letter-spacing:.05em;color:var(--mid);text-align:left;padding:6px 4px}.art-lines td{padding:4px}.art-lines input{border:1px solid rgba(28,26,22,.15);border-radius:6px;padding:6px 8px;font:13px 'DM Sans',sans-serif;width:100%;box-sizing:border-box}
.art-tot{margin-left:auto;max-width:300px;font-size:14px}.art-tot div{display:flex;justify-content:space-between;padding:4px 0}.art-tot .g{border-top:2px solid var(--dark);margin-top:4px;padding-top:8px;font:700 18px 'Playfair Display',serif}
.art-back{background:none;border:0;color:var(--mid);cursor:pointer;font:500 13px 'DM Sans',sans-serif;padding:0;margin-bottom:12px}
.art-note{font-size:12px;color:var(--mid);background:var(--warm);border-radius:8px;padding:9px 12px;line-height:1.5;margin:10px 0}
@media(max-width:900px){.art-kpis{grid-template-columns:1fr 1fr}.art-j{grid-template-columns:1fr}.art-2,.art-3{grid-template-columns:1fr}.art-req{grid-template-columns:1fr}.art-req .r{text-align:left}}
`;
    document.head.appendChild(c);
  }

  /* ---------- Tableau de bord ---------- */
  function stats() {
    const reqs = myRequests();
    const env = reqs.filter(r => ['envoye', 'accepte', 'refuse'].includes(statutOf(r)));
    const acc = reqs.filter(r => statutOf(r) === 'accepte');
    const ca = acc.reduce((a, r) => a + ((myReponse(r) || {}).totalTTC || 0), 0);
    const pot = env.filter(r => statutOf(r) === 'envoye').reduce((a, r) => a + ((myReponse(r) || {}).totalTTC || 0), 0);
    return { total: reqs.length, nouvelles: reqs.filter(r => statutOf(r) === 'nouvelle').length, envoyes: env.length, acceptes: acc.length, taux: env.length ? Math.round(acc.length / env.length * 100) : 0, ca, pot };
  }
  function alertsHTML() {
    const out = [];
    const manquants = JUSTIFS.filter(d => d.req && jStatus(d).k === 'manquant').map(d => d.label.toLowerCase());
    if (!S0.profil.metiers.length) out.push(['warn', 'Choisissez vos métiers et zones d\'intervention pour recevoir les demandes de devis.']);
    if (manquants.length) out.push(['bad', 'Pièces obligatoires manquantes : ' + manquants.join(', ') + '. Elles sont nécessaires pour envoyer un devis.']);
    JUSTIFS.forEach(d => { const s = jStatus(d); if (s.k === 'expire') out.push(['bad', `${d.label} expiré. Renouvelez-le pour rester conforme.`]); else if (s.k === 'bientot') out.push(['warn', `${d.label} : ${s.t.toLowerCase()}.`]); });
    return out.map(([c, t]) => `<div class="art-alert ${c}">${E(t)} <a href="#" data-go="art-profil" style="color:inherit;font-weight:600">Mettre à jour</a></div>`).join('');
  }
  function renderDashboard(dash) {
    injectStyle();
    const s = stats(), c = conformite(), nom = S0.profil.nom || (typeof APP_STATE !== 'undefined' && APP_STATE.user?.nom) || 'votre entreprise';
    const last = myRequests().slice(0, 3);
    dash.innerHTML = `<div class="art-wrap">
      <div class="art-head"><h2>Bonjour ${E(nom)}</h2><p>${c.conforme ? 'Votre dossier est conforme.' : 'Votre dossier est complété à ' + c.pct + ' %.'}</p></div>
      ${alertsHTML()}
      <div class="art-kpis">
        <div class="art-kpi"><small>Nouvelles demandes</small><b>${s.nouvelles}</b></div>
        <div class="art-kpi"><small>Devis envoyés</small><b>${s.envoyes}</b></div>
        <div class="art-kpi"><small>Taux d'acceptation</small><b>${s.taux} %</b></div>
        <div class="art-kpi"><small>Devis acceptés</small><b>${F(s.ca)}</b></div>
      </div>
      <div class="card"><div class="card-title" style="justify-content:space-between">Demandes à traiter <button type="button" class="btn btn-sm btn-outline" data-go="art-demandes">Voir tout</button></div>
        ${last.length ? last.map(r => reqRow(r)).join('') : (S0.profil.metiers.length ? '<p style="color:var(--mid);font-size:13px;margin:0">Aucune demande pour vos métiers pour le moment.</p>' : '<p style="color:var(--mid);font-size:13px;margin:0">Renseignez vos métiers dans votre profil pour voir les demandes qui vous concernent.</p>')}
      </div>
      ${s.pot ? `<div class="art-note">Montant en attente de réponse client : <b>${F(s.pot)}</b></div>` : ''}
    </div>`;
    wire(dash);
  }

  /* ---------- Liste des demandes ---------- */
  function reqRow(r) {
    const st = statutOf(r), cls = st === 'nouvelle' ? 'new' : st === 'accepte' ? 'ok' : st === 'refuse' ? 'bad' : st === 'envoye' ? 'warn' : 'idle';
    const metiers = r.metiers.map(m => METIERS[m] || m).join(', ');
    return `<div class="art-req" data-open="${E(r.id)}"><div>
      <h4>${E(metiers || 'Travaux')} — ${E(r.bien.quartier || r.adresse || '')}</h4>
      <p>${r.bien.type ? E(r.bien.type) + ' · ' : ''}${r.bien.surface ? E(r.bien.surface) + ' m² · ' : ''}${E(r.delai || '')}${r.demo ? ' · <i>exemple</i>' : ''}</p>
      <p>${r.lignes.map(l => E(l.label)).join(' · ')}</p></div>
      <div class="r"><b>${r.budget ? 'Budget ~' + F(r.budget) : ''}</b><span class="art-tag ${cls}">${E(STAT_LABEL[st] || st)}</span></div></div>`;
  }
  function buildDemandes(el) {
    injectStyle(); remoteSync();
    const reqs = myRequests();
    el.innerHTML = `<div class="art-wrap"><div class="art-head"><h2>Demandes de devis</h2><p>Demandes correspondant à vos métiers${S0.profil.metiers.length ? ' (' + S0.profil.metiers.map(m => E(METIERS[m] || m)).join(', ') + ')' : ' — renseignez vos métiers dans votre profil pour filtrer'}.</p></div>
      ${reqs.length ? reqs.map(reqRow).join('') : '<div class="card"><p style="margin:0;color:var(--mid);font-size:13px">Aucune demande pour le moment.</p></div>'}</div>`;
    wire(el);
  }

  /* ---------- Détail + éditeur de devis ---------- */
  function openRequest(el, id) {
    const r0 = allRequests().find(x => String(x.id) === String(id)); if (!r0) return; const r = scoped(r0);
    if (!S0.statuts[r.id] || S0.statuts[r.id] === 'nouvelle') { S0.statuts[r.id] = 'vue'; save(); }
    const accepted = statutOf(r) === 'accepte';
    const rep = myReponse(r) || S0.statuts['draft-' + r.id] && JSON.parse(S0.statuts['draft-' + r.id]) || null;
    const lignes = (rep && rep.lignes) || r.lignes.map(l => ({ desig: l.label, qte: 1, unite: 'forfait', pu: l.cout || 0 }));
    const d = rep || { remise: 0, taxe: 0, validite: 30, delaiExec: '', acompte: 30, note: '' };
    el.innerHTML = `<div class="art-wrap"><button type="button" class="art-back" data-go="art-demandes">← Retour aux demandes</button>
      <div class="card"><div class="card-title">${E(r.metiers.map(m => METIERS[m] || m).join(', ') || 'Demande')} — ${E(r.bien.quartier || '')}</div>
        <div class="art-2"><div><b>Bien</b><br>${E(r.bien.type || '—')}${r.bien.surface ? ' · ' + E(r.bien.surface) + ' m²' : ''}<br>${E(r.bien.quartier || r.adresse || '')}</div>
        <div><b>Client</b><br>${accepted ? E(r.nom) + ' · ' + E(r.tel) : E((r.nom || '').split(' ')[0] || 'Client') + ' <span style="color:var(--mid)">(coordonnées complètes après acceptation du devis)</span>'}<br>Délai souhaité : ${E(r.delai || '—')}</div></div>
        <div class="art-note" style="white-space:pre-line">${E(r.message || 'Aucune précision.')}</div>
        ${r.budget ? `<div style="font-size:13px;color:var(--mid)">Budget estimé par le client : <b>${F(r.budget)}</b></div>` : ''}</div>
      <div class="card"><div class="card-title">Votre devis</div>
        <table class="art-lines"><thead><tr><th style="width:42%">Désignation</th><th>Qté</th><th>Unité</th><th>PU HT (F)</th><th></th></tr></thead><tbody id="art-lines"></tbody></table>
        <button type="button" class="btn btn-sm btn-outline" id="art-addl" style="margin:8px 0 14px">+ Ajouter une ligne</button>
        <div class="art-3"><div class="art-f"><label>Remise (%)</label><input id="art-remise" type="number" min="0" max="100" value="${d.remise}"></div>
          <div class="art-f"><label>Taxe (TGC) %</label><input id="art-taxe" type="number" min="0" max="100" step="0.5" value="${d.taxe}"></div>
          <div class="art-f"><label>Validité (jours)</label><input id="art-valid" type="number" min="1" value="${d.validite}"></div></div>
        <div class="art-3"><div class="art-f"><label>Délai d'exécution</label><input id="art-delai" value="${E(d.delaiExec)}" placeholder="ex. 2 semaines après acceptation"></div>
          <div class="art-f"><label>Acompte (%)</label><input id="art-acompte" type="number" min="0" max="100" value="${d.acompte}"></div><div></div></div>
        <div class="art-f"><label>Conditions / remarques</label><textarea id="art-note" rows="3">${E(d.note)}</textarea></div>
        <div class="art-tot" id="art-tot"></div>
        <div class="art-note">Le taux de TGC applicable à vos prestations est à confirmer avec votre comptable : il n'est pas pré-rempli. Votre RIDET et votre attestation décennale figurent automatiquement sur le devis.</div>
        <div style="display:flex;gap:8px;flex-wrap:wrap">
          <button type="button" class="btn btn-gold" id="art-send"${accepted ? ' disabled' : ''}>${rep && rep.statut ? 'Mettre à jour le devis' : 'Envoyer le devis'}</button>
          <button type="button" class="btn btn-outline" id="art-draft">Enregistrer le brouillon</button>
          <button type="button" class="btn btn-outline" id="art-print">Aperçu / imprimer</button>
          ${r.demo ? '' : `<button type="button" class="btn btn-outline" id="art-decline">Décliner</button>`}</div></div></div>`;
    const body = $('art-lines');
    const addLine = l => {
      const tr = document.createElement('tr');
      tr.innerHTML = `<td><input class="l-d" value="${E(l.desig)}"></td><td><input class="l-q" type="number" min="0" step="0.5" value="${l.qte}"></td><td><input class="l-u" value="${E(l.unite)}"></td><td><input class="l-p" type="number" min="0" step="1000" value="${l.pu}"></td><td><button type="button" class="btn btn-sm" aria-label="Supprimer la ligne">×</button></td>`;
      tr.querySelector('button').onclick = () => { tr.remove(); recalc(); };
      tr.querySelectorAll('input').forEach(i => i.addEventListener('input', recalc));
      body.appendChild(tr);
    };
    lignes.forEach(addLine);
    $('art-addl').onclick = () => { addLine({ desig: '', qte: 1, unite: 'forfait', pu: 0 }); };
    ['art-remise', 'art-taxe'].forEach(i => $(i).addEventListener('input', recalc));
    const read = () => {
      const L = [...body.querySelectorAll('tr')].map(tr => ({ desig: tr.querySelector('.l-d').value.trim(), qte: parseFloat(tr.querySelector('.l-q').value) || 0, unite: tr.querySelector('.l-u').value.trim(), pu: parseFloat(tr.querySelector('.l-p').value) || 0 })).filter(l => l.desig);
      const remise = Math.min(100, Math.max(0, parseFloat($('art-remise').value) || 0)), taxe = Math.min(100, Math.max(0, parseFloat($('art-taxe').value) || 0));
      const ht0 = L.reduce((a, l) => a + l.qte * l.pu, 0), ht = ht0 * (1 - remise / 100), tva = ht * taxe / 100;
      return { lignes: L, remise, taxe, totalHT: Math.round(ht), taxeMontant: Math.round(tva), totalTTC: Math.round(ht + tva), validite: parseInt($('art-valid').value) || 30, delaiExec: $('art-delai').value.trim(), acompte: parseFloat($('art-acompte').value) || 0, note: $('art-note').value.trim().slice(0, 800) };
    };
    function recalc() { const q = read(); $('art-tot').innerHTML = `<div><span>Total HT</span><span>${F(q.totalHT)}</span></div><div><span>Taxe (${q.taxe} %)</span><span>${F(q.taxeMontant)}</span></div><div class="g"><span>Total TTC</span><span>${F(q.totalTTC)}</span></div>`; return q; }
    recalc();
    $('art-draft').onclick = () => { S0.statuts['draft-' + r.id] = JSON.stringify(read()); save(); toast('Brouillon enregistré.'); };
    $('art-print').onclick = () => printDevis(r, read());
    if ($('art-decline')) $('art-decline').onclick = () => { if (confirm('Décliner cette demande ?')) { S0.statuts[r.id] = 'refuse'; save(); buildDemandes(el); } };
    $('art-send').onclick = () => sendDevis(el, r, read());
    wire(el);
  }

  function missingForQuote() {
    const m = []; if (!S0.profil.nom) m.push('nom de l\'entreprise'); if (!S0.justifs.ridet?.ref) m.push('RIDET');
    const dc = S0.justifs.decennale; if (!dc?.ref) m.push('attestation décennale'); return m;
  }
  function sendDevis(el, r, q) {
    if (!q.lignes.length || !q.totalHT) { alert('Ajoutez au moins une ligne chiffrée.'); return; }
    const miss = missingForQuote();
    if (miss.length) { alert('Avant d\'envoyer un devis, complétez votre profil : ' + miss.join(', ') + '.\nCes mentions sont obligatoires sur vos documents commerciaux.'); go('art-profil'); return; }
    const rep = { ...q, proKey: proKey(), proNom: S0.profil.nom, ridet: S0.profil.ridet || S0.justifs.ridet.ref, tel: S0.profil.tel, decennale: { assureur: S0.justifs.decennale.emetteur || '', ref: S0.justifs.decennale.ref, exp: S0.justifs.decennale.exp || '' }, date: new Date().toLocaleDateString('fr-FR'), statut: 'envoye' };
    if (r.ref) { r.ref.reponses = (r.ref.reponses || []).filter(x => x.proKey !== rep.proKey); r.ref.reponses.push(rep); r.ref.statut = 'Devis reçu'; saveDevis(); }
    else { S0.statuts['rep-' + r.id] = rep; }
    S0.statuts[r.id] = 'envoye'; save();
    if (r.ref && window.IMMO_SYNC) IMMO_SYNC.pushReponse(r.ref.id, rep);
    toast('Devis envoyé au client.'); buildDemandes(el);
  }

  function printDevis(r, q) {
    const p = S0.profil, dc = S0.justifs.decennale || {}, w = window.open('', '_blank'); if (!w) { alert('Autorisez les fenêtres pop-up pour afficher l\'aperçu.'); return; }
    w.document.write(`<!doctype html><meta charset="utf-8"><title>Devis</title><style>body{font:14px/1.5 Arial,sans-serif;margin:32px;color:#111}h1{font-size:22px;margin:0}table{width:100%;border-collapse:collapse;margin:18px 0}th,td{border-bottom:1px solid #ddd;padding:8px;text-align:left}td.n,th.n{text-align:right}.t{margin-left:auto;width:280px}.t div{display:flex;justify-content:space-between;padding:3px 0}.g{border-top:2px solid #111;font-weight:700;font-size:16px}small{color:#555}</style>
<h1>${E(p.nom || 'Entreprise')}</h1><small>${E(p.forme || '')} · RIDET ${E(p.ridet || S0.justifs.ridet?.ref || '—')}<br>${E(p.tel || '')} ${E(p.email || '')}<br>Assurance décennale : ${E(dc.emetteur || '—')} — contrat ${E(dc.ref || '—')}${dc.exp ? ' (valable jusqu\'au ' + E(new Date(dc.exp).toLocaleDateString('fr-FR')) + ')' : ''}</small>
<h2>Devis — ${E(r.bien.quartier || r.adresse || '')}</h2><p>Date : ${new Date().toLocaleDateString('fr-FR')} · Validité : ${q.validite} jours</p>
<table><tr><th>Désignation</th><th class="n">Qté</th><th>Unité</th><th class="n">PU HT</th><th class="n">Total HT</th></tr>${q.lignes.map(l => `<tr><td>${E(l.desig)}</td><td class="n">${l.qte}</td><td>${E(l.unite)}</td><td class="n">${F(l.pu)}</td><td class="n">${F(l.qte * l.pu)}</td></tr>`).join('')}</table>
<div class="t">${q.remise ? `<div><span>Remise ${q.remise} %</span><span></span></div>` : ''}<div><span>Total HT</span><span>${F(q.totalHT)}</span></div><div><span>Taxe (${q.taxe} %)</span><span>${F(q.taxeMontant)}</span></div><div class="g"><span>Total TTC</span><span>${F(q.totalTTC)}</span></div></div>
<p>${q.delaiExec ? 'Délai d\'exécution : ' + E(q.delaiExec) + '<br>' : ''}${q.acompte ? 'Acompte à la commande : ' + q.acompte + ' %<br>' : ''}${E(q.note)}</p><p><small>Bon pour accord, date et signature du client :</small></p><script>onload=()=>setTimeout(()=>print(),300)<\/script>`);
    w.document.close();
  }

  /* ---------- Profil & justificatifs ---------- */
  function buildProfil(el) {
    injectStyle();
    const p = S0.profil, c = conformite();
    el.innerHTML = `<div class="art-wrap"><div class="art-head"><h2>Profil &amp; justificatifs</h2><p>${c.conforme ? 'Votre dossier est conforme.' : 'Dossier complété à ' + c.pct + ' % — les pièces obligatoires conditionnent l\'envoi de devis.'}</p></div>
      <div class="card"><div class="card-title">Entreprise</div>
        <div class="art-2"><div class="art-f"><label>Nom de l'entreprise *</label><input id="ap-nom" value="${E(p.nom)}"></div><div class="art-f"><label>Forme juridique</label><input id="ap-forme" value="${E(p.forme)}" placeholder="EI, SARL…"></div></div>
        <div class="art-2"><div class="art-f"><label>Téléphone</label><input id="ap-tel" value="${E(p.tel)}"></div><div class="art-f"><label>Email</label><input id="ap-email" type="email" value="${E(p.email)}"></div></div>
        <div class="art-f"><label>Présentation</label><textarea id="ap-bio" rows="3" placeholder="Votre savoir-faire, vos réalisations…">${E(p.bio)}</textarea></div>
        <div class="art-f"><label>Métiers *</label><div class="art-chips" id="ap-metiers">${Object.keys(METIERS).map(m => `<label><input type="checkbox" value="${m}"${p.metiers.includes(m) ? ' checked' : ''}>${E(METIERS[m])}</label>`).join('')}</div></div>
        <div class="art-f"><label>Zones d'intervention *</label><div class="art-chips" id="ap-zones">${ZONES.map(z => `<label><input type="checkbox" value="${E(z)}"${p.zones.includes(z) ? ' checked' : ''}>${E(z)}</label>`).join('')}</div></div></div>
      <div class="card"><div class="card-title">Justificatifs</div>
        ${JUSTIFS.map(d => { const j = S0.justifs[d.id] || {}, s = jStatus(d); return `<div class="art-j" data-j="${d.id}">
          <div><b>${E(d.label)}</b>${d.req ? ' <span class="art-tag idle">obligatoire</span>' : ''}<small>${E(d.hint)}</small></div>
          <div class="art-f" style="margin:0"><input class="j-ref" placeholder="${d.id === 'ridet' ? 'N° RIDET' : 'N° / référence'}" value="${E(j.ref || '')}">${d.id === 'decennale' || d.id === 'rcpro' ? `<input class="j-emet" style="margin-top:4px" placeholder="Assureur" value="${E(j.emetteur || '')}">` : ''}</div>
          <div class="art-f" style="margin:0">${d.expire ? `<input class="j-exp" type="date" value="${E(j.exp || '')}" aria-label="Date d'expiration">` : '<span style="color:var(--mid);font-size:12px">sans échéance</span>'}</div>
          <div><span class="art-tag ${s.c}">${E(s.t)}</span></div></div>`; }).join('')}
        <div class="art-note">Les documents eux-mêmes (PDF) pourront être joints dans une prochaine version ; pour l'instant, indiquez les références et les dates. Qualification professionnelle : la liste des activités concernées est fixée par le gouvernement de la NC, vérifiez auprès de la CMA-NC.</div>
        <button type="button" class="btn btn-gold" id="ap-save">Enregistrer</button></div></div>`;
    $('ap-save').onclick = () => {
      S0.profil = { nom: $('ap-nom').value.trim(), forme: $('ap-forme').value.trim(), tel: $('ap-tel').value.trim(), email: $('ap-email').value.trim(), bio: $('ap-bio').value.trim().slice(0, 800), ridet: (el.querySelector('[data-j="ridet"] .j-ref').value || '').trim(), effectif: p.effectif,
        metiers: [...$('ap-metiers').querySelectorAll('input:checked')].map(i => i.value), zones: [...$('ap-zones').querySelectorAll('input:checked')].map(i => i.value) };
      el.querySelectorAll('[data-j]').forEach(row => { const id = row.dataset.j; S0.justifs[id] = { ref: row.querySelector('.j-ref').value.trim(), exp: row.querySelector('.j-exp')?.value || '', emetteur: row.querySelector('.j-emet')?.value.trim() || '' }; });
      save(); toast('Profil enregistré.');
      if (window.IMMO_SYNC) IMMO_SYNC.ensurePro('art', { nom: S0.profil.nom, ridet: S0.profil.ridet, tel: S0.profil.tel, email: S0.profil.email, bio: S0.profil.bio, metiers: S0.profil.metiers, zones: S0.profil.zones });
      buildProfil(el);
    };
    wire(el);
  }

  // Récupère les demandes à jour (si connecté) ; la vue est redessinée par IMMO_SYNC si elle a changé
  function remoteSync() { if (window.IMMO_SYNC && IMMO_SYNC.uid) IMMO_SYNC.pullAll(); }

  /* ---------- Côté client (vendeur) : devis reçus ---------- */
  function reponsesHTML(d) {
    const reps = d.reponses || []; if (!reps.length) return '';
    return `<div style="margin-top:10px"><div style="font-size:11px;font-weight:700;color:var(--mid);text-transform:uppercase;letter-spacing:.06em;margin-bottom:6px">Devis reçus (${reps.length})</div>` + reps.map((x, i) => `
      <div style="border:1px solid rgba(28,26,22,.12);border-radius:10px;padding:10px 12px;margin-bottom:6px;font-size:13px">
        <div style="display:flex;justify-content:space-between;gap:8px;align-items:center"><b>${E(x.proNom)}</b><b style="font-family:'Playfair Display',serif">${F(x.totalTTC)} TTC</b></div>
        <div style="color:var(--mid);font-size:12px;margin:2px 0 6px">RIDET ${E(x.ridet)} · décennale ${E(x.decennale?.assureur || '')} ${E(x.decennale?.ref || '')} · valable ${x.validite} j${x.delaiExec ? ' · délai : ' + E(x.delaiExec) : ''}</div>
        ${x.statut === 'accepte' ? '<span class="art-tag ok">Accepté</span>' : `<button type="button" class="btn btn-sm btn-gold" data-accept-devis="${E(String(d.id))}" data-accept-idx="${i}">Accepter ce devis</button>`}
      </div>`).join('') + '</div>';
  }
  function accept(devisId, idx) {
    const d = (typeof devisEnCours !== 'undefined' ? devisEnCours : []).find(x => String(x.id) === String(devisId)); if (!d || !d.reponses?.[idx]) return;
    d.reponses.forEach((x, i) => { x.statut = i === idx ? 'accepte' : (x.statut === 'accepte' ? 'envoye' : x.statut); });
    d.statut = 'Accepté'; d.acceptedKey = d.reponses[idx].proKey; saveDevis();
    // Coordonnées du client transmises au seul artisan retenu
    if (window.IMMO_SYNC && d.reponses[idx]._o) IMMO_SYNC.shareContact(d.id, d.reponses[idx]._o, { nom: d.nom || '', tel: d.tel || '' });
    if (typeof renderDevisList === 'function') renderDevisList();
    toast('Devis accepté. L\'artisan est notifié.');
  }

  /* ---------- Utilitaires UI ---------- */
  function toast(t) {
    const n = document.createElement('div'); n.setAttribute('role', 'status'); n.className = 'immo-toast'; document.querySelectorAll('.immo-toast').forEach(x => x.remove());
    n.style.cssText = 'position:fixed;bottom:20px;right:20px;background:var(--dark);color:#fff;padding:12px 18px;border-radius:10px;font-size:13px;z-index:3000';
    n.textContent = t; document.body.appendChild(n); setTimeout(() => n.remove(), 3500);
  }
  function wire(root) {
    root.querySelectorAll('[data-go]').forEach(b => b.addEventListener('click', e => { e.preventDefault(); e.stopPropagation(); go(b.dataset.go); }));
    root.querySelectorAll('[data-open]').forEach(b => b.addEventListener('click', () => { const p = $('panel-art-demandes'); go('art-demandes'); openRequest(p, b.dataset.open); }));
  }

  const build = { 'art-demandes': buildDemandes, 'art-profil': buildProfil, 'art-devis': el => { /* Mes devis : vue filtrée */
    injectStyle(); const sent = myRequests().filter(r => ['envoye', 'accepte', 'refuse'].includes(statutOf(r)));
    el.innerHTML = `<div class="art-wrap"><div class="art-head"><h2>Mes devis</h2><p>Devis envoyés et leur suivi.</p></div>${sent.length ? sent.map(reqRow).join('') : '<div class="card"><p style="margin:0;color:var(--mid);font-size:13px">Vous n\'avez pas encore envoyé de devis.</p></div>'}</div>`; wire(el); } };

  // Bouton « Accepter ce devis » (liste des devis côté client) — délégation d'événement
  document.addEventListener('click', e => {
    const b = e.target.closest && e.target.closest('[data-accept-devis]');
    if (b) accept(b.dataset.acceptDevis, parseInt(b.dataset.acceptIdx, 10));
  });

  window.IMMO_ART = { build, renderDashboard, reponsesHTML, accept, saveDevis };
  window.IMMO_PANELS = Object.assign(window.IMMO_PANELS || {}, build);
  window.IMMO_DASH = Object.assign(window.IMMO_DASH || {}, { art: renderDashboard });
})();
