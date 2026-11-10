/* Immo360 NC — Annonces réelles
 * Publication depuis le formulaire de dépôt (miniature + photos redimensionnées), lecture des annonces
 * publiées de tous les utilisateurs (y compris visiteurs non connectés) et fusion dans BIENS_DATA, galerie
 * photo dans les fiches, onglet « Mes annonces » (retirer, republier, supprimer).
 *
 * Stockage : métadonnées + miniature dans la collection « annonce » (synchronisée par js/sync.js) ;
 * photos dans « annonce_photos » (lues à l'ouverture d'une fiche). Lecture publique une fois publiées (RLS).
 * Sécurité : toute annonce reçue est NETTOYÉE avant affichage (nombres forcés, listes fermées, caractères
 * HTML neutralisés, images limitées aux data URL JPEG/PNG/WebP) : les gabarits existants restent sûrs.
 * Dépend des globales : BIENS_DATA, S, APP_STATE, go, esc, landingSearch, buildMarketplace, IMMO_SYNC.
 */
(function () {
  'use strict';

  const KEY = 'immo360.annonces.v1', PKEY = 'immo360.annonce_photos.v1';
  const MAX_PHOTOS = 12, PHOTO_PX = 1280, THUMB_PX = 400;
  const TYPES = ['Appartement', 'Villa', 'Maison', 'Studio', 'Duplex', 'Terrain', 'Local commercial', 'Immeuble', 'Autre'];
  const STATUTS = ['En vente', 'Compromis', 'Vendu', 'À louer'];
  const $ = id => document.getElementById(id);
  const E = v => (typeof esc === 'function' ? esc(v) : String(v == null ? '' : v));
  const read = (k, d) => { try { return JSON.parse(localStorage.getItem(k)) ?? d; } catch (_) { return d; } };
  const write = (k, v) => { try { localStorage.setItem(k, JSON.stringify(v)); return true; } catch (_) { return false; } };
  const online = () => !!(window.IMMO_SYNC && IMMO_SYNC.uid);

  /* ---------- Nettoyage des annonces reçues ---------- */
  const IMG = /^data:image\/(jpeg|png|webp);base64,[A-Za-z0-9+/=]+$/;
  // Neutralise les caractères HTML en gardant un texte lisible (apostrophes et guillemets typographiques)
  const txt = (v, max) => String(v == null ? '' : v).replace(/[<>`]/g, '').replace(/\s*&\s*/g, ' et ').replace(/'/g, '’').replace(/"/g, '”').replace(/[\u0000-\u001f]/g, ' ').trim().slice(0, max);
  const num = (v, max) => { const n = Number(v); return Number.isFinite(n) && n >= 0 ? Math.min(n, max) : 0; };
  function sanitize(d) {
    if (!d) return null;
    const id = Number(d.id); if (!Number.isFinite(id) || id <= 0) return null;
    return {
      id, titre: txt(d.titre, 120) || 'Bien immobilier', type: TYPES.includes(d.type) ? d.type : 'Autre',
      surface: num(d.surface, 100000), pieces: Math.round(num(d.pieces, 100)), chambres: Math.round(num(d.chambres, 50)), prix: Math.round(num(d.prix, 1e11)),
      statut: STATUTS.includes(d.statut) ? d.statut : 'En vente', dpe: /^[A-G]$/.test(d.dpe || '') ? d.dpe : '—',
      ville: txt(d.ville, 60), quartier: txt(d.quartier, 60), desc: txt(d.desc, 3000),
      features: (Array.isArray(d.features) ? d.features : []).slice(0, 20).map(f => txt(f, 40)).filter(Boolean),
      agent: txt(d.agent, 60), tel: txt(d.tel, 30).replace(/[^0-9+ ().-]/g, ''), ref: txt(d.ref, 40), date: /^\d{4}-\d{2}-\d{2}$/.test(d.date || '') ? d.date : '',
      thumb: IMG.test(d.thumb || '') ? d.thumb : null, nbPhotos: Math.round(num(d.nbPhotos, MAX_PHOTOS)), publie: d.publie === true,
      // marque de l'agence (nom + logo) apposée à la publication
      agence: d.agence && typeof d.agence === 'object' ? { nom: txt(d.agence.nom, 80), logo: IMG.test(d.agence.logo || '') && d.agence.logo.length < 120000 ? d.agence.logo : null } : null
    };
  }
  // Forme attendue par les gabarits existants (BIENS_DATA)
  const toBien = a => ({ id: a.id, titre: a.titre, type: a.type, surface: a.surface, pieces: a.pieces, chambres: a.chambres, prix: a.prix, statut: a.statut, dpe: a.dpe,
    ville: a.ville, quartier: a.quartier, desc: a.desc, description: a.desc, features: a.features, photos: ['🏠'], photoUrl: a.thumb, date: a.date, agent: a.agent, tel: a.tel, ref: a.ref, agence: a.agence && (a.agence.nom || a.agence.logo) ? a.agence : null, _ann: true });

  /* ---------- Images ---------- */
  function loadImg(src) { return new Promise((res, rej) => { const i = new Image(); i.onload = () => res(i); i.onerror = rej; i.src = src; }); }
  function resize(img, max, q) {
    const k = Math.min(1, max / Math.max(img.width, img.height));
    const c = document.createElement('canvas'); c.width = Math.round(img.width * k); c.height = Math.round(img.height * k);
    c.getContext('2d').drawImage(img, 0, 0, c.width, c.height); return c.toDataURL('image/jpeg', q);
  }

  /* ---------- Mes annonces ---------- */
  const mine = () => read(KEY, []);
  function saveMine(list) { const ok = write(KEY, list); if (window.IMMO_SYNC) IMMO_SYNC.saved(KEY, list); return ok; }
  const localPhotos = () => read(PKEY, {});

  async function publish(bien, files) {
    const id = Date.now();
    const imgs = [];
    for (const f of (files || []).slice(0, MAX_PHOTOS)) { try { imgs.push(await loadImg(f.url)); } catch (_) { /* photo illisible ignorée */ } }
    const photos = imgs.map(i => resize(i, PHOTO_PX, 0.72));
    const user = (typeof APP_STATE !== 'undefined' && APP_STATE.user) || {};
    const meta = Object.assign({}, bien, { id, desc: bien.description || bien.desc || '', date: new Date().toISOString().slice(0, 10), ref: bien.ref || 'IMM-' + id,
      statut: 'En vente', thumb: imgs[0] ? resize(imgs[0], THUMB_PX, 0.65) : null, nbPhotos: photos.length, publie: true, auteur: user.nom || '' });
    delete meta.description;
    const list = mine(); list.unshift(meta); const okLocal = saveMine(list);
    let okPhotos = true;
    if (online()) okPhotos = await IMMO_SYNC.putRecord('annonce_photos', id, { publie: true, photos });
    else { const lp = localPhotos(); lp[id] = photos; okPhotos = write(PKEY, lp); }
    await refreshPublic();
    return { id, online: online(), okLocal, okPhotos };
  }
  async function setPublie(id, publie) {
    const list = mine(), a = list.find(x => String(x.id) === String(id)); if (!a) return;
    a.publie = publie; saveMine(list);
    if (online()) { const p = await IMMO_SYNC.fetchOne('annonce_photos', id); if (p) await IMMO_SYNC.putRecord('annonce_photos', id, Object.assign({}, p, { publie })); }
    await refreshPublic();
  }
  async function remove(id) {
    saveMine(mine().filter(x => String(x.id) !== String(id)));
    if (online()) await IMMO_SYNC.delRecord('annonce_photos', id); else { const lp = localPhotos(); delete lp[id]; write(PKEY, lp); }
    await refreshPublic();
  }

  /* ---------- Annonces publiées de tous ---------- */
  let lastSig = null; // null : le premier passage dessine toujours la grille publique
  async function refreshPublic() {
    if (typeof BIENS_DATA === 'undefined') return;
    const rows = window.IMMO_SYNC ? await IMMO_SYNC.fetchAll('annonce') : null;
    const raw = rows ? rows.map(r => r.data) : [];
    if (!online()) mine().forEach(a => raw.push(a)); // démo : ses annonces locales
    const seen = new Set();
    const list = raw.map(sanitize).filter(a => a && a.publie && !seen.has(a.id) && seen.add(a.id)).sort((a, b) => b.id - a.id);
    const sig = list.map(a => a.id + ':' + a.prix + ':' + a.statut + ':' + a.titre).join('|');
    for (let i = BIENS_DATA.length - 1; i >= 0; i--) if (BIENS_DATA[i]._ann) BIENS_DATA.splice(i, 1);
    BIENS_DATA.unshift(...list.map(toBien));
    if (sig !== lastSig) { lastSig = sig; rerender(); }
  }
  function rerender() {
    const visible = el => !!el && el.getClientRects().length > 0; // (offsetParent vaut null pour un élément en position fixe)
    // Page publique (grille #landing-biens-grid) et vue de recherche (#landing-biens)
    try { if (typeof buildLandingBiensPublic === 'function' && visible($('landing-page'))) buildLandingBiensPublic(); } catch (_) { /* vue absente */ }
    try { if (typeof landingSearch === 'function' && $('landing-biens')) landingSearch(); } catch (_) { /* vue absente */ }
    try { if (typeof S !== 'undefined' && S.panel === 'marketplace' && typeof buildMarketplace === 'function') buildMarketplace(); } catch (_) { /* vue absente */ }
  }

  /* ---------- Galerie dans la fiche d'un bien ---------- */
  async function photosFor(id) {
    if (!online() || !window.IMMO_SYNC) { const lp = localPhotos()[id]; if (lp) return lp.filter(x => IMG.test(x)); }
    const p = window.IMMO_SYNC ? await IMMO_SYNC.fetchOne('annonce_photos', id) : null;
    return p && Array.isArray(p.photos) ? p.photos.filter(x => IMG.test(x)).slice(0, MAX_PHOTOS) : [];
  }
  // Prépare l'emplacement média (galerie puis visite vidéo) sous l'en-tête de la fiche, puis charge les photos
  function attach(overlay, bienId) {
    const b = (typeof BIENS_DATA !== 'undefined' ? BIENS_DATA : []).find(x => x.id === bienId);
    const card = overlay && overlay.firstElementChild; if (!card) return;
    let media = card.querySelector('.ann-media');
    if (!media) {
      media = document.createElement('div'); media.className = 'ann-media';
      media.innerHTML = '<div class="ann-gal"></div><div class="ann-visite"></div>';
      const header = card.firstElementChild; if (header && header.nextSibling) card.insertBefore(media, header.nextSibling); else card.prepend(media);
    }
    if (!b || !b._ann) return;
    photosFor(bienId).then(ph => {
      if (!ph.length || !document.body.contains(media)) return;
      const gal = media.querySelector('.ann-gal');
      gal.innerHTML = `<div style="position:relative;border-radius:10px;overflow:hidden;background:#111;aspect-ratio:3/2;margin-bottom:6px"><img class="ann-main" alt="${E(b.titre)}" src="${ph[0]}" style="width:100%;height:100%;object-fit:cover;display:block"></div>
        ${ph.length > 1 ? `<div style="display:flex;gap:6px;overflow-x:auto;padding-bottom:4px;margin-bottom:10px">${ph.map((src, i) => `<img data-i="${i}" alt="Photo ${i + 1}" src="${src}" style="width:64px;height:48px;object-fit:cover;border-radius:6px;cursor:pointer;flex:none;outline:${i ? 'none' : '2px solid #0A7A84'}">`).join('')}</div>` : ''}`;
      gal.querySelectorAll('img[data-i]').forEach(t => t.onclick = () => { gal.querySelector('.ann-main').src = ph[+t.dataset.i]; gal.querySelectorAll('img[data-i]').forEach(x => { x.style.outline = x === t ? '2px solid #0A7A84' : 'none'; }); });
      // Masque l'ancien bloc « photo » (emoji ou miniature) de la fiche, remplacé par la galerie
      const fph = card.querySelector('.fi-ph'); if (fph) fph.classList.add('gal'); // fiche v3 : la galerie remplace la photo d'en-tête, les boutons restent
      card.querySelectorAll('div').forEach(d => { if (media.contains(d) || d.classList.contains('fi-ph')) return; const im = d.querySelector(':scope > img'); if ((d.style.height === '130px' && d.textContent.trim() === '🏠') || (im && im.getAttribute('src') === b.photoUrl)) d.style.display = 'none'; });
    });
  }

  /* ---------- Onglet « Mes annonces » ---------- */
  function buildMes(el) {
    const list = mine();
    el.innerHTML = `<div style="max-width:1000px;margin:0 auto"><div style="display:flex;justify-content:space-between;align-items:flex-start;gap:12px;margin-bottom:16px"><div><h2 style="font-family:'Source Sans 3',sans-serif;font-size:24px;margin:0 0 4px">Mes annonces</h2>
      <p style="color:var(--mid);font-size:13px;margin:0">${online() ? 'Vos annonces publiées sont visibles par tous les visiteurs d\'Immo360.' : 'Mode démonstration : vos annonces ne sont visibles que dans ce navigateur. Connectez-vous pour les publier en ligne.'}</p></div>
      <div style="display:flex;gap:8px;flex-wrap:wrap"><button type="button" class="btn btn-outline" id="ma-texte">Rédiger un texte avec l'IA</button><button type="button" class="btn btn-gold" id="ma-new">Déposer une annonce</button></div></div>
      ${list.length ? list.map(a => `<div class="card" style="display:grid;grid-template-columns:120px 1fr auto;gap:14px;align-items:center;padding:12px">
        <div style="width:120px;height:80px;border-radius:8px;background:var(--warm) center/cover no-repeat${a.thumb && IMG.test(a.thumb) ? ';background-image:url(' + a.thumb + ')' : ''}"></div>
        <div><div style="font-weight:600;font-size:15px">${E(a.titre)}</div><div style="font-size:12px;color:var(--mid);margin:3px 0">${E([a.quartier, a.ville].filter(Boolean).join(', '))} · ${a.surface ? E(a.surface) + ' m² · ' : ''}${a.prix ? Number(a.prix).toLocaleString('fr-FR') + ' F' : ''}</div>
          <span style="font-size:11px;font-weight:600;padding:2px 9px;border-radius:99px;${a.modere ? 'background:#FBEAE6;color:#8A2E1C">Retirée par la modération' : a.publie ? 'background:#E6F4EA;color:#1E6B3A">Publiée' : 'background:#EEF2F6;color:#475569">Retirée'}</span>${a.modere && a.motif ? ' <span style="font-size:12px;color:#8A2E1C">Motif : ' + E(a.motif) + '</span>' : ''} <span style="font-size:11px;color:var(--mid)">${E(a.nbPhotos || 0)} photo(s) · réf. ${E(a.ref)}</span>${window.IMMO_OPT && IMMO_OPT.badges(a.id) ? '<div style="margin-top:6px">' + IMMO_OPT.badges(a.id) + '</div>' : ''}</div>
        <div style="display:flex;flex-direction:column;gap:6px">${a.publie ? `<button type="button" class="btn btn-sm btn-outline" data-voir="${E(a.id)}">Voir la fiche</button><button type="button" class="btn btn-sm btn-gold" data-social="${E(a.id)}">Diffuser sur les réseaux</button>` : ''}
          ${a.publie && window.IMMO_TARIFS && IMMO_TARIFS.actif() ? `<button type="button" class="btn btn-sm btn-gold" data-boost="${E(a.id)}">Vendre plus vite</button>` : ''}
          <button type="button" class="btn btn-sm btn-outline" data-visite="${E(a.id)}">Visite vidéo</button>
          ${a.modere ? '' : `<button type="button" class="btn btn-sm btn-outline" data-pub="${E(a.id)}" data-v="${a.publie ? '0' : '1'}">${a.publie ? 'Retirer' : 'Republier'}</button>`}
          <button type="button" class="btn btn-sm btn-outline" data-del="${E(a.id)}">Supprimer</button></div></div>`).join('')
        : '<div class="card"><p style="margin:0;color:var(--mid);font-size:13px">Vous n\'avez pas encore d\'annonce.</p></div>'}</div>`;
    $('ma-new').onclick = () => go('depot');
    $('ma-texte').onclick = () => go('annonces');
    el.querySelectorAll('[data-voir]').forEach(b => b.onclick = () => { if (typeof openBien === 'function') openBien(+b.dataset.voir); });
    el.querySelectorAll('[data-boost]').forEach(b => b.onclick = () => { if (window.IMMO_OPT) IMMO_OPT.openBoost(+b.dataset.boost); });
    el.querySelectorAll('[data-visite]').forEach(b => b.onclick = () => { if (window.IMMO_VISITE && IMMO_VISITE.state) IMMO_VISITE.state.bienId = +b.dataset.visite; go('visite'); });
    el.querySelectorAll('[data-pub]').forEach(b => b.onclick = async () => { await setPublie(+b.dataset.pub, b.dataset.v === '1'); buildMes(el); });
    el.querySelectorAll('[data-del]').forEach(b => b.onclick = async () => { if (confirm('Supprimer définitivement cette annonce et ses photos ?')) { await remove(+b.dataset.del); buildMes(el); } });
  }

  // Chargement initial (après l'initialisation de Supabase) puis rafraîchissement régulier
  window.addEventListener('load', () => { setTimeout(refreshPublic, 1500); setInterval(refreshPublic, 120000); });
  window.addEventListener('immo360:purge', () => { setTimeout(refreshPublic, 0); });
  window.IMMO_PANELS = Object.assign(window.IMMO_PANELS || {}, { 'mes-annonces': buildMes });
  window.IMMO_ANN = { publish, setPublie, remove, refreshPublic, attach, mine, sanitize, photosFor };
})();
