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
  let sb = null, onglet = 'pros', cache = {};

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
    app.innerHTML = `<nav class="tabs" aria-label="Rubriques">${tab('pros', 'Professionnels', nPros)}${tab('cmd', 'Commandes à régler', nCmd)}${tab('ann', 'Annonces')}${tab('mode', 'Partie payante')}</nav><section id="sec" class="card"></section>`;
    app.querySelectorAll('[data-t]').forEach(b => b.onclick = () => { onglet = b.dataset.t; render(); });
    ({ pros: vPros, cmd: vCmd, ann: vAnn, mode: vMode })[onglet]($('sec'));
  }
  const flash = (el, txt, err) => { const m = el.querySelector('.msg') || el.appendChild(Object.assign(document.createElement('p'), { className: 'msg' })); m.className = 'msg' + (err ? ' err' : ''); m.textContent = txt; };

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
      sb = window.supabase.createClient(cfg.supabaseUrl, cfg.supabaseKey);
    } catch (_) { app.innerHTML = '<div class="card err">Le service est indisponible : la connexion à la base n\'est pas configurée sur ce déploiement.</div>'; return; }
    start();
  })();
})();
