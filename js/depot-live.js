/* Immo360 NC — Dépôt d'annonce : aperçu en direct et score de finition
 * À côté du formulaire (en bas de l'écran sur mobile) :
 *  - l'annonce telle que les acheteurs la verront, mise à jour à chaque saisie ou case cochée ;
 *  - un pourcentage de finition avec un niveau (Brouillon → Annonce coup de cœur) ;
 *  - les prochaines actions qui rapportent le plus de points, cliquables.
 * Tout est calculé dans le navigateur : rien n'est envoyé.
 */
(function () {
  'use strict';

  const $ = id => document.getElementById(id);
  const val = id => ($(id) && $(id).value || '').trim();
  const num = id => parseInt(val(id), 10) || 0;
  const esc = s => String(s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const photos = () => (typeof depotPhotos !== 'undefined' && Array.isArray(depotPhotos)) ? depotPhotos : [];
  const prestas = () => [...document.querySelectorAll('#panel-depot input[id^="df-"]:checked')].map(c => (c.closest('label')?.textContent || '').trim()).filter(Boolean);
  const sansPieces = () => /Terrain|Local/.test(val('d-type'));
  const reduit = () => window.matchMedia && matchMedia('(prefers-reduced-motion: reduce)').matches;

  /* ---------- Barème de finition (100 points) ---------- */
  const ITEMS = [
    { k: 'type', pts: 5, lbl: 'Choisir le type de bien', step: 1, ok: () => !!val('d-type') },
    { k: 'lieu', pts: 5, lbl: 'Indiquer la commune et le quartier', step: 1, f: 'd-quartier', ok: () => !!(val('d-ville') && val('d-quartier')) },
    { k: 'surface', pts: 8, lbl: 'Indiquer la surface habitable', step: 1, f: 'd-surface', ok: () => num('d-surface') > 0 },
    { k: 'pieces', pts: 4, lbl: 'Indiquer le nombre de pièces', step: 1, f: 'd-pieces', ok: () => sansPieces() || num('d-pieces') > 0 },
    { k: 'chambres', pts: 3, lbl: 'Indiquer le nombre de chambres', step: 1, f: 'd-chambres', ok: () => sansPieces() || num('d-chambres') > 0 },
    { k: 'photo1', pts: 8, lbl: 'Ajouter une première photo', step: 2, ok: () => photos().length >= 1 },
    { k: 'photo5', pts: 7, lbl: 'Ajouter au moins 5 photos', step: 2, ok: () => photos().length >= 5 },
    { k: 'photo10', pts: 5, lbl: 'Aller jusqu\'à 10 photos', step: 2, ok: () => photos().length >= 10 },
    { k: 'video', pts: 3, lbl: 'Garder la visite vidéo (2 photos minimum)', step: 2, ok: () => !!($('d-video') && $('d-video').checked) && photos().length >= 2 },
    { k: 'prix', pts: 10, lbl: 'Fixer le prix', step: 3, f: 'd-prix', ok: () => num('d-prix') >= 100000 },
    { k: 'titre', pts: 4, lbl: 'Donner un titre', step: 4, f: 'd-titre', ok: () => val('d-titre').length >= 10 },
    { k: 'presta3', pts: 6, lbl: 'Cocher au moins 3 prestations', step: 4, f: 'df-vue-mer', ok: () => prestas().length >= 3 },
    { k: 'presta6', pts: 4, lbl: 'Cocher 6 prestations ou plus', step: 4, f: 'df-vue-mer', ok: () => prestas().length >= 6 },
    { k: 'desc', pts: 8, lbl: 'Écrire une description (150 caractères)', step: 4, f: 'd-desc', ok: () => val('d-desc').length >= 150 },
    { k: 'desc2', pts: 6, lbl: 'Détailler la description (400 caractères)', step: 4, f: 'd-desc', ok: () => val('d-desc').length >= 400 },
    { k: 'etat', pts: 3, lbl: 'Préciser l\'état général', step: 4, f: 'd-etat', ok: () => !!val('d-etat') },
    { k: 'annee', pts: 2, lbl: 'Indiquer l\'année de construction', step: 4, f: 'd-annee', ok: () => num('d-annee') > 1800 },
    { k: 'dpe', pts: 3, lbl: 'Renseigner le diagnostic énergétique', step: 4, f: 'd-dpe', ok: () => !!val('d-dpe') },
    { k: 'nom', pts: 3, lbl: 'Indiquer le nom affiché', step: 5, f: 'd-contact-nom', ok: () => !!val('d-contact-nom') },
    { k: 'tel', pts: 3, lbl: 'Indiquer un téléphone', step: 5, f: 'd-contact-tel', ok: () => val('d-contact-tel').replace(/\D/g, '').length >= 6 }
  ];
  const NIVEAUX = [
    { min: 0, nom: 'Brouillon', txt: 'C\'est parti ! Chaque information ajoutée rend votre annonce plus attirante.' },
    { min: 30, nom: 'Bien parti', txt: 'Bon début. Les photos et le prix font le plus de différence.' },
    { min: 60, nom: 'Belle annonce', txt: 'Votre annonce prend forme. Encore quelques détails !' },
    { min: 85, nom: 'Presque parfaite', txt: 'Plus que quelques points pour une annonce complète.' },
    { min: 100, nom: 'Annonce coup de cœur', txt: 'Bravo, votre annonce est complète : c\'est ce que les acheteurs préfèrent.' }
  ];
  const niveau = s => NIVEAUX.filter(n => s >= n.min).pop();

  function score() {
    let s = 0; const manque = [];
    ITEMS.forEach(it => { let ok = false; try { ok = it.ok(); } catch (_) { /* champ absent */ } if (ok) s += it.pts; else manque.push(it); });
    return { s: Math.min(100, s), manque };
  }

  /* ---------- Rendu ---------- */
  let maxStep = 1, last = -1, lastNiv = '', sig = '', vus = {};
  const C = 2 * Math.PI * 34;

  function squelette() {
    const box = $('dp-live'); if (!box || box.dataset.ok) return box;
    box.dataset.ok = '1';
    box.innerHTML = `
      <button type="button" class="dpl-bar" aria-expanded="false" aria-controls="dpl-body">
        <span class="dpl-mini"><svg viewBox="0 0 80 80" aria-hidden="true"><circle cx="40" cy="40" r="34" class="dpl-trk"/><circle cx="40" cy="40" r="34" class="dpl-arc"/></svg></span>
        <span class="dpl-bar-t"><b class="dpl-pct-m">0 %</b> <span class="dpl-niv-m">Brouillon</span></span>
        <span class="dpl-bar-a">Voir l'aperçu</span>
      </button>
      <div class="dpl-body" id="dpl-body">
        <div class="dpl-score">
          <div class="dpl-ring"><svg viewBox="0 0 80 80" aria-hidden="true"><circle cx="40" cy="40" r="34" class="dpl-trk"/><circle cx="40" cy="40" r="34" class="dpl-arc"/></svg><b class="dpl-pct" aria-live="polite">0 %</b><i class="dpl-gain" aria-hidden="true"></i><span class="dpl-fx" aria-hidden="true"></span></div>
          <div><div class="dpl-niv">Brouillon</div><p class="dpl-niv-t"></p></div>
        </div>
        <p class="dpl-h">Votre annonce en direct</p>
        <article class="dpl-card">
          <div class="dpl-ph"></div>
          <div class="dpl-b">
            <div class="dpl-prix"></div><div class="dpl-t"></div><div class="dpl-l"></div>
            <div class="dpl-facts"></div><div class="dpl-chips"></div><p class="dpl-d"></p>
          </div>
        </article>
        <div class="dpl-next"></div>
      </div>`;
    box.querySelector('.dpl-bar').addEventListener('click', () => {
      const o = box.classList.toggle('open');
      box.querySelector('.dpl-bar').setAttribute('aria-expanded', String(o));
      box.querySelector('.dpl-bar-a').textContent = o ? 'Fermer' : 'Voir l\'aperçu';
    });
    box.addEventListener('click', e => {
      const b = e.target.closest('[data-go]'); if (!b) return;
      const it = ITEMS.find(x => x.k === b.dataset.go); if (it) aller(it);
    });
    return box;
  }

  // Ligne factice animée tant que l'information manque
  const vide = (w, txt) => `<span class="dpl-sk" style="width:${w}">${txt ? '<em>' + esc(txt) + '</em>' : ''}</span>`;

  function rendu() {
    const box = squelette(); if (!box) return;
    maxStep = Math.max(maxStep, window.depotStep || 1);
    const ph = photos(), pr = prestas(), loc = val('d-transaction') === 'location';
    const prix = num('d-prix'), titre = val('d-titre'), desc = val('d-desc');
    const lieu = [val('d-quartier') !== 'Autre' ? val('d-quartier') : '', val('d-ville')].filter(Boolean).filter((x, i, a) => a.indexOf(x) === i).join(', ');
    const etat = { s: score(), ph: ph.map(p => p.url).join('|'), pr: pr.join('|'), prix, titre, desc, lieu, t: val('d-type'), su: val('d-surface'), pi: val('d-pieces'), ch: val('d-chambres'), dpe: val('d-dpe'), loc, step: window.depotStep || 1, o: box.classList.contains('open') };
    const ns = JSON.stringify(etat); if (ns === sig) return; sig = ns;
    const { s, manque } = etat.s;

    // Score et niveau
    box.querySelectorAll('.dpl-arc').forEach(a => { a.style.strokeDasharray = C; a.style.strokeDashoffset = C * (1 - s / 100); });
    box.querySelector('.dpl-pct').textContent = s + ' %'; box.querySelector('.dpl-pct-m').textContent = s + ' %';
    const n = niveau(s);
    box.querySelector('.dpl-niv').textContent = n.nom; box.querySelector('.dpl-niv-m').textContent = n.nom;
    box.querySelector('.dpl-niv-t').textContent = n.txt;
    box.dataset.niv = String(NIVEAUX.indexOf(n));
    if (last >= 0 && s > last) gain(box, s - last, lastNiv && lastNiv !== n.nom);
    last = s; lastNiv = n.nom;

    // Photo principale
    const zone = box.querySelector('.dpl-ph');
    const badges = `<span class="dpl-tr">${loc ? 'À louer' : 'À vendre'}</span>${etat.dpe ? `<span class="dpl-dpe dpe-${esc(etat.dpe)}">DPE ${esc(etat.dpe)}</span>` : ''}${ph.length > 1 ? `<span class="dpl-nb">${ph.length} photos</span>` : ''}`;
    zone.innerHTML = ph.length
      ? `<img src="${esc(ph[0].url)}" alt="Photo principale">${badges}`
      : `<div class="dpl-ph0"><svg class="i" aria-hidden="true"><use href="#i-camera"/></svg><span>Votre photo principale ici</span></div>${badges}`;

    // Texte de l'annonce
    set(box, '.dpl-prix', prix >= 100000 ? esc(typeof conv === 'function' ? conv(prix) : prix.toLocaleString('fr-FR') + ' F') + (loc ? ' <small>/ mois</small>' : '') : vide('46%', 'Prix'), 'prix', prix);
    set(box, '.dpl-t', titre ? esc(titre) : vide('88%', 'Titre de l\'annonce'), 'titre', titre);
    set(box, '.dpl-l', lieu ? esc(lieu) : vide('50%'), 'lieu', lieu);
    const facts = [etat.t, num('d-surface') ? num('d-surface') + ' m²' : '', !sansPieces() && num('d-pieces') ? num('d-pieces') + ' pièces' : '', !sansPieces() && num('d-chambres') ? num('d-chambres') + ' ch.' : ''].filter(Boolean);
    set(box, '.dpl-facts', facts.length ? facts.map(f => `<span>${esc(f)}</span>`).join('') : vide('70%', 'Type, surface, pièces'), 'facts', facts.join());
    set(box, '.dpl-chips', pr.length ? pr.slice(0, 6).map(p => `<span>${esc(p)}</span>`).join('') + (pr.length > 6 ? `<span class="plus">+${pr.length - 6}</span>` : '') : vide('62%', 'Prestations'), 'pr', pr.join());
    set(box, '.dpl-d', desc ? esc(desc.length > 260 ? desc.slice(0, 260).replace(/\s+\S*$/, '') + '…' : desc) : vide('100%', 'Description') + vide('92%') + vide('60%'), 'desc', desc);

    // Prochaines actions (les plus rentables d'abord)
    const next = box.querySelector('.dpl-next');
    if (!manque.length) { next.innerHTML = '<p class="dpl-done">Tout est rempli. Il ne reste qu\'à publier !</p>'; return; }
    const top = manque.slice().sort((a, b) => b.pts - a.pts || a.step - b.step).slice(0, 3);
    next.innerHTML = `<p class="dpl-h">Pour gagner des points</p><ul>${top.map(it => {
      const ok = it.step <= maxStep;
      return `<li>${ok ? `<button type="button" data-go="${it.k}">` : '<span>'}<b>+${it.pts} %</b> ${esc(it.lbl)}${ok ? '</button>' : `<small>étape ${it.step}</small></span>`}</li>`;
    }).join('')}</ul>${manque.length > 3 ? `<p class="dpl-more">${manque.length - 3} autre${manque.length > 4 ? 's' : ''} conseil${manque.length > 4 ? 's' : ''} ensuite</p>` : ''}`;
  }

  // Remplace le contenu ; signale d'un éclair la donnée qui vient d'apparaître ou de changer
  function set(box, sel, html, k, v) {
    const el = box.querySelector(sel); if (!el) return;
    el.innerHTML = html;
    const avant = vus[k]; vus[k] = v;
    if (avant !== undefined && v && avant !== v && !reduit()) { el.classList.remove('dpl-flash'); void el.offsetWidth; el.classList.add('dpl-flash'); }
  }

  function gain(box, d, levelUp) {
    if (reduit()) return;
    const g = box.querySelector('.dpl-gain'); if (g) { g.textContent = '+' + d + ' %'; g.classList.remove('on'); void g.offsetWidth; g.classList.add('on'); }
    const bar = box.querySelector('.dpl-bar'); if (bar) { bar.classList.remove('pop'); void bar.offsetWidth; bar.classList.add('pop'); }
    if (levelUp) {
      const fx = box.querySelector('.dpl-fx'); if (!fx) return;
      fx.innerHTML = Array.from({ length: 14 }, (_, i) => `<i style="--a:${i * 360 / 14}deg;--d:${(i % 3) * 60}ms"></i>`).join('');
      fx.classList.remove('on'); void fx.offsetWidth; fx.classList.add('on');
    }
  }

  // Aller au champ concerné (sans sauter une étape pas encore validée)
  function aller(it) {
    const cur = window.depotStep || 1;
    if (it.step !== cur && typeof goDepotStep === 'function') goDepotStep(it.step);
    const f = it.f && $(it.f);
    if (f) {
      const d = f.closest('details'); if (d) d.open = true;
      const cible = f.closest('.dp-pg') || f;
      setTimeout(() => { cible.scrollIntoView({ block: 'center', behavior: reduit() ? 'auto' : 'smooth' }); try { f.focus({ preventScroll: true }); } catch (_) { /* ignoré */ } }, 60);
    }
    const box = $('dp-live'); if (box && box.classList.contains('open') && matchMedia('(max-width: 999px)').matches) box.querySelector('.dpl-bar').click();
  }

  /* ---------- Branchements ---------- */
  let timer = null;
  const plus_tard = () => { clearTimeout(timer); timer = setTimeout(rendu, 60); };
  function init() {
    const panel = $('panel-depot'); if (!panel || panel.dataset.live) return;
    panel.dataset.live = '1';
    panel.addEventListener('input', plus_tard);
    panel.addEventListener('change', plus_tard);
    panel.addEventListener('click', e => { if (e.target.closest('.dp-tile,.dp-seg button')) plus_tard(); });
    const grid = $('d-photos-grid'); if (grid) new MutationObserver(plus_tard).observe(grid, { childList: true });
    // Valeurs remplies par le programme (titre proposé, rédaction IA, reprise de l'estimation…)
    setInterval(() => { if (panel.offsetParent !== null) rendu(); }, 1200);
    rendu();
  }
  const g0 = window.goDepotStep;
  if (typeof g0 === 'function') {
    window.goDepotStep = function (n) { const r = g0.apply(this, arguments); maxStep = Math.max(maxStep, window.depotStep || n || 1); plus_tard(); return r; };
  }
  window.IMMO_LIVE = { score: () => score().s, refresh: () => { sig = ''; rendu(); } };
  if (document.readyState !== 'loading') init(); else document.addEventListener('DOMContentLoaded', init);
})();
