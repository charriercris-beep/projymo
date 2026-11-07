/* Immo360 NC — Pages d'information (pied de page) et petit message de confirmation.
 * showPage() était appelée par le pied de page sans jamais avoir été définie : les liens ne faisaient rien.
 * Les informations légales de l'éditeur restent à compléter avant l'ouverture au public.
 */
(function () {
  'use strict';

  const PAGES = {
    mentions: ['Mentions légales', `
      <p><b>Éditeur du site</b> : Immo360 NC — raison sociale, forme, capital, adresse, numéro RIDET et directeur de la publication <i>à compléter avant l'ouverture au public</i>.</p>
      <p><b>Hébergement</b> : Vercel Inc. (site) et Supabase (données).</p>
      <p><b>Annonces</b> : chaque annonce est publiée sous la responsabilité de son auteur. Les annonces de démonstration sont signalées et leurs photos portent la mention « Photo d'illustration ».</p>
      <p><b>Estimations</b> : indicatives, calculées à partir des annonces publiées et de la statistique officielle des ventes (ISEE). Elles ne remplacent pas l'avis d'un professionnel.</p>`],
    cgv: ['Conditions d\'utilisation', `
      <p>Le site permet de consulter des annonces, d'estimer un bien, de déposer une annonce et d'échanger avec des professionnels.</p>
      <ul><li>Consulter les annonces est gratuit et ne demande pas de compte.</li>
      <li>Déposer une annonce demande un compte. Vous vous engagez à publier des informations exactes et des photos dont vous avez les droits.</li>
      <li>Les professionnels s'inscrivent avec leur numéro RIDET ; leur profil est vérifié avant d'apparaître aux particuliers.</li>
      <li>Les conditions tarifaires des services payants seront publiées ici avant leur mise en place.</li></ul>`],
    confidentialite: ['Confidentialité', `
      <p>Nous ne collectons que ce qui sert au service : votre nom, vos coordonnées, vos annonces et vos dossiers.</p>
      <ul><li>Vos documents (pièces d'identité, avis d'imposition…) ne sont visibles que par vous et les professionnels que vous choisissez.</li>
      <li>Aucune donnée n'est revendue.</li>
      <li>Vos favoris et brouillons restent sur votre appareil.</li>
      <li>Vous pouvez demander la consultation, la correction ou la suppression de vos données à tout moment depuis la page Contact.</li></ul>`],
    contact: ['Contact', `
      <p>Une question, un problème avec une annonce, une demande sur vos données ?</p>
      <p>Écrivez-nous depuis la messagerie de votre espace, ou à l'adresse de contact qui sera publiée ici à l'ouverture.</p>`],
    credits: ['Crédits photos', `
      <p>Les photos des annonces de démonstration sont des <b>photos d'illustration</b> libres de droits (licence CC0, domaine public), issues de Wikimedia Commons / Unsplash. Elles ne représentent pas les biens décrits.</p>
      <p>Les annonces déposées par les vendeurs utilisent leurs propres photos.</p>
      <p>Détail des sources : fichier <code>assets/demo/CREDITS.md</code> du projet.</p>`]
  };

  function close(ov) { ov.remove(); document.removeEventListener('keydown', ov._k); if (ov._from) try { ov._from.focus(); } catch (_) { /* ignoré */ } }
  function showPage(name) {
    const p = PAGES[name]; if (!p) return;
    document.querySelectorAll('.immo-page').forEach(x => x.remove());
    const ov = document.createElement('div');
    ov.className = 'immo-page modal-overlay'; ov._from = document.activeElement;
    ov.style.cssText = 'display:flex;position:fixed;inset:0;background:rgba(20,26,32,.55);z-index:3000;align-items:center;justify-content:center;padding:16px';
    ov.innerHTML = `<div role="dialog" aria-modal="true" aria-labelledby="immo-page-t" style="background:#fff;border-radius:14px;max-width:620px;width:100%;max-height:88vh;overflow:auto;padding:28px 28px 24px;font-size:16px;line-height:1.6;color:var(--dark)">
      <div style="display:flex;justify-content:space-between;align-items:start;gap:16px;margin-bottom:8px"><h2 id="immo-page-t" style="margin:0;font-size:24px">${p[0]}</h2>
      <button type="button" class="pg-x" aria-label="Fermer" style="background:var(--cream);border:0;width:36px;height:36px;border-radius:50%;font-size:18px;cursor:pointer;flex:none">✕</button></div>${p[1]}</div>`;
    ov.addEventListener('click', e => { if (e.target === ov || e.target.closest('.pg-x')) close(ov); });
    ov._k = e => { if (e.key === 'Escape') close(ov); };
    document.addEventListener('keydown', ov._k);
    document.body.appendChild(ov);
    ov.querySelector('.pg-x').focus();
  }

  function showToast(t) {
    document.querySelectorAll('.immo-toast').forEach(x => x.remove());
    const n = document.createElement('div'); n.setAttribute('role', 'status'); n.className = 'immo-toast';
    n.style.cssText = 'position:fixed;bottom:20px;left:50%;transform:translateX(-50%);background:var(--dark);color:#fff;padding:12px 20px;border-radius:10px;font-size:15px;z-index:3100;box-shadow:0 8px 24px rgba(0,0,0,.2)';
    n.textContent = t; document.body.appendChild(n); setTimeout(() => n.remove(), 3000);
  }

  Object.assign(window, { showPage, showToast });
})();
