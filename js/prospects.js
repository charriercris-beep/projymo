/* Immo360 NC — Messagerie : qualification des prospects par l'IA (/api/prospects)
 * Dans chaque conversation : score, niveau (chaud / tiède / froid), budget, financement, délai,
 * prochaine action et réponse prête à envoyer. Dans la liste : pastille de niveau et tri par priorité.
 * Si l'IA ne répond pas, une estimation rapide fondée sur des mots-clés est proposée, signalée comme telle.
 * Dépend des globales : CONVERSATIONS, BIENS_DATA, openConversation, renderConvList, activeConvId.
 */
(function () {
  'use strict';

  const $ = id => document.getElementById(id);
  const E = s => String(s == null ? '' : s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const convs = () => (typeof CONVERSATIONS !== 'undefined' ? CONVERSATIONS : []);
  const actif = () => (typeof activeConvId !== 'undefined' ? activeConvId : null);
  const sa = s => String(s || '').normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase();

  function charge(c) {
    const b = (typeof BIENS_DATA !== 'undefined' ? BIENS_DATA : []).find(x => x.id === c.bien) || {};
    return {
      id: String(c.id),
      bien: { titre: c.bienTitre || b.titre || '', prix: b.prix || 0, lieu: [b.quartier, b.ville].filter(Boolean).join(', ') },
      messages: (c.messages || []).map(m => ({ de: m.from === 'me' ? 'moi' : 'autre', texte: m.text }))
    };
  }

  /* ---------- Estimation rapide sans IA (secours) ---------- */
  function rapide(c) {
    const t = sa((c.messages || []).filter(m => m.from !== 'me').map(m => m.text).join(' '));
    let s = 25;
    if (/visite|visiter|voir le bien|disponible (ce|le) |samedi|dimanche|lundi|mardi|mercredi|jeudi|vendredi/.test(t)) s += 25;
    if (/accord (de|bancaire)|pret accorde|financement (ok|obtenu|valide)|comptant|cash/.test(t)) s += 25;
    else if (/banque|pret|financement|courtier/.test(t)) s += 10;
    if (/charges|taxe|travaux|copropriete|diagnostic|dpe|compromis|offre/.test(t)) s += 10;
    if (/rapidement|vite|urgent|ce mois|avant /.test(t)) s += 10;
    s = Math.min(95, s);
    return { id: String(c.id), score: s, niveau: s >= 70 ? 'chaud' : s >= 40 ? 'tiède' : 'froid', resume: '', budget: '', financement: 'non précisé', delai: '', action: s >= 70 ? 'Proposez rapidement deux créneaux de visite.' : 'Posez une question sur son projet (budget, financement, délai).', reponse: '', rapide: true };
  }

  /* ---------- Appel ---------- */
  let enCours = false;
  async function analyser(liste) {
    liste = liste.filter(c => (c.messages || []).length);
    if (!liste.length || enCours) return;
    enCours = true; rendreCarte(); bouton();
    try {
      const r = await fetch('/api/prospects', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ convs: liste.map(charge) }) });
      const d = await r.json().catch(() => ({ error: 'réponse illisible' }));
      if (!r.ok || d.error) throw new Error(d.error || 'service indisponible');
      (d.prospects || []).forEach(p => { const c = liste.find(x => String(x.id) === p.id); if (c) c.lead = Object.assign(p, { n: c.messages.length }); });
    } catch (e) {
      liste.forEach(c => { c.lead = Object.assign(rapide(c), { n: c.messages.length, erreur: e.message }); });
    }
    enCours = false;
    if (typeof renderConvList === 'function') renderConvList();
    rendreCarte(); bouton();
  }

  /* ---------- Carte dans la conversation ---------- */
  const NIV = { chaud: 'Prospect chaud', 'tiède': 'Prospect tiède', froid: 'Prospect froid' };
  function rendreCarte() {
    const box = $('msg-lead'); if (!box) return;
    const c = convs().find(x => x.id === actif());
    if (!c || !(c.messages || []).some(m => m.from !== 'me')) { box.innerHTML = ''; return; }
    if (enCours && (!c.lead || c.lead.n !== c.messages.length)) { box.innerHTML = '<div class="lead-w"><span class="iap-scan"></span>L\'IA lit la conversation…</div>'; return; }
    const L = c.lead;
    if (!L) {
      box.innerHTML = `<div class="lead-cta"><span><b>Ce contact est-il sérieux ?</b> L'IA évalue l'acheteur et vous propose une réponse.</span><button type="button" class="btn btn-sm btn-gold" data-lead="un">Qualifier ce prospect</button></div>`;
      return;
    }
    const perime = L.n !== c.messages.length;
    const faits = [['Budget', L.budget], ['Financement', L.financement !== 'non précisé' ? L.financement : ''], ['Délai', L.delai]].filter(x => x[1]);
    box.innerHTML = `<div class="lead lead-${L.niveau === 'tiède' ? 'tiede' : L.niveau}">
      <div class="lead-top"><span class="lead-b">${NIV[L.niveau]}</span><span class="lead-s"><i style="width:${L.score}%"></i></span><b>${L.score}/100</b>
        <button type="button" class="lead-x" data-lead="un" title="Analyser de nouveau">${perime ? 'Nouveaux messages : mettre à jour' : 'Actualiser'}</button></div>
      ${L.resume ? `<p class="lead-r">${E(L.resume)}</p>` : ''}
      ${faits.length ? `<div class="lead-f">${faits.map(([k, v]) => `<span><small>${k}</small>${E(v)}</span>`).join('')}</div>` : ''}
      ${L.action ? `<p class="lead-a"><b>À faire :</b> ${E(L.action)}</p>` : ''}
      ${L.reponse ? `<div class="lead-rep"><p>${E(L.reponse)}</p><button type="button" class="btn btn-sm btn-outline" data-lead="rep">Utiliser cette réponse</button></div>` : ''}
      ${L.rapide ? `<p class="lead-n">Estimation rapide sans IA${L.erreur ? ' (' + E(L.erreur) + ')' : ''}.</p>` : ''}
    </div>`;
  }

  /* ---------- Liste : pastilles et tri ---------- */
  function bouton() {
    const b = $('lead-tri'); if (!b) return;
    b.disabled = enCours; b.textContent = enCours ? 'Analyse en cours…' : 'Trier par priorité (IA)';
  }
  async function trier() {
    const aFaire = convs().filter(c => (c.messages || []).some(m => m.from !== 'me') && (!c.lead || c.lead.n !== c.messages.length));
    if (aFaire.length) await analyser(aFaire);
    convs().sort((a, b) => (b.lead ? b.lead.score : -1) - (a.lead ? a.lead.score : -1));
    if (typeof renderConvList === 'function') renderConvList();
  }

  const r0 = window.renderConvList;
  if (typeof r0 === 'function') {
    window.renderConvList = function () {
      const out = r0.apply(this, arguments);
      try {
        const items = document.querySelectorAll('#conv-list .conv-item');
        convs().forEach((c, i) => {
          const it = items[i]; if (!it || !c.lead) return;
          const n = it.querySelector('.conv-item-name'); if (!n || n.querySelector('.lead-p')) return;
          const s = document.createElement('span'); s.className = 'lead-p ' + (c.lead.niveau === 'tiède' ? 'tiede' : c.lead.niveau); s.textContent = c.lead.niveau + ' · ' + c.lead.score;
          n.appendChild(s);
        });
      } catch (_) { /* liste sans pastilles */ }
      return out;
    };
  }
  const o0 = window.openConversation;
  if (typeof o0 === 'function') window.openConversation = function () { const out = o0.apply(this, arguments); rendreCarte(); return out; };

  document.addEventListener('click', e => {
    const b = e.target.closest && e.target.closest('[data-lead]'); if (b) {
      const c = convs().find(x => x.id === actif()); if (!c) return;
      if (b.dataset.lead === 'un') analyser([c]);
      if (b.dataset.lead === 'rep' && c.lead && c.lead.reponse) { const i = $('msg-input'); if (i) { i.value = c.lead.reponse; i.focus(); } }
    }
    if (e.target.closest && e.target.closest('#lead-tri')) trier();
  });
  window.IMMO_PROSPECTS = { analyser, trier, rapide };
})();
