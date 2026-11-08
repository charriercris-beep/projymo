/* Immo360 NC — Parcours de dépôt d'annonce en 5 étapes courtes
 * 1. Le bien (type, vente/location, commune, quartier, surface, pièces) · 2. Photos · 3. Prix (repère du
 * marché en direct) · 4. Présentation (titre proposé, description, points forts, détails facultatifs)
 * · 5. Contact, aperçu et publication.
 * Erreurs affichées dans la page (pas de fenêtre d'alerte), champ concerné mis en évidence.
 * Remplace goDepotStep / validateStep1 / validateStep3 / updateDepotEstim et ajoute updateQuartiers
 * (appelée par le formulaire mais jamais définie auparavant).
 * Dépend des globales : NC_PM2, IMMO_EST, APP_STATE, depotPhotos, buildDepotPreview, conv.
 */
(function () {
  'use strict';

  const $ = id => document.getElementById(id);
  const val = id => ($(id) && $(id).value || '').trim();
  const N = 5;

  // Quartiers par commune (repris du barème NC_PM2) ; ailleurs, la commune elle-même
  const QUARTIERS = {
    'Nouméa': ['Anse Vata', 'Baie des Citrons', 'Val Plaisance', 'Tina', 'Faubourg Blanchot', 'Centre Ville', 'Motor Pool', 'Magenta', 'Ouémo', 'Trianon', 'Montravel', 'Tuband', 'Rivière Salée', 'Vallée du Tir', 'Normandie', '7ème km', 'Portes de Fer', 'Ducos', 'Receiving', 'Kaméré'],
    'Dumbéa': ['Dumbéa sur Mer', 'Koutio', 'Katiramona', 'Savannah', 'Tonghoué', 'Dumbéa Centre', 'Dumbéa Nord', 'Pahéa'],
    'Mont-Dore': ['Mont-Dore Centre', 'Boulari', 'Plum', 'Robinson'],
    'Païta': ['Païta Centre']
  };
  function updateQuartiers() {
    const v = val('d-ville') || 'Nouméa', q = $('d-quartier'); if (!q) return;
    const list = QUARTIERS[v] || [v];
    const cur = q.value;
    q.innerHTML = list.map(x => `<option>${x.replace(/[<>&"]/g, '')}</option>`).join('') + (QUARTIERS[v] ? '<option value="Autre">Autre quartier</option>' : '');
    if (list.includes(cur)) q.value = cur;
    hint();
  }

  /* ---------- Erreurs dans la page ---------- */
  function err(step, msg, fieldId) {
    const box = $('depot-step-' + step)?.querySelector('.dp-err');
    document.querySelectorAll('#panel-depot [aria-invalid]').forEach(e => e.removeAttribute('aria-invalid'));
    if (!box) return false;
    if (!msg) { box.style.display = 'none'; box.textContent = ''; return true; }
    box.textContent = msg; box.style.display = 'block';
    const f = fieldId && $(fieldId);
    if (f) { f.setAttribute('aria-invalid', 'true'); try { f.focus({ preventScroll: true }); } catch (_) { f.focus(); } }
    box.scrollIntoView({ block: 'center', behavior: 'smooth' });
    return false;
  }

  /* ---------- Navigation ---------- */
  function goDepotStep(n) {
    n = Math.max(1, Math.min(N, n));
    for (let i = 1; i <= N; i++) {
      const el = $('depot-step-' + i); if (el) el.style.display = i === n ? 'block' : 'none';
      const st = $('dstep-' + i); if (st) { st.classList.remove('active', 'done'); if (i < n) st.classList.add('done'); if (i === n) st.classList.add('active'); }
    }
    window.depotStep = n;
    if (n === 2) { photosHint(); videoPreview(); }
    if (n === 3) { hint(); updateDepotEstim(); }
    if (n === 4) autoTitle();
    if (n === 5) { prefillContact(); preview(); }
    const panel = $('panel-depot'); if (panel && panel.scrollIntoView) panel.scrollIntoView({ block: 'start' });
    window.scrollTo({ top: 0 });
  }
  function validateStep1() {
    if (!val('d-type')) return err(1, 'Choisissez le type de bien.');
    const s = parseInt(val('d-surface'), 10);
    if (!s || s <= 0) return err(1, 'Indiquez la surface habitable (en m²).', 'd-surface');
    err(1, ''); goDepotStep(2);
  }
  function validatePrix() {
    const p = parseInt(val('d-prix'), 10);
    if (!p || p <= 0) return err(3, 'Indiquez le prix demandé.', 'd-prix');
    if (p < 100000) return err(3, 'Le prix semble incomplet : saisissez-le en francs, par exemple 42 500 000.', 'd-prix');
    err(3, ''); goDepotStep(4);
  }
  function validatePresentation() {
    if (!val('d-titre')) return err(4, 'Donnez un titre à votre annonce.', 'd-titre');
    err(4, ''); goDepotStep(5);
  }

  /* ---------- Visite vidéo : aperçu en direct à partir des photos du dépôt ---------- */
  let vSig = '';
  function videoPreview() {
    const box = $('dp-video-prev'), help = $('dp-video-help'), on = $('d-video') && $('d-video').checked;
    const ph = (typeof depotPhotos !== 'undefined' ? depotPhotos : []);
    if (help) help.textContent = !on ? 'Pas de vidéo pour cette annonce.' : ph.length < 2 ? 'Ajoutez au moins 2 photos pour voir l\'aperçu de la vidéo.' : 'Aperçu : lancez la lecture pour voir la visite.';
    const sig = on ? ph.map(p => p.url).join('|') : '';
    if (sig === vSig || !box) return; vSig = sig;
    if (!on || ph.length < 2 || !window.IMMO_VISITE) { box.innerHTML = ''; return; }
    IMMO_VISITE.preview(box, ph, { titre: val('d-titre') || val('d-type') || 'Votre bien', sous: val('d-quartier') && val('d-quartier') !== 'Autre' ? val('d-quartier') : val('d-ville') });
  }

  /* ---------- Aides ---------- */
  function photosHint() { const b = $('dp-photos-next'); if (b) b.textContent = (typeof depotPhotos !== 'undefined' && depotPhotos.length) ? 'Continuer' : 'Continuer sans photo'; }
  let autoT = '';
  function autoTitle() {
    const t = $('d-titre'); if (!t) return;
    if (t.value.trim() && t.value !== autoT) return; // titre déjà personnalisé : on n'y touche pas
    const type = val('d-type'), p = parseInt(val('d-pieces'), 10), s = val('d-surface');
    const lieu = val('d-quartier') && val('d-quartier') !== 'Autre' ? val('d-quartier') : val('d-ville');
    const f = p && /Appartement|Maison|Villa/.test(type) ? ' F' + p : '';
    autoT = `${type || 'Bien'}${f} de ${s || '?'} m² — ${lieu}`;
    t.value = autoT;
  }
  function prefillContact() {
    const u = (typeof APP_STATE !== 'undefined' && APP_STATE.user) || {};
    if (!val('d-contact-nom') && u.nom && u.nom !== 'Demo') $('d-contact-nom').value = u.nom;
    if (!val('d-contact-email') && u.email && !/demo@/.test(u.email)) $('d-contact-email').value = u.email;
    if (!val('d-contact-tel') && u.tel) $('d-contact-tel').value = u.tel;
  }
  function preview() {
    try { if (typeof buildDepotPreview === 'function') buildDepotPreview(); } catch (_) { /* aperçu partiel */ }
    const em = $('dp-emoji');
    if (em && !(typeof depotPhotos !== 'undefined' && depotPhotos.length)) em.innerHTML = '<svg class="i" aria-hidden="true"><use href="#i-home"/></svg>';
    const b = $('dp-dpe-badge'); if (b && !val('d-dpe')) b.style.display = 'none'; else if (b) b.style.display = '';
  }
  // Repère de prix : moteur d'estimation (observatoire Immo360 ou barème calé sur les ventes 2025)
  function repere() {
    const s = parseInt(val('d-surface'), 10); if (!s || !window.IMMO_EST) return null;
    const e = IMMO_EST.pm2(val('d-quartier'), val('d-type'), val('d-ville'));
    return { e, s, mid: e.value * s, low: e.low * s, high: e.high * s };
  }
  const fmt = n => Math.round(n / 100000) / 10 >= 1 ? (Math.round(n / 100000) / 10).toLocaleString('fr-FR') + ' M F' : Math.round(n).toLocaleString('fr-FR') + ' F';
  function hint() {
    const h = $('dp-hint'); if (!h) return;
    const r = repere();
    if (!r) { h.innerHTML = 'Indiquez la surface à l\'étape 1 pour obtenir un repère de prix.'; return; }
    const type = (val('d-type') || 'bien').toLowerCase(), lieu = val('d-quartier') && val('d-quartier') !== 'Autre' ? val('d-quartier') : val('d-ville');
    h.innerHTML = `Pour un ${type} de ${r.s} m² à ${lieu}, les prix de vente se situent autour de <b>${fmt(r.mid)}</b> (entre ${fmt(r.low)} et ${fmt(r.high)}).<small>${r.e.source === 'observatoire' ? 'D\'après les annonces Immo360 du secteur, ramenées au prix de vente.' : 'D\'après notre barème, calé sur les ventes réellement conclues en 2025 (ISEE).'} Repère indicatif : l'état, la vue et les prestations font varier le prix.</small>`;
  }
  function updateDepotEstim() {
    const p = parseInt(val('d-prix'), 10), lis = $('dp-prix-lisible'), cmp = $('depot-estim-compare');
    if (lis) lis.textContent = p ? 'Soit ' + p.toLocaleString('fr-FR') + ' F' : '';
    const r = repere();
    if (!p || !r || !cmp) { if (cmp) cmp.style.display = 'none'; return; }
    const ecart = Math.round((p / r.mid - 1) * 100), de = $('depot-ecart');
    cmp.style.display = 'block';
    if ($('depot-prix-user')) $('depot-prix-user').textContent = conv(p);
    if ($('depot-prix-ia')) $('depot-prix-ia').textContent = conv(r.mid);
    if (de) {
      de.textContent = (ecart >= 0 ? '+' : '') + ecart + ' %' + (Math.abs(ecart) > 20 ? (ecart > 0 ? ' — prix élevé, la vente risque d\'être plus longue' : ' — prix bas, vérifiez votre saisie') : '');
      de.style.color = Math.abs(ecart) > 20 ? 'var(--red)' : Math.abs(ecart) > 10 ? 'var(--accent)' : 'var(--green)';
    }
  }

  /* ---------- Liaisons (une seule fois) ---------- */
  let bound = false;
  function init() {
    if (!bound && $('panel-depot')) {
      bound = true;
      document.querySelectorAll('#panel-depot .dp-tile').forEach(b => b.addEventListener('click', () => {
        document.querySelectorAll('#panel-depot .dp-tile').forEach(x => x.classList.toggle('on', x === b));
        $('d-type').value = b.dataset.type; err(1, ''); hint();
      }));
      document.querySelectorAll('#panel-depot .dp-seg button').forEach(b => b.addEventListener('click', () => {
        document.querySelectorAll('#panel-depot .dp-seg button').forEach(x => x.classList.toggle('on', x === b));
        $('d-transaction').value = b.dataset.tr;
      }));
      ['d-surface', 'd-quartier'].forEach(id => $(id) && $(id).addEventListener('input', hint));
      // L'aperçu vidéo suit les photos ajoutées ou retirées
      const grid = $('d-photos-grid'); if (grid) new MutationObserver(() => { if (window.depotStep === 2) videoPreview(); }).observe(grid, { childList: true });
      $('d-video') && $('d-video').addEventListener('change', () => { vSig = 'x'; videoPreview(); });
      $('d-quartier') && $('d-quartier').addEventListener('change', hint);
      updateQuartiers();
    }
    // rétablir l'état visuel des vignettes si le type a été rempli autrement
    const t = val('d-type'); document.querySelectorAll('#panel-depot .dp-tile').forEach(x => x.classList.toggle('on', x.dataset.type === t));
  }

  Object.assign(window, { goDepotStep, validateStep1, validateStep3: validatePrix, validatePrix, validatePresentation, updateQuartiers, updateDepotEstim });
  window.IMMO_PANELS = Object.assign(window.IMMO_PANELS || {}, { depot: () => init() });
  if (document.readyState !== 'loading') init(); else document.addEventListener('DOMContentLoaded', init);
  // Arrivée depuis l'estimation : informations reprises, on reste à l'étape 1 pour vérifier
  let fromEst = null;
  function fromEstimation(o) {
    fromEst = o; goDepotStep(1);
    const bx = $('dp-from-est');
    const lk = $('dp-est-link'); if (lk) lk.style.display = 'none';
    if (bx) { bx.style.display = 'block'; bx.innerHTML = `<b>Repris de votre estimation</b> : type, lieu, surface, prestations et prix (${(typeof conv === 'function' ? conv(Math.round(o.prix / 100000) * 100000) : '')}). Vérifiez puis continuez.`; }
  }
  window.IMMO_DEPOT = { QUARTIERS, repere, autoTitle, fromEstimation };
})();
