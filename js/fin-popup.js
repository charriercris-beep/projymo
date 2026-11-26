/* Immo360 NC — « Simuler le financement » depuis la fiche d'un bien : fenêtre au-dessus de l'annonce
 * Mensualité en grand, curseurs (apport, durée, taux), répartition du coût (anneau), frais d'acquisition
 * calédoniens (js/banquier.js : droits, centimes, taxe hypothécaire, émoluments), revenus conseillés,
 * et demande d'étude envoyée aux banques et courtiers vérifiés (compte réel uniquement).
 * Remplace la redirection vers une autre page.
 */
(function () {
  'use strict';

  const $ = id => document.getElementById(id);
  const E = s => String(s == null ? '' : s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const F = n => Math.round(n || 0).toLocaleString('fr-FR') + ' F';
  const M = n => n >= 1e6 ? (Math.round(n / 1e5) / 10).toLocaleString('fr-FR') + ' M F' : F(n);
  const online = () => !!(window.IMMO_SYNC && IMMO_SYNC.uid);
  const B = window.IMMO_BNK;
  let ctx = null;

  function bienDuPrix(prix) {
    const ouvert = document.querySelector('.fiche-ov [data-partage]');
    const id = ouvert ? +ouvert.dataset.partage : 0;
    return (typeof BIENS_DATA !== 'undefined' ? BIENS_DATA : []).find(b => b.id === id) || { prix, titre: 'Ce bien' };
  }

  function calc() {
    const { prix } = ctx, apport = +$('fpp-apport').value, duree = +$('fpp-duree').value, taux = +$('fpp-taux').value / 100, rp = $('fpp-rp').checked;
    const frais = B ? B.fraisAcquisition(prix, { usage: rp ? 'rp' : 'locatif', personnePhysique: true, type: 'ancien' }) : { total: Math.round(prix * 0.08), lignes: [] };
    const emprunt = Math.max(0, prix + frais.total - apport), mois = duree * 12;
    const fac = B ? B.mensualiteFacteur(taux, mois) : (taux / 12) / (1 - Math.pow(1 + taux / 12, -mois));
    const assur = (B ? B.assurance() : 0.003), mens = emprunt * fac, assM = emprunt * assur / 12;
    const interets = mens * mois - emprunt, assTot = assM * mois;
    return { prix, apport, duree, taux, rp, frais, emprunt, mens, assM, total: mens + assM, interets, assTot, revenus: (mens + assM) / 0.35 };
  }

  function anneau(parts) {
    const tot = parts.reduce((a, p) => a + p[1], 0) || 1, R = 52, C = 2 * Math.PI * R; let off = 0;
    return `<svg viewBox="0 0 140 140" class="fp-don" role="img" aria-label="${parts.map(p => p[0] + ' ' + M(p[1])).join(', ')}">
      <circle cx="70" cy="70" r="${R}" fill="none" stroke="var(--warm)" stroke-width="18"/>
      ${parts.map(([, v, c]) => { const l = v / tot * C, s = `<circle cx="70" cy="70" r="${R}" fill="none" stroke="${c}" stroke-width="18" stroke-dasharray="${l} ${C - l}" stroke-dashoffset="${-off}" transform="rotate(-90 70 70)"/>`; off += l; return s; }).join('')}</svg>`;
  }

  function rendu() {
    const r = calc();
    $('fpp-apport-v').textContent = M(r.apport) + ' (' + Math.round(r.apport / r.prix * 100) + ' %)';
    $('fpp-duree-v').textContent = r.duree + ' ans';
    $('fpp-taux-v').textContent = (r.taux * 100).toFixed(2).replace('.', ',') + ' %';
    $('fpp-mens').textContent = F(r.total);
    $('fpp-mens-d').textContent = `dont assurance ${F(r.assM)} · pendant ${r.duree} ans`;
    const parts = [['Prix du bien', r.prix, 'var(--gold)'], ['Frais d\'acquisition', r.frais.total, '#2F6FDB'], ['Intérêts', r.interets, 'var(--accent)'], ['Assurance', r.assTot, '#D9A21B']];
    $('fpp-graph').innerHTML = anneau(parts) + `<ul class="fp-leg">${parts.map(([l, v, c]) => `<li><i style="background:${c}"></i>${E(l)}<b>${M(v)}</b></li>`).join('')}<li class="t">Coût total<b>${M(parts.reduce((a, p) => a + p[1], 0))}</b></li></ul>`;
    $('fpp-tiles').innerHTML = `<div><small>Montant à emprunter</small><b>${M(r.emprunt)}</b><span>prix + frais − apport</span></div>
      <div><small>Frais d'acquisition</small><b>${M(r.frais.total)}</b><span>${r.rp ? 'droits réduits résidence principale' : 'droits au taux normal'}</span></div>
      <div><small>Revenus du foyer conseillés</small><b>${F(Math.ceil(r.revenus / 10000) * 10000)}</b><span>par mois, pour un endettement de 35 %</span></div>`;
  }

  function ouvrir(prix) {
    fermer();
    const b = bienDuPrix(prix); prix = Number(prix) || Number(b.prix) || 0; if (!prix) return;
    ctx = { prix, b };
    const tauxDef = B ? B.taux() * 100 : 4;
    const d = document.createElement('div'); d.id = 'fpp-mod'; d.className = 'fp-mod'; d.setAttribute('role', 'dialog'); d.setAttribute('aria-modal', 'true'); d.setAttribute('aria-label', 'Simuler le financement');
    d.innerHTML = `<div class="fp-in">
      <div class="fp-h"><div><small>Financer ce bien</small><b>${E(b.titre || 'Ce bien')}</b><span>${M(prix)}${b.quartier || b.ville ? ' · ' + E([b.quartier, b.ville].filter(Boolean).join(', ')) : ''}</span></div><button type="button" class="fp-x" aria-label="Fermer">×</button></div>
      <div class="fp-g">
        <div class="fp-l">
          <div class="fp-big"><small>Votre mensualité estimée</small><b id="fpp-mens">—</b><span id="fpp-mens-d"></span></div>
          <label class="fp-s">Apport personnel <output id="fpp-apport-v"></output><input type="range" id="fpp-apport" min="0" max="${Math.round(prix * 0.6 / 100000) * 100000}" step="100000" value="${Math.round(prix * 0.1 / 100000) * 100000}"></label>
          <label class="fp-s">Durée <output id="fpp-duree-v"></output><input type="range" id="fpp-duree" min="10" max="30" step="1" value="25"></label>
          <label class="fp-s">Taux du crédit <output id="fpp-taux-v"></output><input type="range" id="fpp-taux" min="1.5" max="7" step="0.05" value="${tauxDef}"></label>
          <label class="fp-c"><input type="checkbox" id="fpp-rp" checked> Résidence principale (droits d'enregistrement réduits)</label>
          <p class="fp-n">Taux et assurance : exemples à confirmer avec votre banque.</p>
        </div>
        <div class="fp-r"><div class="fp-graph" id="fpp-graph"></div></div>
      </div>
      <div class="fp-tiles" id="fpp-tiles"></div>
      <div class="fp-cta"><div><b>Une étude gratuite et sans engagement</b><span>Votre demande est transmise aux banques et courtiers vérifiés d'Immo360 ; le premier disponible vous recontacte.</span></div>
        <div class="fp-acts"><button type="button" class="btn btn-gold" id="fpp-send">Demander une étude</button><button type="button" class="btn btn-outline" id="fpp-full">Étude complète (aides, PTZ)</button></div>
        <p class="fp-msg" id="fpp-msg" role="status"></p></div>
    </div>`;
    document.body.appendChild(d);
    document.addEventListener('keydown', echap);
    d.querySelectorAll('input').forEach(i => i.addEventListener('input', rendu));
    d.addEventListener('click', e => { if (e.target === d || e.target.closest('.fp-x')) fermer(); });
    $('fpp-send').onclick = envoyer;
    $('fpp-full').onclick = () => { const p = ctx.prix; fermer(); document.querySelectorAll('.fiche-ov').forEach(x => x.remove()); if (typeof hideLanding === 'function') hideLanding(); if (APP_STATE.loggedIn) { go('capacite'); } else { const el = $('fin-prix'); if (el) el.value = p; go('financement'); } };
    rendu();
    d.querySelector('.fp-x').focus();
  }

  function envoyer() {
    const msg = $('fpp-msg'), btn = $('fpp-send');
    if (!APP_STATE.loggedIn) {
      msg.innerHTML = 'Pour qu\'un conseiller puisse vous recontacter, il faut un compte (gratuit). <button type="button" class="lp-link" id="fpp-login">Créer un compte ou se connecter</button>';
      $('fpp-login').onclick = () => { fermer(); document.querySelectorAll('.fiche-ov').forEach(x => x.remove()); showLoginModal('buy'); };
      return;
    }
    if (!online() || !B || !B.demande) { msg.textContent = 'Mode démonstration : rien n\'est envoyé. Connectez-vous avec votre compte pour demander une étude.'; return; }
    const r = calc(), u = APP_STATE.user || {};
    B.demande({ client: u.nom || 'Client', email: u.email || '', tel: u.tel || '', source: 'acheteur', etape: 'contact', bien: (ctx.b.titre || '') + ' — ' + M(r.prix),
      sim: { apport: r.apport, duree: r.duree, taux: r.taux, usage: r.rp ? 'rp' : 'locatif', type: 'ancien' } });
    btn.disabled = true; btn.textContent = 'Demande envoyée';
    msg.textContent = 'C\'est envoyé : votre demande est visible par les banques et courtiers vérifiés. Vous serez recontacté par téléphone ou par email.';
    try { if (window.IMMO_EVT) IMMO_EVT.track('simulation_financement'); } catch (_) { /* ignoré */ }
  }
  function echap(e) { if (e.key === 'Escape') fermer(); }
  function fermer() { const d = $('fpp-mod'); if (d) d.remove(); document.removeEventListener('keydown', echap); }

  window.simulerFinancement = ouvrir;
  window.simulerFinancementPublic = ouvrir;
  window.IMMO_FINPOP = { ouvrir, fermer, calc };
})();
