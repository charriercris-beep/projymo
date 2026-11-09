/* Immo360 NC — Revenir au même endroit après une actualisation de la page
 * Mémorise, pour l'onglet en cours (sessionStorage) : accueil ou espace, profil, onglet, fiche de bien ouverte
 * et position dans la page. Au rechargement, tout est rétabli au lieu de repartir de l'accueil.
 * - mode démo : l'espace est rouvert directement ;
 * - compte réel : on attend que Supabase ait rétabli la session (sinon on reste sur l'accueil) ;
 * - après une déconnexion, rien n'est rétabli.
 * Chargé en dernier : enveloppe go, showLanding, hideLanding, logout, openLandingBien, doLoginConfirm.
 */
(function () {
  'use strict';

  const KEY = 'immo360.nav.v1';
  const read = () => { try { return JSON.parse(sessionStorage.getItem(KEY) || 'null'); } catch (_) { return null; } };
  const write = v => { try { sessionStorage.setItem(KEY, JSON.stringify(v)); } catch (_) { /* stockage indisponible */ } };
  const clear = () => { try { sessionStorage.removeItem(KEY); } catch (_) { /* ignoré */ } };
  const $ = id => document.getElementById(id);
  const inApp = () => { const s = $('main-shell'); return !!s && s.style.display === 'flex'; };
  const isDemo = () => typeof APP_STATE !== 'undefined' && !!APP_STATE.user && APP_STATE.user.email === 'demo@immo360.nc';

  const saved = read();          // état d'avant l'actualisation
  let restoring = !!saved;       // pendant la restauration, on n'écrase pas l'état mémorisé
  let fiche = null;              // id du bien dont la fiche est ouverte

  function snapshot() {
    if (restoring) return;
    const app = inApp();
    if (app && !(typeof APP_STATE !== 'undefined' && APP_STATE.loggedIn)) return;
    const content = document.querySelector('.content'), landing = $('landing-page');
    write({
      view: app ? 'app' : 'landing',
      profil: app ? (typeof S !== 'undefined' ? S.profile : null) : null,
      panel: app ? (typeof S !== 'undefined' ? S.panel : null) : null,
      demo: app ? isDemo() : false,
      fiche,
      scroll: app ? (content ? content.scrollTop : 0) : (landing && landing.scrollTop) || window.scrollY || 0
    });
  }

  /* ---------- Enveloppes ---------- */
  function wrap(name, after) {
    const f = window[name]; if (typeof f !== 'function') return;
    window[name] = function () { const r = f.apply(this, arguments); try { after.apply(this, arguments); } catch (_) { /* ignoré */ } return r; };
  }
  wrap('go', () => snapshot());
  wrap('showLanding', () => snapshot());
  wrap('hideLanding', () => snapshot());
  wrap('openLandingBien', id => { fiche = id; snapshot(); });
  const logout0 = window.logout;
  if (typeof logout0 === 'function') window.logout = function () { restoring = false; fiche = null; clear(); try { Object.keys(sessionStorage).filter(k => k.startsWith('immo360.')).forEach(k => sessionStorage.removeItem(k)); } catch (_) { /* ignoré */ } const r = logout0.apply(this, arguments); write({ view: 'landing', scroll: 0 }); return r; };

  // Fermeture d'une fiche (bouton, clic à côté, Échap ou action) : on l'oublie
  new MutationObserver(() => { if (fiche !== null && !document.querySelector('.fiche-ov')) { fiche = null; snapshot(); } })
    .observe(document.body, { childList: true });
  // Position dans la page, mémorisée au moment de quitter ou d'actualiser
  window.addEventListener('pagehide', snapshot);
  document.addEventListener('visibilitychange', () => { if (document.visibilityState === 'hidden') snapshot(); });

  /* ---------- Restauration ---------- */
  function finish() {
    const s = saved;
    const after = () => {
      if (s.fiche != null && typeof openLandingBien === 'function' && typeof BIENS_DATA !== 'undefined' && BIENS_DATA.some(b => b.id === s.fiche)) openLandingBien(s.fiche);
      const content = document.querySelector('.content'), landing = $('landing-page');
      if (s.view === 'app' && content) content.scrollTop = s.scroll || 0;
      else if (s.view === 'landing') { if (landing && landing.scrollHeight > landing.clientHeight) landing.scrollTop = s.scroll || 0; else window.scrollTo(0, s.scroll || 0); }
      restoring = false; snapshot();
    };
    setTimeout(after, 150); // laisse les grilles et panneaux se dessiner
  }
  function goSaved() {
    if (saved.profil && typeof setProfile === 'function' && S.profile !== saved.profil) setProfile(saved.profil, null);
    if (saved.panel && typeof go === 'function') go(saved.panel);
    finish();
  }
  function restore() {
    if (!saved) return;
    if (saved.view !== 'app') { finish(); return; }
    if (saved.demo) {
      if (typeof loginAs !== 'function') { restoring = false; return; }
      loginAs(saved.profil || 'buy');
      goSaved();
      return;
    }
    // Compte réel : la session Supabase est rétablie par initSupabase → doLoginConfirm
    const confirm0 = window.doLoginConfirm;
    let done = false;
    if (typeof confirm0 === 'function') window.doLoginConfirm = function () { const r = confirm0.apply(this, arguments); if (!done && restoring) { done = true; try { goSaved(); } catch (_) { restoring = false; } } return r; };
    // Pas de session retrouvée (expirée, ou hors ligne) : on reste sur l'accueil
    setTimeout(() => { if (!done) { restoring = false; finish(); } }, 6000);
  }

  window.IMMO_NAV = { read, clear, snapshot };
  if (document.readyState === 'complete') restore(); else window.addEventListener('load', restore);
})();
