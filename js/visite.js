/* Immo360 NC — Visite virtuelle vidéo
 * Assemble les photos d'un bien en une visite animée : mouvement lent (zoom/panoramique), transitions,
 * légende par pièce, cartes d'ouverture et de fin, formats 16:9 / 9:16 / 1:1.
 * La visite reste sur le site : elle est publiée sur l'annonce et jouée en direct dans la fiche du bien
 * (canvas), sans fichier vidéo. Le même moteur de rendu sert à l'aperçu de l'éditeur et au lecteur.
 * Dépend des globales : esc, S (photos de l'estimation), APP_STATE, BIENS_DATA, IMMO_SYNC (facultatif).
 */
(function () {
  'use strict';

  const $ = id => document.getElementById(id);
  const E = v => (typeof esc === 'function' ? esc(v) : String(v == null ? '' : v));
  const PIECES = ['Extérieur', 'Façade', 'Jardin', 'Piscine', 'Terrasse', 'Vue', 'Entrée', 'Séjour', 'Salle à manger', 'Cuisine', 'Chambre', 'Chambre parentale', 'Salle de bain', 'Bureau', 'Buanderie', 'Garage', 'Autre'];
  const ORDRE = ['Façade', 'Extérieur', 'Jardin', 'Entrée', 'Séjour', 'Salle à manger', 'Cuisine', 'Terrasse', 'Vue', 'Chambre parentale', 'Chambre', 'Bureau', 'Salle de bain', 'Buanderie', 'Garage', 'Piscine', 'Autre'];
  const FORMATS = { '16:9': [1280, 720], '9:16': [720, 1280], '1:1': [1080, 1080] };
  const MAX_PHOTOS = 20, PUB_SIZE = 1024, PUB_QUALITY = 0.7, KEY = 'immo360.visites.v1';

  const st = {
    photos: [],            // { id, img, url, nom, piece, legende }
    format: '16:9', duree: 3.5, transition: 'fondu', mouvement: true,
    intro: { titre: '', sous: '', prix: '' }, outro: { contact: '', tel: '' }, filigrane: true,
    bienId: null, playing: false, t0: 0, tPause: 0, raf: 0
  };

  /* ---------- Chronologie ---------- */
  const INTRO = 2.5, OUTRO = 3, TRANS = 0.8;
  function timeline(V) {
    V = V || st; const segs = []; let t = 0;
    segs.push({ type: 'intro', start: t, end: t + INTRO }); t += INTRO;
    V.photos.forEach((p, i) => { segs.push({ type: 'photo', i, start: t, end: t + V.duree }); t += V.duree; });
    segs.push({ type: 'outro', start: t, end: t + OUTRO }); t += OUTRO;
    return { segs, total: t };
  }

  /* ---------- Rendu d'une image à l'instant t ---------- */
  function drawCover(ctx, img, W, H, k, dx, dy) {
    const s = Math.max(W / img.width, H / img.height) * k;
    const w = img.width * s, h = img.height * s;
    ctx.drawImage(img, (W - w) / 2 + dx * (w - W) / 2, (H - h) / 2 + dy * (h - H) / 2, w, h);
  }
  function drawPhoto(V, ctx, W, H, i, local, dur) {
    const p = V.photos[i]; if (!p || !p.img) return;
    const prog = Math.min(1, Math.max(0, local / dur));
    // mouvement lent : zoom avant/arrière et panoramique alternés selon la photo
    const zoomIn = i % 2 === 0, dir = [[-1, 0], [1, 0], [0, -1], [0, 1]][i % 4];
    const k = V.mouvement ? (zoomIn ? 1 + 0.12 * prog : 1.12 - 0.12 * prog) : 1;
    const pan = V.mouvement ? (prog - 0.5) * 0.6 : 0;
    drawCover(ctx, p.img, W, H, k, dir[0] * pan, dir[1] * pan);
    const txt = (p.legende || p.piece || '').trim();
    if (txt) {
      const fs = Math.round(Math.min(W, H) * 0.045), pad = fs * 0.7, a = Math.min(1, local / 0.5, (dur - local) / 0.4);
      ctx.save(); ctx.globalAlpha = Math.max(0, a);
      ctx.font = `600 ${fs}px "Source Sans 3", Arial, sans-serif`;
      const tw = ctx.measureText(txt).width, y = H - fs * 2.6;
      ctx.fillStyle = 'rgba(15,13,10,.62)'; roundRect(ctx, fs, y - fs - pad / 2, tw + pad * 2, fs + pad * 1.4, fs * 0.35); ctx.fill();
      ctx.fillStyle = '#0A7A84'; ctx.fillRect(fs, y - fs - pad / 2, Math.max(4, fs * 0.12), fs + pad * 1.4);
      ctx.fillStyle = '#fff'; ctx.fillText(txt, fs + pad + fs * 0.1, y + fs * 0.05);
      ctx.restore();
    }
  }
  function roundRect(ctx, x, y, w, h, r) { ctx.beginPath(); ctx.moveTo(x + r, y); ctx.arcTo(x + w, y, x + w, y + h, r); ctx.arcTo(x + w, y + h, x, y + h, r); ctx.arcTo(x, y + h, x, y, r); ctx.arcTo(x, y, x + w, y, r); ctx.closePath(); }
  function wrap(ctx, text, maxW) { const words = String(text).split(/\s+/), lines = []; let l = ''; words.forEach(w => { const t = l ? l + ' ' + w : w; if (ctx.measureText(t).width > maxW && l) { lines.push(l); l = w; } else l = t; }); if (l) lines.push(l); return lines; }
  function drawCard(V, ctx, W, H, kind, local, dur) {
    // fond : première (ouverture) ou dernière (fin) photo, floutée et assombrie
    const ref = kind === 'intro' ? V.photos[0] : V.photos[V.photos.length - 1];
    ctx.fillStyle = '#1C1A16'; ctx.fillRect(0, 0, W, H);
    if (ref && ref.img) { ctx.save(); ctx.filter = 'blur(14px) brightness(.45)'; drawCover(ctx, ref.img, W, H, 1.15, 0, 0); ctx.restore(); }
    const a = Math.min(1, local / 0.6, (dur - local) / 0.5); ctx.save(); ctx.globalAlpha = Math.max(0, a);
    const u = Math.min(W, H), cx = W / 2; ctx.textAlign = 'center'; ctx.fillStyle = '#fff';
    if (kind === 'intro') {
      ctx.font = `700 ${Math.round(u * 0.075)}px "Source Sans 3", Arial, sans-serif`;
      const lines = wrap(ctx, V.intro.titre || 'Visite du bien', W * 0.84);
      let y = H / 2 - (lines.length - 1) * u * 0.045 - u * 0.03;
      lines.forEach(l => { ctx.fillText(l, cx, y); y += u * 0.09; });
      ctx.font = `500 ${Math.round(u * 0.038)}px "Source Sans 3", Arial, sans-serif`; ctx.fillStyle = 'rgba(255,255,255,.82)';
      if (V.intro.sous) { ctx.fillText(V.intro.sous, cx, y + u * 0.01); y += u * 0.06; }
      if (V.intro.prix) { ctx.font = `700 ${Math.round(u * 0.05)}px "Source Sans 3", Arial, sans-serif`; ctx.fillStyle = '#C4EEEA'; ctx.fillText(V.intro.prix, cx, y + u * 0.04); }
    } else {
      ctx.font = `700 ${Math.round(u * 0.06)}px "Source Sans 3", Arial, sans-serif`;
      ctx.fillText('Envie de visiter ?', cx, H / 2 - u * 0.05);
      ctx.font = `500 ${Math.round(u * 0.04)}px "Source Sans 3", Arial, sans-serif`; ctx.fillStyle = 'rgba(255,255,255,.85)';
      if (V.outro.contact) ctx.fillText(V.outro.contact, cx, H / 2 + u * 0.04);
      if (V.outro.tel) { ctx.fillStyle = '#C4EEEA'; ctx.font = `700 ${Math.round(u * 0.05)}px "Source Sans 3", Arial, sans-serif`; ctx.fillText(V.outro.tel, cx, H / 2 + u * 0.12); }
    }
    ctx.restore(); ctx.textAlign = 'left';
  }
  function drawWatermark(V, ctx, W, H) {
    if (!V.filigrane) return;
    const fs = Math.round(Math.min(W, H) * 0.03); ctx.save(); ctx.globalAlpha = 0.85;
    ctx.font = `700 ${fs}px "Source Sans 3", Arial, sans-serif`; ctx.textAlign = 'right';
    ctx.fillStyle = '#fff'; const x = W - fs, y = fs * 1.7; ctx.fillText('360', x, y);
    const w360 = ctx.measureText('360').width; ctx.fillText('Immo', x - w360, y);
    ctx.fillStyle = '#0A7A84'; ctx.fillText('360', x, y); ctx.restore();
  }
  function render(ctx, W, H, t, V) {
    V = V || st; const { segs } = timeline(V);
    ctx.fillStyle = '#000'; ctx.fillRect(0, 0, W, H);
    const draw = (s, tt) => s.type === 'photo' ? drawPhoto(V, ctx, W, H, s.i, tt - s.start, s.end - s.start) : drawCard(V, ctx, W, H, s.type, tt - s.start, s.end - s.start);
    const idx = segs.findIndex(s => t >= s.start && t < s.end);
    const cur = segs[idx < 0 ? segs.length - 1 : idx];
    draw(cur, Math.min(t, cur.end - 0.001));
    // transition vers le segment suivant pendant les TRANS dernières secondes
    const next = segs[idx + 1];
    if (next && t > cur.end - TRANS) {
      const p = (t - (cur.end - TRANS)) / TRANS;
      ctx.save();
      if (V.transition === 'glisse') { ctx.translate(W * (1 - easeInOut(p)), 0); ctx.beginPath(); ctx.rect(0, 0, W, H); ctx.clip(); }
      else ctx.globalAlpha = easeInOut(p);
      draw(next, next.start + 0.001 + (t - (cur.end - TRANS)) * 0.2);
      ctx.restore();
    }
    drawWatermark(V, ctx, W, H);
  }
  const easeInOut = p => p < 0.5 ? 2 * p * p : 1 - Math.pow(-2 * p + 2, 2) / 2;

  /* ---------- Chargement des photos ---------- */
  function loadImage(url) { return new Promise((res, rej) => { const i = new Image(); i.onload = () => res(i); i.onerror = rej; i.src = url; }); }
  function guessPiece(name) {
    const n = (name || '').toLowerCase();
    const map = [['cuisin', 'Cuisine'], ['kitchen', 'Cuisine'], ['salon', 'Séjour'], ['sejour', 'Séjour'], ['séjour', 'Séjour'], ['living', 'Séjour'], ['chambre', 'Chambre'], ['bed', 'Chambre'], ['sdb', 'Salle de bain'], ['bain', 'Salle de bain'], ['bath', 'Salle de bain'], ['douche', 'Salle de bain'], ['piscine', 'Piscine'], ['pool', 'Piscine'], ['jardin', 'Jardin'], ['garden', 'Jardin'], ['terrasse', 'Terrasse'], ['vue', 'Vue'], ['facade', 'Façade'], ['façade', 'Façade'], ['ext', 'Extérieur'], ['garage', 'Garage'], ['bureau', 'Bureau'], ['entree', 'Entrée'], ['entrée', 'Entrée']];
    const f = map.find(([k]) => n.includes(k)); return f ? f[1] : 'Autre';
  }
  async function addFiles(files) {
    const list = [...files].filter(f => /^image\//.test(f.type)).slice(0, MAX_PHOTOS - st.photos.length);
    for (const f of list) {
      const url = URL.createObjectURL(f);
      try { const img = await loadImage(url); st.photos.push({ id: 'p' + Date.now() + Math.random().toString(36).slice(2, 6), img, url, nom: f.name, piece: guessPiece(f.name), legende: '' }); }
      catch (_) { URL.revokeObjectURL(url); }
    }
  }
  async function importEstimation() {
    const src = (typeof S !== 'undefined' && Array.isArray(S.photos)) ? S.photos : [];
    for (const p of src.slice(0, MAX_PHOTOS - st.photos.length)) {
      try { const img = await loadImage(p.url); st.photos.push({ id: 'p' + Date.now() + Math.random().toString(36).slice(2, 6), img, url: p.url, nom: p.name || '', piece: guessPiece(p.name), legende: '', shared: true }); } catch (_) { /* ignorée */ }
    }
  }
  function prefill() {
    const v = id => ($(id) && $(id).value || '').trim();
    if (!v('d-titre')) { if (!st.outro.contact) st.outro.contact = (typeof APP_STATE !== 'undefined' && APP_STATE.user?.nom) || ''; return; } // aucune annonce en cours de rédaction
    if (!st.intro.titre) st.intro.titre = v('d-titre');
    if (!st.intro.prix && v('d-prix')) st.intro.prix = (parseInt(v('d-prix'), 10) || 0).toLocaleString('fr-FR') + ' F';
    if (!st.intro.sous && v('d-quartier')) st.intro.sous = v('d-quartier');
    if (!st.outro.contact) st.outro.contact = v('d-contact-nom') || (typeof APP_STATE !== 'undefined' && APP_STATE.user?.nom) || '';
    if (!st.outro.tel) st.outro.tel = v('d-contact-tel');
  }

  /* ---------- Interface ---------- */
  function injectStyle() {
    if ($('vv-style')) return;
    const c = document.createElement('style'); c.id = 'vv-style';
    c.textContent = `
.vv-wrap{max-width:1180px;margin:0 auto}.vv-head h2{font-family:'Source Sans 3',sans-serif;font-size:24px;margin:0 0 4px}.vv-head p{color:var(--mid);font-size:13px;margin:0 0 18px}
.vv-grid{display:grid;grid-template-columns:1fr 380px;gap:20px;align-items:start}
.vv-stage{background:#111;border-radius:12px;overflow:hidden;display:flex;align-items:center;justify-content:center;aspect-ratio:16/9;max-height:62vh}
.vv-stage canvas{max-width:100%;max-height:62vh;display:block}
.vv-bar{display:flex;align-items:center;gap:10px;margin:10px 0 16px}.vv-bar input[type=range]{flex:1;accent-color:var(--gold)}.vv-bar span{font:500 12px 'Source Sans 3',sans-serif;color:var(--mid);min-width:80px;text-align:right}
.vv-f{display:flex;flex-direction:column;gap:4px;margin-bottom:10px}.vv-f label{font-size:14px;font-weight:600;color:var(--dark)}
.vv-f input,.vv-f select{border:1px solid rgba(28,26,22,.15);border-radius:8px;padding:8px 10px;font:14px 'Source Sans 3',sans-serif;background:#fff;width:100%;box-sizing:border-box}
.vv-2{display:grid;grid-template-columns:1fr 1fr;gap:10px}
.vv-chk{display:flex;align-items:center;gap:8px;font:400 13px 'Source Sans 3',sans-serif;margin:6px 0;cursor:pointer;text-transform:none;color:var(--dark)}.vv-chk input{width:16px;height:16px;accent-color:var(--gold);margin:0}
.vv-drop{border:1.5px dashed var(--soft);border-radius:10px;padding:18px;text-align:center;color:var(--mid);font-size:13px;cursor:pointer;margin-bottom:12px}.vv-drop:hover,.vv-drop.over{border-color:var(--gold);background:rgba(10,122,132,.05)}
.vv-list{display:flex;flex-direction:column;gap:8px}
.vv-item{display:grid;grid-template-columns:64px 1fr auto;gap:10px;align-items:center;border:1px solid rgba(28,26,22,.1);border-radius:10px;padding:6px;background:#fff}
.vv-item img{width:64px;height:48px;object-fit:cover;border-radius:6px}.vv-item select,.vv-item input{border:1px solid rgba(28,26,22,.15);border-radius:6px;padding:5px 7px;font:13px 'Source Sans 3',sans-serif;width:100%;box-sizing:border-box}
.vv-item .b{display:flex;gap:2px}.vv-item .b button{border:1px solid rgba(28,26,22,.15);background:#fff;border-radius:6px;width:28px;height:28px;cursor:pointer;font-size:13px}
.vv-note{font-size:12px;color:var(--mid);background:var(--warm);border-radius:8px;padding:9px 12px;line-height:1.5;margin:10px 0}
.vv-prog{height:8px;background:var(--warm);border-radius:99px;overflow:hidden;margin:10px 0}.vv-prog div{height:100%;width:0;background:var(--gold);transition:width .2s}
@media(max-width:980px){.vv-grid{grid-template-columns:1fr}}
`;
    document.head.appendChild(c);
  }

  /* ---------- Visites publiées (stockage + synchronisation) ---------- */
  const readAll = () => { try { return JSON.parse(localStorage.getItem(KEY)) || []; } catch (_) { return []; } };
  function writeAll(list) {
    let okLocal = true;
    try { localStorage.setItem(KEY, JSON.stringify(list)); } catch (_) { okLocal = false; }
    if (window.IMMO_SYNC) IMMO_SYNC.saved(KEY, list);
    return okLocal;
  }
  // Connecté : uniquement ses propres annonces ; démo : toutes les annonces de démonstration
  const biens = () => (window.IMMO_SYNC && IMMO_SYNC.uid && window.IMMO_ANN) ? IMMO_ANN.mine() : (typeof BIENS_DATA !== 'undefined' ? BIENS_DATA : []);
  // Photo redimensionnée et compressée pour la publication (JPEG, 1024 px max)
  function toData(img) {
    const k = Math.min(1, PUB_SIZE / Math.max(img.width, img.height));
    const c = document.createElement('canvas'); c.width = Math.round(img.width * k); c.height = Math.round(img.height * k);
    c.getContext('2d').drawImage(img, 0, 0, c.width, c.height); return c.toDataURL('image/jpeg', PUB_QUALITY);
  }
  async function loadDoc(doc) {
    const photos = [];
    for (const p of doc.photos || []) { try { photos.push(Object.assign({}, p, { img: await loadImage(p.src) })); } catch (_) { /* photo illisible ignorée */ } }
    return Object.assign({}, doc, { photos });
  }
  async function editBien(id) {
    st.bienId = id;
    const doc = readAll().find(v => String(v.bienId) === String(id));
    if (!doc) return;
    const V = await loadDoc(doc);
    st.photos = V.photos.map((p, i) => ({ id: 'p' + i + Date.now(), img: p.img, url: p.src, nom: '', piece: p.piece, legende: p.legende || '', shared: true }));
    ['format', 'duree', 'transition', 'mouvement', 'filigrane'].forEach(k => { if (doc[k] !== undefined) st[k] = doc[k]; });
    st.intro = Object.assign({ titre: '', sous: '', prix: '' }, doc.intro); st.outro = Object.assign({ contact: '', tel: '' }, doc.outro);
  }
  function publish(publie) {
    if (st.bienId == null) { alert('Choisissez l\'annonce à laquelle rattacher la visite.'); return; }
    if (!st.photos.length) return;
    const doc = { id: 'v' + st.bienId, bienId: st.bienId, publie, maj: new Date().toISOString(), format: st.format, duree: st.duree, transition: st.transition, mouvement: st.mouvement, filigrane: st.filigrane,
      intro: Object.assign({}, st.intro), outro: Object.assign({}, st.outro), photos: st.photos.map(p => ({ src: toData(p.img), piece: p.piece, legende: p.legende || '' })) };
    const list = readAll().filter(v => String(v.bienId) !== String(st.bienId)); list.unshift(doc);
    const ok = writeAll(list);
    const n = $('vv-out');
    if (n) n.innerHTML = `<div class="vv-note" style="background:${publie ? '#E6F4EA;color:#1E6B3A' : 'var(--warm)'}">${publie ? 'Visite publiée : elle apparaît dans la fiche de l\'annonce.' : 'Visite retirée de l\'annonce.'}${ok ? '' : ' Attention : l\'espace de stockage de ce navigateur est plein ; connectez-vous pour l\'enregistrer en ligne.'}</div>`;
  }
  function publishedFor(id) { return readAll().find(v => String(v.bienId) === String(id) && v.publie); }

  /* ---------- Éditeur ---------- */
  function build(el) {
    injectStyle(); prefill();
    const hasEstim = typeof S !== 'undefined' && Array.isArray(S.photos) && S.photos.length && !st.photos.some(p => p.shared);
    const cur = st.bienId != null ? readAll().find(v => String(v.bienId) === String(st.bienId)) : null;
    el.innerHTML = `<div class="vv-wrap"><div class="vv-head"><h2>Visite vidéo</h2><p>Transformez les photos de votre bien en une visite animée, visible directement dans la fiche de l'annonce.</p></div>
      <div class="vv-grid"><section>
        <div class="vv-stage" id="vv-stage"><canvas id="vv-canvas"></canvas></div>
        <div class="vv-bar"><button type="button" class="btn btn-dark btn-sm" id="vv-play">Lecture</button><input type="range" id="vv-seek" min="0" max="1000" value="0" aria-label="Position"><span id="vv-time">0:00 / 0:00</span></div>
        <div class="card"><div class="card-title" style="justify-content:space-between">Photos (${st.photos.length}/${MAX_PHOTOS}) <span style="display:flex;gap:6px">${hasEstim ? '<button type="button" class="btn btn-sm btn-outline" id="vv-import">Importer les photos de l\'estimation</button>' : ''}<button type="button" class="btn btn-sm btn-outline" id="vv-order"${st.photos.length > 1 ? '' : ' disabled'}>Ordre de visite conseillé</button></span></div>
          <div class="vv-drop" id="vv-drop">Glissez vos photos ici ou cliquez pour les choisir<br><small>JPG, PNG, WEBP — jusqu'à ${MAX_PHOTOS} photos</small><input type="file" id="vv-files" accept="image/*" multiple hidden></div>
          <div class="vv-list" id="vv-list"></div></div>
      </section><aside>
        <div class="card"><div class="card-title">Annonce</div>
          <div class="vv-f"><label>Visite rattachée à</label><select id="vv-bien"><option value="">— choisir une annonce —</option>${biens().map(b => `<option value="${E(b.id)}"${String(b.id) === String(st.bienId) ? ' selected' : ''}>${E(b.titre)}</option>`).join('')}</select></div>
          ${cur ? `<div style="font-size:12px;color:var(--mid)">${cur.publie ? 'Visite publiée' : 'Visite non publiée'} · mise à jour le ${new Date(cur.maj).toLocaleDateString('fr-FR')}</div>` : ''}</div>
        <div class="card"><div class="card-title">Réglages</div>
          <div class="vv-2"><div class="vv-f"><label>Format</label><select id="vv-format"><option value="16:9">16:9 — paysage</option><option value="9:16">9:16 — vertical (mobile)</option><option value="1:1">1:1 — carré</option></select></div>
            <div class="vv-f"><label>Durée par photo</label><select id="vv-duree"><option value="2.5">2,5 s</option><option value="3.5">3,5 s</option><option value="5">5 s</option></select></div></div>
          <div class="vv-f"><label>Transition</label><select id="vv-trans"><option value="fondu">Fondu enchaîné</option><option value="glisse">Glissement</option></select></div>
          <label class="vv-chk"><input type="checkbox" id="vv-mvt">Mouvement lent sur les photos</label>
          <label class="vv-chk"><input type="checkbox" id="vv-wm">Logo Immo360 en filigrane</label></div>
        <div class="card"><div class="card-title">Textes</div>
          <div class="vv-f"><label>Titre d'ouverture</label><input id="vv-titre" maxlength="80" placeholder="Villa F5 avec piscine"></div>
          <div class="vv-2"><div class="vv-f"><label>Sous-titre</label><input id="vv-sous" maxlength="60" placeholder="Anse Vata, Nouméa"></div><div class="vv-f"><label>Prix</label><input id="vv-prix" maxlength="30" placeholder="58 000 000 F"></div></div>
          <div class="vv-2"><div class="vv-f"><label>Contact (fin)</label><input id="vv-contact" maxlength="50"></div><div class="vv-f"><label>Téléphone</label><input id="vv-tel" maxlength="30"></div></div></div>
        <div class="card"><div class="card-title">Publication</div>
          <button type="button" class="btn btn-gold btn-full" id="vv-pub"${st.photos.length ? '' : ' disabled'}>${cur && cur.publie ? 'Mettre à jour la visite publiée' : 'Publier la visite sur l\'annonce'}</button>
          ${cur && cur.publie ? '<button type="button" class="btn btn-outline btn-full" id="vv-unpub" style="margin-top:8px">Retirer de l\'annonce</button>' : ''}
          <div id="vv-out"></div>
          <div class="vv-note">Les photos sont redimensionnées (${PUB_SIZE} px) pour un affichage rapide. La visite est visible par tous les visiteurs de l'annonce.</div></div>
      </aside></div></div>`;
    $('vv-format').value = st.format; $('vv-duree').value = String(st.duree); $('vv-trans').value = st.transition; $('vv-mvt').checked = st.mouvement; $('vv-wm').checked = st.filigrane;
    $('vv-titre').value = st.intro.titre; $('vv-sous').value = st.intro.sous; $('vv-prix').value = st.intro.prix; $('vv-contact').value = st.outro.contact; $('vv-tel').value = st.outro.tel;
    renderList(); setupCanvas(); seek(st.tPause || Math.min(1.2, timeline().total)); // aperçu lisible dès l'ouverture
    const reglages = () => {
      st.format = $('vv-format').value; st.duree = parseFloat($('vv-duree').value) || 3.5; st.transition = $('vv-trans').value; st.mouvement = $('vv-mvt').checked; st.filigrane = $('vv-wm').checked;
      st.intro = { titre: $('vv-titre').value.trim(), sous: $('vv-sous').value.trim(), prix: $('vv-prix').value.trim() }; st.outro = { contact: $('vv-contact').value.trim(), tel: $('vv-tel').value.trim() };
      setupCanvas(); seek(st.tPause);
    };
    ['vv-format', 'vv-duree', 'vv-trans', 'vv-mvt', 'vv-wm', 'vv-titre', 'vv-sous', 'vv-prix', 'vv-contact', 'vv-tel'].forEach(i => $(i).addEventListener('input', reglages));
    const drop = $('vv-drop');
    drop.onclick = () => $('vv-files').click();
    $('vv-files').onchange = async e => { await addFiles(e.target.files); build(el); };
    drop.addEventListener('dragover', e => { e.preventDefault(); drop.classList.add('over'); });
    drop.addEventListener('dragleave', () => drop.classList.remove('over'));
    drop.addEventListener('drop', async e => { e.preventDefault(); drop.classList.remove('over'); await addFiles(e.dataTransfer.files); build(el); });
    if ($('vv-import')) $('vv-import').onclick = async () => { await importEstimation(); build(el); };
    $('vv-order').onclick = () => { st.photos.sort((a, b) => ORDRE.indexOf(a.piece) - ORDRE.indexOf(b.piece)); build(el); };
    $('vv-play').onclick = () => st.playing ? pause() : play();
    $('vv-seek').oninput = e => { pause(); seek(e.target.value / 1000 * timeline().total); };
    $('vv-bien').onchange = async e => {
      const id = e.target.value === '' ? null : (isNaN(+e.target.value) ? e.target.value : +e.target.value);
      const had = readAll().some(v => String(v.bienId) === String(id));
      if (had) await editBien(id); else { st.bienId = id; const b = biens().find(x => String(x.id) === String(id)); if (b) { st.intro.titre = st.intro.titre || b.titre; st.intro.prix = st.intro.prix || (b.prix ? b.prix.toLocaleString('fr-FR') + ' F' : ''); st.intro.sous = st.intro.sous || [b.quartier, b.ville].filter(Boolean).join(', '); } }
      build(el);
    };
    $('vv-pub').onclick = () => { publish(true); const m = $('vv-out').innerHTML; build(el); $('vv-out').innerHTML = m; };
    if ($('vv-unpub')) $('vv-unpub').onclick = () => { publish(false); const m = $('vv-out').innerHTML; build(el); $('vv-out').innerHTML = m; };
  }
  function renderList() {
    const L = $('vv-list'); if (!L) return;
    L.innerHTML = st.photos.map((p, i) => `<div class="vv-item" data-i="${i}"><img src="${E(p.url)}" alt="">
      <div style="display:grid;grid-template-columns:1fr 1fr;gap:6px"><select data-k="piece" aria-label="Pièce">${PIECES.map(x => `<option${x === p.piece ? ' selected' : ''}>${E(x)}</option>`).join('')}</select><input data-k="legende" maxlength="40" placeholder="Légende (facultatif)" value="${E(p.legende)}"></div>
      <div class="b"><button type="button" data-a="up" aria-label="Monter"${i ? '' : ' disabled'}>↑</button><button type="button" data-a="down" aria-label="Descendre"${i < st.photos.length - 1 ? '' : ' disabled'}>↓</button><button type="button" data-a="del" aria-label="Retirer">×</button></div></div>`).join('')
      || '<div style="color:var(--mid);font-size:13px">Aucune photo pour le moment.</div>';
    L.querySelectorAll('.vv-item').forEach(row => {
      const i = +row.dataset.i;
      row.querySelectorAll('[data-k]').forEach(inp => inp.addEventListener('input', () => { st.photos[i][inp.dataset.k] = inp.value; seek(st.tPause); }));
      row.querySelectorAll('[data-a]').forEach(b => b.onclick = () => {
        const a = b.dataset.a, P = st.photos;
        if (a === 'up' && i > 0) [P[i - 1], P[i]] = [P[i], P[i - 1]];
        if (a === 'down' && i < P.length - 1) [P[i + 1], P[i]] = [P[i], P[i + 1]];
        if (a === 'del') { const [x] = P.splice(i, 1); if (x && !x.shared) URL.revokeObjectURL(x.url); }
        build($('panel-visite'));
      });
    });
  }

  /* ---------- Aperçu ---------- */
  let canvas, ctx;
  function setupCanvas() {
    canvas = $('vv-canvas'); if (!canvas) return; ctx = canvas.getContext('2d');
    const [W, H] = FORMATS[st.format]; canvas.width = W; canvas.height = H;
    const stage = $('vv-stage'); if (stage) stage.style.aspectRatio = W + '/' + H;
  }
  const fmt = s => Math.floor(s / 60) + ':' + String(Math.floor(s % 60)).padStart(2, '0');
  function seek(t) {
    if (!ctx) return; const { total } = timeline(); st.tPause = Math.min(Math.max(0, t), total);
    render(ctx, canvas.width, canvas.height, st.tPause);
    if ($('vv-seek')) $('vv-seek').value = Math.round(st.tPause / total * 1000);
    if ($('vv-time')) $('vv-time').textContent = fmt(st.tPause) + ' / ' + fmt(total);
  }
  function play() {
    if (!ctx || st.recording) return; const { total } = timeline(); if (st.tPause >= total - 0.05) st.tPause = 0;
    st.playing = true; st.t0 = performance.now() - st.tPause * 1000; $('vv-play').textContent = 'Pause';
    const loop = () => { if (!st.playing) return; const t = (performance.now() - st.t0) / 1000; if (t >= total) { seek(total); pause(); return; } seek(t); st.raf = requestAnimationFrame(loop); };
    st.raf = requestAnimationFrame(loop);
  }
  function pause() { st.playing = false; cancelAnimationFrame(st.raf); if ($('vv-play')) $('vv-play').textContent = 'Lecture'; }


  /* ---------- Lecteur intégré à la fiche du bien ---------- */
  async function findPublished(bienId) {
    const local = publishedFor(bienId); if (local) return local;
    // Visiteur d'un autre appareil ou non connecté : lecture publique depuis la base
    if (window.IMMO_SYNC && IMMO_SYNC.fetchOne) {
      const d = await IMMO_SYNC.fetchOne('visite', 'v' + bienId);
      if (d && d.publie) return d;
    }
    return null;
  }
  async function mountPlayer(container, doc) {
    injectStyle();
    const V = await loadDoc(doc); if (!V.photos.length) return null;
    const [W, H] = FORMATS[V.format] || FORMATS['16:9'];
    container.innerHTML = `<div class="vv-player" style="position:relative;background:#111;border-radius:10px;overflow:hidden;aspect-ratio:${W}/${H};max-height:60vh;margin:0 auto 12px">
      <canvas style="width:100%;height:100%;display:block;object-fit:contain"></canvas>
      <button type="button" class="vv-big" aria-label="Lancer la visite" style="position:absolute;inset:0;margin:auto;width:68px;height:68px;border-radius:50%;border:0;background:rgba(10,122,132,.92);color:#fff;font-size:26px;cursor:pointer;box-shadow:0 4px 18px rgba(0,0,0,.35)">▶</button>
      <div class="vv-ctrl" style="position:absolute;left:0;right:0;bottom:0;display:flex;gap:8px;align-items:center;padding:8px 10px;background:linear-gradient(transparent,rgba(0,0,0,.6))">
        <button type="button" class="vv-pp" style="background:none;border:0;color:#fff;font-size:15px;cursor:pointer;width:26px" aria-label="Lecture / pause">▶</button>
        <input type="range" class="vv-sk" min="0" max="1000" value="0" style="flex:1;accent-color:#0A7A84" aria-label="Position"><span class="vv-tm" style="color:#fff;font:500 11px 'Source Sans 3',sans-serif">0:00</span></div></div>`;
    const cv = container.querySelector('canvas'), c2 = cv.getContext('2d'); cv.width = W; cv.height = H;
    const total = timeline(V).total; let t = 0, playing = false, t0 = 0, raf = 0;
    const draw = () => { render(c2, W, H, t, V); container.querySelector('.vv-sk').value = Math.round(t / total * 1000); container.querySelector('.vv-tm').textContent = fmt(t) + ' / ' + fmt(total); };
    const stop = () => { playing = false; cancelAnimationFrame(raf); container.querySelector('.vv-pp').textContent = '▶'; container.querySelector('.vv-big').style.display = t >= total - 0.05 || t === 0 ? '' : 'none'; };
    const start = () => {
      if (t >= total - 0.05) t = 0; playing = true; t0 = performance.now() - t * 1000;
      container.querySelector('.vv-pp').textContent = '❚❚'; container.querySelector('.vv-big').style.display = 'none';
      const loop = () => { if (!playing || !document.body.contains(cv)) return; t = (performance.now() - t0) / 1000; if (t >= total) { t = total; draw(); stop(); return; } draw(); raf = requestAnimationFrame(loop); };
      raf = requestAnimationFrame(loop);
    };
    container.querySelector('.vv-big').onclick = start;
    container.querySelector('.vv-pp').onclick = () => playing ? stop() : start();
    container.querySelector('.vv-sk').oninput = e => { stop(); t = e.target.value / 1000 * total; draw(); container.querySelector('.vv-big').style.display = 'none'; };
    t = Math.min(total, INTRO + 0.5); draw(); t = 0; // vignette : première photo
    return { start, stop, total };
  }
  // Insère la visite publiée sous l'en-tête d'une fiche de bien (fenêtres openBien / openLandingBien)
  async function attach(overlay, bienId) {
    const doc = await findPublished(bienId); if (!doc || !overlay || !document.body.contains(overlay)) return;
    const card = overlay.firstElementChild; if (!card) return;
    const box = document.createElement('div'); box.className = 'vv-attach';
    const slot = card.querySelector('.ann-media .ann-visite'); // emplacement préparé par js/annonces.js (sous la galerie)
    box.innerHTML = '<div style="font:600 11px \'Source Sans 3\',sans-serif;color:var(--mid);margin:0 0 6px">Visite vidéo</div><div class="vv-slot"></div>';
    const header = card.firstElementChild;
    if (slot) slot.appendChild(box); else if (header && header.nextSibling) card.insertBefore(box, header.nextSibling); else card.prepend(box);
    await mountPlayer(box.querySelector('.vv-slot'), doc);
  }

  /* ---------- Vidéo créée automatiquement au dépôt d'une annonce ---------- */
  // Ordre logique des pièces quand le nom de fichier l'indique ; sinon l'ordre choisi par le vendeur
  function autoDoc(bienId, photos, meta, publie) {
    const order = p => { const i = ORDRE.indexOf(p.piece); return i < 0 ? ORDRE.length : i; };
    const list = photos.slice(0, MAX_PHOTOS).map((p, i) => Object.assign({ i }, p)).sort((a, b) => (order(a) - order(b)) || (a.i - b.i));
    return { id: 'v' + bienId, bienId, publie, maj: new Date().toISOString(), format: '16:9', duree: 3.5, transition: 'fondu', mouvement: true, filigrane: true,
      intro: { titre: meta.titre || '', sous: meta.sous || '', prix: meta.prix || '' }, outro: { contact: meta.contact || '', tel: meta.tel || '' },
      photos: list.map(p => ({ src: p.src, piece: p.piece, legende: '' })) };
  }
  const fromUrls = items => (items || []).map(x => ({ src: x.url, piece: guessPiece(x.name) }));
  // Aperçu en direct dans le formulaire de dépôt (photos locales, rien n'est enregistré)
  async function preview(container, items, meta) {
    if (!container) return null;
    const ph = fromUrls(items); if (ph.length < 2) { container.innerHTML = ''; return null; }
    return mountPlayer(container, autoDoc('apercu', ph, meta || {}, false));
  }
  // À la publication de l'annonce : la visite est créée et publiée avec elle
  async function autoCreate(bienId, items, meta) {
    const ph = [];
    for (const x of fromUrls(items)) { try { const img = await loadImage(x.src); ph.push({ src: toData(img), piece: x.piece }); } catch (_) { /* photo illisible ignorée */ } }
    if (ph.length < 2) return false;
    const doc = autoDoc(bienId, ph, meta || {}, true);
    const list = readAll().filter(v => String(v.bienId) !== String(bienId)); list.unshift(doc);
    return writeAll(list);
  }
  // Ouvrir l'éditeur sur la visite d'une annonce (pour la personnaliser)
  async function openFor(bienId) { pause(); await editBien(bienId); if (typeof go === 'function') go('visite'); }

  window.addEventListener('immo360:purge', () => { pause(); st.photos.forEach(p => { if (!p.shared) URL.revokeObjectURL(p.url); }); st.photos = []; st.bienId = null; st.intro = { titre: '', sous: '', prix: '' }; st.outro = { contact: '', tel: '' }; });
  window.IMMO_PANELS = Object.assign(window.IMMO_PANELS || {}, { visite: el => { pause(); build(el); } });
  window.IMMO_VISITE = { addFiles, timeline, render, state: st, publish, attach, mountPlayer, findPublished, preview, autoCreate, openFor }; // exposé pour les tests
})();
