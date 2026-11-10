/* Immo360 NC — « Diffuser sur les réseaux » depuis Mes annonces
 * Kit prêt à publier : visuel carré 1080 × 1080 (photo, prix, lieu) à télécharger, et textes Facebook,
 * Instagram (avec mots-clés) et WhatsApp. Un modèle s'affiche tout de suite ; l'IA (/api/social) le
 * remplace dès qu'elle répond. Rien n'est publié automatiquement : la personne copie et publie elle-même.
 */
(function () {
  'use strict';

  const E = s => String(s == null ? '' : s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const M = n => n >= 1e6 ? (Math.round(n / 1e5) / 10).toLocaleString('fr-FR') + ' M F' : Math.round(n || 0).toLocaleString('fr-FR') + ' F';
  const lieuDe = a => [a.quartier, a.ville].filter(Boolean).filter((x, i, l) => l.indexOf(x) === i).join(', ');

  function trouver(id) {
    const m = window.IMMO_ANN ? IMMO_ANN.mine().find(x => x.id === id) : null;
    return m || (typeof BIENS_DATA !== 'undefined' ? BIENS_DATA.find(x => x.id === id) : null);
  }

  /* ---------- Modèle immédiat (sans IA) ---------- */
  function modele(a) {
    const l = lieuDe(a), f = (a.features || []).slice(0, 5);
    const tete = `${a.type || 'Bien'}${a.surface ? ' de ' + a.surface + ' m²' : ''} à ${l}${a.prix ? ' — ' + M(a.prix) : ''}`;
    return {
      facebook: `À VENDRE : ${tete}\n${[a.pieces ? '- ' + a.pieces + ' pièces' + (a.chambres ? ', ' + a.chambres + ' chambres' : '') : ''].concat(f.map(x => '- ' + x)).filter(Boolean).join('\n')}\nContact en message privé ou sur Immo360.`,
      instagram: `${tete}.${f.length ? ' ' + f.join(', ') + '.' : ''} Toutes les photos et la visite vidéo sur Immo360.`,
      hashtags: ['#immobiliernc', '#nouvellecaledonie', '#' + String(a.ville || 'noumea').toLowerCase().normalize('NFD').replace(/[^a-z]/g, ''), '#avendre', '#' + String(a.type || 'maison').toLowerCase().normalize('NFD').replace(/[^a-z]/g, '')],
      whatsapp: `${tete}. Annonce complète sur Immo360 NC.`
    };
  }

  /* ---------- Visuel carré ---------- */
  function charger(src) { return new Promise(ok => { if (!src) return ok(null); const i = new Image(); i.onload = () => ok(i); i.onerror = () => ok(null); i.src = src; }); }
  async function visuel(a, canvas) {
    const c = canvas.getContext('2d'), W = 1080;
    canvas.width = W; canvas.height = W;
    let src = a.thumb || a.photoUrl;
    try { if (window.IMMO_ANN && IMMO_ANN.photosFor) { const ph = await IMMO_ANN.photosFor(a.id); if (ph && ph[0]) src = ph[0]; } } catch (_) { /* miniature */ }
    const img = await charger(src);
    if (img) { const k = Math.max(W / img.width, W / img.height); c.drawImage(img, (W - img.width * k) / 2, (W - img.height * k) / 2, img.width * k, img.height * k); }
    else { const g = c.createLinearGradient(0, 0, W, W); g.addColorStop(0, '#0B3954'); g.addColorStop(1, '#35C3BC'); c.fillStyle = g; c.fillRect(0, 0, W, W); }
    const g2 = c.createLinearGradient(0, W * 0.45, 0, W); g2.addColorStop(0, 'rgba(7,45,66,0)'); g2.addColorStop(1, 'rgba(7,45,66,.92)'); c.fillStyle = g2; c.fillRect(0, W * 0.45, W, W * 0.55);
    // étiquette
    c.fillStyle = '#fff'; c.beginPath(); c.roundRect ? c.roundRect(48, 48, 230, 64, 14) : c.rect(48, 48, 230, 64); c.fill();
    c.fillStyle = '#0B3954'; c.font = '700 34px "Source Sans 3", system-ui, sans-serif'; c.textBaseline = 'middle'; c.fillText('À VENDRE', 72, 81);
    // textes
    c.textBaseline = 'alphabetic'; c.fillStyle = '#fff';
    c.font = '700 92px "Source Sans 3", system-ui, sans-serif'; c.fillText(a.prix ? M(a.prix) : 'Prix sur demande', 60, W - 230);
    c.font = '600 46px "Source Sans 3", system-ui, sans-serif';
    const ligne = `${a.type || 'Bien'}${a.surface ? ' · ' + a.surface + ' m²' : ''}${a.pieces && a.type !== 'Terrain' ? ' · ' + a.pieces + ' p.' : ''}`;
    c.fillText(ligne, 60, W - 160);
    c.font = '400 40px "Source Sans 3", system-ui, sans-serif'; c.fillStyle = 'rgba(255,255,255,.9)'; c.fillText(lieuDe(a), 60, W - 105);
    c.font = '700 36px "Source Sans 3", system-ui, sans-serif'; c.fillStyle = '#9BEAE3'; c.textAlign = 'right'; c.fillText('Immo360 NC', W - 60, W - 105); c.textAlign = 'left';
  }

  /* ---------- Fenêtre ---------- */
  let cur = null;
  function remplir(t, src) {
    const box = document.getElementById('soc-mod'); if (!box) return;
    box.querySelector('[data-t="facebook"]').value = t.facebook;
    box.querySelector('[data-t="instagram"]').value = t.instagram + (t.hashtags.length ? '\n\n' + t.hashtags.join(' ') : '');
    box.querySelector('[data-t="whatsapp"]').value = t.whatsapp;
    box.querySelector('.soc-src').textContent = src;
    const wa = box.querySelector('#soc-wa'); if (wa) wa.href = 'https://wa.me/?text=' + encodeURIComponent(t.whatsapp);
  }
  async function ouvrir(id) {
    const a = trouver(id); if (!a) return;
    fermer();
    cur = a;
    const d = document.createElement('div'); d.id = 'soc-mod'; d.className = 'soc-mod'; d.setAttribute('role', 'dialog'); d.setAttribute('aria-modal', 'true'); d.setAttribute('aria-label', 'Diffuser sur les réseaux');
    d.innerHTML = `<div class="soc-in">
      <div class="soc-h"><b>Diffuser sur les réseaux</b><button type="button" class="soc-x" aria-label="Fermer">×</button></div>
      <p class="soc-lead">Téléchargez le visuel, copiez le texte, puis publiez-le dans les groupes immobiliers de Nouméa, sur votre page ou en story.</p>
      <div class="soc-g">
        <div><canvas id="soc-cv" class="soc-cv" aria-label="Visuel de l'annonce"></canvas><button type="button" class="btn btn-gold btn-full btn-sm" id="soc-dl">Télécharger le visuel</button></div>
        <div>
          <div class="soc-tabs" role="tablist"><button type="button" class="on" data-tab="facebook">Facebook</button><button type="button" data-tab="instagram">Instagram</button><button type="button" data-tab="whatsapp">WhatsApp</button></div>
          ${['facebook', 'instagram', 'whatsapp'].map((k, i) => `<div class="soc-p" data-p="${k}"${i ? ' hidden' : ''}><textarea data-t="${k}" rows="10" aria-label="Texte ${k}"></textarea>
            <div class="soc-acts"><button type="button" class="btn btn-sm btn-outline" data-copy="${k}">Copier le texte</button>${k === 'whatsapp' ? '<a class="btn btn-sm btn-gold" id="soc-wa" target="_blank" rel="noopener">Envoyer sur WhatsApp</a>' : ''}</div></div>`).join('')}
          <p class="soc-src"></p>
        </div>
      </div></div>`;
    document.body.appendChild(d);
    d.addEventListener('click', ev => {
      if (ev.target === d || ev.target.closest('.soc-x')) return fermer();
      const t = ev.target.closest('[data-tab]');
      if (t) { d.querySelectorAll('[data-tab]').forEach(x => x.classList.toggle('on', x === t)); d.querySelectorAll('[data-p]').forEach(p => { p.hidden = p.dataset.p !== t.dataset.tab; }); }
      const cp = ev.target.closest('[data-copy]');
      if (cp) { const ta = d.querySelector(`[data-t="${cp.dataset.copy}"]`); ta.select(); (navigator.clipboard ? navigator.clipboard.writeText(ta.value) : Promise.reject()).catch(() => document.execCommand && document.execCommand('copy')); cp.textContent = 'Copié !'; setTimeout(() => { cp.textContent = 'Copier le texte'; }, 1500); }
      if (ev.target.closest('#soc-dl')) { const cv = d.querySelector('#soc-cv'); const l = document.createElement('a'); l.download = 'immo360-' + (a.ref || a.id) + '.jpg'; l.href = cv.toDataURL('image/jpeg', 0.9); l.click(); }
    });
    document.addEventListener('keydown', echap);
    d.querySelector('.soc-x').focus();
    remplir(modele(a), 'Modèle prêt à l\'emploi. L\'IA rédige une version personnalisée…');
    visuel(a, d.querySelector('#soc-cv'));
    try {
      const r = await fetch('/api/social', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ titre: a.titre, type: a.type, lieu: lieuDe(a), surface: a.surface, pieces: a.pieces, chambres: a.chambres, prix: a.prix, features: a.features, desc: a.desc || a.description }) });
      const t = await r.json();
      if (cur !== a) return;
      if (!r.ok || t.error) throw new Error(t.error || 'indisponible');
      remplir(t, 'Textes rédigés par l\'IA à partir de votre annonce. Relisez-les avant de publier.');
    } catch (e) { if (cur === a) document.querySelector('#soc-mod .soc-src').textContent = 'Modèle prêt à l\'emploi (rédaction IA indisponible : ' + e.message + ').'; }
  }
  function echap(e) { if (e.key === 'Escape') fermer(); }
  function fermer() { const d = document.getElementById('soc-mod'); if (d) d.remove(); cur = null; document.removeEventListener('keydown', echap); }

  document.addEventListener('click', e => { const b = e.target.closest && e.target.closest('[data-social]'); if (b) ouvrir(+b.dataset.social); });
  window.IMMO_SOCIAL = { ouvrir, fermer, modele };
})();
