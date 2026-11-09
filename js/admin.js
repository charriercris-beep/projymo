/* Immo360 NC — Back office (admin.html)
 * Réservé aux comptes listés dans la table public.admins. La page ne fait qu'appeler les fonctions
 * admin_* de la base, qui vérifient elles-mêmes le droit d'accès : sans ce droit, rien n'est renvoyé.
 * Onglets : professionnels à valider, commandes à régler, modération des annonces, interrupteur payant.
 */
(function () {
  'use strict';

  const $ = id => document.getElementById(id);
  const E = v => String(v == null ? '' : v).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const app = $('app'), T = window.IMMO_TARIFS;
  const fmt = n => (Number(n) || 0).toLocaleString('fr-FR') + ' F';
  const date = d => d ? new Date(d).toLocaleDateString('fr-FR', { day: 'numeric', month: 'short', year: 'numeric' }) : '';
  const ROLES = { artisan: 'Artisan', notaire: 'Notaire', banquier: 'Banquier', courtier: 'Courtier', diagnostiqueur: 'Diagnostiqueur', geometre: 'Géomètre-expert', assureur: 'Assureur', agent: 'Agent immobilier',
    agt: 'Agence', art: 'Artisan', bnk: 'Banque / courtier', not: 'Notaire', diag: 'Diagnostiqueur', geo: 'Géomètre', ass: 'Assureur' };
  let sb = null, onglet = 'kpi', cache = {};

  async function rpc(fn, args) {
    const r = await sb.rpc(fn, args || {});
    if (r.error) throw new Error(r.error.message || 'Erreur');
    return r.data;
  }

  /* ---------- Connexion ---------- */
  function login(msg) {
    $('out').hidden = true; $('who').textContent = '';
    app.innerHTML = `<div class="card login"><h1>Back office</h1><p class="sub">Accès réservé à l'administrateur d'Immo360.</p>
      <form id="lf"><label for="le">Email</label><input id="le" type="email" autocomplete="username" required>
      <label for="lp">Mot de passe</label><input id="lp" type="password" autocomplete="current-password" required>
      <p style="margin:16px 0 0"><button class="btn" type="submit">Se connecter</button></p><p class="msg err" id="lm" role="alert">${E(msg || '')}</p></form></div>`;
    $('lf').onsubmit = async e => {
      e.preventDefault(); $('lm').textContent = '';
      const r = await sb.auth.signInWithPassword({ email: $('le').value.trim(), password: $('lp').value });
      if (r.error || !r.data || !r.data.user) { $('lm').textContent = 'Email ou mot de passe incorrect.'; return; }
      start();
    };
  }
  async function start() {
    const s = await sb.auth.getSession(); const u = s && s.data && s.data.session && s.data.session.user;
    if (!u) return login();
    let ok = false; try { ok = await rpc('admin_moi'); } catch (_) { ok = false; }
    if (ok !== true) {
      await sb.auth.signOut();
      return login('Ce compte n\'a pas l\'accès administrateur. Pour le donner, exécutez dans Supabase : insert into public.admins (user_id) select id from auth.users where email = \'' + u.email + '\';');
    }
    $('who').textContent = u.email; $('out').hidden = false;
    $('out').onclick = async () => { await sb.auth.signOut(); login(); };
    render();
  }

  /* ---------- Mise en page ---------- */
  async function render() {
    let pros = [], cmd = [];
    try { [pros, cmd] = await Promise.all([rpc('admin_pros'), rpc('admin_commandes')]); } catch (e) { app.innerHTML = `<div class="card err">${E(e.message)}</div>`; return; }
    cache.pros = pros || []; cache.cmd = cmd || [];
    const nPros = cache.pros.filter(p => p.attente).length, nCmd = cache.cmd.length;
    const tab = (id, l, n) => `<button type="button" class="tab${onglet === id ? ' on' : ''}" data-t="${id}">${l}${n ? `<span class="n">${n}</span>` : ''}</button>`;
    app.innerHTML = `<nav class="tabs" aria-label="Rubriques">${tab('kpi', 'Tableau de bord')}${tab('pros', 'Professionnels', nPros)}${tab('cmd', 'Commandes à régler', nCmd)}${tab('ann', 'Annonces')}${tab('prix', 'Tarifs')}${tab('mode', 'Partie payante')}</nav><section id="sec" class="card"></section>`;
    app.querySelectorAll('[data-t]').forEach(b => b.onclick = () => { onglet = b.dataset.t; render(); });
    ({ kpi: vKpi, pros: vPros, cmd: vCmd, ann: vAnn, prix: vPrix, mode: vMode })[onglet]($('sec'));
  }
  const flash = (el, txt, err) => { const m = el.querySelector('.msg') || el.appendChild(Object.assign(document.createElement('p'), { className: 'msg' })); m.className = 'msg' + (err ? ' err' : ''); m.textContent = txt; };

  /* ---------- Tableau de bord ---------- */
  const PROFILS = { sell: 'Vendeurs', buy: 'Acheteurs', agt: 'Agences', art: 'Artisans', bnk: 'Banques, courtiers', not: 'Notaires', diag: 'Diagnostiqueurs', geo: 'Géomètres', ass: 'Assureurs', inconnu: 'Non précisé' };
  const n0 = v => (Number(v) || 0).toLocaleString('fr-FR');
  const tile = (v, l, sub) => `<div class="k"><b>${v}</b><span>${E(l)}</span>${sub ? `<small>${sub}</small>` : ''}</div>`;
  // Histogramme hebdomadaire (une seule série : pas de légende, le titre la nomme ; survol et tableau des valeurs)
  function colonnes(titre, serie) {
    const max = Math.max(1, ...serie.map(x => x.n)), H = 120;
    const lab = s => new Date(s + 'T12:00:00').toLocaleDateString('fr-FR', { day: 'numeric', month: 'short' });
    const last = serie.length - 1, iMax = serie.reduce((a, x, i) => x.n > serie[a].n ? i : a, 0);
    return `<figure class="ch"><figcaption>${E(titre)} <small>12 dernières semaines</small></figcaption>
      <div class="cols" role="img" aria-label="${E(titre)} : ${serie.map(x => lab(x.s) + ' ' + x.n).join(', ')}">
        ${serie.map((x, i) => `<div class="col" tabindex="0" data-tip="Semaine du ${lab(x.s)} : ${x.n}"><span class="v">${i === last || (i === iMax && x.n) ? x.n : ''}</span><i style="height:${Math.round(x.n / max * H)}px"></i><em>${i % 3 === 0 || i === last ? lab(x.s) : ''}</em></div>`).join('')}
      </div>
      <details class="tv"><summary>Voir les chiffres</summary><table><tr><th>Semaine du</th><th>Nombre</th></tr>${serie.map(x => `<tr><td>${lab(x.s)}</td><td>${x.n}</td></tr>`).join('')}</table></details></figure>`;
  }
  // Répartition (barres horizontales, valeur au bout de la barre)
  function barres(titre, l, nom, extra) {
    if (!l || !l.length) return `<figure class="ch"><figcaption>${E(titre)}</figcaption><p class="empty">Pas encore de données.</p></figure>`;
    const max = Math.max(1, ...l.map(x => x.n));
    return `<figure class="ch"><figcaption>${E(titre)}</figcaption><div class="hb">${l.map(x => `<div class="r"><span class="l">${E(nom ? nom(x.k) : x.k)}</span><span class="t"><i style="width:${Math.max(2, Math.round(x.n / max * 100))}%"></i></span><span class="n">${n0(x.n)}${extra ? extra(x) : ''}</span></div>`).join('')}</div></figure>`;
  }
  // Entonnoir : chaque étape en barre, rapportée à la première ; % par rapport à l'étape précédente
  function entonnoir(titre, etapes) {
    const base = Math.max(1, etapes[0][1]);
    return `<figure class="ch"><figcaption>${E(titre)} <small>30 derniers jours</small></figcaption><div class="hb fn">${etapes.map(([l, n], i) => {
      const prev = i ? etapes[i - 1][1] : 0, pc = i && prev ? Math.round(n / prev * 100) + ' %' : '';
      return `<div class="r"><span class="l">${E(l)}</span><span class="t"><i style="width:${Math.max(2, Math.round(n / base * 100))}%"></i></span><span class="n">${n0(n)}${pc ? ` <small>· ${pc} de l'étape précédente</small>` : ''}</span></div>`;
    }).join('')}</div></figure>`;
  }
  async function vKpi(el) {
    await chargerPrix();
    el.innerHTML = '<h2>Tableau de bord</h2><p class="sub">Chargement…</p>';
    let k; try { k = await rpc('admin_kpis'); } catch (e) { el.innerHTML = `<p class="err">${E(e.message)}</p>`; return; }
    const A = k.annonces, U = k.utilisateurs, P = k.pros, R = k.relations, M = k.argent;
    const V = new Proxy((k.evenements && k.evenements.n30) || {}, { get: (o, p) => Number(o[p]) || 0 });
    const taux = R.devis_total ? Math.round(R.devis_avec_reponse / R.devis_total * 100) + ' %' : '—';
    const optNom = o => (T && T.OPTIONS[o] && T.OPTIONS[o].nom) || o;
    el.innerHTML = `<div class="kh"><div><h2>Tableau de bord</h2><p class="sub">Calculé le ${new Date(k.calcule_le).toLocaleString('fr-FR')}. Chiffres agrégés, sans données personnelles.</p></div><button type="button" class="btn out sm" id="k-re">Actualiser</button></div>
      <h3>Annonces</h3><div class="ks">${tile(n0(A.en_ligne), 'en ligne')}${tile(n0(A.nouvelles_7j), 'nouvelles sur 7 jours', n0(A.nouvelles_30j) + ' sur 30 jours')}
        ${tile(A.prix_m2_median ? n0(A.prix_m2_median) + ' F' : '—', 'prix au m² médian affiché', 'repère ISEE 2025 (vendus, appartements) : 280 000 F')}
        ${tile(n0(A.sans_photo), 'en ligne sans photo')}${tile(n0(A.avec_video), 'avec visite vidéo')}${tile(n0(A.moderees), 'retirées par la modération')}</div>
      <div class="g2">${colonnes('Annonces publiées par semaine', A.par_semaine || [])}${barres('Annonces en ligne par commune', A.par_commune)}</div>
      <div class="g2">${barres('Annonces en ligne par type', A.par_type)}<div></div></div>
      <h3>Utilisateurs</h3><div class="ks">${tile(n0(U.total), 'comptes')}${tile(n0(U.nouveaux_7j), 'nouveaux sur 7 jours', n0(U.nouveaux_30j) + ' sur 30 jours')}${tile(n0(U.actifs_30j), 'connectés sur 30 jours')}
        ${tile(n0(P.verifies), 'professionnels vérifiés', P.en_attente ? n0(P.en_attente) + ' en attente' : '')}</div>
      <div class="g2">${colonnes('Inscriptions par semaine', U.par_semaine || [])}${barres('Comptes par profil', U.par_profil, x => PROFILS[x] || x)}</div>
      <div class="g2">${barres('Professionnels par métier', P.par_role, x => ROLES[x] || x, x => ` <small>(${n0(x.v)} vérifié${x.v > 1 ? "s" : ""})</small>`)}<div></div></div>
      <h3>Mise en relation</h3><div class="ks">${tile(n0(R.devis_30j), 'demandes de devis sur 30 jours', n0(R.devis_total) + ' au total')}${tile(taux, 'des demandes de devis ont reçu une réponse')}
        ${tile(n0(R.financements_30j), 'dossiers de financement sur 30 jours')}${tile(n0(R.missions_30j), 'missions diagnostic, géomètre, assurance', 'sur 30 jours')}${tile(n0(R.notaire_30j), 'dossiers notaire sur 30 jours')}</div>
      <h3>Parcours des visiteurs</h3>
      <div class="ks">${tile(n0(V.visite), 'visites sur 30 jours', V.visite ? Math.round((k.evenements.mobile30 || 0) / V.visite * 100) + ' % sur téléphone' : '')}${tile(n0(V.recherche), 'recherches')}${tile(n0(V.fiche_vue), 'fiches de biens vues')}
        ${tile(n0(V.favori), 'ajouts en favori')}${tile(n0(V.simulation_financement), 'simulations de financement')}${tile(n0(V.inscription), 'inscriptions')}</div>
      <div class="g2">${entonnoir('Acheteurs', [['Visites', V.visite], ['Fiches vues', V.fiche_vue], ['Contacts vendeur', V.contact_vendeur], ['Demandes de visite', V.demande_visite]])}
        ${entonnoir('Vendeurs', [['Estimations', V.estimation], ['Dépôts commencés', V.depot_debut], ['Annonces publiées', V.annonce_publiee]])}</div>
      <div class="g2">${colonnes('Visites par semaine', (k.evenements && k.evenements.visites_semaine) || [])}${barres('Autres actions', [['Rapports d\'estimation', V.rapport_estimation], ['Demandes de devis', V.devis_demande], ['Options commandées', V.option_commande]].map(([k2, n]) => ({ k: k2, n })).filter(x => x.n))}</div>
      <p class="note">Journal anonyme : ni compte, ni adresse IP, ni contenu ; une visite est comptée une fois par onglet ouvert.</p>
      <h3>Chiffre d'affaires</h3><div class="ks">${tile(n0(M.options_mois) + ' F', 'options payées ce mois-ci', n0(M.options_mois_n) + ' option(s)')}${tile(n0(M.abonnements_mensuel) + ' F', 'revenu mensuel des abonnements', n0(M.abonnements_actifs) + ' abonnement(s) actif(s)')}
        ${tile(n0(M.a_regler) + ' F', 'commandes à régler')}${tile(n0(M.essais), 'essais gratuits en cours')}</div>
      <div class="g2">${barres('Options vendues (depuis le début)', M.top_options, optNom, x => ` <small>· ${n0(x.m)} F</small>`)}${barres('Formules pros en cours', M.formules, x => { const [r, f] = String(x).split(' · '); return (ROLES[r] || r) + ' · ' + (((T && T.plans(r).find(p => p.id === f)) || {}).nom || f); })}</div>`;
    $('k-re').onclick = () => vKpi(el);
  }

  /* ---------- Professionnels ---------- */
  function vPros(el) {
    const l = cache.pros;
    const st = p => p.verifie ? '<span class="st ok">Vérifié</span>' : p.refuse_le ? `<span class="st ko">Refusé</span>${p.refus_motif ? '<br><small>' + E(p.refus_motif) + '</small>' : ''}` : '<span class="st att">À vérifier</span>';
    el.innerHTML = `<h2>Professionnels</h2><p class="sub">Vérifiez le RIDET (avis de situation au répertoire de l'ISEE) et, selon le métier, l'assurance décennale ou la carte professionnelle, avant de valider. Un pro validé reçoit les demandes des particuliers.</p>
      ${l.length ? `<table><thead><tr><th>Professionnel</th><th>Métier</th><th>RIDET</th><th>Contact</th><th>Inscrit le</th><th>Statut</th><th></th></tr></thead><tbody>
      ${l.map(p => `<tr><td><b>${E(p.nom)}</b>${p.metiers && p.metiers.length ? '<br><small>' + E(p.metiers.join(', ')) + '</small>' : ''}</td><td>${E(ROLES[p.role] || p.role)}</td><td>${E(p.ridet || '—')}</td>
        <td>${E(p.compte || p.email || '')}${p.tel ? '<br><small>' + E(p.tel) + '</small>' : ''}</td><td>${date(p.created_at)}</td><td>${st(p)}</td>
        <td><div class="acts">${p.verifie ? `<button type="button" class="btn red sm" data-ko="${p.id}">Retirer</button>` : `<button type="button" class="btn sm" data-ok="${p.id}">Valider</button>${p.refuse_le ? '' : `<button type="button" class="btn red sm" data-ko="${p.id}">Refuser</button>`}`}</div></td></tr>`).join('')}</tbody></table>`
      : '<p class="empty">Aucun professionnel inscrit pour le moment.</p>'}`;
    el.querySelectorAll('[data-ok]').forEach(b => b.onclick = async () => { try { await rpc('admin_pro_decider', { p_id: +b.dataset.ok, p_ok: true }); render(); } catch (e) { flash(el, e.message, true); } });
    el.querySelectorAll('[data-ko]').forEach(b => b.onclick = async () => {
      const motif = prompt('Motif (communiqué au professionnel) :', 'RIDET introuvable ou activité non correspondante'); if (motif === null) return;
      try { await rpc('admin_pro_decider', { p_id: +b.dataset.ko, p_ok: false, p_motif: motif }); render(); } catch (e) { flash(el, e.message, true); }
    });
  }

  /* ---------- Commandes à régler ---------- */
  function vCmd(el) {
    const l = cache.cmd;
    const quoi = c => c.type === 'option' ? ((T && T.OPTIONS[c.quoi] && T.OPTIONS[c.quoi].nom) || c.quoi) + (c.info ? ' · ' + E(c.info) : '')
      : 'Abonnement ' + E(((T && T.plans(c.cible).find(p => p.id === c.quoi)) || {}).nom || c.quoi);
    const cible = c => c.type === 'option' ? 'Annonce n° ' + E(c.cible) : E(ROLES[c.cible] || c.cible);
    el.innerHTML = `<h2>Commandes à régler</h2><p class="sub">Quand le paiement est reçu (virement), cliquez sur « Payé » : l'option ou l'abonnement s'active immédiatement. Vérifiez que le montant reçu correspond.</p>
      ${l.length ? `<table><thead><tr><th>Commande</th><th>Pour</th><th>Montant</th><th>Client</th><th>Date</th><th></th></tr></thead><tbody>
      ${l.map(c => `<tr><td><b>${quoi(c)}</b></td><td>${cible(c)}</td><td><b>${fmt(c.prix)}</b>${c.type === 'abonnement' ? '<small> / mois</small>' : ''}</td><td>${E(c.email || '')}</td><td>${date(c.created_at)}</td>
        <td><div class="acts">${c.type === 'abonnement' ? `<select data-mois="${c.id}" aria-label="Mois payés" style="width:auto"><option value="1">1 mois</option><option value="3">3 mois</option><option value="6">6 mois</option><option value="12">12 mois</option></select>` : ''}
          <button type="button" class="btn sm" data-pay="${c.type}:${c.id}">Payé</button><button type="button" class="btn red sm" data-cancel="${c.type}:${c.id}">Annuler</button></div></td></tr>`).join('')}</tbody></table>`
      : '<p class="empty">Aucune commande en attente.</p>'}`;
    el.querySelectorAll('[data-pay]').forEach(b => b.onclick = async () => {
      const [t, id] = b.dataset.pay.split(':'), m = el.querySelector(`[data-mois="${id}"]`);
      try { await rpc('admin_payer', { p_type: t, p_id: +id, p_mois: m ? +m.value : 1 }); render(); } catch (e) { flash(el, e.message, true); }
    });
    el.querySelectorAll('[data-cancel]').forEach(b => b.onclick = async () => {
      if (!confirm('Annuler cette commande ?')) return;
      const [t, id] = b.dataset.cancel.split(':');
      try { await rpc('admin_annuler', { p_type: t, p_id: +id }); render(); } catch (e) { flash(el, e.message, true); }
    });
  }

  /* ---------- Annonces ---------- */
  async function vAnn(el, q) {
    el.innerHTML = `<h2>Annonces</h2><p class="sub">Retirez une annonce frauduleuse, en double ou contraire aux conditions : elle disparaît du site (photos et visite vidéo comprises) et son auteur voit le motif.</p>
      <form class="bar" id="af"><input id="aq" placeholder="Titre, commune, quartier ou email" value="${E(q || '')}"><button class="btn out sm" type="submit">Rechercher</button></form><div id="al">Chargement…</div>`;
    $('af').onsubmit = e => { e.preventDefault(); vAnn(el, $('aq').value.trim()); };
    let l = []; try { l = await rpc('admin_annonces', { p_q: q || null }) || []; } catch (e) { $('al').innerHTML = `<p class="err">${E(e.message)}</p>`; return; }
    const st = a => a.modere ? `<span class="st ko">Retirée (modération)</span>${a.motif ? '<br><small>' + E(a.motif) + '</small>' : ''}` : a.publie ? '<span class="st ok">En ligne</span>' : '<span class="st off">Retirée par l\'auteur</span>';
    $('al').innerHTML = l.length ? `<table><thead><tr><th>Annonce</th><th>Lieu</th><th>Prix</th><th>Auteur</th><th>Publiée le</th><th>Statut</th><th></th></tr></thead><tbody>
      ${l.map(a => `<tr><td><b>${E(a.titre || 'Sans titre')}</b><br><small>${E(a.type || '')} · ${E(a.photos || 0)} photo(s) · n° ${E(a.id)}</small></td><td>${E([a.quartier, a.ville].filter(Boolean).join(', '))}</td>
        <td>${a.prix ? fmt(a.prix) : '—'}</td><td>${E(a.email || '')}</td><td>${date(a.created_at)}</td><td>${st(a)}</td>
        <td>${a.modere ? `<button type="button" class="btn out sm" data-rest="${E(a.id)}">Rétablir</button>` : a.publie ? `<button type="button" class="btn red sm" data-ret="${E(a.id)}">Retirer</button>` : ''}</td></tr>`).join('')}</tbody></table>`
      : '<p class="empty">Aucune annonce.</p>';
    $('al').querySelectorAll('[data-ret]').forEach(b => b.onclick = async () => {
      const motif = prompt('Motif du retrait (visible par l\'auteur) :', 'Annonce non conforme aux conditions d\'utilisation'); if (motif === null) return;
      try { await rpc('admin_moderer', { p_id: b.dataset.ret, p_retirer: true, p_motif: motif }); vAnn(el, q); } catch (e) { flash(el, e.message, true); }
    });
    $('al').querySelectorAll('[data-rest]').forEach(b => b.onclick = async () => { try { await rpc('admin_moderer', { p_id: b.dataset.rest, p_retirer: false }); vAnn(el, q); } catch (e) { flash(el, e.message, true); } });
  }

  /* ---------- Tarifs (modifiables sans toucher au code) ---------- */
  async function chargerPrix() {
    try { const r = await sb.from('parametres').select('cle,valeur').eq('cle', 'tarifs'); const v = r.data && r.data[0] && r.data[0].valeur; T.setPrix(v ? JSON.parse(v) : {}); } catch (_) { T.setPrix({}); }
  }
  async function vPrix(el) {
    await chargerPrix();
    const d = T.defauts();
    const ligne = (g, k, nom, prix, def, unite) => `<tr><td>${E(nom)}</td><td><input type="number" min="0" max="10000000" step="100" data-g="${g}" data-k="${E(k)}" value="${prix}" style="max-width:150px"> <small>F${unite || ''}</small></td><td><small>${prix !== def ? 'par défaut : ' + fmt(def) : ''}</small></td></tr>`;
    const abo = Object.keys(T.ABONNEMENTS).flatMap(r => T.ABONNEMENTS[r].map((p, i) => [r, p, d.a[r][i]]).filter(([, p, pd]) => p.prix || pd.prix));
    el.innerHTML = `<h2>Tarifs</h2><p class="sub">Prix en francs CFP TTC. Ils s'appliquent sur le site au prochain chargement de page (et seulement quand la partie payante est allumée). Une commande déjà passée garde son montant.</p>
      <table class="px-t"><thead><tr><th>Options d'annonce</th><th>Prix</th><th></th></tr></thead><tbody>${Object.entries(T.OPTIONS).map(([k, o]) => ligne('options', k, o.nom, o.prix, d.o[k].prix)).join('')}
        ${Object.entries(T.PACKS).map(([k, o]) => ligne('packs', k, o.nom, o.prix, d.p[k].prix)).join('')}</tbody></table>
      <table class="px-t" style="margin-top:14px"><thead><tr><th>Abonnements des professionnels</th><th>Prix</th><th></th></tr></thead><tbody>${abo.map(([r, p, pd]) => ligne('abonnements', r + '.' + p.id, (ROLES[r] || r) + ' · formule ' + p.nom, p.prix, pd.prix, ' / mois')).join('')}</tbody></table>
      <table class="px-t" style="margin-top:14px"><thead><tr><th>Services</th><th>Prix</th><th></th></tr></thead><tbody>${Object.entries(T.SERVICES).map(([k, o]) => ligne('services', k, o.nom, o.prix, d.s[k].prix)).join('')}</tbody></table>
      <p style="margin-top:16px;display:flex;gap:8px;flex-wrap:wrap"><button type="button" class="btn" id="px-go">Enregistrer les prix</button><button type="button" class="btn out" id="px-def">Revenir aux prix par défaut</button></p>`;
    $('px-go').onclick = async () => {
      const t = { options: {}, packs: {}, abonnements: {}, services: {} }; let bad = null;
      el.querySelectorAll('input[data-g]').forEach(i => { const v = Number(i.value); if (!Number.isFinite(v) || v < 0 || v > 10000000) bad = i; else t[i.dataset.g][i.dataset.k] = Math.round(v); });
      if (bad) { bad.focus(); flash(el, 'Prix invalide (entre 0 et 10 000 000 F).', true); return; }
      try { await rpc('admin_tarifs', { p_tarifs: t }); await vPrix(el); flash(el, 'Prix enregistrés.'); } catch (e) { flash(el, e.message, true); }
    };
    $('px-def').onclick = async () => { if (!confirm('Revenir à tous les prix par défaut ?')) return; try { await rpc('admin_tarifs', { p_tarifs: {} }); await vPrix(el); flash(el, 'Prix par défaut rétablis.'); } catch (e) { flash(el, e.message, true); } };
  }

  /* ---------- Interrupteur de la partie payante ---------- */
  async function vMode(el) {
    let cur = 'off';
    try { const r = await sb.from('parametres').select('cle,valeur').eq('cle', 'mode_tarifs'); cur = (r.data && r.data[0] && r.data[0].valeur) || 'off'; } catch (_) { /* défaut */ }
    const M = [['off', 'Éteinte', 'Rien de payant n\'apparaît. Le site est entièrement gratuit.'], ['lancement', 'Lancement', 'Options, page Tarifs et abonnements visibles mais offerts : pour habituer les utilisateurs.'], ['payant', 'Payante', 'Les prix s\'appliquent : commandes à régler, limites des formules gratuites pour les pros.']];
    el.innerHTML = `<h2>Partie payante</h2><p class="sub">Les prix se règlent dans js/tarifs.js. Le changement s'applique aux visiteurs au prochain chargement de page.</p>
      <div class="modes">${M.map(([k, l, d]) => `<label class="mode${cur === k ? ' on' : ''}"><input type="radio" name="md" value="${k}"${cur === k ? ' checked' : ''}><span><b>${l}</b>${d}</span></label>`).join('')}</div>
      <p style="margin-top:14px"><button type="button" class="btn" id="md-go">Appliquer</button></p>`;
    $('md-go').onclick = async () => {
      const v = (el.querySelector('input[name=md]:checked') || {}).value; if (!v || v === cur) return;
      if (v === 'payant' && !confirm('Passer le site en mode payant ? Les prix s\'appliqueront immédiatement aux visiteurs.')) return;
      try { await rpc('admin_mode', { p_mode: v }); vMode(el); flash(el, 'Mode appliqué : ' + v + '.'); } catch (e) { flash(el, e.message, true); }
    };
  }

  /* ---------- Démarrage ---------- */
  (async () => {
    try {
      const r = await fetch('/api/config'); const cfg = r.ok ? await r.json() : {};
      if (!cfg.supabaseKey || !window.supabase) throw new Error('config');
      if (!cfg.supabaseUrl) throw new Error('config'); // déduite de la clé par /api/config
      sb = window.supabase.createClient(cfg.supabaseUrl, cfg.supabaseKey);
    } catch (_) { app.innerHTML = '<div class="card err">Le service est indisponible : la clé Supabase n\'est pas configurée sur ce déploiement (variable NEXT_PUBLIC_SUPABASE_ANON_KEY dans Vercel, voir docs/back-office.md).</div>'; return; }
    start();
  })();
})();
