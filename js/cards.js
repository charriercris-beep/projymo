/* Immo360 NC — Carte d'annonce unique (accueil, liste des annonces, tableaux de bord)
 * Photo en grand, prix mis en avant, favoris en un clic : le modèle des grands portails
 * (Zillow, Rightmove, Idealista, realestate.com.au), aux couleurs Immo360.
 * - IMMO_CARDS.html(b, {open})  → code HTML d'une carte (textes échappés)
 * - IMMO_CARDS.demoPhotos(list) → photos libres de droits sur les annonces de démonstration,
 *   marquées « Photo d'illustration » (les vraies annonces gardent leurs propres photos)
 * - IMMO_CARDS.fav(id, bouton)  → ajoute / retire un favori (mémorisé sur cet appareil)
 */
(function () {
  'use strict';

  const E = v => String(v == null ? '' : v).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const FKEY = 'immo360.fav.v1';

  /* ---------- Photos d'illustration (CC0, voir assets/demo/CREDITS.md) ---------- */
  const D = 'assets/demo/';
  const DEMO = {
    sejour: [D + 'sejour-clair.jpg', D + 'sejour-brique.jpg'],
    cuisine: [D + 'cuisine.jpg'],
    chambre: [D + 'chambre.jpg'],
    exterieur: [],
    terrain: []
  };
  // Choix de la photo selon le type de bien ; varié pour que deux annonces voisines ne se ressemblent pas
  function pickDemo(b, i) {
    const ext = DEMO.exterieur, inter = [].concat(DEMO.sejour, DEMO.cuisine, DEMO.chambre);
    if (b.type === 'Terrain') return (DEMO.terrain[0] || ext[i % (ext.length || 1)] || null);
    if ((b.type === 'Villa' || b.type === 'Maison') && ext.length) return ext[i % ext.length];
    return inter[i % inter.length];
  }
  function demoPhotos(list) {
    (list || []).forEach((b, i) => {
      if (!b || b._ann || b.photoUrl) return;
      const u = pickDemo(b, i);
      if (u) { b.photoUrl = u; b.illustration = true; }
    });
    return list;
  }

  /* ---------- Favoris (sur cet appareil) ---------- */
  function favs() { try { return new Set(JSON.parse(localStorage.getItem(FKEY) || '[]').map(String)); } catch (_) { return new Set(); } }
  function isFav(id) { return favs().has(String(id)); }
  function fav(id, btn) {
    const s = favs(), k = String(id);
    if (s.has(k)) s.delete(k); else s.add(k);
    try { localStorage.setItem(FKEY, JSON.stringify([...s])); } catch (_) { /* stockage indisponible */ }
    const on = s.has(k);
    document.querySelectorAll('.pc-fav[data-id="' + CSS.escape(k) + '"]').forEach(b => { b.setAttribute('aria-pressed', on); b.title = on ? 'Retirer des favoris' : 'Ajouter aux favoris'; });
    if (btn) btn.blur && btn.blur();
    return on;
  }

  /* ---------- Formats ---------- */
  function sym() { return (typeof S !== 'undefined' && S.sym) || 'F'; }
  function rate() { try { return (RATES[S.curr] || 1); } catch (_) { return 1; } }
  function price(x) { const v = Math.round((Number(x) || 0) * rate()); return v ? v.toLocaleString('fr-FR') + ' ' + sym() : 'Prix sur demande'; }
  function specs(b) {
    const p = [];
    if (b.type !== 'Terrain' && Number(b.chambres) > 0) p.push('<b>' + Number(b.chambres) + '</b> ch.');
    else if (b.type !== 'Terrain' && Number(b.pieces) > 0) p.push('<b>' + Number(b.pieces) + '</b> p.');
    if (Number(b.surface) > 0) p.push('<b>' + Number(b.surface) + '</b> m²' + (b.type === 'Terrain' ? ' de terrain' : ''));
    p.push(E(b.type || 'Bien'));
    return p.join('<span aria-hidden="true"> · </span>');
  }
  const lieu = b => [b.quartier, b.ville].filter(Boolean).filter((x, i, a) => a.indexOf(x) === i).map(E).join(', ');

  /* ---------- Carte ---------- */
  function html(b, o) {
    o = o || {};
    const id = Number(b.id), open = (o.open || 'openLandingBien') + '(' + id + ')';
    const on = isFav(id);
    const badge = b.statut && b.statut !== 'En vente' ? `<span class="pc-badge alt">${E(b.statut)}</span>`
      : b._ann ? '<span class="pc-badge">Nouvelle annonce</span>' : '';
    const ph = b.photoUrl
      ? `<img src="${E(b.photoUrl)}" alt="" loading="lazy" onerror="this.parentNode.classList.add('none');this.remove()">`
      : '';
    return `<article class="pc${o.compact ? ' sm' : ''}">
  <div class="pc-ph${b.photoUrl ? '' : ' none'}">${ph}<svg class="i pc-noimg" aria-hidden="true"><use href="#i-home"/></svg>${badge}${b.illustration ? '<span class="pc-ill">Photo d\'illustration</span>' : ''}</div>
  <div class="pc-bd">
    <div class="pc-pr">${price(b.prix)}</div>
    <div class="pc-sp">${specs(b)}</div>
    <div class="pc-ti"><button type="button" class="pc-hit" onclick="${open}">${E(b.titre || ((b.type || 'Bien') + ' ' + (b.quartier || '')))}</button></div>
    <div class="pc-lo"><svg class="i" aria-hidden="true"><use href="#i-pin"/></svg>${lieu(b)}</div>
  </div>
  <button type="button" class="pc-fav" data-id="${id}" aria-pressed="${on}" aria-label="Favori : ${E(b.titre || '')}" title="${on ? 'Retirer des favoris' : 'Ajouter aux favoris'}" onclick="event.stopPropagation();IMMO_CARDS.fav(${id},this)"><svg class="i" aria-hidden="true"><use href="#i-heart"/></svg></button>
</article>`;
  }
  function grid(list, o) {
    if (!list || !list.length) return `<div class="pc-empty"><svg class="i" aria-hidden="true"><use href="#i-search"/></svg><b>Aucune annonce pour ces critères</b><span>Élargissez le lieu ou le budget.</span></div>`;
    return list.map(b => html(b, o)).join('');
  }

  window.IMMO_CARDS = { html, grid, demoPhotos, fav, isFav, favs, price, DEMO };
})();
