/* Immo360 NC — Options d'annonce : bulles « Urgent » / « Négociable » / « Portes ouvertes », remontée en tête
 * de liste, « À la une », annonce en couleur, pack « Vente express ». Tarifs et interrupteur : js/tarifs.js.
 *
 * - MODE 'off' : rien n'apparaît. 'lancement' : options offertes. 'payant' : commande « à régler ».
 * - Compte réel : la commande est enregistrée dans la table options_annonce. Seule la base peut activer une
 *   option (après paiement, par l'administrateur ; ou automatiquement si elle est offerte en mode lancement).
 *   Un vendeur ne peut donc jamais s'offrir lui-même une option payante.
 * - Mode démonstration (sans compte) : l'option s'active tout de suite dans ce navigateur, mention « démo ».
 */
(function () {
  'use strict';

  const T = () => window.IMMO_TARIFS;
  const LKEY = 'immo360.options.v1';
  const E = v => String(v == null ? '' : v).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const DAY = 86400000;
  const online = () => !!(window.IMMO_SYNC && IMMO_SYNC.uid && IMMO_SYNC.client);
  const readL = () => { try { return JSON.parse(localStorage.getItem(LKEY) || '[]'); } catch (_) { return []; } };
  const writeL = v => { try { localStorage.setItem(LKEY, JSON.stringify(v)); } catch (_) { /* stockage plein */ } };

  let rows = [];       // options connues (actives publiques + les miennes)
  let byId = {};       // id d'annonce → effets actifs

  /* ---------- Effets actifs ---------- */
  function compute() {
    const now = Date.now(); byId = {};
    rows.filter(r => r.statut === 'active' && r.debut && new Date(r.fin).getTime() > now).forEach(r => {
      const o = byId[r.annonce_id] = byId[r.annonce_id] || {};
      const d = new Date(r.debut).getTime();
      if (r.option === 'remontee') o.bump = Math.max(o.bump || 0, d);
      else if (r.option === 'remontee7') o.bump = Math.max(o.bump || 0, d + Math.floor((now - d) / DAY) * DAY);
      else if (r.option === 'portes') o.portes = r.info || true;
      else o[r.option] = r.option === 'une' ? d : true;
    });
  }
  const of = id => (T() && T().actif() ? byId[id] || null : null);

  async function load() {
    const local = readL();
    let remote = [];
    const c = window.IMMO_SYNC && IMMO_SYNC.client;
    if (c) {
      try { const r = await c.from('options_annonce').select('id,annonce_id,option,info,statut,debut,fin,prix,created_at'); if (!r.error && r.data) remote = r.data; } catch (_) { /* table absente : rien */ }
    }
    rows = remote.concat(online() ? [] : local);
    compute();
  }

  /* ---------- Tri : « À la une » d'abord, puis la date la plus récente (publication ou remontée) ---------- */
  function sort(list) {
    const ts = b => { const o = of(b.id) || {}; return Math.max(new Date(b.date || 0).getTime() || 0, o.bump || 0); };
    return list.slice().sort((a, b) => {
      const ua = (of(a.id) || {}).une || 0, ub = (of(b.id) || {}).une || 0;
      if (!!ua !== !!ub) return ub ? 1 : -1;
      return ts(b) - ts(a);
    });
  }

  /* ---------- Pastilles ---------- */
  function badges(id) {
    const o = of(id); if (!o) return '';
    const pd = o.portes && o.portes !== true ? new Date(o.portes + 'T12:00:00') : null;
    return [o.une && '<span class="ob ob-une">À la une</span>', o.urgent && '<span class="ob ob-urg">Urgent</span>',
      o.negociable && '<span class="ob ob-neg">Prix négociable</span>',
      o.portes && `<span class="ob ob-po">Portes ouvertes${pd && !isNaN(pd) ? ' · ' + E(pd.toLocaleDateString('fr-FR', { weekday: 'short', day: 'numeric', month: 'short' })) : ''}</span>`]
      .filter(Boolean).join('');
  }
  const couleur = id => !!(of(id) || {}).couleur;

  /* ---------- Commande ---------- */
  async function order(annonceId, ids, info) {
    const t = T(); if (!t || !t.actif() || !ids.length) return { ok: false };
    const offert = t.offert(), now = new Date();
    const lignes = ids.filter(id => t.OPTIONS[id]).map(id => ({ annonce_id: Number(annonceId), option: id, info: id === 'portes' ? (info || null) : null, prix: offert ? 0 : t.OPTIONS[id].prix }));
    // prix des packs : réparti sur ses options pour que le total corresponde
    const total = t.totalOptions(ids), brut = lignes.reduce((a, l) => a + l.prix, 0);
    if (brut && total !== brut) lignes.forEach(l => { l.prix = Math.round(l.prix * total / brut); });
    if (online()) {
      // la base décide : « active » seulement si l'option est offerte (mode lancement côté base), sinon « à régler »
      const rowsIns = lignes.map(l => Object.assign({}, l, { statut: offert ? 'active' : 'a_payer' }));
      const r = await IMMO_SYNC.client.from('options_annonce').insert(rowsIns);
      if (r && r.error) return { ok: false, error: r.error.message || String(r.error) };
      await load(); refreshViews();
      return { ok: true, online: true, aPayer: !offert, total };
    }
    // démonstration : actif tout de suite dans ce navigateur
    const all = readL();
    lignes.forEach(l => {
      const j = (t.OPTIONS[l.option] || {}).jours || 30;
      all.push(Object.assign({ id: 'd' + Date.now() + Math.random().toString(36).slice(2, 6), statut: 'active', debut: now.toISOString(), fin: new Date(now.getTime() + j * DAY).toISOString(), created_at: now.toISOString(), demo: true }, l));
    });
    writeL(all); await load(); refreshViews();
    return { ok: true, online: false, aPayer: false, total };
  }
  const mine = annonceId => rows.filter(r => String(r.annonce_id) === String(annonceId));

  function refreshViews() {
    const visible = el => !!el && el.getClientRects().length > 0;
    try { if (visible(document.getElementById('landing-page')) && typeof buildLandingBiensSimple === 'function') buildLandingBiensSimple(); } catch (_) { /* vue absente */ }
    try { if (typeof S !== 'undefined' && S.panel === 'marketplace' && typeof filterMarketplace === 'function') filterMarketplace(); } catch (_) { /* vue absente */ }
    try { if (typeof S !== 'undefined' && S.panel === 'mes-annonces' && typeof go === 'function') go('mes-annonces'); } catch (_) { /* vue absente */ }
  }

  /* ---------- Choix des options (réutilisé : dépôt et fenêtre « Booster ») ---------- */
  function pickerHTML(prefix) {
    const t = T(); const off = t.offert();
    const opt = Object.entries(t.OPTIONS).map(([id, o]) => `<label class="op-row"><input type="checkbox" data-op="${id}"><span><b>${E(o.nom)}</b><small>${E(o.desc)}</small>
      ${o.date ? `<input type="date" class="op-date" id="${prefix}-date" aria-label="Date des portes ouvertes">` : ''}</span><em>${off ? '<s>' + t.fmt(o.prix) + '</s> Offert' : t.fmt(o.prix)}</em></label>`).join('');
    const packs = Object.entries(t.PACKS).map(([id, p]) => `<label class="op-row op-pack"><input type="checkbox" data-pack="${id}"><span><b>${E(p.nom)}</b><small>${E(p.desc)}</small></span><em>${off ? '<s>' + t.fmt(p.prix) + '</s> Offert' : t.fmt(p.prix)}</em></label>`).join('');
    return `${packs}${opt}<div class="op-total" id="${prefix}-total"></div>`;
  }
  function bindPicker(root, prefix) {
    const t = T();
    const sel = () => [...root.querySelectorAll('[data-op]:checked')].map(i => i.dataset.op);
    const upd = () => {
      root.querySelectorAll('[data-pack]').forEach(pk => { pk.checked = t.PACKS[pk.dataset.pack].options.every(o => sel().includes(o)); });
      const ids = sel(), tot = t.totalOptions(ids), box = root.querySelector('#' + prefix + '-total');
      if (box) box.innerHTML = ids.length ? `Total : <b>${t.offert() ? 'offert pendant le lancement' : t.fmt(tot)}</b>` : '';
    };
    root.querySelectorAll('[data-op]').forEach(i => i.onchange = upd);
    root.querySelectorAll('[data-pack]').forEach(pk => pk.onchange = () => { t.PACKS[pk.dataset.pack].options.forEach(o => { const c = root.querySelector(`[data-op="${o}"]`); if (c) c.checked = pk.checked; }); upd(); });
    upd();
    return { selected: sel, date: () => (root.querySelector('#' + prefix + '-date') || {}).value || '' };
  }

  /* ---------- Fenêtre « Booster mon annonce » ---------- */
  function openBoost(annonceId) {
    const t = T(); if (!t || !t.actif()) return;
    document.querySelectorAll('.op-mod').forEach(x => x.remove());
    const b = (typeof BIENS_DATA !== 'undefined' ? BIENS_DATA : []).find(x => String(x.id) === String(annonceId)) || {};
    const deja = mine(annonceId).filter(r => r.statut !== 'annulee');
    const etat = r => r.statut === 'active' ? (new Date(r.fin) > new Date() ? 'active jusqu\'au ' + new Date(r.fin).toLocaleDateString('fr-FR') : 'terminée') : 'à régler';
    const ov = document.createElement('div'); ov.className = 'op-mod';
    ov.innerHTML = `<div role="dialog" aria-modal="true" aria-labelledby="op-t"><div class="op-head"><h2 id="op-t">Vendez plus vite</h2><button type="button" class="op-x" aria-label="Fermer">✕</button></div>
      <p class="op-sub">${E(b.titre || 'Votre annonce')}</p>
      ${t.offert() ? '<p class="op-note">Pendant le lancement d\'Immo360, toutes les options sont offertes.</p>' : ''}
      ${deja.length ? `<div class="op-deja"><b>Déjà commandé</b>${deja.map(r => `<span>${E((t.OPTIONS[r.option] || {}).nom || r.option)} — ${etat(r)}${r.demo ? ' (démo)' : ''}</span>`).join('')}</div>` : ''}
      <div id="op-pick">${pickerHTML('opb')}</div>
      <p class="op-msg" id="op-msg" role="status"></p>
      <div class="op-actions"><button type="button" class="btn btn-outline op-x">Plus tard</button><button type="button" class="btn btn-gold" id="op-go">${t.offert() ? 'Activer les options' : 'Commander'}</button></div></div>`;
    document.body.appendChild(ov);
    const close = () => ov.remove();
    ov.addEventListener('click', e => { if (e.target === ov || e.target.closest('.op-x')) close(); });
    const pk = bindPicker(ov.querySelector('#op-pick'), 'opb');
    ov.querySelector('#op-go').onclick = async () => {
      const ids = pk.selected(), msg = ov.querySelector('#op-msg');
      if (!ids.length) { msg.textContent = 'Choisissez au moins une option.'; return; }
      if (ids.includes('portes') && !pk.date()) { msg.textContent = 'Indiquez la date des portes ouvertes.'; ov.querySelector('#opb-date').focus(); return; }
      const r = await order(annonceId, ids, pk.date());
      msg.innerHTML = !r.ok ? 'La commande n\'a pas pu être enregistrée. Réessayez.' + (r.error ? ' <small>(' + E(r.error) + ')</small>' : '')
        : r.aPayer ? `<b>Commande enregistrée : ${t.fmt(r.total)} à régler.</b> Nous vous contactons pour le paiement ; les options s'activent dès réception.`
        : r.online ? '<b>Options activées.</b>' : '<b>Mode démonstration : options activées dans ce navigateur, sans paiement.</b>';
      if (r.ok) { ov.querySelector('#op-go').disabled = true; setTimeout(close, 2500); }
    };
  }

  /* ---------- Styles ---------- */
  const css = document.createElement('style');
  css.textContent = `
.ob{display:inline-block;font:700 12.5px 'Source Sans 3',sans-serif;padding:4px 9px;border-radius:6px;margin:0 5px 5px 0;box-shadow:0 1px 4px rgba(0,0,0,.15);color:#fff}
.ob-une{background:var(--ocean,#0B3954)}.ob-urg{background:var(--accent,#E8704F)}.ob-neg{background:#fff;color:var(--gold-dark,#06575F)}.ob-po{background:#F7C873;color:#4A3500}
.pc-obs{position:absolute;top:10px;left:10px;right:56px;display:flex;flex-wrap:wrap;z-index:1;pointer-events:none}
.pc.op-couleur{background:var(--lagoon-pale,#E6F7F5);box-shadow:0 0 0 2px var(--lagoon,#35C3BC);border-radius:14px;padding:8px 8px 12px}
.fi-obs{margin:0 0 6px}
.op-mod{position:fixed;inset:0;background:rgba(15,42,56,.55);z-index:3000;display:flex;align-items:center;justify-content:center;padding:16px}
.op-mod>div{background:#fff;border-radius:16px;max-width:620px;width:100%;max-height:90vh;overflow:auto;padding:24px;font-family:'Source Sans 3',sans-serif;color:var(--dark)}
.op-head{display:flex;justify-content:space-between;align-items:center}.op-head h2{margin:0;font-size:24px;color:var(--ocean)}
.op-head .op-x{background:var(--cream);border:0;width:36px;height:36px;border-radius:50%;font-size:17px;cursor:pointer}
.op-sub{margin:4px 0 12px;color:var(--mid)}.op-note{background:var(--lagoon-pale);border-radius:8px;padding:9px 12px;margin:0 0 12px}
.op-deja{display:flex;flex-direction:column;gap:2px;background:var(--cream);border-radius:8px;padding:9px 12px;margin:0 0 12px;font-size:14px}
.op-row{display:grid!important;grid-template-columns:22px 1fr auto;gap:10px;align-items:start;border:1.5px solid var(--line);border-radius:10px;padding:11px 12px;margin:0 0 8px!important;cursor:pointer;font-weight:400!important}
.op-row input[type=checkbox]{width:18px;height:18px;margin-top:2px;accent-color:var(--gold)}
.op-row b{display:block;font-size:15.5px}.op-row small{display:block;color:var(--mid);font-size:13.5px}
.op-row em{font-style:normal;font-weight:700;white-space:nowrap;color:var(--ocean)}.op-row em s{color:var(--mid);font-weight:400;margin-right:4px}
.op-row:has(input:checked){border-color:var(--gold);background:var(--lagoon-pale)}
.op-pack{border-color:var(--gold)}.op-date{margin-top:6px;max-width:200px}
.op-total{text-align:right;font-size:17px;margin:6px 0}.op-msg{min-height:1em;font-size:15px}
.op-actions{display:flex;justify-content:flex-end;gap:8px;margin-top:8px}
.dp-boost{margin-top:18px}.dp-boost>h3{font-size:18px;margin:0 0 4px;color:var(--ocean)}.dp-boost>p{margin:0 0 10px;color:var(--mid);font-size:15px}`;
  document.head.appendChild(css);

  window.IMMO_OPT = { load, sort, badges, couleur, of, order, openBoost, pickerHTML, bindPicker, mine, refresh: async () => { await load(); refreshViews(); } };
  window.addEventListener('immo360:purge', () => { rows = []; byId = {}; });
  // La fenêtre se ferme quand on change de page
  const go0 = window.go;
  if (typeof go0 === 'function') window.go = function () { document.querySelectorAll('.op-mod').forEach(x => x.remove()); return go0.apply(this, arguments); };
  const start = () => load().then(refreshViews);
  if (document.readyState === 'complete') start(); else window.addEventListener('load', start);
})();
