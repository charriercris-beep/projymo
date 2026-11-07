/* Immo360 NC — Espace Notaire
 * Dossiers de vente : parties, bien (régime foncier, nature), prix, financement ; étapes de la
 * transaction ; pièces à réunir générées selon le contexte calédonien ; conditions suspensives
 * et échéancier avec alertes ; décompte prévisionnel des frais (barème commun avec l'espace
 * Banquier) ; rattachement d'un dossier de financement.
 * Cadre et sources : docs/fiches-metiers.md §2. Points non confirmés pour la NC signalés « à vérifier ».
 * Dépend des globales : esc, go, APP_STATE, IMMO_BNK (js/banquier.js).
 */
(function () {
  'use strict';

  const $ = id => document.getElementById(id);
  const E = v => (typeof esc === 'function' ? esc(v) : String(v == null ? '' : v));
  const F = n => Math.round(n || 0).toLocaleString('fr-FR') + ' F';
  const KEY = 'immo360.notaire.v1', FINKEY = 'immo360.fin.v1';
  const store = { get(k, d) { try { return JSON.parse(localStorage.getItem(k)) ?? d; } catch (_) { return d; } }, set(k, v) { try { localStorage.setItem(k, JSON.stringify(v)); } catch (_) { /* stockage indisponible */ } } };
  let dossiers = store.get(KEY, []);
  const save = () => { store.set(KEY, dossiers); if (window.IMMO_SYNC) IMMO_SYNC.saved(KEY, dossiers); };
  const today = () => new Date().toISOString().slice(0, 10);
  const jours = iso => iso ? Math.ceil((new Date(iso + 'T23:59:59') - new Date()) / 86400000) : null;
  const fmtD = iso => iso ? new Date(iso + 'T12:00:00').toLocaleDateString('fr-FR') : '—';

  const ETAPES = [['ouverture', 'Ouverture'], ['avant_contrat', 'Avant-contrat signé'], ['pieces', 'Pièces et formalités préalables'], ['conditions', 'Conditions suspensives levées'], ['acte', 'Acte authentique signé'], ['publication', 'Publication foncière'], ['clos', 'Dossier clos']];
  const COMMUNES = ['Nouméa', 'Dumbéa', 'Mont-Dore', 'Païta', 'Boulouparis', 'La Foa', 'Bourail', 'Koné', 'Voh', 'Poindimié', 'Hienghène', 'Lifou', 'Maré', 'Ouvéa', 'Île des Pins', 'Autre'];

  /* ---------- Pièces : générées selon le dossier ---------- */
  function piecesFor(d) {
    const L = [
      ['id_vendeur', 'Identité et état civil du vendeur'],
      ['id_acquereur', 'Identité et état civil de l\'acquéreur'],
      ['titre', 'Titre de propriété (origine de propriété)'],
      ['cadastre_desig', 'Attestation de désignation cadastrale (DITTT)', 'Délivrée par le bureau du cadastre de la DITTT.'],
      ['cadastre_fiche', 'Fiche de renseignement cadastral (DITTT)', 'Informations à contrôler avec les actes publiés.'],
      ['hypotheques', 'État hypothécaire (service de la publicité foncière)'],
      ['urbanisme', 'Renseignements d\'urbanisme (commune, ou province à défaut)', 'Le plan d\'urbanisme directeur (PUD) est communal.']
    ];
    if (d.bien.nature === 'bati' || d.bien.nature === 'copro') L.push(['diagnostics', 'Diagnostics techniques exigés par la réglementation calédonienne', 'Liste à confirmer (amiante : délibération 211/CP de 1997) — ne pas transposer le DDT métropolitain.']);
    if (d.bien.nature === 'copro') L.push(['copro_rc', 'Règlement de copropriété et état descriptif de division'], ['copro_charges', 'Situation des charges et procès-verbaux d\'assemblée']);
    if (d.bien.nature === 'terrain' || d.bien.lotissement) L.push(['bornage', 'Plan de bornage par un géomètre-expert', 'Seul un géomètre-expert peut fixer les limites.']);
    if (d.bien.lotissement) L.push(['lotir', 'Autorisation de lotir et documents du lotissement']);
    if (d.financement.pret) L.push(['offre_pret', 'Offre de prêt acceptée']);
    if (d.usage === 'rp' && d.acquereur.personnePhysique) L.push(['attest_rp', 'Engagement d\'affectation à la résidence principale', 'Condition des droits d\'enregistrement réduits (loi du pays 2025-12).']);
    return L.map(([id, label, hint]) => ({ id, label, hint: hint || '' }));
  }
  function defaultConditions(d) {
    const c = [];
    if (d.financement.pret) c.push({ id: 'pret', label: 'Obtention du prêt', limite: '', statut: 'en_cours' });
    c.push({ id: 'preemption', label: 'Purge des droits de préemption éventuels (régime calédonien à vérifier)', limite: '', statut: 'en_cours' });
    c.push({ id: 'urbanisme', label: 'Absence de servitude ou de règle d\'urbanisme bloquante', limite: '', statut: 'en_cours' });
    return c;
  }

  /* ---------- Frais (barème commun) ---------- */
  function frais(d) {
    if (!window.IMMO_BNK) return null;
    return IMMO_BNK.fraisAcquisition(d.prix || 0, { usage: d.usage, personnePhysique: d.acquereur.personnePhysique, type: 'ancien' });
  }

  /* ---------- Alertes et échéancier ---------- */
  function echeances(d) {
    const out = [];
    (d.conditions || []).forEach(c => { if (c.limite && c.statut === 'en_cours') out.push({ date: c.limite, label: 'Condition : ' + c.label, d }); });
    if (d.dates.signature && !['acte', 'publication', 'clos'].includes(d.etape)) out.push({ date: d.dates.signature, label: 'Signature de l\'acte authentique', d });
    return out;
  }
  function bloquant(d) { return d.bien.regime === 'coutumier' ? 'Terre coutumière : inaliénable et incessible, la vente est impossible. Seuls des baux ou actes coutumiers sont envisageables (autorité coutumière compétente).' : ''; }

  /* ---------- Styles ---------- */
  function injectStyle() {
    if ($('not-style')) return;
    const c = document.createElement('style'); c.id = 'not-style';
    c.textContent = `
.nt-wrap{max-width:1100px;margin:0 auto}.nt-head h2{font-family:'Source Sans 3',sans-serif;font-size:24px;margin:0 0 4px}.nt-head p{color:var(--mid);font-size:13px;margin:0 0 18px}
.nt-f{display:flex;flex-direction:column;gap:4px;margin-bottom:10px}.nt-f label,.nt-lab{font-size:14px;font-weight:600;color:var(--dark)}
.nt-f input,.nt-f select,.nt-f textarea{border:1px solid rgba(28,26,22,.15);border-radius:8px;padding:8px 10px;font:14px 'Source Sans 3',sans-serif;background:#fff;width:100%;box-sizing:border-box}
.nt-2{display:grid;grid-template-columns:1fr 1fr;gap:12px}.nt-3{display:grid;grid-template-columns:1fr 1fr 1fr;gap:12px}
.nt-chk{display:flex;align-items:flex-start;gap:8px;font:400 13px 'Source Sans 3',sans-serif;color:var(--dark);margin:7px 0;cursor:pointer;text-transform:none;}.nt-chk input{width:16px;height:16px;accent-color:var(--gold);margin:2px 0 0}.nt-chk small{display:block;color:var(--mid);font-size:11px}
.nt-kpis{display:grid;grid-template-columns:repeat(4,1fr);gap:12px;margin-bottom:16px}.nt-kpi{background:#fff;border:1px solid rgba(28,26,22,.08);border-radius:12px;padding:14px 16px}.nt-kpi small{display:block;font-size:11px;color:var(--mid);margin-bottom:6px}.nt-kpi b{font:700 22px 'Source Sans 3',sans-serif}
.nt-alert{border-radius:10px;padding:10px 14px;margin-bottom:10px;font-size:13px;line-height:1.5}.nt-alert.bad{background:#FDE8E4;color:#8E2A1D}.nt-alert.warn{background:#FEF3C7;color:#7A4A0A}.nt-alert.info{background:#E8EEFB;color:#2A4A7A}
.nt-tag{display:inline-block;font-size:11px;font-weight:600;padding:2px 9px;border-radius:99px;white-space:nowrap}.nt-tag.ok{background:#E6F4EA;color:#1E6B3A}.nt-tag.warn{background:#FEF3C7;color:#7A4A0A}.nt-tag.bad{background:#FDE8E4;color:#8E2A1D}.nt-tag.idle{background:#EEF2F6;color:#475569}
.nt-dos{display:grid;grid-template-columns:1fr auto;gap:10px;padding:14px 16px;border:1px solid rgba(28,26,22,.1);border-radius:12px;background:#fff;margin-bottom:10px;cursor:pointer}.nt-dos:hover{border-color:var(--gold)}.nt-dos h4{margin:0 0 3px;font-size:15px}.nt-dos p{margin:0;font-size:12px;color:var(--mid)}
.nt-steps{display:flex;flex-wrap:wrap;gap:6px;margin:6px 0 4px}.nt-steps button{border:1px solid rgba(28,26,22,.15);background:#fff;border-radius:99px;padding:6px 12px;font:500 12px 'Source Sans 3',sans-serif;cursor:pointer}.nt-steps button.on{background:var(--dark);color:#fff;border-color:var(--dark)}.nt-steps button.done{background:#E6F4EA;border-color:#B7DEC2}
.nt-cond{display:grid;grid-template-columns:1fr 160px 150px;gap:10px;align-items:center;padding:8px 0;border-top:1px solid rgba(28,26,22,.07);font-size:13px}.nt-cond input,.nt-cond select{border:1px solid rgba(28,26,22,.15);border-radius:6px;padding:6px 8px;font:13px 'Source Sans 3',sans-serif;width:100%;box-sizing:border-box}
.nt-rows div{display:flex;justify-content:space-between;padding:7px 0;border-bottom:1px solid rgba(28,26,22,.07);font-size:13px}.nt-rows div span:first-child{color:var(--mid)}.nt-rows .t{font-weight:700;border-bottom:0}
.nt-note{font-size:12px;color:var(--mid);background:var(--warm);border-radius:8px;padding:9px 12px;line-height:1.5;margin:10px 0}
.nt-back{background:none;border:0;color:var(--mid);cursor:pointer;font:500 13px 'Source Sans 3',sans-serif;padding:0;margin-bottom:12px}
.nt-ech{display:grid;grid-template-columns:110px 1fr auto;gap:12px;align-items:center;padding:10px 0;border-top:1px solid rgba(28,26,22,.07);font-size:13px;cursor:pointer}
@media(max-width:900px){.nt-2,.nt-3,.nt-cond{grid-template-columns:1fr}.nt-kpis{grid-template-columns:1fr 1fr}}
`;
    document.head.appendChild(c);
  }

  /* ---------- Liste ---------- */
  function newDossier() {
    dossiers = store.get(KEY, []);
    const n = dossiers.length + 1, y = new Date().getFullYear();
    const d = { id: 'n' + Date.now(), ref: `${y}-${String(n).padStart(3, '0')}`, created: today(), vendeur: { nom: '', tel: '' }, acquereur: { nom: '', tel: '', personnePhysique: true },
      bien: { adresse: '', commune: 'Nouméa', nature: 'bati', regime: 'droit_commun', lotissement: false }, prix: 0, usage: 'rp',
      financement: { pret: true, montant: 0, banque: '', finId: '' }, etape: 'ouverture', dates: { avantContrat: '', signature: '' }, conditions: [], pieces: {}, notes: '' };
    d.conditions = defaultConditions(d);
    dossiers.unshift(d); save(); return d.id;
  }
  function statusOf(d) {
    const pcs = piecesFor(d), ok = pcs.filter(p => d.pieces[p.id]).length;
    const ech = echeances(d).map(e => jours(e.date)).filter(j => j != null);
    const minJ = ech.length ? Math.min(...ech) : null;
    return { ok, total: pcs.length, minJ, bloc: bloquant(d) };
  }
  function buildListe(el) {
    injectStyle(); dossiers = store.get(KEY, []);
    el.innerHTML = `<div class="nt-wrap"><div class="nt-head" style="display:flex;justify-content:space-between;gap:12px;align-items:flex-start"><div><h2>Dossiers de vente</h2><p>${dossiers.length} dossier(s).</p></div><button type="button" class="btn btn-gold" id="nt-new">Nouveau dossier</button></div>
      ${dossiers.length ? dossiers.map(rowHTML).join('') : '<div class="card"><p style="margin:0;color:var(--mid);font-size:13px">Aucun dossier pour le moment.</p></div>'}</div>`;
    $('nt-new').onclick = () => { const id = newDossier(); openDossier(el, id); };
    el.querySelectorAll('[data-nd]').forEach(b => b.onclick = () => openDossier(el, b.dataset.nd));
  }
  function rowHTML(d) {
    const s = statusOf(d), et = (ETAPES.find(e => e[0] === d.etape) || ['', d.etape])[1];
    const tag = s.bloc ? '<span class="nt-tag bad">Bloquant</span>' : s.minJ != null && s.minJ < 0 ? '<span class="nt-tag bad">Échéance dépassée</span>' : s.minJ != null && s.minJ <= 10 ? `<span class="nt-tag warn">Échéance dans ${s.minJ} j</span>` : `<span class="nt-tag idle">${E(et)}</span>`;
    return `<div class="nt-dos" data-nd="${E(d.id)}"><div><h4>${E(d.ref)} — ${E(d.vendeur.nom || 'Vendeur ?')} → ${E(d.acquereur.nom || 'Acquéreur ?')}</h4><p>${E(d.bien.adresse || d.bien.commune)} · ${d.prix ? F(d.prix) : 'prix à renseigner'} · ${E(et)} · pièces ${s.ok}/${s.total}</p></div><div>${tag}</div></div>`;
  }

  /* ---------- Détail ---------- */
  function openDossier(el, id) {
    injectStyle();
    const d = dossiers.find(x => x.id === id); if (!d || !el) return;
    const pcs = piecesFor(d), fr = frais(d), bloc = bloquant(d), fins = store.get(FINKEY, []);
    const cur = ETAPES.findIndex(e => e[0] === d.etape);
    el.innerHTML = `<div class="nt-wrap"><button type="button" class="nt-back" id="nd-back">← Retour aux dossiers</button>
      ${bloc ? `<div class="nt-alert bad">${E(bloc)}</div>` : ''}
      <div class="card"><div class="card-title">Dossier ${E(d.ref)}</div>
        <span class="nt-lab">Étape</span><div class="nt-steps">${ETAPES.map(([k, l], i) => `<button type="button" data-et="${k}" class="${k === d.etape ? 'on' : i < cur ? 'done' : ''}">${E(l)}</button>`).join('')}</div>
        <div class="nt-2" style="margin-top:10px"><div class="nt-f"><label>Date de l'avant-contrat</label><input id="nd-avc" type="date" value="${E(d.dates.avantContrat)}"></div><div class="nt-f"><label>Date prévue de signature de l'acte</label><input id="nd-sig" type="date" value="${E(d.dates.signature)}"></div></div></div>
      <div class="card"><div class="card-title">Parties</div>
        <div class="nt-2"><div class="nt-f"><label>Vendeur</label><input id="nd-vnom" value="${E(d.vendeur.nom)}"></div><div class="nt-f"><label>Téléphone vendeur</label><input id="nd-vtel" value="${E(d.vendeur.tel)}"></div></div>
        <div class="nt-2"><div class="nt-f"><label>Acquéreur</label><input id="nd-anom" value="${E(d.acquereur.nom)}"></div><div class="nt-f"><label>Téléphone acquéreur</label><input id="nd-atel" value="${E(d.acquereur.tel)}"></div></div>
        <label class="nt-chk"><input type="checkbox" id="nd-pp"${d.acquereur.personnePhysique ? ' checked' : ''}><span>L'acquéreur est une personne physique (pas une société)</span></label></div>
      <div class="card"><div class="card-title">Bien et prix</div>
        <div class="nt-2"><div class="nt-f"><label>Adresse / désignation</label><input id="nd-adr" value="${E(d.bien.adresse)}"></div><div class="nt-f"><label>Commune</label><select id="nd-com">${COMMUNES.map(c => `<option${c === d.bien.commune ? ' selected' : ''}>${E(c)}</option>`).join('')}</select></div></div>
        <div class="nt-3"><div class="nt-f"><label>Nature</label><select id="nd-nat"><option value="bati">Bâti (maison, villa)</option><option value="copro">Lot de copropriété</option><option value="terrain">Terrain nu</option></select></div>
          <div class="nt-f"><label>Régime foncier</label><select id="nd-reg"><option value="droit_commun">Droit commun</option><option value="coutumier">Terre coutumière</option></select></div>
          <div class="nt-f"><label>Usage par l'acquéreur</label><select id="nd-usage"><option value="rp">Résidence principale</option><option value="autre">Autre (locatif, secondaire, professionnel)</option></select></div></div>
        <div class="nt-2"><div class="nt-f"><label>Prix de vente (F)</label><input id="nd-prix" type="number" min="0" step="100000" value="${d.prix || ''}"></div><div><label class="nt-chk" style="margin-top:22px"><input type="checkbox" id="nd-lot"${d.bien.lotissement ? ' checked' : ''}><span>Bien situé dans un lotissement</span></label></div></div></div>
      <div class="card"><div class="card-title">Financement</div>
        <label class="nt-chk"><input type="checkbox" id="nd-pret"${d.financement.pret ? ' checked' : ''}><span>Achat financé par un prêt</span></label>
        <div class="nt-3"><div class="nt-f"><label>Montant du prêt (F)</label><input id="nd-mpret" type="number" min="0" step="100000" value="${d.financement.montant || ''}"></div><div class="nt-f"><label>Banque</label><input id="nd-banque" value="${E(d.financement.banque)}" placeholder="BCI, BNC, BNP Paribas NC, SGCB…"></div>
          <div class="nt-f"><label>Dossier de financement lié</label><select id="nd-fin"><option value="">— aucun —</option>${fins.map(f => `<option value="${E(f.id)}"${f.id === d.financement.finId ? ' selected' : ''}>${E(f.client || 'Client')} (${E(f.etape)})</option>`).join('')}</select></div></div>
        ${fins.length ? '' : '<div class="nt-note">Aucun dossier de financement dans l\'espace Banquier pour le moment.</div>'}</div>
      <div class="card"><div class="card-title">Conditions suspensives</div>
        ${(d.conditions || []).map((c, i) => { const j = jours(c.limite); return `<div class="nt-cond"><div>${E(c.label)}${c.statut === 'en_cours' && j != null ? ` <span class="nt-tag ${j < 0 ? 'bad' : j <= 10 ? 'warn' : 'idle'}">${j < 0 ? 'dépassée' : j + ' j'}</span>` : ''}</div>
          <input type="date" data-cl="${i}" value="${E(c.limite)}" aria-label="Date limite"><select data-cs="${i}"><option value="en_cours"${c.statut === 'en_cours' ? ' selected' : ''}>En cours</option><option value="levee"${c.statut === 'levee' ? ' selected' : ''}>Levée</option><option value="defaillie"${c.statut === 'defaillie' ? ' selected' : ''}>Défaillie</option></select></div>`; }).join('')}
        <div style="display:flex;gap:8px;margin-top:10px"><input id="nd-newcond" placeholder="Ajouter une condition…" style="flex:1;border:1px solid rgba(28,26,22,.15);border-radius:8px;padding:8px 10px;font:14px 'Source Sans 3',sans-serif"><button type="button" class="btn btn-sm btn-outline" id="nd-addcond">Ajouter</button></div></div>
      <div class="card"><div class="card-title">Pièces à réunir (${pcs.filter(p => d.pieces[p.id]).length}/${pcs.length})</div>
        ${pcs.map(p => { const cmd = { diagnostics: ['diag', 'Commander à un diagnostiqueur'], bornage: ['geo', 'Commander à un géomètre-expert'] }[p.id];
          return `<label class="nt-chk"><input type="checkbox" data-pc="${p.id}"${d.pieces[p.id] ? ' checked' : ''}><span>${E(p.label)}${p.hint ? `<small>${E(p.hint)}</small>` : ''}${cmd && window.IMMO_MIS ? `<small><a href="#" data-cmd="${cmd[0]}" style="color:var(--gold-dark);font-weight:600">${E(cmd[1])} →</a></small>` : ''}</span></label>`; }).join('')}
        <div class="nt-note">Liste générée selon la nature du bien, le financement et l'usage. Elle reste à compléter selon votre pratique et les textes en vigueur.</div></div>
      <div class="card"><div class="card-title">Décompte prévisionnel des frais</div>
        ${fr && d.prix ? `<div class="nt-rows">${fr.lignes.map(l => `<div><span>${E(l.l)} (${(l.t * 100).toFixed(l.t < 0.01 ? 3 : 1).replace('.', ',')} %)</span><span>${F(l.m)}</span></div>`).join('')}<div class="t"><span>Total des frais d'acquisition</span><span>${F(fr.total)}</span></div></div>
          ${fr.droitsReduits ? '<div class="nt-note">Droits réduits appliqués : résidence principale achetée par une personne physique (loi du pays 2025-12, jusqu\'au 31/12/2027).</div>' : ''}
          <div class="nt-note">Barème commun avec l'espace Banquier (onglet Barèmes) ; émoluments approximés. À ajuster selon votre tarif et les débours réels.</div>`
          : '<p style="margin:0;color:var(--mid);font-size:13px">Renseignez le prix pour obtenir le décompte.</p>'}</div>
      <div class="card"><div class="nt-f"><label>Notes internes</label><textarea id="nd-notes" rows="3">${E(d.notes)}</textarea></div>
        <div style="display:flex;gap:8px;flex-wrap:wrap"><button type="button" class="btn btn-gold" id="nd-save">Enregistrer</button><button type="button" class="btn btn-outline" id="nd-print"${fr && d.prix ? '' : ' disabled'}>Imprimer le décompte</button><button type="button" class="btn btn-outline" id="nd-del">Supprimer</button></div></div></div>`;
    $('nd-nat').value = d.bien.nature; $('nd-reg').value = d.bien.regime; $('nd-usage').value = d.usage;

    // Lecture du formulaire : appelée avant toute action qui redessine, pour ne rien perdre
    const collect = () => {
      d.dates.avantContrat = $('nd-avc').value; d.dates.signature = $('nd-sig').value;
      d.vendeur = { nom: $('nd-vnom').value.trim(), tel: $('nd-vtel').value.trim() };
      d.acquereur = { nom: $('nd-anom').value.trim(), tel: $('nd-atel').value.trim(), personnePhysique: $('nd-pp').checked };
      d.bien = { adresse: $('nd-adr').value.trim(), commune: $('nd-com').value, nature: $('nd-nat').value, regime: $('nd-reg').value, lotissement: $('nd-lot').checked };
      d.usage = $('nd-usage').value; d.prix = Math.max(0, parseInt($('nd-prix').value, 10) || 0);
      const hadPret = d.financement.pret;
      d.financement = { pret: $('nd-pret').checked, montant: Math.max(0, parseInt($('nd-mpret').value, 10) || 0), banque: $('nd-banque').value.trim(), finId: $('nd-fin').value };
      el.querySelectorAll('[data-cl]').forEach(i => { d.conditions[+i.dataset.cl].limite = i.value; });
      el.querySelectorAll('[data-cs]').forEach(i => { d.conditions[+i.dataset.cs].statut = i.value; });
      if (d.financement.pret && !hadPret && !d.conditions.some(c => c.id === 'pret')) d.conditions.unshift({ id: 'pret', label: 'Obtention du prêt', limite: '', statut: 'en_cours' });
      if (!d.financement.pret) d.conditions = d.conditions.filter(c => c.id !== 'pret');
      el.querySelectorAll('[data-pc]').forEach(i => { d.pieces[i.dataset.pc] = i.checked; });
      d.notes = $('nd-notes').value.slice(0, 3000);
    };
    // Redessin différé et protégé : un champ qui perd le focus (« change ») peut déclencher un redessin
    // pendant qu'un autre événement s'exécute ; on ignore ceux qui visent un formulaire déjà remplacé.
    const formRoot = $('nd-avc'); let pending = false;
    const redraw = () => { if (pending) return; pending = true; setTimeout(() => { pending = false; if (!document.body.contains(formRoot)) return; collect(); save(); openDossier(el, id); }, 0); };
    el.querySelectorAll('[data-et]').forEach(b => b.onclick = () => {
      collect();
      if (b.dataset.et === 'acte' && bloquant(d)) { alert('Signature impossible : ' + bloquant(d)); return; }
      const ouvertes = d.conditions.filter(c => c.statut === 'en_cours');
      if (['acte', 'publication', 'clos'].includes(b.dataset.et) && ouvertes.length && !confirm(`${ouvertes.length} condition(s) suspensive(s) encore en cours. Continuer ?`)) return;
      d.etape = b.dataset.et; save(); openDossier(el, id);
    });
    // Champs qui modifient la liste de pièces, les conditions ou le décompte : redessiner aussitôt
    ['nd-nat', 'nd-reg', 'nd-usage', 'nd-pp', 'nd-pret', 'nd-lot'].forEach(i => $(i).addEventListener('change', redraw));
    $('nd-prix').addEventListener('change', redraw);
    $('nd-fin').addEventListener('change', () => {
      if (!document.body.contains(formRoot)) return;
      const f = fins.find(x => x.id === $('nd-fin').value);
      if (f && window.IMMO_BNK) { const c = IMMO_BNK.capacite(f.sim); if (!$('nd-mpret').value) $('nd-mpret').value = c.capital; if (!$('nd-anom').value) $('nd-anom').value = f.client || ''; $('nd-pret').checked = true; }
      redraw();
    });
    el.querySelectorAll('[data-cmd]').forEach(a => a.onclick = e => {
      e.preventDefault(); e.stopPropagation(); collect(); save();
      const role = a.dataset.cmd;
      IMMO_MIS.request(role, { source: 'notaire', ref: d.ref, client: d.vendeur.nom, tel: d.vendeur.tel, adresse: d.bien.adresse, commune: d.bien.commune, nature: d.bien.nature, type: role === 'geo' ? 'Bornage' : (d.bien.nature === 'terrain' ? 'Amiante environnemental (terrain, carte DIMENC)' : 'Repérage amiante (bâti)') });
      toast(role === 'geo' ? 'Demande de bornage transmise aux géomètres-experts.' : 'Demande de diagnostic transmise aux diagnostiqueurs.');
    });
    $('nd-addcond').onclick = () => { const v = $('nd-newcond').value.trim(); if (!v) return; collect(); d.conditions.push({ id: 'c' + Date.now(), label: v.slice(0, 200), limite: '', statut: 'en_cours' }); save(); openDossier(el, id); };
    $('nd-back').onclick = () => { collect(); save(); buildListe(el); };
    $('nd-save').onclick = () => { collect(); save(); toast('Dossier enregistré.'); openDossier(el, id); };
    $('nd-print').onclick = () => { collect(); save(); printDecompte(d); };
    $('nd-del').onclick = () => { if (confirm('Supprimer ce dossier ?')) { dossiers = dossiers.filter(x => x.id !== id); save(); buildListe(el); } };
  }

  function printDecompte(d) {
    const fr = frais(d); if (!fr) return;
    const w = window.open('', '_blank'); if (!w) { alert('Autorisez les fenêtres pop-up pour afficher le décompte.'); return; }
    w.document.write(`<!doctype html><meta charset="utf-8"><title>Décompte prévisionnel</title><style>body{font:14px/1.6 Arial,sans-serif;margin:40px;color:#111;max-width:720px}h1{font-size:20px}table{width:100%;border-collapse:collapse;margin:16px 0}td{padding:6px 0;border-bottom:1px solid #ddd}td:last-child{text-align:right}.n{font-size:12px;color:#555}</style>
<h1>Décompte prévisionnel des frais d'acquisition</h1><p>Dossier ${E(d.ref)} — ${E(d.bien.adresse || d.bien.commune)}<br>Vendeur : ${E(d.vendeur.nom)} · Acquéreur : ${E(d.acquereur.nom)}<br>Prix : <b>${F(d.prix)}</b></p>
<table>${fr.lignes.map(l => `<tr><td>${E(l.l)} (${(l.t * 100).toFixed(l.t < 0.01 ? 3 : 1).replace('.', ',')} %)</td><td>${F(l.m)}</td></tr>`).join('')}<tr><td><b>Total</b></td><td><b>${F(fr.total)}</b></td></tr></table>
<p class="n">Décompte prévisionnel établi le ${new Date().toLocaleDateString('fr-FR')}, susceptible d'ajustement (émoluments exacts, débours, formalités).${fr.droitsReduits ? ' Droits d\'enregistrement réduits au titre de la résidence principale (loi du pays 2025-12).' : ''}</p><script>onload=()=>setTimeout(()=>print(),300)<\/script>`);
    w.document.close();
  }

  /* ---------- Échéancier ---------- */
  function buildEcheancier(el) {
    injectStyle(); dossiers = store.get(KEY, []);
    const all = dossiers.flatMap(echeances).sort((a, b) => a.date.localeCompare(b.date));
    el.innerHTML = `<div class="nt-wrap"><div class="nt-head"><h2>Échéancier</h2><p>Dates limites des conditions suspensives et signatures prévues, tous dossiers confondus.</p></div>
      <div class="card">${all.length ? all.map(e => { const j = jours(e.date); return `<div class="nt-ech" data-nd="${E(e.d.id)}"><b>${fmtD(e.date)}</b><span>${E(e.d.ref)} — ${E(e.label)}</span><span class="nt-tag ${j < 0 ? 'bad' : j <= 10 ? 'warn' : 'idle'}">${j < 0 ? 'dépassée' : j === 0 ? 'aujourd\'hui' : 'dans ' + j + ' j'}</span></div>`; }).join('')
        : '<p style="margin:0;color:var(--mid);font-size:13px">Aucune échéance renseignée.</p>'}</div></div>`;
    el.querySelectorAll('[data-nd]').forEach(b => b.onclick = () => { go('not-dossiers'); openDossier($('panel-not-dossiers'), b.dataset.nd); });
  }

  /* ---------- Calculateur de frais rapide ---------- */
  function buildFrais(el) {
    injectStyle();
    el.innerHTML = `<div class="nt-wrap"><div class="nt-head"><h2>Calcul des frais d'acquisition</h2><p>Estimation rapide selon le barème calédonien.</p></div>
      <div class="card"><div class="nt-3"><div class="nt-f"><label>Prix (F)</label><input id="nf-prix" type="number" min="0" step="100000" value="30000000"></div>
        <div class="nt-f"><label>Usage</label><select id="nf-usage"><option value="rp">Résidence principale</option><option value="autre">Autre</option></select></div>
        <div class="nt-f"><label>Acquéreur</label><select id="nf-pp"><option value="1">Personne physique</option><option value="0">Société</option></select></div></div>
        <div class="nt-rows" id="nf-out"></div></div></div>`;
    const r = () => { const f = IMMO_BNK.fraisAcquisition(Math.max(0, parseInt($('nf-prix').value, 10) || 0), { usage: $('nf-usage').value, personnePhysique: $('nf-pp').value === '1', type: 'ancien' });
      $('nf-out').innerHTML = f.lignes.map(l => `<div><span>${E(l.l)} (${(l.t * 100).toFixed(l.t < 0.01 ? 3 : 1).replace('.', ',')} %)</span><span>${F(l.m)}</span></div>`).join('') + `<div class="t"><span>Total</span><span>${F(f.total)}</span></div>`; };
    el.querySelectorAll('input,select').forEach(i => i.addEventListener('input', r)); r();
  }

  /* ---------- Tableau de bord ---------- */
  function renderDashboard(dash) {
    injectStyle(); dossiers = store.get(KEY, []);
    const actifs = dossiers.filter(d => d.etape !== 'clos');
    const ech = actifs.flatMap(echeances).filter(e => { const j = jours(e.date); return j != null && j <= 10; }).sort((a, b) => a.date.localeCompare(b.date));
    const signatures = actifs.filter(d => d.dates.signature && jours(d.dates.signature) >= 0 && jours(d.dates.signature) <= 30 && !['acte', 'publication', 'clos'].includes(d.etape));
    const manquantes = actifs.reduce((a, d) => { const s = statusOf(d); return a + (s.total - s.ok); }, 0);
    const blocs = actifs.filter(d => bloquant(d));
    const nom = (typeof APP_STATE !== 'undefined' && APP_STATE.user?.nom) || '';
    dash.innerHTML = `<div class="nt-wrap"><div class="nt-head"><h2>Bonjour ${E(nom)}</h2><p>Votre étude en un coup d'œil.</p></div>
      ${blocs.length ? `<div class="nt-alert bad">${blocs.length} dossier(s) portent sur une terre coutumière : vente impossible en l'état.</div>` : ''}
      ${ech.length ? `<div class="nt-alert warn">${ech.length} échéance(s) dans les 10 prochains jours ou dépassée(s).</div>` : ''}
      <div class="nt-kpis"><div class="nt-kpi"><small>Dossiers actifs</small><b>${actifs.length}</b></div><div class="nt-kpi"><small>Signatures sous 30 j</small><b>${signatures.length}</b></div>
        <div class="nt-kpi"><small>Échéances proches</small><b>${ech.length}</b></div><div class="nt-kpi"><small>Pièces manquantes</small><b>${manquantes}</b></div></div>
      <div class="card"><div class="card-title" style="justify-content:space-between">Dossiers en cours <button type="button" class="btn btn-sm btn-outline" data-ngo="not-dossiers">Tous les dossiers</button></div>
        ${actifs.slice(0, 5).map(rowHTML).join('') || '<p style="margin:0;color:var(--mid);font-size:13px">Aucun dossier en cours.</p>'}</div></div>`;
    dash.querySelectorAll('[data-ngo]').forEach(b => b.onclick = () => go(b.dataset.ngo));
    dash.querySelectorAll('[data-nd]').forEach(b => b.onclick = () => { go('not-dossiers'); openDossier($('panel-not-dossiers'), b.dataset.nd); });
  }

  function toast(t) { const n = document.createElement('div'); n.setAttribute('role', 'status'); n.className = 'immo-toast'; document.querySelectorAll('.immo-toast').forEach(x => x.remove()); n.style.cssText = 'position:fixed;bottom:20px;right:20px;background:var(--dark);color:#fff;padding:12px 18px;border-radius:10px;font-size:13px;z-index:3000'; n.textContent = t; document.body.appendChild(n); setTimeout(() => n.remove(), 3500); }

  window.addEventListener('immo360:purge', () => { dossiers = []; });
  window.IMMO_PANELS = Object.assign(window.IMMO_PANELS || {}, { 'not-dossiers': buildListe, 'not-echeancier': buildEcheancier, 'not-frais': buildFrais });
  window.IMMO_DASH = Object.assign(window.IMMO_DASH || {}, { not: renderDashboard });
  window.IMMO_NOT = { piecesFor, defaultConditions, echeances, bloquant }; // exposé pour les tests
})();
