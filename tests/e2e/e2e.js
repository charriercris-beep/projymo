// Scénario de bout en bout : plusieurs utilisateurs, chacun dans un navigateur isolé, échangent via la base.
// ⚠️ BASE DE TEST UNIQUEMENT : le scénario VIDE les tables records et professionnels au démarrage.
//    Ne jamais le lancer contre la base Supabase de production.
const { chromium } = require('playwright');
const { execFileSync } = require('child_process');
const fs = require('fs');
const PGHOST = process.argv[2], OUT = process.argv[3], BASE = 'http://localhost:8125';
const FAKE = fs.readFileSync(__dirname + '/fake-supabase.js', 'utf8');
const sql = q => execFileSync('psql', ['-h', PGHOST, '-p', '54329', '-U', 'postgres', '-X', '-q', '-A', '-t', '-c', q], { encoding: 'utf8' }).trim();
const U = {
  'acheteur@test.nc': { id: 'a0000000-0000-0000-0000-00000000000a', password: 'motdepasse1', nom: 'Marie Dupont', profil: 'buy' },
  'banque@test.nc': { id: 'b1000000-0000-0000-0000-0000000000b1', password: 'motdepasse1', nom: 'Conseiller BCI', profil: 'bnk' },
  'banque2@test.nc': { id: 'b2000000-0000-0000-0000-0000000000b2', password: 'motdepasse1', nom: 'Banque non vérifiée', profil: 'bnk' },
  'peintre@test.nc': { id: 'c1000000-0000-0000-0000-0000000000c1', password: 'motdepasse1', nom: 'Eric Peintures NC', profil: 'art' },
  'notaire@test.nc': { id: 'e1000000-0000-0000-0000-0000000000e1', password: 'motdepasse1', nom: 'Me Kaouma', profil: 'not' },
  'diag@test.nc': { id: 'd1000000-0000-0000-0000-0000000000d1', password: 'motdepasse1', nom: 'Diag NC', profil: 'diag' }
};
const ok = (label, cond, extra) => { console.log((cond ? 'OK   ' : 'ÉCHEC') + ' ' + label + (extra !== undefined ? ' → ' + extra : '')); if (!cond) process.exitCode = 1; };
const wait = ms => new Promise(r => setTimeout(r, ms));

