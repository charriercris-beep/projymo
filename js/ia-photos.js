/* Immo360 NC — Dépôt : l'IA lit les photos du bien (appel à /api/photos)
 * Les photos sont réduites dans le navigateur (1024 px, JPEG) avant l'envoi ; 8 au maximum.
 * Résultat : pièce et qualité de chaque photo (affichées sur les vignettes), meilleure photo principale,
 * prestations visibles à cocher en un clic, état apparent, photos à refaire et pièces manquantes.
 * Les atouts vus sur les photos sont ensuite repris par la rédaction automatique de la description.
 * Remplace l'ancienne « vérification » qui affichait un score inventé.
 */
(function () {
  'use strict';

  const $ = id => document.getElementById(id);
  const val = id => ($(id) && $(id).value || '').trim();
  const e = s => String(s == null ? '' : s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const MAX = 8;
  const ETATS = { neuf: 'Neuf / récent', excellent: 'Excellent état', bon: 'Bon état', moyen: 'État moyen', travaux: 'À rénover' };
  const photos = () => (typeof depotPhotos !== 'undefined' && Array.isArray(depotPhotos)) ? depotPhotos : [];
  let dernier = null; // { res, objs } : objets photo analysés (l'ordre de la liste peut changer ensuite)

  /* ---------- Réduction des images ---------- */
  function reduire(p) {
    return new Promise(ok => {
      const img = new Image();
      img.onload = () => {
        try {
          const k = Math.min(1, 1024 / Math.max(img.naturalWidth, img.naturalHeight));
          const c = document.createElement('canvas'); c.width = Math.round(img.naturalWidth * k); c.height = Math.round(img.naturalHeight * k);
          c.getContext('2d').drawImage(img, 0, 0, c.width, c.height);
          ok(c.toDataURL('image/jpeg', 0.78).split(',')[1]);
        } catch (_) { ok(null); }
      };
      img.onerror = () => ok(null); // HEIC et formats illisibles : ignorés
      img.src = p.url;
    });
  }

  /* ---------- Appel ---------- */
  async function analyzeDepotPhotos() {
    const box = $('depot-ia-result'), btn = $('btn-analyze-depot');
    const liste = photos();
    if (!liste.length) { if (box) box.innerHTML = '<p class="iap-msg err">Ajoutez d\'abord des photos.</p>'; return; }
    const objs = [], data = [];
    for (const p of liste.slice(0, 12)) { if (data.length >= MAX) break; const d = await reduire(p); if (d) { objs.push(p); data.push({ data: d, mediaType: 'image/jpeg' }); } }
    if (!data.length) { if (box) box.innerHTML = '<p class="iap-msg err">Ces photos ne sont pas lisibles (format HEIC ?). Convertissez-les en JPG.</p>'; return; }
    if (btn) { btn.disabled = true; btn.textContent = 'Lecture en cours…'; }
    if (box) box.innerHTML = `<div class="iap-wait"><span class="iap-scan"></span>L'IA examine ${data.length} photo${data.length > 1 ? 's' : ''} : pièces, lumière, état, prestations… (15 à 30 secondes)</div>`;
    const lieu = [val('d-quartier') !== 'Autre' ? val('d-quartier') : '', val('d-ville')].filter(Boolean).join(', ');
    try {
      const r = await fetch('/api/photos', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ photos: data, context: { type: val('d-type'), surface: val('d-surface'), pieces: val('d-pieces'), lieu } })
      });
      let d = {}; try { d = await r.json(); } catch (_) { d = { error: 'réponse illisible du serveur (' + r.status + ')' }; }
      if (!r.ok || d.error) throw new Error(d.error || 'service indisponible');
      (d.photos || []).forEach(x => { const o = objs[x.i]; if (o) o.ia = x; });
      dernier = { res: d, objs };
      window.IMMO_PHOTOS_IA = { points_forts: d.points_forts || [], prestations: (d.prestations || []).map(x => x.label), etat: d.etat || '' };
      if (typeof renderDepotPhotos === 'function') renderDepotPhotos();
      afficher();
    } catch (err) {
      if (box) box.innerHTML = `<p class="iap-msg err">La lecture des photos n'a pas abouti : ${e(err.message)}</p>`;
    }
    if (btn) { btn.disabled = false; btn.textContent = 'Relancer l\'analyse'; }
  }

  /* ---------- Résultat ---------- */
  function afficher() {
    const box = $('depot-ia-result'); if (!box || !dernier) return;
    const { res, objs } = dernier, liste = photos();
    const vign = o => o ? `<img src="${e(o.url)}" alt="">` : '';
    const best = objs[res.ordre[0]];
    const dejaPremiere = best && liste[0] === best;
    const coches = id => { const c = $('df-' + id); return !!(c && c.checked); };
    const aCocher = (res.prestations || []).filter(p => !coches(p.id));
    const mauvaises = (res.photos || []).filter(x => x.qualite < 6 || x.defauts.length);
    const etatSel = val('d-etat');

    let h = `<div class="iap-h"><b>Ce que l'IA voit sur vos photos</b>${res.resume ? `<p>${e(res.resume)}</p>` : ''}</div>`;
    if (best) {
      h += `<div class="iap-row"><div class="iap-th">${vign(best)}</div><div><b>Photo principale ${dejaPremiere ? 'idéale' : 'conseillée'}</b><small>${dejaPremiere ? 'Votre première photo est déjà la plus attractive.' : 'Celle-ci attire davantage l\'œil. Les autres suivront dans l\'ordre d\'une visite.'}</small></div>${dejaPremiere ? '' : '<button type="button" class="btn btn-sm btn-gold" data-iap="ordre">Réorganiser</button>'}</div>`;
    }
    if ((res.prestations || []).length) {
      h += `<div class="iap-blk"><b>Prestations repérées</b><div class="iap-chips">${res.prestations.map(p => `<span class="${coches(p.id) ? 'on' : ''}">${e(p.label)}</span>`).join('')}</div>${aCocher.length ? `<button type="button" class="btn btn-sm btn-gold" data-iap="presta">Cocher ${aCocher.length > 1 ? 'ces ' + aCocher.length + ' prestations' : 'cette prestation'} dans l'annonce</button>` : '<small class="iap-ok">Cochées dans votre annonce.</small>'}</div>`;
    }
    if (res.etat) {
      h += `<div class="iap-blk"><b>État apparent : ${e(ETATS[res.etat])}</b>${etatSel === res.etat ? '<small class="iap-ok">Repris dans votre annonce.</small>' : `<button type="button" class="btn btn-sm btn-outline" data-iap="etat">Reprendre dans l'annonce</button>`}</div>`;
    }
    if (mauvaises.length) {
      h += `<div class="iap-blk"><b>Photos à améliorer</b>${mauvaises.map(x => `<div class="iap-row sm"><div class="iap-th">${vign(objs[x.i])}</div><div><span class="iap-q">${x.qualite}/10</span> ${e(x.defauts.join(', '))}<small>${e(x.conseil || 'Reprenez-la de jour, à hauteur de poitrine, pièce rangée.')}</small></div></div>`).join('')}</div>`;
    }
    if ((res.manque || []).length) h += `<div class="iap-blk"><b>À ajouter</b><small>Les acheteurs aiment voir : ${e(res.manque.join(', '))}.</small></div>`;
    if ((res.points_forts || []).length) h += `<div class="iap-blk"><b>Atouts repérés</b><small>${e(res.points_forts.join(' · '))} — repris dans la description rédigée automatiquement.</small></div>`;
    box.innerHTML = `<div class="iap-res">${h}</div>`;
  }

  function action(k) {
    if (!dernier) return;
    const { res, objs } = dernier;
    if (k === 'ordre') {
      // ordre conseillé pour les photos analysées encore présentes, puis les autres
      const liste = photos(), rang = res.ordre.map(i => objs[i]).filter(p => p && liste.includes(p));
      const reste = liste.filter(p => !rang.includes(p));
      liste.splice(0, liste.length, ...rang, ...reste);
      if (typeof renderDepotPhotos === 'function') renderDepotPhotos();
    }
    if (k === 'presta') (res.prestations || []).forEach(p => { const c = $('df-' + p.id); if (c && !c.checked) { c.checked = true; c.dispatchEvent(new Event('change', { bubbles: true })); } });
    if (k === 'etat' && $('d-etat')) { $('d-etat').value = res.etat; $('d-etat').dispatchEvent(new Event('change', { bubbles: true })); }
    afficher();
  }

  /* ---------- Vignettes : pièce reconnue et alerte qualité ---------- */
  const r0 = window.renderDepotPhotos;
  if (typeof r0 === 'function') {
    window.renderDepotPhotos = function () {
      const out = r0.apply(this, arguments);
      try {
        const grid = $('d-photos-grid'); if (!grid) return out;
        [...grid.children].forEach((cell, i) => {
          const ia = photos()[i] && photos()[i].ia; if (!ia) return;
          const t = document.createElement('span');
          t.className = 'iap-tag' + (ia.qualite < 6 || ia.defauts.length ? ' warn' : '');
          t.textContent = ia.piece + (ia.qualite < 6 || ia.defauts.length ? ' · à refaire' : '');
          cell.appendChild(t);
        });
      } catch (_) { /* vignettes sans étiquette */ }
      return out;
    };
  }

  document.addEventListener('click', ev => { const b = ev.target.closest && ev.target.closest('[data-iap]'); if (b) action(b.dataset.iap); });
  // Photos retirées ou ajoutées : l'analyse précédente reste valable pour les photos encore présentes
  window.analyzeDepotPhotos = analyzeDepotPhotos;
  window.IMMO_IA_PHOTOS = { analyser: analyzeDepotPhotos, resultat: () => dernier && dernier.res };
})();
