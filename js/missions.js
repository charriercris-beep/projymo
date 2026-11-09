/* Immo360 NC — Espaces Diagnostiqueur, Géomètre-expert, Assureur / courtier
 * Modèle commun « demande → mission → livrable », paramétré par métier :
 * types de mission, étapes, champs du livrable, mentions réglementaires (docs/fiches-metiers.md §4-6).
 * Les demandes peuvent venir d'autres espaces (notaire : diagnostics, bornage ; banquier : assurance).
 * Dépend des globales : esc, go, APP_STATE.
 */
(function () {
  'use strict';

  const $ = id => document.getElementById(id);
  const E = v => (typeof esc === 'function' ? esc(v) : String(v == null ? '' : v));
  const F = n => Math.round(n || 0).toLocaleString('fr-FR') + ' F';
  const store = { get(k, d) { try { return JSON.parse(localStorage.getItem(k)) ?? d; } catch (_) { return d; } }, set(k, v) { try { localStorage.setItem(k, JSON.stringify(v)); } catch (_) { /* stockage indisponible */ } } };
  const jours = iso => iso ? Math.ceil((new Date(iso + 'T23:59:59') - new Date()) / 86400000) : null;
  const fmtD = iso => iso ? new Date(iso + 'T12:00:00').toLocaleDateString('fr-FR') : '—';

  /* ---------- Configuration par métier ---------- */
  const ROLES = {
    diag: {
      nom: 'Diagnostiqueur', titreMissions: 'Missions de diagnostic',
      types: ['Repérage amiante (bâti)', 'Amiante environnemental (terrain, carte DIMENC)', 'Termites', 'Installation électrique', 'Installation gaz', 'Autre diagnostic'],
      etapes: [['demande', 'Demande reçue'], ['devis', 'Devis envoyé'], ['planifiee', 'Visite planifiée'], ['realisee', 'Visite réalisée'], ['livree', 'Rapport livré'], ['annulee', 'Annulée']],
      livrable: [['ref', 'Référence du rapport', 'text'], ['date', 'Date du rapport', 'date'], ['validite', 'Fin de validité', 'date'], ['conclusion', 'Conclusion', 'select:Absence de repérage|Présence constatée|À surveiller|Sans objet']],
      agrement: 'Certification / organisme', note: 'Diagnostics exigés à la vente en Nouvelle-Calédonie : liste à confirmer. Textes identifiés : amiante dans le bâti (délibération 211/CP de 1997), terrains amiantifères (délibération 82 du 25/08/2010, carte DIMENC). Ne pas transposer le DDT métropolitain.',
      dossierLabel: 'Rapport'
    },
    geo: {
      nom: 'Géomètre-expert', titreMissions: 'Missions foncières',
      types: ['Bornage', 'Division parcellaire (nouveaux numéros DITTT)', 'Plan de vente / relevé de surface', 'Implantation de construction', 'Copropriété (état descriptif de division)'],
      etapes: [['demande', 'Demande reçue'], ['devis', 'Devis envoyé'], ['convocation', 'Riverains convoqués'], ['terrain', 'Relevé sur le terrain'], ['plan', 'Plan / procès-verbal établi'], ['dittt', 'Déposé à la DITTT'], ['livree', 'Livré'], ['annulee', 'Annulée']],
      livrable: [['ref', 'Référence du plan / PV', 'text'], ['date', 'Date', 'date'], ['parcelles', 'Numéros de parcelles attribués (DITTT)', 'text'], ['surface', 'Surface mesurée (m²)', 'number']],
      agrement: 'Inscription à l\'ordre des géomètres-experts de NC', note: 'Seul un géomètre-expert peut fixer les limites de propriété. Pour une division, demande de nouveaux numéros au bureau du cadastre de la DITTT (formulaire + plan). Les informations cadastrales ne valent pas titre de propriété.',
      dossierLabel: 'Plan / PV'
    },
    ass: {
      nom: 'Assureur / courtier', titreMissions: 'Demandes d\'assurance',
      types: ['Multirisque habitation', 'Assurance emprunteur', 'Propriétaire non occupant', 'Dommages-ouvrage', 'Responsabilité civile décennale (professionnel)'],
      etapes: [['demande', 'Demande reçue'], ['devis', 'Proposition envoyée'], ['acceptee', 'Acceptée'], ['attestation', 'Attestation émise'], ['refusee', 'Refusée / sans suite']],
      livrable: [['ref', 'N° de contrat / attestation', 'text'], ['date', 'Date d\'effet', 'date'], ['validite', 'Échéance', 'date'], ['prime', 'Prime annuelle (F)', 'number']],
      garanties: ['Incendie', 'Dégâts des eaux', 'Catastrophe naturelle', 'Cyclone / tempête', 'Vol', 'Responsabilité civile'],
      garantiesEmprunteur: ['Décès', 'Perte totale et irréversible d\'autonomie (PTIA)', 'Incapacité temporaire de travail (ITT)', 'Invalidité', 'Perte d\'emploi'],
      agrement: 'Immatriculation / agrément', note: 'En Nouvelle-Calédonie, la garantie cyclone peut être optionnelle selon les contrats : vérifiez qu\'elle est bien incluse. En cas de délégation d\'assurance emprunteur, la banque exige des garanties au moins équivalentes à son contrat groupe.',
      dossierLabel: 'Attestation'
    }
  };
  const OPEN = ['demande', 'devis', 'planifiee', 'realisee', 'convocation', 'terrain', 'plan', 'dittt', 'acceptee'];
  const DONE = ['livree', 'attestation'];
  const keyM = r => 'immo360.missions.' + r + '.v1', keyP = r => 'immo360.pro.' + r + '.v1';
  const setM = (r, list) => { store.set(keyM(r), list); if (window.IMMO_SYNC) IMMO_SYNC.saved(keyM(r), list); };

  /* ---------- Demandes venant des autres espaces ---------- */
  function request(role, o) {
    if (!ROLES[role]) return null;
    const list = store.get(keyM(role), []);
    const m = { id: role + Date.now(), created: new Date().toISOString().slice(0, 10), source: o.source || 'manuel', sourceRef: o.ref || '', type: o.type || ROLES[role].types[0],
      client: o.client || '', tel: o.tel || '', adresse: o.adresse || '', commune: o.commune || '', nature: o.nature || '', annee: o.annee || '', montant: o.montant || 0,
      etape: 'demande', devis: 0, intervention: '', liv: {}, garanties: {}, notes: o.notes || '' };
    list.unshift(m); setM(role, list); return m.id;
  }

  /* ---------- Styles ---------- */
  function injectStyle() {
    if ($('mis-style')) return;
    const c = document.createElement('style'); c.id = 'mis-style';
    c.textContent = `
.ms-wrap{max-width:1100px;margin:0 auto}.ms-head h2{font-family:'Source Sans 3',sans-serif;font-size:24px;margin:0 0 4px}.ms-head p{color:var(--mid);font-size:13px;margin:0 0 18px}
.ms-f{display:flex;flex-direction:column;gap:4px;margin-bottom:10px}.ms-f label,.ms-lab{font-size:14px;font-weight:600;color:var(--dark)}
.ms-f input,.ms-f select,.ms-f textarea{border:1px solid rgba(28,26,22,.15);border-radius:8px;padding:8px 10px;font:14px 'Source Sans 3',sans-serif;background:#fff;width:100%;box-sizing:border-box}
.ms-2{display:grid;grid-template-columns:1fr 1fr;gap:12px}.ms-3{display:grid;grid-template-columns:1fr 1fr 1fr;gap:12px}
.ms-chk{display:inline-flex;align-items:center;gap:7px;font:400 13px 'Source Sans 3',sans-serif;color:var(--dark);margin:5px 14px 5px 0;cursor:pointer;text-transform:none;}.ms-chk input{width:16px;height:16px;accent-color:var(--gold);margin:0}
.ms-kpis{display:grid;grid-template-columns:repeat(4,1fr);gap:12px;margin-bottom:16px}.ms-kpi{background:#fff;border:1px solid rgba(28,26,22,.08);border-radius:12px;padding:14px 16px}.ms-kpi small{display:block;font-size:11px;color:var(--mid);margin-bottom:6px}.ms-kpi b{font:700 22px 'Source Sans 3',sans-serif}
.ms-alert{border-radius:10px;padding:10px 14px;margin-bottom:10px;font-size:13px;line-height:1.5}.ms-alert.bad{background:#FDE8E4;color:#8E2A1D}.ms-alert.warn{background:#FEF3C7;color:#7A4A0A}.ms-alert.info{background:#E8EEFB;color:#2A4A7A}
.ms-tag{display:inline-block;font-size:11px;font-weight:600;padding:2px 9px;border-radius:99px;white-space:nowrap}.ms-tag.ok{background:#E6F4EA;color:#1E6B3A}.ms-tag.warn{background:#FEF3C7;color:#7A4A0A}.ms-tag.bad{background:#FDE8E4;color:#8E2A1D}.ms-tag.idle{background:#EEF2F6;color:#475569}.ms-tag.new{background:#E8EEFB;color:#2A4A7A}
.ms-row{display:grid;grid-template-columns:1fr auto;gap:10px;padding:14px 16px;border:1px solid rgba(28,26,22,.1);border-radius:12px;background:#fff;margin-bottom:10px;cursor:pointer}.ms-row:hover{border-color:var(--gold)}.ms-row h4{margin:0 0 3px;font-size:15px}.ms-row p{margin:0;font-size:12px;color:var(--mid)}
.ms-steps{display:flex;flex-wrap:wrap;gap:6px;margin:6px 0 4px}.ms-steps button{border:1px solid rgba(28,26,22,.15);background:#fff;border-radius:99px;padding:6px 12px;font:500 12px 'Source Sans 3',sans-serif;cursor:pointer}.ms-steps button.on{background:var(--dark);color:#fff;border-color:var(--dark)}.ms-steps button.done{background:#E6F4EA;border-color:#B7DEC2}
.ms-note{font-size:12px;color:var(--mid);background:var(--warm);border-radius:8px;padding:9px 12px;line-height:1.5;margin:10px 0}
.ms-back{background:none;border:0;color:var(--mid);cursor:pointer;font:500 13px 'Source Sans 3',sans-serif;padding:0;margin-bottom:12px}
@media(max-width:900px){.ms-2,.ms-3{grid-template-columns:1fr}.ms-kpis{grid-template-columns:1fr 1fr}}
`;
    document.head.appendChild(c);
  }

  // Les trois métiers partagent les mêmes gabarits (mêmes identifiants) : un seul panneau affiché à la fois
  function clearOthers(el) {
    Object.keys(ROLES).forEach(r => ['-missions', '-profil'].forEach(sfx => { const p = $('panel-' + r + sfx); if (p && p !== el) p.innerHTML = ''; }));
  }

  /* ---------- Profil (conformité minimale) ---------- */
  const profil = r => store.get(keyP(r), { nom: '', ridet: '', agrement: '', rcRef: '', rcExp: '', zones: '' });
  function profilAlerts(r) {
    const p = profil(r), out = [];
    const manque = [!p.nom && 'nom', !p.ridet && 'RIDET', !p.agrement && ROLES[r].agrement.toLowerCase(), !p.rcRef && 'assurance RC professionnelle'].filter(Boolean);
    if (manque.length) out.push(['warn', 'Profil à compléter : ' + manque.join(', ') + '.']);
    const j = jours(p.rcExp); if (j != null && j < 0) out.push(['bad', 'Assurance RC professionnelle expirée.']); else if (j != null && j <= 60) out.push(['warn', `Assurance RC professionnelle : expire dans ${j} j.`]);
    return out;
  }
  function buildProfil(r, el) {
    injectStyle(); clearOthers(el); const p = profil(r), R = ROLES[r];
    el.innerHTML = `<div class="ms-wrap"><div class="ms-head"><h2>Profil</h2><p>Informations affichées aux clients et reprises sur vos documents.</p></div>
      ${profilAlerts(r).map(([c, t]) => `<div class="ms-alert ${c}">${E(t)}</div>`).join('')}
      <div class="card"><div class="ms-2"><div class="ms-f"><label>Nom / raison sociale</label><input id="mp-nom" value="${E(p.nom)}"></div><div class="ms-f"><label>RIDET</label><input id="mp-ridet" value="${E(p.ridet)}"></div></div>
        <div class="ms-2"><div class="ms-f"><label>${E(R.agrement)}</label><input id="mp-agr" value="${E(p.agrement)}"></div><div class="ms-f"><label>Zones d'intervention</label><input id="mp-zones" value="${E(p.zones)}" placeholder="Grand Nouméa, Brousse…"></div></div>
        <div class="ms-2"><div class="ms-f"><label>Assurance RC professionnelle (n°)</label><input id="mp-rc" value="${E(p.rcRef)}"></div><div class="ms-f"><label>Échéance RC pro</label><input id="mp-rcexp" type="date" value="${E(p.rcExp)}"></div></div>
        <button type="button" class="btn btn-gold" id="mp-save">Enregistrer</button></div></div>`;
    $('mp-save').onclick = () => { const v = { nom: $('mp-nom').value.trim(), ridet: $('mp-ridet').value.trim(), agrement: $('mp-agr').value.trim(), zones: $('mp-zones').value.trim(), rcRef: $('mp-rc').value.trim(), rcExp: $('mp-rcexp').value }; store.set(keyP(r), v); if (window.IMMO_SYNC) IMMO_SYNC.ensurePro(r, { nom: v.nom || 'Professionnel', ridet: v.ridet }); toast('Profil enregistré.'); buildProfil(r, el); };
  }

  /* ---------- Missions ---------- */
  const etapeL = (r, k) => (ROLES[r].etapes.find(e => e[0] === k) || [k, k])[1];
  function rowHTML(r, m) {
    const j = jours(m.liv.validite), cls = DONE.includes(m.etape) ? (j != null && j < 0 ? 'bad' : 'ok') : m.etape === 'demande' ? 'new' : ['annulee', 'refusee'].includes(m.etape) ? 'idle' : 'warn';
    const lab = DONE.includes(m.etape) && j != null ? (j < 0 ? 'Expiré' : j <= 60 ? 'Expire dans ' + j + ' j' : etapeL(r, m.etape)) : etapeL(r, m.etape);
    return `<div class="ms-row" data-mid="${E(m.id)}"><div><h4>${E(m.type)} — ${E(m.client || 'Client ?')}</h4><p>${E([m.adresse, m.commune].filter(Boolean).join(', ') || 'Adresse à préciser')}${m.source !== 'manuel' ? ' · demandé depuis l\'espace ' + E(m.source) : ''}${m.intervention ? ' · intervention le ' + fmtD(m.intervention) : ''}</p></div><div><span class="ms-tag ${cls}">${E(lab)}</span></div></div>`;
  }
  function buildListe(r, el) {
    injectStyle(); clearOthers(el); const all = store.get(keyM(r), []), R = ROLES[r];
    // Formule gratuite en mode payant : missions limitées par mois (js/abonnement.js)
    const capM = window.IMMO_ABO ? IMMO_ABO.cap(r, 'missions', all) : { shown: all, hidden: 0 }, list = capM.shown;
    el.innerHTML = `<div class="ms-wrap">${window.IMMO_ABO ? IMMO_ABO.invite(r, capM.hidden, 'missions') : ''}<div class="ms-head" style="display:flex;justify-content:space-between;gap:12px;align-items:flex-start"><div><h2>${E(R.titreMissions)}</h2><p>${list.length} mission(s).</p></div><button type="button" class="btn btn-gold" id="ms-new">Nouvelle mission</button></div>
      ${list.length ? list.map(m => rowHTML(r, m)).join('') : '<div class="card"><p style="margin:0;color:var(--mid);font-size:13px">Aucune mission pour le moment.</p></div>'}</div>`;
    $('ms-new').onclick = () => openMission(r, el, request(r, {}));
    el.querySelectorAll('[data-mid]').forEach(b => b.onclick = () => openMission(r, el, b.dataset.mid));
  }
  function openMission(r, el, id) {
    injectStyle(); clearOthers(el); let list = store.get(keyM(r), []); const m = list.find(x => x.id === id), R = ROLES[r]; if (!m || !el) return;
    const cur = R.etapes.findIndex(e => e[0] === m.etape), P = profil(r);
    const emprunteur = /emprunteur/i.test(m.type);
    const GAR = R.garanties ? (emprunteur ? R.garantiesEmprunteur : R.garanties) : null;
    const fld = ([k, l, t]) => { const v = m.liv[k] ?? '';
      if (t.startsWith('select:')) return `<div class="ms-f"><label>${E(l)}</label><select data-lv="${k}"><option value="">—</option>${t.slice(7).split('|').map(o => `<option${o === v ? ' selected' : ''}>${E(o)}</option>`).join('')}</select></div>`;
      return `<div class="ms-f"><label>${E(l)}</label><input data-lv="${k}" type="${t}" value="${E(v)}"></div>`; };
    el.innerHTML = `<div class="ms-wrap"><button type="button" class="ms-back" id="ms-back">← Retour</button>
      <div class="card"><div class="card-title">${E(m.type)}</div><span class="ms-lab">Étape</span>
        <div class="ms-steps">${R.etapes.map(([k, l], i) => `<button type="button" data-et="${k}" class="${k === m.etape ? 'on' : (i < cur && !['annulee', 'refusee'].includes(k) ? 'done' : '')}">${E(l)}</button>`).join('')}</div></div>
      <div class="card"><div class="card-title">Demande</div>
        <div class="ms-2"><div class="ms-f"><label>Type de mission</label><select id="mm-type">${R.types.map(t => `<option${t === m.type ? ' selected' : ''}>${E(t)}</option>`).join('')}</select></div><div class="ms-f"><label>Client</label><input id="mm-client" value="${E(m.client)}"></div></div>
        <div class="ms-3"><div class="ms-f"><label>Téléphone</label><input id="mm-tel" value="${E(m.tel)}"></div><div class="ms-f"><label>Adresse</label><input id="mm-adr" value="${E(m.adresse)}"></div><div class="ms-f"><label>Commune</label><input id="mm-com" value="${E(m.commune)}"></div></div>
        <div class="ms-3"><div class="ms-f"><label>${r === 'ass' ? 'Capital / montant assuré (F)' : 'Année de construction'}</label><input id="mm-x" type="number" value="${E(r === 'ass' ? (m.montant || '') : m.annee)}"></div>
          <div class="ms-f"><label>${r === 'ass' ? 'Prime proposée (F)' : 'Montant du devis (F)'}</label><input id="mm-devis" type="number" min="0" step="1000" value="${m.devis || ''}"></div>
          <div class="ms-f"><label>${r === 'ass' ? 'Date de rendez-vous' : 'Date d\'intervention'}</label><input id="mm-int" type="date" value="${E(m.intervention)}"></div></div>
        ${m.sourceRef ? `<div class="ms-note">Demande issue de l'espace ${E(m.source)} (dossier ${E(m.sourceRef)}).</div>` : ''}
        <div class="ms-note">${E(R.note)}</div></div>
      <div class="card"><div class="card-title">${E(R.dossierLabel)}</div><div class="ms-2">${R.livrable.map(fld).join('')}</div>
        ${GAR ? `<span class="ms-lab">Garanties incluses</span><div>${GAR.map(g => `<label class="ms-chk"><input type="checkbox" data-gar="${E(g)}"${m.garanties[g] ? ' checked' : ''}>${E(g)}</label>`).join('')}</div>` : ''}
        <div class="ms-f" style="margin-top:8px"><label>Notes</label><textarea id="mm-notes" rows="3">${E(m.notes)}</textarea></div>
        <div style="display:flex;gap:8px;flex-wrap:wrap"><button type="button" class="btn btn-gold" id="mm-save">Enregistrer</button><button type="button" class="btn btn-outline" id="mm-print">Imprimer ${r === 'ass' ? 'l\'attestation' : 'le compte rendu'}</button><button type="button" class="btn btn-outline" id="mm-del">Supprimer</button></div></div></div>`;
    const collect = () => {
      m.type = $('mm-type').value; m.client = $('mm-client').value.trim(); m.tel = $('mm-tel').value.trim(); m.adresse = $('mm-adr').value.trim(); m.commune = $('mm-com').value.trim();
      if (r === 'ass') m.montant = Math.max(0, parseInt($('mm-x').value, 10) || 0); else m.annee = $('mm-x').value;
      m.devis = Math.max(0, parseInt($('mm-devis').value, 10) || 0); m.intervention = $('mm-int').value; m.notes = $('mm-notes').value.slice(0, 2000);
      el.querySelectorAll('[data-lv]').forEach(i => { m.liv[i.dataset.lv] = i.value; });
      el.querySelectorAll('[data-gar]').forEach(i => { m.garanties[i.dataset.gar] = i.checked; });
    };
    const persist = () => { list = store.get(keyM(r), []).map(x => x.id === m.id ? m : x); setM(r, list); };
    el.querySelectorAll('[data-et]').forEach(b => b.onclick = () => {
      collect();
      if (DONE.includes(b.dataset.et) && !m.liv.ref) { alert(`Renseignez la référence (${R.livrable[0][1].toLowerCase()}) avant de marquer la mission comme livrée.`); return; }
      if (r === 'ass' && !emprunteur && b.dataset.et === 'attestation' && !m.garanties['Cyclone / tempête'] && !confirm('La garantie cyclone / tempête n\'est pas cochée. Émettre l\'attestation quand même ?')) return;
      m.etape = b.dataset.et; persist(); openMission(r, el, id);
    });
    $('mm-type').addEventListener('change', () => { collect(); persist(); openMission(r, el, id); }); // les garanties dépendent du type
    $('ms-back').onclick = () => { collect(); persist(); buildListe(r, el); };
    $('mm-save').onclick = () => { collect(); persist(); toast('Mission enregistrée.'); openMission(r, el, id); };
    $('mm-del').onclick = () => { if (confirm('Supprimer cette mission ?')) { setM(r, store.get(keyM(r), []).filter(x => x.id !== id)); buildListe(r, el); } };
    $('mm-print').onclick = () => {
      collect(); persist();
      const w = window.open('', '_blank'); if (!w) { alert('Autorisez les fenêtres pop-up.'); return; }
      w.document.write(`<!doctype html><meta charset="utf-8"><title>${E(R.dossierLabel)}</title><style>body{font:14px/1.6 Arial,sans-serif;margin:40px;max-width:720px;color:#111}h1{font-size:20px}td{padding:5px 12px 5px 0;vertical-align:top}small{color:#555}</style>
<h1>${E(r === 'ass' ? 'Attestation d\'assurance' : 'Compte rendu de mission')} — ${E(m.type)}</h1>
<p><b>${E(P.nom || R.nom)}</b><br><small>RIDET ${E(P.ridet || '—')} · ${E(R.agrement)} : ${E(P.agrement || '—')} · RC pro ${E(P.rcRef || '—')}</small></p>
<table><tr><td>Client</td><td>${E(m.client)}</td></tr><tr><td>Bien</td><td>${E([m.adresse, m.commune].filter(Boolean).join(', '))}</td></tr>
${R.livrable.map(([k, l]) => `<tr><td>${E(l)}</td><td>${E(/date|validite/.test(k) ? fmtD(m.liv[k]) : (m.liv[k] || '—'))}</td></tr>`).join('')}
${GAR ? `<tr><td>Garanties</td><td>${E(GAR.filter(g => m.garanties[g]).join(', ') || '—')}</td></tr>` : ''}</table>
<p><small>Document établi le ${new Date().toLocaleDateString('fr-FR')}.</small></p><script>onload=()=>setTimeout(()=>print(),300)<\/script>`);
      w.document.close();
    };
  }

  /* ---------- Tableau de bord ---------- */
  function renderDashboard(r, dash) {
    injectStyle(); const list = store.get(keyM(r), []), R = ROLES[r];
    const nouvelles = list.filter(m => m.etape === 'demande'), encours = list.filter(m => OPEN.includes(m.etape) && m.etape !== 'demande');
    const livrees = list.filter(m => DONE.includes(m.etape));
    const expirent = livrees.filter(m => { const j = jours(m.liv.validite); return j != null && j <= 60; });
    const semaine = list.filter(m => { const j = jours(m.intervention); return OPEN.includes(m.etape) && j != null && j >= 0 && j <= 7; });
    const nom = profil(r).nom || (typeof APP_STATE !== 'undefined' && APP_STATE.user?.nom) || '';
    dash.innerHTML = `<div class="ms-wrap"><div class="ms-head"><h2>Bonjour ${E(nom)}</h2><p>Espace ${E(R.nom)}.</p></div>
      ${profilAlerts(r).map(([c, t]) => `<div class="ms-alert ${c}">${E(t)} <a href="#" data-mgo="${r}-profil" style="color:inherit;font-weight:600">Compléter</a></div>`).join('')}
      ${nouvelles.length ? `<div class="ms-alert info">${nouvelles.length} nouvelle(s) demande(s) à traiter.</div>` : ''}
      ${expirent.length ? `<div class="ms-alert warn">${expirent.length} ${E(R.dossierLabel.toLowerCase())}(s) arrive(nt) à échéance dans moins de 60 jours.</div>` : ''}
      <div class="ms-kpis"><div class="ms-kpi"><small>Nouvelles demandes</small><b>${nouvelles.length}</b></div><div class="ms-kpi"><small>En cours</small><b>${encours.length}</b></div>
        <div class="ms-kpi"><small>Interventions sous 7 j</small><b>${semaine.length}</b></div><div class="ms-kpi"><small>Livrées</small><b>${livrees.length}</b></div></div>
      <div class="card"><div class="card-title" style="justify-content:space-between">Missions récentes <button type="button" class="btn btn-sm btn-outline" data-mgo="${r}-missions">Toutes les missions</button></div>
        ${list.slice(0, 5).map(m => rowHTML(r, m)).join('') || '<p style="margin:0;color:var(--mid);font-size:13px">Aucune mission pour le moment.</p>'}</div></div>`;
    dash.querySelectorAll('[data-mgo]').forEach(b => b.onclick = e => { e.preventDefault(); go(b.dataset.mgo); });
    dash.querySelectorAll('[data-mid]').forEach(b => b.onclick = () => { go(r + '-missions'); openMission(r, $('panel-' + r + '-missions'), b.dataset.mid); });
  }

  function toast(t) { const n = document.createElement('div'); n.setAttribute('role', 'status'); n.className = 'immo-toast'; document.querySelectorAll('.immo-toast').forEach(x => x.remove()); n.style.cssText = 'position:fixed;bottom:20px;right:20px;background:var(--dark);color:#fff;padding:12px 18px;border-radius:10px;font-size:13px;z-index:3000'; n.textContent = t; document.body.appendChild(n); setTimeout(() => n.remove(), 3500); }

  const panels = {}, dashes = {};
  Object.keys(ROLES).forEach(r => { panels[r + '-missions'] = el => buildListe(r, el); panels[r + '-profil'] = el => buildProfil(r, el); dashes[r] = dash => renderDashboard(r, dash); });
  window.IMMO_PANELS = Object.assign(window.IMMO_PANELS || {}, panels);
  window.IMMO_DASH = Object.assign(window.IMMO_DASH || {}, dashes);
  window.IMMO_MIS = { request, ROLES, toast };
})();
