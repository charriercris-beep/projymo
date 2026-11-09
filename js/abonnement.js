/* Immo360 NC — Abonnements des professionnels (formules et prix : js/tarifs.js)
 * - MODE 'off' ou 'lancement' : aucune limite, tout est ouvert (rien n'est bloqué avant le jour J).
 * - MODE 'payant' : la formule en cours fixe les limites (demandes, missions, annonces par mois…).
 *   Compte réel : la formule vient de la table abonnements (essai de 30 jours une fois par métier,
 *   sinon commande « à régler » activée par l'administrateur après paiement).
 *   Démonstration : la formule choisie s'applique tout de suite dans ce navigateur.
 */
(function () {
  'use strict';

  const T = () => window.IMMO_TARIFS;
  const LKEY = 'immo360.abo.v1';
  const E = v => String(v == null ? '' : v).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const $ = id => document.getElementById(id);
  const online = () => !!(window.IMMO_SYNC && IMMO_SYNC.uid && IMMO_SYNC.client);
  const readL = () => { try { return JSON.parse(localStorage.getItem(LKEY) || '{}'); } catch (_) { return {}; } };
  const writeL = v => { try { localStorage.setItem(LKEY, JSON.stringify(v)); } catch (_) { /* ignoré */ } };
  let rows = []; // abonnements du compte (base)

  async function load() {
    const c = online() ? IMMO_SYNC.client : null; if (!c) { rows = []; return; }
    try { const r = await c.from('abonnements').select('id,role,formule,prix,statut,debut,fin,created_at'); rows = (!r.error && r.data) ? r.data : []; } catch (_) { rows = []; }
  }
  // Ligne en cours (essai ou actif, non expiré) et dernière demande à régler
  function etat(profil) {
    const now = Date.now();
    if (online()) {
      const mine = rows.filter(r => r.role === profil).sort((a, b) => new Date(b.created_at) - new Date(a.created_at));
      const cur = mine.find(r => (r.statut === 'essai' || r.statut === 'actif') && new Date(r.fin).getTime() > now) || null;
      return { cur, attente: mine.find(r => r.statut === 'a_payer') || null, essaiUtilise: mine.some(r => r.statut === 'essai' || r.statut === 'actif') };
    }
    const l = readL()[profil];
    const cur = l && new Date(l.fin).getTime() > now ? l : null;
    return { cur, attente: null, essaiUtilise: !!(l && l.essai) };
  }
  // Formule qui s'applique : tout est ouvert tant que le site n'est pas en mode payant
  function formule(profil) {
    const t = T(), plans = t ? t.plans(profil) : [];
    if (!plans.length) return null;
    if (!t || t.MODE !== 'payant') return plans[plans.length - 1];
    const e = etat(profil);
    return (e.cur && plans.find(p => p.id === e.cur.formule)) || plans[0];
  }
  const limite = (profil, cle) => { const f = formule(profil); const v = f && f.limites ? f.limites[cle] : undefined; return v === undefined ? Infinity : v; };
  const a = (profil, fonction) => { const f = formule(profil); return !f || !T() || T().MODE !== 'payant' || (f.fonctions || []).includes(fonction); };

  // Limite mensuelle sur une liste (demandes, missions…) : les suivantes sont masquées avec une invitation
  const dateOf = x => { const d = x.date || x.created_at || x.cree || (Number(x.id) > 1e12 ? Number(x.id) : null); const t = d ? new Date(typeof d === 'string' && /^\d{2}\/\d{2}\/\d{4}$/.test(d) ? d.split('/').reverse().join('-') : d).getTime() : NaN; return isNaN(t) ? Date.now() : t; };
  function cap(profil, cle, list) {
    const max = limite(profil, cle); if (max === Infinity) return { shown: list, hidden: 0 };
    const m0 = new Date(); m0.setDate(1); m0.setHours(0, 0, 0, 0);
    const mois = list.filter(x => dateOf(x) >= m0.getTime()).sort((x, y) => dateOf(x) - dateOf(y)); // premiers arrivés
    const ok = new Set(mois.slice(0, max)), shown = list.filter(x => dateOf(x) < m0.getTime() || ok.has(x));
    return { shown, hidden: list.length - shown.length };
  }
  function invite(profil, n, quoi) {
    if (!n) return '';
    const p = (T() ? T().plans(profil) : []).find(x => x.conseille) || {};
    return `<div class="abo-invite"><b>${n} ${E(quoi)} de plus ce mois-ci</b><span>Votre formule gratuite est limitée. Avec la formule ${E(p.nom || 'Pro')} (${T().fmt(p.prix)}/mois), vous les recevez toutes.</span><button type="button" class="btn btn-gold btn-sm" onclick="go('abonnement')">Voir les formules</button></div>`;
  }

  /* ---------- Choisir une formule ---------- */
  async function choisir(profil, id, essai) {
    const t = T(), p = t.plans(profil).find(x => x.id === id); if (!p) return { ok: false };
    if (online()) {
      const r = await IMMO_SYNC.client.from('abonnements').insert({ role: profil, formule: id, prix: essai ? 0 : p.prix, statut: essai ? 'essai' : 'a_payer' });
      if (r && r.error) return { ok: false, error: r.error.message || String(r.error) };
      await load(); return { ok: true, aPayer: !essai };
    }
    const all = readL(), jours = essai ? t.ESSAI_JOURS : 30;
    all[profil] = { formule: id, statut: essai ? 'essai' : 'actif', fin: new Date(Date.now() + jours * 86400000).toISOString(), essai: essai || (all[profil] && all[profil].essai), demo: true };
    writeL(all); return { ok: true, aPayer: false, demo: true };
  }

  /* ---------- Page « Abonnement » ---------- */
  async function build(el) {
    const t = T(), profil = (typeof S !== 'undefined' && S.profile) || 'agt', plans = t ? t.plans(profil) : [];
    await load();
    const e = etat(profil), f = formule(profil), payant = t && t.MODE === 'payant';
    const fin = e.cur ? new Date(e.cur.fin).toLocaleDateString('fr-FR') : '';
    const lim = p => Object.entries(p.limites || {}).map(([k, v]) => v === Infinity ? `${k} ${k === 'dossiers' ? 'illimités' : 'illimitées'}` : `${v} ${k} / mois`).join(' · ');
    el.innerHTML = `<div class="abo-wrap"><h2>Votre abonnement</h2>
      <p class="abo-lead">${!payant ? 'Pendant le lancement d\'Immo360, <b>toutes les fonctions sont ouvertes gratuitement</b>. Les formules ci-dessous s\'appliqueront plus tard ; vous serez prévenu avant.'
        : `Formule actuelle : <b>${E(f ? f.nom : '—')}</b>${e.cur ? (e.cur.statut === 'essai' ? ' (essai gratuit jusqu\'au ' + fin + ')' : ' (jusqu\'au ' + fin + ')') : ''}${e.cur && e.cur.demo ? ' · démonstration' : ''}.`}</p>
      ${e.attente ? `<p class="abo-wait">Demande de formule ${E((plans.find(p => p.id === e.attente.formule) || {}).nom || e.attente.formule)} enregistrée : ${t.fmt(e.attente.prix)}/mois à régler. Elle s'active dès réception du paiement.</p>` : ''}
      <div class="abo-plans">${plans.map(p => `<div class="abo-plan${p.conseille ? ' best' : ''}${payant && f && f.id === p.id ? ' cur' : ''}">
        ${p.conseille ? '<span class="abo-tag">Conseillé</span>' : ''}<h3>${E(p.nom)}</h3><div class="abo-prix">${p.prix ? t.fmt(p.prix) + '<small> / mois</small>' : 'Gratuit'}</div>
        <p>${E(p.desc)}</p><small class="abo-lim">${E(lim(p))}</small>
        ${payant && p.prix ? (f && f.id === p.id ? '<span class="abo-on">Formule en cours</span>'
          : `<div class="abo-act">${!e.essaiUtilise ? `<button type="button" class="btn btn-gold btn-sm" data-essai="${p.id}">Essai gratuit ${t.ESSAI_JOURS} jours</button>` : ''}<button type="button" class="btn btn-outline btn-sm" data-pl="${p.id}">Choisir</button></div>`) : ''}
      </div>`).join('')}</div>
      <p class="abo-msg" id="abo-msg" role="status"></p></div>`;
    const go1 = async (id, essai) => {
      const r = await choisir(profil, id, essai), m = $('abo-msg');
      m.innerHTML = !r.ok ? 'La demande n\'a pas pu être enregistrée.' + (r.error ? ' <small>(' + E(r.error) + ')</small>' : '')
        : essai ? '<b>Essai activé.</b>' : r.aPayer ? '<b>Demande enregistrée.</b> Nous vous contactons pour le paiement ; la formule s\'active dès réception.' : '<b>Mode démonstration : formule activée sans paiement.</b>';
      if (r.ok) setTimeout(() => build(el), 1200);
    };
    el.querySelectorAll('[data-essai]').forEach(b => b.onclick = () => go1(b.dataset.essai, true));
    el.querySelectorAll('[data-pl]').forEach(b => b.onclick = () => go1(b.dataset.pl, false));
  }

  const css = document.createElement('style');
  css.textContent = `
.abo-wrap{max-width:1000px;margin:0 auto}.abo-wrap h2{font-size:28px;color:var(--ocean);margin:0 0 6px}
.abo-lead{font-size:16px;color:var(--dark);margin:0 0 16px}.abo-wait{background:#FFF6E0;border-radius:10px;padding:10px 14px}
.abo-plans{display:grid;grid-template-columns:repeat(auto-fit,minmax(240px,1fr));gap:16px}
.abo-plan{position:relative;background:#fff;border:1.5px solid var(--line);border-radius:14px;padding:20px}
.abo-plan.best{border-color:var(--gold);box-shadow:0 6px 20px rgba(10,122,132,.12)}.abo-plan.cur{background:var(--lagoon-pale)}
.abo-plan h3{margin:0 0 4px;font-size:20px}.abo-prix{font-size:28px;font-weight:700;color:var(--ocean)}.abo-prix small{font-size:15px;font-weight:400;color:var(--mid)}
.abo-plan p{color:var(--dark);font-size:15px}.abo-lim{display:block;color:var(--mid);margin-bottom:12px}
.abo-tag{position:absolute;top:-11px;left:16px;background:var(--gold);color:#fff;font-size:12.5px;font-weight:700;padding:3px 10px;border-radius:99px}
.abo-act{display:flex;gap:6px;flex-wrap:wrap}.abo-on{font-weight:700;color:var(--green)}
.abo-invite{display:flex;flex-wrap:wrap;align-items:center;gap:6px 14px;background:var(--lagoon-pale);border:1.5px dashed var(--gold);border-radius:12px;padding:14px 16px;margin:12px 0}
.abo-invite b{font-size:16px;color:var(--ocean)}.abo-invite span{flex:1;min-width:220px;color:var(--dark);font-size:15px}`;
  document.head.appendChild(css);

  window.IMMO_ABO = { load, formule, limite, a, cap, invite, choisir, etat };
  window.IMMO_PANELS = Object.assign(window.IMMO_PANELS || {}, { abonnement: el => { build(el); } });
  window.addEventListener('immo360:purge', () => { rows = []; });
})();
