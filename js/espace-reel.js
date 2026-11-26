/* Immo360 NC — Espaces réels : plus aucune donnée inventée pour les vrais comptes
 * 1. Agence : mandats, clients, rendez-vous, comptes-rendus, dossiers notaire et acheteurs sont ceux du compte
 *    (vides au départ), enregistrés dans la base (privés, synchronisés entre appareils). Les exemples restent
 *    uniquement en mode démonstration, avec un bandeau qui le dit.
 * 2. Plus d'envoi annoncé sans avoir lieu : mandat et bon de visite → document à imprimer et faire signer ;
 *    SMS → ouverture de l'application de messages du téléphone ; invitation de signature → fichier calendrier.
 * 3. Statistiques des annonces : chiffres réels (fiches vues, messages, demandes de visite), via la base.
 * 4. « Mon achat » (acheteur) : étapes et nouvelles tirées de ses vraies actions.
 * Dépend des globales du site (MANDATS, CRM_CLIENTS, VISITES, CR_VISITES, DOSSIERS_NOTAIRE, ACHETEURS…).
 */
(function () {
  'use strict';

  const $ = id => document.getElementById(id);
  const E = s => String(s == null ? '' : s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const reel = () => !!(window.IMMO_SYNC && IMMO_SYNC.uid && IMMO_SYNC.client);
  const M = n => n >= 1e6 ? (Math.round(n / 1e5) / 10).toLocaleString('fr-FR') + ' M F' : Math.round(n || 0).toLocaleString('fr-FR') + ' F';
  // Message bref en bas de l'écran (utilisé par plusieurs modules du site)
  if (typeof window.showToast !== 'function') {
    window.showToast = function (t) {
      let el = document.getElementById('immo-toast');
      if (!el) { el = document.createElement('div'); el.id = 'immo-toast'; el.className = 'immo-toast'; el.setAttribute('role', 'status'); el.setAttribute('aria-live', 'polite'); document.body.appendChild(el); }
      el.textContent = String(t || ''); el.classList.add('on'); clearTimeout(el._t); el._t = setTimeout(() => el.classList.remove('on'), 4200);
    };
  }
  const dire = t => showToast(t);
  const lire = k => { try { const v = JSON.parse(localStorage.getItem(k) || '[]'); return Array.isArray(v) ? v : []; } catch (_) { return []; } };
  const ecrire = (k, v) => { try { localStorage.setItem(k, JSON.stringify(v)); } catch (_) { /* stockage plein */ } };

  /* ---------- 1. Données de l'agence ---------- */
  // get/set explicites : ces listes sont des variables globales du site
  const JEUX = [
    { k: 'immo360.agt.mandats.v1', get: () => MANDATS, set: v => { MANDATS = v; }, build: 'buildMandats', panels: ['mandats'] },
    { k: 'immo360.agt.clients.v1', get: () => CRM_CLIENTS, set: v => { CRM_CLIENTS = v; }, build: 'buildCRM', panels: ['crm'] },
    { k: 'immo360.agt.visites.v1', get: () => VISITES, set: v => { VISITES = v; }, build: 'buildVisites', panels: ['visites'] },
    { k: 'immo360.agt.cr.v1', get: () => CR_VISITES, set: v => { CR_VISITES = v; }, build: 'buildVisites', panels: ['visites'] },
    { k: 'immo360.agt.notaire.v1', get: () => DOSSIERS_NOTAIRE, set: v => { DOSSIERS_NOTAIRE = v; }, build: 'buildNotaire', panels: ['notaire'] },
    { k: 'immo360.agt.acheteurs.v1', get: () => ACHETEURS, set: v => { ACHETEURS = v; }, build: 'buildMatching', panels: ['matching'] }
  ].filter(j => { try { j.get(); return true; } catch (_) { return false; } });
  const DEMO = {}; JEUX.forEach(j => { DEMO[j.k] = JSON.parse(JSON.stringify(j.get())); });
  let mode = null; // 'reel' | 'demo'

  function charger() {
    const m = reel() ? 'reel' : 'demo';
    JEUX.forEach(j => j.set(m === 'reel' ? lire(j.k) : JSON.parse(JSON.stringify(DEMO[j.k]))));
    mode = m;
  }
  // Identifiants uniques (la base les partage entre comptes) ; enregistrement quand une liste change
  let seq = 0;
  function enregistrer() {
    if (!reel() || mode !== 'reel') return;
    JEUX.forEach(j => {
      const v = j.get(); if (!Array.isArray(v)) return;
      let renum = false;
      v.forEach(x => { if (x && (typeof x.id !== 'number' || x.id < 1e12)) { x.id = Date.now() * 100 + (seq++ % 100); renum = true; } });
      const s = JSON.stringify(v);
      if (s !== localStorage.getItem(j.k)) { ecrire(j.k, v); if (window.IMMO_SYNC) IMMO_SYNC.saved(j.k, v); }
      if (renum) { const p = document.querySelector('.panel.active'); if (p && j.panels.includes(p.id.replace('panel-', '')) && typeof window[j.build] === 'function') window[j.build](); }
    });
  }
  setInterval(enregistrer, 1500);
  setInterval(() => { const m = reel() ? 'reel' : 'demo'; if (m !== mode) charger(); }, 1000);
  window.addEventListener('immo360:purge', () => { mode = null; });

  // Avant chaque affichage : bonnes données ; après : bandeau en démonstration
  function bandeau(panel, txt) {
    const p = $('panel-' + panel); if (!p) return;
    p.querySelectorAll('.demo-band').forEach(x => x.remove());
    if (reel()) return;
    const d = document.createElement('div'); d.className = 'demo-band';
    d.innerHTML = '<b>Exemples de démonstration.</b> ' + E(txt) + ' <button type="button" class="lp-link" onclick="showLoginModal(\'agt\')">Se connecter</button>';
    p.prepend(d);
  }
  const TXT = { mandats: 'Avec votre compte, vous retrouvez ici vos propres mandats.', crm: 'Avec votre compte, vous gérez ici vos propres clients.', visites: 'Avec votre compte, vos propres rendez-vous et comptes-rendus.', notaire: 'Avec votre compte, vos propres dossiers en cours chez le notaire.', matching: 'Avec votre compte, vos propres acheteurs.' };
  [['buildMandats', 'mandats'], ['buildCRM', 'crm'], ['buildVisites', 'visites'], ['buildNotaire', 'notaire'], ['buildMatching', 'matching']].forEach(([f, panel]) => {
    const f0 = window[f]; if (typeof f0 !== 'function') return;
    window[f] = function () {
      if (mode !== (reel() ? 'reel' : 'demo')) charger();
      if (f === 'buildMatching' && typeof S !== 'undefined' && S.profile === 'buy') return biensPourMoi();
      const r = f0.apply(this, arguments);
      try { bandeau(panel, TXT[panel]); vides(panel); } catch (_) { /* ignoré */ }
      return r;
    };
  });
  // Écrans vides : une phrase d'aide plutôt que des zéros
  function vides(panel) {
    if (!reel()) return;
    const p = $('panel-' + panel); if (!p) return;
    p.querySelectorAll('.vide-aide').forEach(x => x.remove());
    const n = { mandats: MANDATS.length, crm: CRM_CLIENTS.length, visites: VISITES.length + CR_VISITES.length, notaire: DOSSIERS_NOTAIRE.length, matching: ACHETEURS.length }[panel];
    if (n) return;
    const AIDE = { mandats: 'Aucun mandat pour l\'instant. Créez votre premier mandat avec « Créer un mandat ».', crm: 'Aucun client pour l\'instant. Ajoutez vos acheteurs et vendeurs avec « Ajouter un client ».', visites: 'Aucun rendez-vous pour l\'instant. Planifiez une visite avec « Planifier une visite ».', notaire: 'Aucun dossier chez le notaire pour l\'instant.', matching: 'Aucun acheteur enregistré. Ajoutez vos acheteurs : Immo360 leur proposera les biens compatibles.' };
    const d = document.createElement('div'); d.className = 'vide-aide'; d.textContent = AIDE[panel];
    const t = p.querySelector('h2'), tete = t && t.closest('div') && t.closest('div').parentNode;
    if (tete && tete.parentNode && tete !== p) tete.parentNode.insertBefore(d, tete.nextSibling); else p.prepend(d);
  }

  /* ---------- 2. Plus d'envoi fictif ---------- */
  function imprimer(titre, corps) {
    const w = window.open('', '_blank');
    if (!w) { dire('Autorisez l\'ouverture de fenêtres pour imprimer le document.'); return false; }
    const ag = window.IMMO_AGENCE && IMMO_AGENCE.marque ? IMMO_AGENCE.marque('estimation_marque') : null;
    w.document.open();
    w.document.write(`<!doctype html><html lang="fr"><head><meta charset="utf-8"><title>${E(titre)}</title><style>body{font:15px/1.6 system-ui,sans-serif;color:#0F2A38;max-width:760px;margin:24px auto;padding:0 24px}h1{font-size:24px;color:#0B3954}table{width:100%;border-collapse:collapse;margin:12px 0}td{padding:7px 8px;border-bottom:1px solid #D3DEE2;vertical-align:top}td:first-child{color:#3E5462;width:38%}.sig{display:grid;grid-template-columns:1fr 1fr;gap:24px;margin-top:40px}.sig div{border-top:1px solid #0F2A38;padding-top:6px;min-height:90px}.np{margin:12px 0}@media print{.np{display:none}}</style></head><body>
      <div class="np"><button onclick="print()" style="font:600 15px sans-serif;padding:10px 18px;border-radius:8px;border:0;background:#0A7A84;color:#fff;cursor:pointer">Imprimer ou enregistrer en PDF</button></div>
      ${ag && ag.nom ? `<p><b>${E(ag.nom)}</b>${ag.carte ? ' — carte professionnelle n° ' + E(ag.carte) : ''}<br>${E([ag.adresse, ag.tel, ag.email].filter(Boolean).join(' · '))}</p>` : ''}
      ${corps}<p style="font-size:12px;color:#3E5462;margin-top:30px">Document préparé avec Immo360 NC. À vérifier et compléter avant signature.</p></body></html>`);
    w.document.close(); return true;
  }
  window.signerMandat = function (id) {
    const m = MANDATS.find(x => x.id === id); if (!m) return;
    const ok = imprimer('Mandat de vente — ' + (m.bien || ''), `<h1>Mandat de vente ${m.type === 'exclusif' ? 'exclusif' : 'simple'}</h1>
      <table><tr><td>Bien</td><td>${E(m.bien)}</td></tr><tr><td>Mandant (vendeur)</td><td>${E(m.vendeur)}${m.tel ? ' — ' + E(m.tel) : ''}</td></tr>
      <tr><td>Prix de vente</td><td>${M(m.prix)}</td></tr><tr><td>Honoraires</td><td>${E(m.honoraires)} %</td></tr>
      <tr><td>Durée</td><td>du ${E(m.debut)} au ${E(m.fin)}</td></tr>${m.conditions ? `<tr><td>Conditions particulières</td><td>${E(m.conditions)}</td></tr>` : ''}</table>
      <div class="sig"><div>Le mandant<br><small>« Lu et approuvé », date et signature</small></div><div>Le mandataire<br><small>Date et signature</small></div></div>`);
    if (ok) dire('Mandat prêt à imprimer. Indiquez-le comme signé une fois signé par le vendeur.');
    if (!m.signe && confirm('Le vendeur a-t-il déjà signé ce mandat ?')) { m.signe = true; if (typeof buildMandats === 'function') buildMandats(); }
  };
  window.genererBonVisite = function (id) {
    const v = VISITES.find(x => x.id === id); if (!v) return;
    v.bonVisite = true; if (typeof renderVisitesAgenda === 'function') renderVisitesAgenda();
    imprimer('Bon de visite — ' + (v.bien || ''), `<h1>Bon de visite</h1>
      <p>Je soussigné(e), <b>${E(v.acheteur)}</b>${v.tel ? ' (' + E(v.tel) + ')' : ''}, reconnais avoir visité le bien suivant par l'intermédiaire de l'agence, et m'engage à ne pas traiter directement ou par un autre intermédiaire avec le propriétaire.</p>
      <table><tr><td>Bien visité</td><td>${E(v.bien)}</td></tr><tr><td>Date et heure</td><td>${E(v.date)} à ${E(v.heure)}</td></tr>${v.notes ? `<tr><td>Observations</td><td>${E(v.notes)}</td></tr>` : ''}</table>
      <div class="sig"><div>Le visiteur<br><small>Date et signature</small></div><div>L'agent<br><small>Date et signature</small></div></div>`);
  };
  window.envoyerSMS = function (id) {
    const v = VISITES.find(x => x.id === id); if (!v) return;
    const tel = String(v.tel || '').replace(/[^\d+]/g, '');
    const txt = `Bonjour ${v.acheteur || ''}, je vous confirme la visite de « ${v.bien || ''} » le ${v.date} à ${v.heure}. À bientôt.`;
    if (!tel) { dire('Ajoutez le téléphone de l\'acheteur pour préparer le SMS.'); return; }
    v.smsSent = true; if (typeof renderVisitesAgenda === 'function') renderVisitesAgenda();
    if (matchMedia('(max-width: 760px)').matches) location.href = `sms:${tel}?&body=${encodeURIComponent(txt)}`;
    else { try { navigator.clipboard.writeText(txt); } catch (_) { /* copie impossible */ } window.open(`https://wa.me/${tel.replace(/^\+?/, '')}?text=${encodeURIComponent(txt)}`, '_blank', 'noopener'); }
    dire('Message de confirmation préparé : envoyez-le depuis votre téléphone ou WhatsApp.');
  };
  window.showPreApproContact = function () { if (typeof go === 'function') go('capacite'); };
  // Rendez-vous de signature : tirés des dossiers, avec fichier calendrier (.ics) à envoyer aux parties
  const r0 = window.renderNotPlanning;
  window.renderNotPlanning = function () {
    if (!reel() && typeof r0 === 'function') return r0.apply(this, arguments);
    const el = $('not-planning-content'); if (!el) return;
    const rdv = DOSSIERS_NOTAIRE.flatMap(d => [['Signature du compromis', d.dateCompromis], ['Signature de l\'acte', d.dateActe]].filter(x => x[1]).map(([t, dt]) => ({ d, t, dt }))).sort((a, b) => String(a.dt).localeCompare(b.dt));
    el.innerHTML = rdv.length ? rdv.map((r, i) => `<div class="rdv-l"><b>${E(r.dt)}</b><span>${E(r.t)} — ${E(r.d.bien)}<small>${E([r.d.vendeur, r.d.acheteur].filter(Boolean).join(' + '))}${r.d.notaire ? ' · ' + E(r.d.notaire) : ''}</small></span><button type="button" class="btn btn-sm btn-outline" data-ics="${i}">Ajouter au calendrier</button></div>`).join('')
      : '<p class="vide-aide">Aucune signature planifiée : renseignez les dates de compromis et d\'acte dans vos dossiers.</p>';
    el.querySelectorAll('[data-ics]').forEach(b => b.onclick = () => {
      const r = rdv[+b.dataset.ics], d = String(r.dt).replace(/-/g, '');
      const ics = ['BEGIN:VCALENDAR', 'VERSION:2.0', 'PRODID:-//Immo360 NC//FR', 'BEGIN:VEVENT', 'UID:' + d + '-' + Date.now() + '@immo360.nc', 'DTSTAMP:' + new Date().toISOString().replace(/[-:]/g, '').slice(0, 15) + 'Z', 'DTSTART;VALUE=DATE:' + d, 'SUMMARY:' + r.t + ' — ' + (r.d.bien || ''), 'END:VEVENT', 'END:VCALENDAR'].join('\r\n');
      const a = document.createElement('a'); a.href = URL.createObjectURL(new Blob([ics], { type: 'text/calendar' })); a.download = 'signature.ics'; a.click();
      dire('Fichier calendrier téléchargé : joignez-le à votre email aux parties.');
    });
  };

  /* ---------- 3. Statistiques réelles des annonces ---------- */
  window.buildStatsAnnonces = async function () {
    const p = $('panel-statsannonces'); if (!p) return;
    p.innerHTML = '<div class="st-w"><h2>Statistiques des annonces</h2><p class="st-sub">Chargement…</p></div>';
    if (!reel()) { p.innerHTML = '<div class="st-w"><h2>Statistiques des annonces</h2><div class="demo-band"><b>Mode démonstration.</b> Connectez-vous : vous verrez ici, pour chacune de vos annonces, le nombre de fiches vues, de messages et de demandes de visite.</div></div>'; return; }
    let l = [];
    try { const r = await IMMO_SYNC.client.rpc('mes_stats_annonces'); if (r.error) throw r.error; l = r.data || []; }
    catch (e) { p.innerHTML = `<div class="st-w"><h2>Statistiques des annonces</h2><p class="st-sub">Statistiques indisponibles pour le moment.</p></div>`; return; }
    const t = k => l.reduce((a, x) => a + (Number(x[k]) || 0), 0);
    const max = Math.max(1, ...l.map(x => Number(x.vues_30j) || 0));
    p.innerHTML = `<div class="st-w"><h2>Statistiques des annonces</h2><p class="st-sub">Chiffres réels mesurés sur Immo360 (fiches ouvertes, messages et demandes de visite reçus).</p>
      <div class="st-k"><div><b>${t('vues_30j')}</b><span>fiches vues sur 30 jours</span></div><div><b>${t('messages')}</b><span>messages reçus</span></div><div><b>${t('visites')}</b><span>demandes de visite</span></div><div><b>${t('acheteurs')}</b><span>acheteurs différents</span></div></div>
      ${l.length ? `<table class="st-t"><thead><tr><th>Annonce</th><th>Vues 30 j</th><th>Total</th><th>Messages</th><th>Visites</th><th>En ligne depuis</th></tr></thead><tbody>
        ${l.map(x => `<tr><td><b>${E(x.titre || 'Annonce')}</b>${x.publie ? '' : ' <small>(retirée)</small>'}</td><td><span class="st-b"><i style="width:${Math.round((Number(x.vues_30j) || 0) / max * 100)}%"></i></span>${Number(x.vues_30j) || 0}</td><td>${Number(x.vues_total) || 0}</td><td>${Number(x.messages) || 0}</td><td>${Number(x.visites) || 0}</td><td>${x.jours != null ? x.jours + ' j' : '—'}</td></tr>`).join('')}</tbody></table>`
        : '<p class="vide-aide">Aucune annonce publiée pour le moment.</p>'}
      <p class="st-sub">Une vue = une ouverture de la fiche par un visiteur (mesure anonyme).</p></div>`;
  };

  /* ---------- 4. « Mon achat » et « Biens pour moi » (acheteur) ---------- */
  const b0 = window.buildSuiviAchat;
  window.buildSuiviAchat = async function () {
    if (!reel()) { const r = typeof b0 === 'function' ? b0.apply(this, arguments) : null; bandeau('suiviachat', 'Avec votre compte, ce suivi reprend vos vraies démarches : favoris, messages, visites, financement.'); return r; }
    const p = $('panel-suiviachat'); if (!p) return;
    const fv = window.IMMO_CARDS && IMMO_CARDS.favs ? IMMO_CARDS.favs() : []; const favs = Array.isArray(fv) ? fv.length : fv && fv.size != null ? fv.size : Object.keys(fv || {}).length;
    let msgs = []; try { msgs = (await IMMO_SYNC.fetchAll('message')) || []; } catch (_) { /* ignoré */ }
    const me = IMMO_SYNC.uid;
    const ecrits = msgs.filter(m => m.owner_id === me), visites = ecrits.filter(m => m.data && m.data.type === 'visite'), recus = msgs.filter(m => m.assignee === me);
    const fin = lire('immo360.fin.v1').filter(d => d.source === 'acheteur');
    const alertes = (() => { try { return JSON.parse(localStorage.getItem('immo360.alertes.v1') || '[]'); } catch (_) { return []; } })();
    const ET = [['Recherche', favs || alertes.length || ecrits.length], ['Contact', ecrits.length], ['Visite', visites.length], ['Financement', fin.length], ['Offre', 0], ['Acte', 0]];
    const cur = ET.reduce((a, e, i) => e[1] ? i : a, 0);
    const suite = !ecrits.length ? ['Contactez un vendeur depuis une annonce qui vous plaît.', 'marketplace', 'Voir les annonces'] : !visites.length ? ['Demandez une visite depuis la fiche du bien.', 'marketplace', 'Voir les annonces'] : !fin.length ? ['Faites étudier votre financement avant de faire une offre.', 'capacite', 'Mon budget'] : ['Préparez votre offre avec le vendeur dans la messagerie.', 'messagerie', 'Mes messages'];
    const nouv = recus.slice(-5).reverse().map(m => `<li><b>${E(m.data.de_nom || 'Vendeur')}</b> vous a répondu à propos de « ${E(m.data.titre || 'une annonce')} »<small>${new Date(m.created_at).toLocaleDateString('fr-FR')}</small></li>`)
      .concat(fin.map(d => `<li>Demande d'étude de financement envoyée${d.bien ? ' pour ' + E(d.bien) : ''}<small>${E(d.date || '')}</small></li>`));
    p.innerHTML = `<div class="st-w"><h2>Où en est mon achat ?</h2><p class="st-sub">Suivi établi à partir de vos démarches sur Immo360.</p>
      <ol class="ach-et">${ET.map((e, i) => `<li class="${i < cur ? 'fait' : i === cur ? 'en' : ''}"><span>${i + 1}</span>${E(e[0])}</li>`).join('')}</ol>
      <div class="ach-s"><b>Prochaine étape conseillée</b><p>${E(suite[0])}</p><button type="button" class="btn btn-gold btn-sm" onclick="go('${suite[1]}')">${E(suite[2])}</button></div>
      <div class="st-k"><div><b>${favs}</b><span>favoris</span></div><div><b>${ecrits.length}</b><span>messages envoyés</span></div><div><b>${visites.length}</b><span>demandes de visite</span></div><div><b>${recus.length}</b><span>réponses reçues</span></div></div>
      <h3 class="ach-h">Dernières nouvelles</h3>${nouv.length ? `<ul class="ach-n">${nouv.join('')}</ul>` : '<p class="vide-aide">Rien de nouveau pour l\'instant.</p>'}</div>`;
  };
  function biensPourMoi() {
    const p = $('panel-matching'); if (!p) return;
    const al = (() => { try { return JSON.parse(localStorage.getItem('immo360.alertes.v1') || '[]'); } catch (_) { return []; } })();
    const R = window.IMMO_RECHERCHE;
    const res = al.length && R ? R.chercher(al[0].c).exacts.slice(0, 12) : [];
    p.innerHTML = `<div class="st-w"><h2>Biens pour moi</h2>
      ${al.length ? `<p class="st-sub">D'après votre recherche « ${E(al[0].q)} ».</p>${res.length ? `<div class="pm-g">${res.map(n => `<div class="rq-it">${IMMO_CARDS.html(n.b, { open: 'openLandingBien' })}<div class="rq-why"><b class="rq-pct">${n.pct} %</b>${n.oui.slice(0, 3).map(x => `<span class="y">${E(x)}</span>`).join('')}</div></div>`).join('')}</div>` : '<p class="vide-aide">Aucun bien ne correspond encore : vous serez prévenu dès qu\'une annonce correspondra.</p>'}`
        : `<p class="vide-aide">Décrivez ce que vous cherchez depuis l'accueil (par exemple « F3 vue lagon à Nouméa, moins de 40 M ») puis cliquez sur « M'alerter des nouveaux biens » : les biens compatibles s'afficheront ici.</p><button type="button" class="btn btn-gold" onclick="showLanding&&showLanding();setTimeout(()=>document.getElementById('lp-ai-q')&&document.getElementById('lp-ai-q').focus(),300)">Décrire ma recherche</button>`}</div>`;
  }

  /* ---------- 5. Faux chantier d'exemple chez le vendeur ---------- */
  setInterval(() => {
    if (!reel()) return;
    const g = $('travaux-suivi-grid'); if (!g) return;
    [...g.children].forEach(c => { if (/Eric Peintures NC/.test(c.textContent)) c.remove(); });
  }, 1500);

  charger();
  window.IMMO_REEL = { charger, enregistrer, biensPourMoi };
})();
