/* Immo360 NC — Profil de l'agence (espace agent) : nom, logo, coordonnées, carte professionnelle.
 * Le logo et le nom sont repris sur les annonces publiées par l'agence (cartes, fiche) et en tête des
 * estimations remises aux vendeurs. En mode payant, selon la formule (js/tarifs.js : fonctions « logo »
 * et « estimation_marque ») ; sinon pour tous.
 * Stockage : immo360.agence.v1 (synchronisé par js/sync.js, collection « agence », privée).
 */
(function () {
  'use strict';

  const KEY = 'immo360.agence.v1', LOGO_PX = 240;
  const $ = id => document.getElementById(id);
  const E = v => String(v == null ? '' : v).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const IMG = /^data:image\/(jpeg|png|webp);base64,[A-Za-z0-9+/=]+$/;
  const VIDE = { id: 'agence', nom: '', logo: null, tel: '', email: '', adresse: '', carte: '', site: '' };

  function get() { try { const l = JSON.parse(localStorage.getItem(KEY) || '[]'); return Object.assign({}, VIDE, (Array.isArray(l) ? l[0] : l) || {}); } catch (_) { return Object.assign({}, VIDE); } }
  function set(v) {
    // identifiant unique par compte (la clé de la table records est partagée entre tous les utilisateurs)
    const list = [Object.assign({}, get(), v, { id: 'agence-' + ((window.IMMO_SYNC && IMMO_SYNC.uid) || 'local') })];
    try { localStorage.setItem(KEY, JSON.stringify(list)); } catch (_) { return false; }
    if (window.IMMO_SYNC) IMMO_SYNC.saved(KEY, list);
    return true;
  }
  const droit = f => !window.IMMO_ABO || IMMO_ABO.a('agt', f);
  // Marque à apposer sur une annonce ou une estimation (null si l'agence n'a rien renseigné ou si la formule ne le permet pas)
  function marque(fonction) {
    if (typeof S === 'undefined' || S.profile !== 'agt' || !droit(fonction)) return null;
    const a = get(); if (!a.nom && !a.logo) return null;
    return { nom: a.nom, logo: IMG.test(a.logo || '') ? a.logo : null, tel: a.tel, email: a.email, adresse: a.adresse, carte: a.carte };
  }

  // Logo redimensionné (fond blanc pour les PNG transparents)
  function readLogo(file) {
    return new Promise((res, rej) => {
      const url = URL.createObjectURL(file), img = new Image();
      img.onload = () => { const k = Math.min(1, LOGO_PX / Math.max(img.width, img.height)); const c = document.createElement('canvas'); c.width = Math.round(img.width * k); c.height = Math.round(img.height * k);
        const x = c.getContext('2d'); x.fillStyle = '#fff'; x.fillRect(0, 0, c.width, c.height); x.drawImage(img, 0, 0, c.width, c.height); URL.revokeObjectURL(url); res(c.toDataURL('image/png')); };
      img.onerror = () => { URL.revokeObjectURL(url); rej(new Error('image illisible')); };
      img.src = url;
    });
  }

  function build(el) {
    const a = get(), payant = window.IMMO_TARIFS && IMMO_TARIFS.MODE === 'payant';
    const okLogo = droit('logo'), okEst = droit('estimation_marque');
    el.innerHTML = `<div class="ag-wrap"><h2>Mon agence</h2>
      <p class="ag-lead">Ces informations apparaissent sur vos annonces et en tête des estimations que vous remettez à vos vendeurs.</p>
      ${payant && (!okLogo || !okEst) ? `<div class="abo-invite"><b>Logo et estimations à votre nom</b><span>Inclus dans les formules Agence et Agence+.</span><button type="button" class="btn btn-gold btn-sm" onclick="go('abonnement')">Voir les formules</button></div>` : ''}
      <div class="ag-grid"><div class="card">
        <div class="ag-f"><label for="ag-nom">Nom de l'agence</label><input id="ag-nom" maxlength="80" value="${E(a.nom)}" autocomplete="organization"></div>
        <div class="ag-2"><div class="ag-f"><label for="ag-tel">Téléphone</label><input id="ag-tel" maxlength="30" inputmode="tel" value="${E(a.tel)}"></div>
          <div class="ag-f"><label for="ag-email">Email</label><input id="ag-email" type="email" maxlength="80" value="${E(a.email)}"></div></div>
        <div class="ag-f"><label for="ag-adr">Adresse</label><input id="ag-adr" maxlength="120" value="${E(a.adresse)}"></div>
        <div class="ag-2"><div class="ag-f"><label for="ag-carte">N° de carte professionnelle</label><input id="ag-carte" maxlength="40" value="${E(a.carte)}"></div>
          <div class="ag-f"><label for="ag-site">Site internet (facultatif)</label><input id="ag-site" maxlength="80" value="${E(a.site)}"></div></div>
        <button type="button" class="btn btn-gold" id="ag-save">Enregistrer</button> <span id="ag-msg" class="ag-msg" role="status"></span>
      </div><div class="card">
        <div class="card-title">Logo</div>
        <div class="ag-logo" id="ag-logo">${a.logo ? `<img src="${E(a.logo)}" alt="Logo de l'agence">` : '<span>Pas encore de logo</span>'}</div>
        <label class="btn btn-outline btn-sm" style="cursor:pointer">Choisir une image<input type="file" id="ag-file" accept="image/png,image/jpeg,image/webp" hidden></label>
        ${a.logo ? '<button type="button" class="btn btn-sm btn-outline" id="ag-del">Retirer</button>' : ''}
        <p class="ag-help">PNG ou JPG, idéalement carré ou horizontal. Il est réduit automatiquement.</p>
      </div></div></div>`;
    $('ag-save').onclick = () => {
      const ok = set({ nom: $('ag-nom').value.trim(), tel: $('ag-tel').value.trim(), email: $('ag-email').value.trim(), adresse: $('ag-adr').value.trim(), carte: $('ag-carte').value.trim(), site: $('ag-site').value.trim() });
      $('ag-msg').textContent = ok ? 'Enregistré. Vos prochaines annonces porteront ces informations.' : 'Enregistrement impossible : stockage du navigateur plein.';
    };
    $('ag-file').onchange = async e => {
      const f = e.target.files && e.target.files[0]; if (!f) return;
      try { set({ logo: await readLogo(f) }); build(el); } catch (_) { $('ag-msg').textContent = 'Cette image n\'a pas pu être lue.'; }
    };
    if ($('ag-del')) $('ag-del').onclick = () => { set({ logo: null }); build(el); };
  }

  const css = document.createElement('style');
  css.textContent = `
.ag-wrap{max-width:1000px;margin:0 auto}.ag-wrap h2{font-size:28px;color:var(--ocean);margin:0 0 6px}.ag-lead{font-size:16px;margin:0 0 16px}
.ag-grid{display:grid;grid-template-columns:1.6fr 1fr;gap:16px;align-items:start}
.ag-f{margin-bottom:12px}.ag-2{display:grid;grid-template-columns:1fr 1fr;gap:12px}.ag-msg{color:var(--green);font-weight:600;margin-left:8px}
.ag-logo{height:120px;border:1.5px dashed var(--line-strong);border-radius:12px;display:flex;align-items:center;justify-content:center;margin-bottom:12px;background:#fff;color:var(--mid)}
.ag-logo img{max-width:90%;max-height:100px;object-fit:contain}.ag-help{font-size:14px;color:var(--mid);margin:10px 0 0}
.pc-logo{position:absolute;right:10px;bottom:10px;background:#fff;border-radius:8px;padding:4px 6px;box-shadow:0 1px 6px rgba(0,0,0,.2);display:flex;max-width:42%}
.pc-logo img{height:30px;max-width:100%;object-fit:contain}
.fi-av.logo{background:#fff;border:1px solid var(--line);border-radius:10px;width:auto;min-width:44px;padding:4px 6px}.fi-av.logo img{height:36px;max-width:110px;object-fit:contain}
@media(max-width:800px){.ag-grid{grid-template-columns:1fr}.ag-2{grid-template-columns:1fr}}`;
  document.head.appendChild(css);

  window.IMMO_AGENCE = { get, set, marque };
  window.IMMO_PANELS = Object.assign(window.IMMO_PANELS || {}, { 'agt-profil': el => build(el) });
})();
