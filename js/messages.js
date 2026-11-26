/* Immo360 NC — Messagerie réelle entre acheteurs et vendeurs
 * A. Depuis la fiche d'un bien : fenêtre « Écrire au vendeur » ou « Demander une visite » (créneaux), au-dessus
 *    de la fiche (on ne quitte pas l'annonce). Sans compte : invitation à se connecter, puis retour à la fiche.
 * B. Onglet Messages : conversations lues dans la base (enregistrements « message »), réponses envoyées par la
 *    fonction envoyer_message (le destinataire est fixé par la base), messages marqués lus, nouvelle lecture
 *    toutes les 20 secondes.
 * En mode démonstration (sans compte réel), rien n'est envoyé et c'est dit clairement ; plus aucune réponse
 * automatique inventée.
 * Dépend des globales : CONVERSATIONS, BIENS_DATA, APP_STATE, IMMO_SYNC, renderConvList, openConversation,
 * updateUnreadTotal, renderMessages, activeConvId, showLoginModal, switchAuthTab, openLandingBien, go.
 */
(function () {
  'use strict';

  const $ = id => document.getElementById(id);
  const E = s => String(s == null ? '' : s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const online = () => !!(window.IMMO_SYNC && IMMO_SYNC.uid && IMMO_SYNC.client);
  const moi = () => window.IMMO_SYNC && IMMO_SYNC.uid;
  const bien = id => (typeof BIENS_DATA !== 'undefined' ? BIENS_DATA : []).find(x => x.id === id);
  const M = n => n >= 1e6 ? (Math.round(n / 1e5) / 10).toLocaleString('fr-FR') + ' M F' : Math.round(n || 0).toLocaleString('fr-FR') + ' F';
  const heure = iso => { const d = new Date(iso); const auj = new Date().toDateString() === d.toDateString(); return auj ? d.toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit' }) : d.toLocaleDateString('fr-FR', { day: 'numeric', month: 'short' }); };
  const num = s => { let h = 5381; for (const c of String(s)) h = ((h * 33) ^ c.charCodeAt(0)) >>> 0; return 1e6 + (h % 9e8); };
  const PLAGES = ['Matin (8 h – 12 h)', 'Midi (12 h – 14 h)', 'Après-midi (14 h – 18 h)', 'Soir (18 h – 20 h)'];
  const track = n => { try { if (window.IMMO_EVT) IMMO_EVT.track(n); } catch (_) { /* ignoré */ } };

  /* ---------- A. Fenêtre de contact depuis la fiche ---------- */
  function fermer() { const d = $('ctc-mod'); if (d) d.remove(); document.removeEventListener('keydown', echap); }
  function echap(e) { if (e.key === 'Escape') fermer(); }
  function ouvrir(id, mode) {
    const b = bien(id); if (!b) return;
    fermer();
    const vendeur = (b.agence && b.agence.nom) || b.agent || b.auteur || 'le vendeur';
    const d = document.createElement('div'); d.id = 'ctc-mod'; d.className = 'ctc-mod';
    d.setAttribute('role', 'dialog'); d.setAttribute('aria-modal', 'true'); d.setAttribute('aria-label', mode === 'visite' ? 'Demander une visite' : 'Écrire au vendeur');
    const tete = `<div class="ctc-h"><div class="ctc-b">${b.photoUrl ? `<img src="${E(b.photoUrl)}" alt="">` : '<span></span>'}<div><b>${E(b.titre || b.type)}</b><small>${b.prix ? M(b.prix) + ' · ' : ''}${E([b.quartier, b.ville].filter(Boolean).join(', '))}</small></div></div><button type="button" class="ctc-x" aria-label="Fermer">×</button></div>`;
    let corps;
    if (!APP_STATE.loggedIn) {
      corps = `<h3>${mode === 'visite' ? 'Demander une visite' : 'Écrire à ' + E(vendeur)}</h3>
        <p class="ctc-p">Pour que ${E(vendeur)} puisse vous répondre, il faut un compte : c'est gratuit et prend 30 secondes. Vous reviendrez ensuite sur cette annonce.</p>
        <div class="ctc-acts"><button type="button" class="btn btn-gold" data-ctc="inscr">Créer un compte</button><button type="button" class="btn btn-outline" data-ctc="cnx">J'ai déjà un compte</button></div>`;
    } else {
      const bloque = !online() ? 'Mode démonstration : le message ne sera pas envoyé. Connectez-vous avec votre compte pour écrire aux vendeurs.'
        : !b._owner ? 'Annonce de démonstration : elle n\'a pas de vendeur réel, aucun message ne peut lui être envoyé.'
        : b._owner === moi() ? 'C\'est votre propre annonce.' : '';
      const auj = new Date().toISOString().slice(0, 10);
      corps = `<h3>${mode === 'visite' ? 'Demander une visite' : 'Écrire à ' + E(vendeur)}</h3>
        ${mode === 'visite' ? `<p class="ctc-p">Proposez deux créneaux : ${E(vendeur)} confirmera celui qui lui convient.</p>
          ${[1, 2].map(i => `<div class="ctc-cr"><label>Créneau ${i}${i === 2 ? ' <small>(facultatif)</small>' : ''}<input type="date" min="${auj}" data-cd="${i}"></label><label>Moment<select data-cp="${i}">${PLAGES.map(p => `<option>${p}</option>`).join('')}</select></label></div>`).join('')}` : ''}
        <label class="ctc-l">Votre message<textarea id="ctc-txt" rows="${mode === 'visite' ? 3 : 5}" maxlength="2000">${mode === 'visite' ? 'Bonjour, je souhaiterais visiter ce bien.' : `Bonjour, votre bien « ${E(b.titre || b.type)} » m'intéresse. Est-il toujours disponible ?`}</textarea></label>
        ${bloque ? `<p class="ctc-warn">${E(bloque)}</p>` : '<p class="ctc-n">Votre nom s\'affiche ; votre email et votre téléphone ne sont pas transmis, sauf si vous les écrivez.</p>'}
        <p class="ctc-err" role="alert"></p>
        <div class="ctc-acts"><button type="button" class="btn btn-gold" data-ctc="envoi"${bloque ? ' disabled' : ''}>${mode === 'visite' ? 'Envoyer la demande de visite' : 'Envoyer le message'}</button><button type="button" class="btn btn-outline" data-ctc="fermer">Annuler</button></div>`;
    }
    d.innerHTML = `<div class="ctc-in">${tete}<div class="ctc-c">${corps}</div></div>`;
    document.body.appendChild(d);
    document.addEventListener('keydown', echap);
    d.addEventListener('click', async ev => {
      if (ev.target === d || ev.target.closest('.ctc-x') || ev.target.closest('[data-ctc="fermer"]')) return fermer();
      const a = ev.target.closest('[data-ctc]'); if (!a) return;
      if (a.dataset.ctc === 'inscr' || a.dataset.ctc === 'cnx') {
        window._pendingContact = { id, mode }; fermer();
        document.querySelectorAll('.fiche-ov').forEach(x => x.remove());
        if (typeof showLoginModal === 'function') showLoginModal('buy');
        if (typeof switchAuthTab === 'function') switchAuthTab(a.dataset.ctc === 'inscr' ? 'register' : 'login');
      }
      if (a.dataset.ctc === 'envoi') envoyer(id, mode, b, vendeur, a);
      if (a.dataset.ctc === 'msgs') { fermer(); document.querySelectorAll('.fiche-ov').forEach(x => x.remove()); if (typeof hideLanding === 'function') hideLanding(); go('messagerie'); }
    });
    const t = d.querySelector('textarea, button'); if (t) t.focus();
  }
  async function envoyer(id, mode, b, vendeur, btn) {
    const d = $('ctc-mod'), err = d.querySelector('.ctc-err');
    const texte = ($('ctc-txt').value || '').trim();
    let creneaux = '';
    if (mode === 'visite') {
      creneaux = [1, 2].map(i => { const v = d.querySelector(`[data-cd="${i}"]`).value; return v ? new Date(v + 'T12:00:00').toLocaleDateString('fr-FR', { weekday: 'long', day: 'numeric', month: 'long' }) + ', ' + d.querySelector(`[data-cp="${i}"]`).value.toLowerCase() : ''; }).filter(Boolean).join(' ; ');
      if (!creneaux) { err.textContent = 'Choisissez au moins une date de visite.'; return; }
    }
    if (!texte) { err.textContent = 'Écrivez un message.'; return; }
    btn.disabled = true; btn.textContent = 'Envoi…'; err.textContent = '';
    try {
      const r = await IMMO_SYNC.client.rpc('envoyer_message', { p_annonce: String(id), p_texte: texte, p_type: mode === 'visite' ? 'visite' : 'message', p_creneaux: creneaux || null });
      if (r.error) throw new Error(r.error.message || 'envoi impossible');
      track(mode === 'visite' ? 'demande_visite' : 'contact_vendeur');
      d.querySelector('.ctc-c').innerHTML = `<div class="ctc-ok"><span aria-hidden="true">✓</span><h3>${mode === 'visite' ? 'Demande de visite envoyée' : 'Message envoyé'}</h3>
        <p>${E(vendeur.charAt(0).toUpperCase() + vendeur.slice(1))} le reçoit dans sa messagerie Immo360. Sa réponse arrivera dans votre onglet Messages.</p>
        <div class="ctc-acts"><button type="button" class="btn btn-gold" data-ctc="msgs">Voir mes messages</button><button type="button" class="btn btn-outline" data-ctc="fermer">Revenir à l'annonce</button></div></div>`;
      charger();
    } catch (e) { btn.disabled = false; btn.textContent = 'Réessayer'; err.textContent = 'Le message n\'est pas parti : ' + e.message; }
  }

  /* ---------- B. Messagerie réelle ---------- */
  let rows = [], derniere = '';
  async function charger() {
    if (!online() || typeof CONVERSATIONS === 'undefined') return;
    const r = await IMMO_SYNC.fetchAll('message'); if (!r) return;
    rows = r.filter(x => x && x.data && x.parent_id);
    const sig = rows.map(x => x.id + (x.data.lu ? 1 : 0)).join('|');
    if (sig === derniere && CONVERSATIONS.every(c => c.reel)) return; derniere = sig;
    const me = moi(), fils = {};
    rows.sort((a, b) => String(a.created_at).localeCompare(String(b.created_at))).forEach(x => { (fils[x.parent_id] = fils[x.parent_id] || []).push(x); });
    const convs = Object.entries(fils).map(([fil, l]) => {
      const premier = l[0], annonce = premier.data.annonce, b = bien(Number(annonce)) || {};
      const autre = premier.owner_id === me ? premier.assignee : premier.owner_id;
      const deLui = l.filter(x => x.owner_id === autre).pop();
      const jeSuisVendeur = premier.owner_id !== me;
      return {
        id: num(fil), fil, reel: true, bien: Number(annonce), bienTitre: premier.data.titre || b.titre || 'Annonce',
        acheteur: jeSuisVendeur ? premier.owner_id : null,
        contact: { nom: (deLui && deLui.data.de_nom) || (jeSuisVendeur ? 'Acheteur' : (b.agence && b.agence.nom) || b.agent || b.auteur || 'Vendeur'), role: jeSuisVendeur ? 'Acheteur intéressé' : 'Vendeur', avatar: '' },
        messages: l.map(x => ({ from: x.owner_id === me ? 'me' : 'other', text: (x.data.type === 'visite' ? 'Demande de visite' + (x.data.creneaux ? ' — ' + x.data.creneaux : '') + '\n' : '') + x.data.texte, time: heure(x.created_at), _id: x.id, _lu: x.data.lu, _pourMoi: x.assignee === me })),
        unread: l.filter(x => x.assignee === me && !x.data.lu).length,
        dernier: l[l.length - 1].created_at
      };
    }).sort((a, b) => String(b.dernier).localeCompare(String(a.dernier)));
    const lead = {}; CONVERSATIONS.forEach(c => { if (c.lead) lead[c.fil || c.id] = c.lead; });
    convs.forEach(c => { if (lead[c.fil]) c.lead = lead[c.fil]; });
    CONVERSATIONS.splice(0, CONVERSATIONS.length, ...convs);
    if (typeof renderConvList === 'function') renderConvList();
    if (typeof updateUnreadTotal === 'function') updateUnreadTotal();
    const ouvert = CONVERSATIONS.find(c => c.id === (typeof activeConvId !== 'undefined' ? activeConvId : null));
    if (ouvert && typeof renderMessages === 'function') renderMessages(ouvert);
    vide();
  }
  function vide() {
    const e = $('msg-empty'); if (!e || !online()) return;
    e.querySelector('div:nth-child(2)').textContent = CONVERSATIONS.length ? 'Sélectionnez une conversation' : 'Aucun message pour le moment';
    const s = e.querySelector('div:nth-child(3)'); if (s) s.textContent = CONVERSATIONS.length ? '' : 'Les messages des acheteurs et des vendeurs arriveront ici.';
  }
  async function marquerLus(c) {
    if (!c || !c.reel || !online()) return;
    const ids = c.messages.filter(m => m._pourMoi && !m._lu).map(m => m._id);
    for (const id of ids) {
      const r = rows.find(x => x.id === id); if (!r) continue;
      try { await IMMO_SYNC.client.from('records').update({ data: Object.assign({}, r.data, { lu: true }) }).eq('collection', 'message').eq('id', id); r.data.lu = true; } catch (_) { /* nouvel essai plus tard */ }
    }
  }

  // Envoi depuis l'onglet Messages (remplace l'ancienne version et sa réponse automatique inventée)
  async function sendMessage() {
    const input = $('msg-input'), text = (input && input.value || '').trim();
    const c = CONVERSATIONS.find(x => x.id === activeConvId);
    if (!text || !c) return;
    if (!c.reel || !online()) {
      c.messages.push({ from: 'me', text, time: heure(new Date().toISOString()) });
      c.messages.push({ from: 'other', text: 'Mode démonstration : ce message n\'est envoyé à personne.', time: '' });
      input.value = ''; renderMessages(c); renderConvList(); return;
    }
    input.disabled = true;
    try {
      const r = await IMMO_SYNC.client.rpc('envoyer_message', { p_annonce: String(c.bien), p_texte: text, p_type: 'message', p_acheteur: c.acheteur || null });
      if (r.error) throw new Error(r.error.message);
      input.value = ''; derniere = ''; await charger();
    } catch (e) { if (typeof showToast === 'function') showToast('Message non envoyé : ' + e.message); }
    input.disabled = false; input.focus();
  }

  /* ---------- Branchements ---------- */
  window.contactVendeur = id => ouvrir(id, 'message');
  window.contactFromLanding = id => ouvrir(id, 'message');
  window.planifierVisite = id => ouvrir(id, 'visite');
  window.sendMessage = sendMessage;
  const o0 = window.openConversation;
  if (typeof o0 === 'function') window.openConversation = function (id) { const r = o0.apply(this, arguments); marquerLus(CONVERSATIONS.find(c => c.id === id)); return r; };
  // Retour à la fiche après connexion
  setInterval(() => {
    if (window._pendingContact && APP_STATE.loggedIn && online()) {
      const p = window._pendingContact; window._pendingContact = null;
      setTimeout(() => { if (typeof openLandingBien === 'function') openLandingBien(p.id); setTimeout(() => ouvrir(p.id, p.mode), 300); }, 600);
    }
  }, 700);
  // Compte réel : conversations de la base (plus de conversations de démonstration), relues toutes les 20 s
  let avant = false;
  setInterval(() => { const on = online(); if (on && !avant) { derniere = ''; charger(); } avant = on; }, 1000);
  setInterval(() => { if (online()) charger(); }, 20000);
  window.IMMO_MSG = { ouvrir, fermer, charger };
})();
