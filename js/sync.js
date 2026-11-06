/* Immo360 NC — Synchronisation des espaces avec Supabase (table public.records, voir supabase/schema.sql)
 *
 * - Sans compte (démo) : rien ne change, les données restent dans le navigateur.
 * - Avec un compte : le navigateur sert de cache ; chaque enregistrement modifié est envoyé,
 *   et les données visibles (les siennes, les demandes ouvertes visant son métier s'il est un
 *   professionnel vérifié, celles qu'il a prises en charge) sont récupérées régulièrement.
 * - Au démarrage, un cache appartenant à un autre compte (ou à la démo) est vidé : les données
 *   de démonstration ne sont jamais envoyées dans un vrai compte. À la déconnexion, le cache est purgé.
 * - Conflits : la dernière écriture l'emporte (horodatage serveur).
 *
 * Les modules appellent IMMO_SYNC.saved(clé, tableau) après chaque enregistrement local.
 */
(function () {
  'use strict';

  const OWNER_KEY = 'immo360.sync.owner';
  const ROLE = { art: 'artisan', bnk: 'banquier', not: 'notaire', diag: 'diagnostiqueur', geo: 'geometre', ass: 'assureur', agt: 'agent' };
  const missionAud = role => r => (r.source && r.source !== 'manuel') ? { role } : null;
  const COLLS = {
    'immo360.fin.v1': { c: 'fin', aud: r => r.source === 'acheteur' ? { role: 'banquier' } : null },
    'immo360.notaire.v1': { c: 'notaire' },
    'immo360.missions.diag.v1': { c: 'mission_diag', aud: missionAud('diagnostiqueur') },
    'immo360.missions.geo.v1': { c: 'mission_geo', aud: missionAud('geometre') },
    'immo360.missions.ass.v1': { c: 'mission_ass', aud: missionAud('assureur') },
    'immo360.devis.v1': { c: 'devis', aud: r => ({ role: 'artisan', metiers: Array.isArray(r.metiers) ? r.metiers : [] }), strip: ['reponses', 'nom', 'tel', 'contactAccepte'] }  // coordonnées du client : jamais dans la demande partagée
  };
  const META = ['_o', '_u'];

  let uid = null, timer = null, proCache = {};
  const sent = {};           // clé → { id: JSON envoyé ou reçu }
  const mine = {};           // clé → { id: true si l'enregistrement m'appartient }
  const pending = {};        // clé → minuterie d'envoi
  const client = () => (typeof sb !== 'undefined' && sb) ? sb : null;
  const read = k => { try { return JSON.parse(localStorage.getItem(k)) || []; } catch (_) { return []; } };
  const write = (k, v) => { try { localStorage.setItem(k, JSON.stringify(v)); } catch (_) { /* stockage indisponible */ } };
  const clean = (o, strip) => { const c = {}; Object.keys(o || {}).forEach(k => { if (!META.includes(k) && !(strip || []).includes(k)) c[k] = o[k]; }); return c; };
  const sig = (o, strip) => JSON.stringify(clean(o, strip));
  const owned = r => !r._o || r._o === uid;

  /* ---------- Session ---------- */
  async function currentUser() {
    const c = client(); if (!c) return null;
    try { const { data } = await c.auth.getSession(); return data?.session?.user || null; } catch (_) { return null; }
  }
  async function start() {
    const user = await currentUser(); if (!user) return false;
    uid = user.id;
    // Cache d'un autre compte ou de la démo : on repart de zéro
    let prev = null; try { prev = localStorage.getItem(OWNER_KEY); } catch (_) { /* ignoré */ }
    if (prev !== uid) { purge(); try { localStorage.setItem(OWNER_KEY, uid); } catch (_) { /* ignoré */ } if (typeof devisEnCours !== 'undefined') devisEnCours.length = 0; }
    if (typeof APP_STATE !== 'undefined' && !APP_STATE.user) {
      const md = user.user_metadata || {};
      APP_STATE.user = { id: user.id, nom: md.nom || (user.email || '').split('@')[0], email: user.email, tel: md.tel || '', profil: md.profil || 'buy' };
      APP_STATE.loggedIn = true;
    }
    await pullAll();
    clearInterval(timer); timer = setInterval(pullAll, 60000);
    window.addEventListener('focus', onFocus);
    return true;
  }
  const onFocus = () => { if (uid) pullAll(); };
  function stop() {
    clearInterval(timer); timer = null; window.removeEventListener('focus', onFocus);
    if (uid) purge();
    uid = null; proCache = {};
  }
  // Vide toutes les données Immo360 du navigateur (sauf les barèmes, qui ne sont pas personnels)
  function purge() {
    try {
      Object.keys(localStorage).filter(k => k.startsWith('immo360.') && k !== 'immo360.baremes.v1').forEach(k => localStorage.removeItem(k));
    } catch (_) { /* ignoré */ }
    Object.keys(sent).forEach(k => delete sent[k]); Object.keys(mine).forEach(k => delete mine[k]);
    // Les modules vident aussi leur mémoire (sinon d'anciennes données pourraient être renvoyées)
    try { window.dispatchEvent(new CustomEvent('immo360:purge')); } catch (_) { /* ignoré */ }
  }

  /* ---------- Envoi ---------- */
  function saved(key, arr) {
    if (!uid || !COLLS[key]) return;
    clearTimeout(pending[key]);
    const snapshot = JSON.parse(JSON.stringify(arr || []));
    pending[key] = setTimeout(() => push(key, snapshot), 300);
  }
  async function push(key, arr) {
    const c = client(), cfg = COLLS[key]; if (!c || !uid) return;
    const done = sent[key] = sent[key] || {};
    const ids = new Set();
    for (const r of arr) {
      if (r == null || r.id == null) continue;
      const id = String(r.id); ids.add(id);
      const s = sig(r, cfg.strip); if (done[id] === s) continue;
      const data = clean(r, cfg.strip);
      try {
        let res;
        if (owned(r)) {
          const aud = cfg.aud ? cfg.aud(r) : null;
          res = await c.from('records').upsert({ collection: cfg.c, id, data, audience_role: aud?.role || null, audience_metiers: aud?.metiers || null }, { onConflict: 'collection,id' });
        } else {
          // Enregistrement d'un autre utilisateur : mise à jour (prise en charge), jamais de création
          res = await c.from('records').update({ data }).eq('collection', cfg.c).eq('id', id);
        }
        if (!res?.error) { done[id] = s; if (owned(r)) (mine[key] = mine[key] || {})[id] = true; } else console.warn('Synchronisation', cfg.c, id, res.error.message || res.error);
      } catch (e) { console.warn('Synchronisation', e); }
    }
    // Suppressions : seulement ses propres enregistrements déjà synchronisés
    const own = mine[key] = mine[key] || {};
    for (const id of Object.keys(done)) {
      if (ids.has(id)) continue;
      if (own[id] !== false) { try { await c.from('records').delete().eq('collection', cfg.c).eq('id', id); } catch (_) { /* ignoré */ } }
      delete done[id]; delete own[id];
    }
  }
  async function pushReponse(parentId, rep) {
    const c = client(); if (!c || !uid || parentId == null) return false;
    const res = await c.from('records').upsert({ collection: 'devis_reponse', id: String(parentId) + ':' + rep.proKey, parent_id: String(parentId), data: rep }, { onConflict: 'collection,id' });
    return !res?.error;
  }

  // Transmet les coordonnées du client au seul artisan dont le devis est accepté
  async function shareContact(devisId, artisanUid, contact) {
    const c = client(); if (!c || !uid || !artisanUid) return false;
    const id = String(devisId);
    const a = await c.from('records').upsert({ collection: 'devis_contact', id, data: contact }, { onConflict: 'collection,id' });
    if (a?.error) return false;
    const b = await c.from('records').update({ assignee: artisanUid }).eq('collection', 'devis_contact').eq('id', id);
    return !b?.error;
  }

  /* ---------- Récupération ---------- */
  async function pull(key) {
    const c = client(), cfg = COLLS[key]; if (!c || !uid || !cfg) return false;
    const { data: rows, error } = await c.from('records').select('*').eq('collection', cfg.c);
    if (error || !Array.isArray(rows)) return false;
    const done = sent[key] = sent[key] || {}, own = mine[key] = mine[key] || {};
    const local = key === 'immo360.devis.v1' && typeof devisEnCours !== 'undefined' ? devisEnCours : read(key);
    const byId = new Map(local.filter(x => x && x.id != null).map(x => [String(x.id), x]));
    const out = []; let changed = false;
    const seen = new Set();
    for (const row of rows) {
      const id = String(row.id); seen.add(id);
      const loc = byId.get(id);
      const remote = Object.assign({}, row.data, { id: loc && typeof loc.id === 'number' ? loc.id : (isNaN(+id) ? id : +id), _o: row.owner_id, _u: row.updated_at });
      if (cfg.strip && loc) cfg.strip.forEach(k => { if (loc[k] !== undefined) remote[k] = loc[k]; });
      // Modification locale pas encore envoyée : on la garde
      const localDirty = loc && done[id] !== undefined && sig(loc, cfg.strip) !== done[id];
      const keep = localDirty ? loc : remote;
      if (!localDirty) done[id] = sig(remote, cfg.strip);
      own[id] = row.owner_id === uid;
      if (!loc || sig(loc, cfg.strip) !== sig(keep, cfg.strip) || loc._u !== keep._u) changed = true;
      out.push(keep);
    }
    for (const [id, loc] of byId) {
      if (seen.has(id)) continue;
      const neverSent = done[id] === undefined;
      if (owned(loc) && neverSent && !loc._u) { out.push(loc); continue; }   // créé hors ligne : sera envoyé
      changed = true;                                                    // supprimé ou plus visible (pris en charge par un autre)
    }
    if (key === 'immo360.devis.v1') { await attachReponses(out); changed = true; }
    if (!changed) return false;
    if (key === 'immo360.devis.v1' && typeof devisEnCours !== 'undefined') { devisEnCours.length = 0; out.forEach(x => devisEnCours.push(x)); }
    write(key, out);
    return true;
  }
  async function attachReponses(list) {
    const c = client(); if (!c) return;
    const { data: rows } = await c.from('records').select('*').eq('collection', 'devis_reponse');
    const byParent = {};
    (rows || []).forEach(r => { (byParent[r.parent_id] = byParent[r.parent_id] || []).push(Object.assign({}, r.data, { _o: r.owner_id })); });
    // Coordonnées transmises à l'artisan retenu (enregistrement qui lui est attribué)
    const { data: contacts } = await c.from('records').select('*').eq('collection', 'devis_contact');
    const contactById = {}; (contacts || []).forEach(r => { if (r.owner_id !== uid) contactById[r.id] = r.data; });
    list.forEach(d => { if (contactById[String(d.id)]) d.contactAccepte = contactById[String(d.id)]; });
    list.forEach(d => {
      const reps = byParent[String(d.id)]; if (!reps) return;
      d.reponses = reps.map(x => Object.assign({}, x, { statut: d.acceptedKey ? (d.acceptedKey === x.proKey ? 'accepte' : 'envoye') : x.statut }));
    });
  }
  let pulling = false;
  async function pullAll() {
    if (!uid || pulling) return; pulling = true;
    let any = false;
    try { for (const k of Object.keys(COLLS)) { if (await pull(k)) any = true; } } finally { pulling = false; }
    if (any) refreshView();
  }
  // Redessine la vue courante si l'utilisateur n'est pas en train de saisir un formulaire de détail
  function refreshView() {
    if (typeof S === 'undefined' || typeof go !== 'function') return;
    const panel = document.getElementById('panel-' + S.panel); if (!panel || panel.style.display === 'none') return;
    if (panel.querySelector('#nd-avc,#bd-client,#mm-type,#art-lines,#fs-revenus,#ap-nom,#mp-nom,#val-surface')) return;
    go(S.panel);
  }

  /* ---------- Fiche professionnelle ---------- */
  async function ensurePro(profil, fields) {
    const c = client(), role = ROLE[profil]; if (!c || !uid || !role) return null;
    const nom = (fields && fields.nom) || (typeof APP_STATE !== 'undefined' && APP_STATE.user?.nom) || 'Professionnel';
    try {
      const row = Object.assign({ owner_id: uid, role, nom }, fields || {});
      const up = await c.from('professionnels').upsert(row, { onConflict: 'owner_id,role' });
      if (up?.error) console.warn('Fiche pro', up.error.message || up.error);
      const { data } = await c.from('professionnels').select('role,verifie').eq('owner_id', uid).eq('role', role);
      proCache[profil] = !!(data && data[0] && data[0].verifie);
    } catch (_) { proCache[profil] = false; }
    return proCache[profil];
  }

  /* ---------- Bandeau d'état sur le tableau de bord ---------- */
  function decorate(dash, profil) {
    if (!dash) return;
    const box = document.createElement('div');
    box.className = 'sync-banner';
    box.style.cssText = 'max-width:1180px;margin:0 auto 14px;border-radius:10px;padding:10px 14px;font:13px/1.5 "DM Sans",sans-serif';
    const isPro = !!ROLE[profil] && profil !== 'agt';
    if (!uid) {
      box.style.background = 'var(--warm)'; box.style.color = 'var(--mid)';
      box.textContent = 'Mode démonstration : vos données restent dans ce navigateur. Connectez-vous pour les retrouver partout et échanger avec les autres utilisateurs.';
      dash.prepend(box); return;
    }
    if (!isPro) return;
    const show = verified => {
      dash.querySelector('.sync-banner')?.remove();
      if (verified) return;
      box.style.background = '#FEF3C7'; box.style.color = '#7A4A0A';
      box.textContent = 'Votre compte professionnel est en attente de vérification par l\'équipe Immo360 : vous ne recevez pas encore les demandes des clients. Vos propres dossiers sont bien enregistrés.';
      dash.prepend(box);
    };
    if (profil in proCache) show(proCache[profil]); else ensurePro(profil).then(show);
  }

  window.IMMO_SYNC = { start, stop, saved, pull, pullAll, pushReponse, shareContact, ensurePro, decorate, get uid() { return uid; }, COLLS };
})();