(async () => {
  // Base propre + comptes de test ; vérification des pros par l'admin (service_role)
  sql(`truncate public.records; delete from public.professionnels; insert into auth.users values ${Object.values(U).map(u => `('${u.id}')`).join(',')} on conflict do nothing;`);
  sql(`insert into public.professionnels(owner_id,role,nom,metiers) values ('${U['banque@test.nc'].id}','banquier','BCI','{}'),('${U['banque2@test.nc'].id}','banquier','Autre','{}'),('${U['peintre@test.nc'].id}','artisan','Eric Peintures NC','{peinture}'),('${U['diag@test.nc'].id}','diagnostiqueur','Diag NC','{}');
       select set_config('request.jwt.claim.role','service_role',false); update public.professionnels set verifie = true where nom in ('BCI','Eric Peintures NC','Diag NC');`);

  const b = await chromium.launch();
  const errors = [];
  async function user(email) {
    const ctx = await b.newContext({ viewport: { width: 1360, height: 900 } });
    await ctx.addInitScript(`sessionStorage.setItem('__users', ${JSON.stringify(JSON.stringify(U))});` + FAKE);
    await ctx.route('**/*', r => r.request().url().startsWith(BASE) ? r.continue() : r.abort());
    const p = await ctx.newPage();
    p.on('pageerror', e => errors.push(email + ' : ' + e.message));
    p.on('dialog', d => d.accept());
    await p.goto(BASE + '/immo360-global.html'); await p.waitForTimeout(500);
    p.login = async () => {
      const r = await p.evaluate(async ([em, pw]) => {
        document.getElementById('login-email-existing').value = em; document.getElementById('login-password').value = pw;
        await doLoginExisting(); doLoginConfirm(); return APP_STATE.loggedIn;
      }, [email, U[email].password]);
      await p.waitForTimeout(700); return r;
    };
    p.espace = async v => { await p.selectOption('#prof-sel', v); await p.waitForTimeout(500); };
    p.sync = async () => { await p.waitForTimeout(700); await p.evaluate(() => IMMO_SYNC.pullAll()); await p.waitForTimeout(500); };
    return p;
  }

  // 0. Données de démonstration créées AVANT connexion : ne doivent jamais partir en base
  const A = await user('acheteur@test.nc');
  await A.evaluate(() => { loginAs('bnk'); go('bnk-dossiers'); });
  await A.waitForTimeout(300); await A.click('#bk-new'); await A.fill('#bd-client', 'DONNEE DE DEMO'); await A.click('#bd-save');
  await A.evaluate(() => { APP_STATE.user = null; APP_STATE.loggedIn = false; });
  ok('connexion de l\'acheteur (vrai chemin doLoginExisting)', await A.login());
  await A.waitForTimeout(800);
  ok('données de démo purgées du navigateur à la connexion', !(await A.evaluate(() => (localStorage.getItem('immo360.fin.v1') || '').includes('DONNEE DE DEMO'))));
  ok('données de démo absentes de la base', sql(`select count(*) from public.records where data::text like '%DONNEE DE DEMO%'`) === '0');

  // 1. L'acheteur demande une étude de financement
  await A.espace('buy'); await A.evaluate(() => go('capacite')); await A.waitForTimeout(300);
  await A.fill('#fs-revenus', '700000'); await A.click('#fs-send'); await A.waitForTimeout(900);
  ok('une seule demande en base, aucune donnée de démo renvoyée depuis la mémoire', sql(`select count(*) || ' ' || count(*) filter (where data::text like '%DONNEE DE DEMO%') from public.records where collection='fin'`) === '1 0');
  ok('demande de financement enregistrée en base, visant les banquiers', sql(`select audience_role from public.records where collection='fin'`) === 'banquier');

  // 2. L'acheteur, vendeur d'un bien, demande des devis (peinture + plomberie)
  await A.espace('sell'); await A.evaluate(() => go('valorisation')); await A.waitForTimeout(400);
  await A.click('[data-pre="rafraichissement"]'); await A.click('#val-devis-btn');
  await A.fill('#vd-nom', 'Marie Dupont'); await A.fill('#vd-tel', '+687 11 22 33'); await A.click('#vd-send'); await A.waitForTimeout(1000);
  const devisRow = sql(`select audience_role || ' ' || array_to_string(audience_metiers, ',') || ' | ' || data::text from public.records where collection='devis'`);
  ok('demande de devis en base, visant les artisans des bons métiers', devisRow.startsWith('artisan ') && devisRow.includes('peinture'));
  ok('coordonnées du client ABSENTES de la demande partagée', !devisRow.includes('+687 11 22 33') && !devisRow.includes('"nom"'));

  // 3. Banquier non vérifié : ne voit rien, bandeau d'attente
  const E2 = await user('banque2@test.nc'); await E2.login(); await E2.espace('bnk');
  ok('banquier NON vérifié : bandeau « en attente de vérification »', (await E2.textContent('#panel-dashboard')).includes('en attente de vérification'));
  ok('banquier NON vérifié : aucune demande reçue', await E2.evaluate(() => (JSON.parse(localStorage.getItem('immo360.fin.v1')) || []).length) === 0);

  // 4. Banquier vérifié : reçoit la demande et la fait avancer
  const B = await user('banque@test.nc'); await B.login(); await B.espace('bnk');
  const dashB = await B.textContent('#panel-dashboard');
  ok('banquier vérifié : demande reçue en ligne', dashB.includes('nouvelle(s) demande(s)'));
  ok('banquier vérifié : pas de bandeau d\'attente', !dashB.includes('en attente de vérification'));
  await B.locator('#panel-dashboard .bk-dos').first().click(); await B.waitForTimeout(300);
  await B.click('[data-et="etude"]'); await B.waitForTimeout(900);
  ok('prise en charge : banquier assigné, propriétaire inchangé, étape « étude »', sql(`select (assignee='${U['banque@test.nc'].id}')::text || ' ' || (owner_id='${U['acheteur@test.nc'].id}')::text || ' ' || (data->>'etape') from public.records where collection='fin'`) === 'true true etude');
  await E2.sync();
  ok('après prise en charge, l\'autre banquier ne voit toujours rien', await E2.evaluate(() => (JSON.parse(localStorage.getItem('immo360.fin.v1')) || []).length) === 0);
  await A.sync();
  ok('l\'acheteur récupère l\'avancement fait par le banquier', await A.evaluate(() => (JSON.parse(localStorage.getItem('immo360.fin.v1')) || [])[0]?.etape) === 'etude');

  // 5. Peintre vérifié : reçoit la demande (sa partie seulement), répond
  const C = await user('peintre@test.nc'); await C.login();
  await C.evaluate(() => { localStorage.setItem('immo360.art.v1', JSON.stringify({ profil: { nom: 'Eric Peintures NC', forme: 'EI', ridet: '1234567', tel: '+687 43 21 10', email: '', bio: '', metiers: ['peinture'], zones: ['Nouméa'], effectif: '' }, justifs: { ridet: { ref: '1234567' }, decennale: { ref: 'AXA-NC-42', emetteur: 'AXA', exp: '2027-12-31' }, qualification: { ref: 'Q1' } }, statuts: {} })); });
  await C.reload(); await C.waitForTimeout(900);
  ok('session restaurée au rechargement (synchronisation relancée)', await C.evaluate(() => !!IMMO_SYNC.uid && APP_STATE.loggedIn));
  ok('retour sur le site : arrivée directe dans son espace', await C.evaluate(() => document.getElementById('main-shell').style.display === 'flex'));
  await C.espace('art'); await C.evaluate(() => go('art-demandes')); await C.waitForTimeout(400);
  ok('peintre : demande reçue', await C.locator('#panel-art-demandes .art-req').count() === 1);
  await C.locator('#panel-art-demandes .art-req').first().click(); await C.waitForTimeout(300);
  const detailC = await C.textContent('#panel-art-demandes');
  ok('peintre : ne voit que sa partie (pas la plomberie)', !detailC.includes('Petites réparations'));
  ok('peintre : coordonnées du client masquées', !detailC.includes('+687 11 22 33'));
  await C.fill('#art-lines tr:nth-child(1) .l-p', '4500'); await C.fill('#art-lines tr:nth-child(1) .l-q', '160'); await C.fill('#art-taxe', '6');
  await C.click('#art-send'); await C.waitForTimeout(900);
  ok('réponse du peintre en base', sql(`select count(*) from public.records where collection='devis_reponse'`) === '1');

  // 6. Le vendeur voit le devis et l'accepte
  await A.sync(); await A.espace('sell'); await A.evaluate(() => { go('artisans'); switchArtisanTab('devis'); }); await A.waitForTimeout(400);
  ok('vendeur : devis du peintre reçu', (await A.textContent('#devis-list')).includes('Eric Peintures NC'));
  await A.click('text=Accepter ce devis'); await A.waitForTimeout(1200);
  ok('contact transmis au seul peintre retenu', sql(`select (assignee='${U['peintre@test.nc'].id}')::text from public.records where collection='devis_contact'`) === 'true');

  // 7. Le peintre voit l'acceptation et les coordonnées
  // l'acceptation arrive à la synchronisation suivante : jusqu'à 3 tentatives (pas de délai fixe)
  for (let k = 0; k < 3; k++) { await C.sync(); await C.evaluate(() => go('art-devis')); await C.waitForTimeout(300); if ((await C.textContent('#panel-art-devis')).includes('Accepté')) break; }
  ok('peintre : devis accepté', (await C.textContent('#panel-art-devis')).includes('Accepté'));
  await C.locator('#panel-art-devis .art-req').first().click(); await C.waitForTimeout(300);
  ok('peintre : coordonnées du client désormais visibles', (await C.textContent('#panel-art-demandes')).includes('+687 11 22 33'));

  // 8. Notaire → diagnostiqueur
  const N = await user('notaire@test.nc'); await N.login(); await N.espace('not');
  await N.evaluate(() => go('not-dossiers')); await N.waitForTimeout(300); await N.click('#nt-new'); await N.waitForTimeout(200);
  await N.fill('#nd-vnom', 'M. Lebon'); await N.fill('#nd-adr', '12 rue Jules Garnier'); await N.click('#nd-save'); await N.waitForTimeout(300);
  await N.click('[data-cmd="diag"]'); await N.waitForTimeout(900);
  ok('dossier notaire privé en base (aucun public visé)', sql(`select count(*) from public.records where collection='notaire' and audience_role is null`) === '1');
  ok('commande de diagnostic en base, visant les diagnostiqueurs', sql(`select audience_role from public.records where collection='mission_diag'`) === 'diagnostiqueur');
  const D = await user('diag@test.nc'); await D.login(); await D.espace('diag');
  ok('diagnostiqueur : commande reçue', (await D.textContent('#panel-dashboard')).includes('1 nouvelle(s) demande(s)'));
  ok('diagnostiqueur : ne voit pas le dossier du notaire', await D.evaluate(() => (JSON.parse(localStorage.getItem('immo360.notaire.v1')) || []).length) === 0);
  await D.locator('#panel-dashboard .ms-row').first().click(); await D.waitForTimeout(300);
  await D.fill('[data-lv="ref"]', 'RAP-2026-118'); await D.click('[data-et="livree"]'); await D.waitForTimeout(900);
  await N.sync();
  ok('le notaire récupère le rapport livré', await N.evaluate(() => (JSON.parse(localStorage.getItem('immo360.missions.diag.v1')) || [])[0]?.liv?.ref) === 'RAP-2026-118');

  // 9. Visite vidéo : publiée par le vendeur, vue par un visiteur NON connecté sur un autre appareil
  await A.espace('sell'); await A.evaluate(() => go('visite')); await A.waitForTimeout(300);
  await A.evaluate(async () => { const mk = (n, c) => new Promise(r => { const cv = document.createElement('canvas'); cv.width = 1600; cv.height = 1000; const x = cv.getContext('2d'); x.fillStyle = c; x.fillRect(0, 0, 1600, 1000); cv.toBlob(b => r(new File([b], n, { type: 'image/jpeg' })), 'image/jpeg', 0.9); });
    await IMMO_VISITE.addFiles([await mk('facade.jpg', '#2a7a4b'), await mk('salon.jpg', '#2a4a7a')]); go('visite'); });
  await A.waitForTimeout(300); await A.selectOption('#vv-bien', '1'); await A.waitForTimeout(300); await A.click('#vv-pub'); await A.waitForTimeout(1200);
  ok('visite publiée enregistrée en base', sql(`select (data->>'publie') || ' ' || jsonb_array_length(data->'photos') from public.records where collection='visite'`) === 'true 2');
  const V = await user('visiteur@anonyme.nc');
  await V.evaluate(() => { showLanding(); openLandingBien(1); }); await V.waitForTimeout(1500);
  ok('visiteur non connecté : la visite s\'affiche dans la fiche publique', await V.locator('.vv-player canvas').count() === 1);
  await V.click('.vv-big'); await V.waitForTimeout(1300);
  ok('visiteur non connecté : la visite se joue', (await V.textContent('.vv-tm')).startsWith('0:01'));
  await A.evaluate(() => go('visite')); await A.waitForTimeout(300); await A.click('#vv-unpub'); await A.waitForTimeout(1200);
  const V2 = await user('visiteur@anonyme.nc');
  await V2.evaluate(() => { showLanding(); openLandingBien(1); }); await V2.waitForTimeout(1500);
  ok('visite retirée : plus visible du public', await V2.locator('.vv-player').count() === 0);
  ok('un autre utilisateur ne peut pas modifier la visite', sql(`set role authenticated; select set_config('request.jwt.claim.sub','${U['banque@test.nc'].id}',false); with x as (update public.records set data = jsonb_set(data,'{publie}','true') where collection='visite' returning 1) select count(*) from x;`).split('\n').pop() === '0');

  // 9. Déconnexion : purge des données personnelles du navigateur
  await A.evaluate(() => logout()); await A.waitForTimeout(300);
  ok('déconnexion : données Immo360 purgées du navigateur', await A.evaluate(() => Object.keys(localStorage).filter(k => k.startsWith('immo360.') && k !== 'immo360.baremes.v1').length) === 0);
  await A.screenshot({ path: OUT + '/e2e-fin.png' });

  ok('aucune erreur JavaScript', errors.length === 0, errors.join(' | '));
  await b.close();
})();
