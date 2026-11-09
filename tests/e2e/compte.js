// Vrai compte ou démo : publier une annonce demande un compte quand la base est disponible ;
// un utilisateur connecté qui clique sur « Vendre » depuis l'accueil reste sur son compte.
// ⚠️ BASE DE TEST UNIQUEMENT. Lancer après server.js : node tests/e2e/compte.js $PG
const { chromium } = require('playwright');
const { execFileSync } = require('child_process');
const fs = require('fs');
const PGHOST = process.argv[2], BASE = 'http://localhost:8125';
const FAKE = fs.readFileSync(__dirname + '/fake-supabase.js', 'utf8');
const sql = q => execFileSync('psql', ['-h', PGHOST, '-p', '54329', '-U', 'postgres', '-X', '-q', '-A', '-t', '-c', q], { encoding: 'utf8' }).trim();
const U = { 'proprio@test.nc': { id: 'f5000000-0000-0000-0000-0000000000f5', password: 'motdepasse1', nom: 'Paul Proprio', profil: 'sell' } };
const ok = (label, cond, extra) => { console.log((cond ? 'OK   ' : 'ÉCHEC') + ' ' + label + (extra !== undefined ? ' → ' + extra : '')); if (!cond) process.exitCode = 1; };
const wait = ms => new Promise(r => setTimeout(r, ms));
(async () => {
  const id = U['proprio@test.nc'].id;
  sql(`delete from public.records where owner_id = '${id}'; insert into auth.users(id, email) values ('${id}', 'proprio@test.nc') on conflict (id) do nothing;`);
  const b = await chromium.launch(), errors = [];
  const ctx = await b.newContext({ viewport: { width: 1300, height: 900 } });
  await ctx.addInitScript(`sessionStorage.setItem('__users', ${JSON.stringify(JSON.stringify(U))});` + FAKE);
  await ctx.route('**/*', r => r.request().url().startsWith(BASE) ? r.continue() : r.abort());
  const p = await ctx.newPage(); p.on('pageerror', e => errors.push(e.message)); p.on('dialog', d => d.accept());
  await p.goto(BASE + '/immo360-global.html'); await wait(1200);
  // Visiteur sans compte : « Vendre » depuis l'accueil → démo, bouton « Se connecter » visible
  await p.evaluate(() => { loginAs('sell'); go('depot'); }); await wait(300);
  ok('démo : bouton « Se connecter » visible dans l\'en-tête', await p.isVisible('#tn-login'));
  ok('démo : « Quitter la démo » au lieu de « Déconnexion »', (await p.textContent('#tn-out')).trim() === 'Quitter la démo');
  await p.click('#panel-depot .dp-tile[data-type="Appartement"]'); await p.fill('#d-surface', '70');
  await p.evaluate(() => goDepotStep(3)); await p.fill('#d-prix', '34000000'); await p.evaluate(() => { goDepotStep(4); goDepotStep(5); }); await wait(200);
  await p.click('#btn-publier'); await wait(600);
  ok('sans compte : publication refusée, invitation à se connecter', /Connectez-vous pour publier/.test(await p.textContent('#depot-notif')) && sql(`select count(*) from public.records where owner_id = '${id}'`) === '0');
  // Connexion depuis l'invitation → retour à la dernière étape, formulaire conservé
  await p.click('#depot-notif button:has-text("J\'ai déjà un compte")'); await wait(300);
  await p.fill('#login-email-existing', 'proprio@test.nc'); await p.fill('#login-password', 'motdepasse1');
  await p.evaluate(async () => { await doLoginExisting(); }); await wait(600);
  await p.click('#auth-step-2 button'); await wait(900);
  ok('après connexion : retour à la dernière étape du dépôt, saisie conservée', await p.evaluate(() => S.panel === 'depot' && window.depotStep === 5 && document.getElementById('d-prix').value === '34000000'));
  ok('connecté : bouton « Se connecter » masqué', !(await p.isVisible('#tn-login')));
  await p.click('#btn-publier'); await wait(2500);
  ok('publication en ligne : annonce enregistrée dans la base', /Annonce publiée\./.test(await p.textContent('#depot-notif')) && sql(`select count(*) from public.records where owner_id = '${id}' and collection = 'annonce'`) === '1', (await p.textContent('#depot-notif')).replace(/\s+/g, ' ').slice(0, 90));
  // Connecté, retour à l'accueil puis « Vendre » : on reste sur le compte (pas « Demo »)
  await p.evaluate(() => { showLanding(); loginAs('sell'); }); await wait(300);
  ok('connecté : « Vendre » depuis l\'accueil garde le vrai compte', await p.evaluate(() => APP_STATE.user.email === 'proprio@test.nc' && IMMO_SYNC.uid != null));
  ok('aucune erreur JavaScript', errors.length === 0, errors.join(' | '));
  sql(`delete from public.records where owner_id = '${id}'`);
  await b.close();
})().catch(e => { console.error(e); process.exitCode = 1; });
