// Back office (admin.html) : accès réservé, validation des pros, commandes à régler, modération, interrupteur.
// ⚠️ BASE DE TEST UNIQUEMENT (vide et remplit des tables). Lancer après server.js : node tests/e2e/admin.js $PG
const { chromium } = require('playwright');
const { execFileSync } = require('child_process');
const fs = require('fs');
const PGHOST = process.argv[2], BASE = 'http://localhost:8125';
const FAKE = fs.readFileSync(__dirname + '/fake-supabase.js', 'utf8');
const sql = q => execFileSync('psql', ['-h', PGHOST, '-p', '54329', '-U', 'postgres', '-X', '-q', '-A', '-t', '-c', q], { encoding: 'utf8' }).trim();
const U = {
  'admin@test.nc': { id: 'f0000000-0000-0000-0000-0000000000f0', password: 'motdepasse1', nom: 'Admin', profil: 'buy' },
  'vendeur@test.nc': { id: 'f1000000-0000-0000-0000-0000000000f1', password: 'motdepasse1', nom: 'Vendeur', profil: 'sell' },
  'artisan2@test.nc': { id: 'f2000000-0000-0000-0000-0000000000f2', password: 'motdepasse1', nom: 'Artisan', profil: 'art' }
};
const ok = (label, cond, extra) => { console.log((cond ? 'OK   ' : 'ÉCHEC') + ' ' + label + (extra !== undefined ? ' → ' + extra : '')); if (!cond) process.exitCode = 1; };
const wait = ms => new Promise(r => setTimeout(r, ms));

(async () => {
  const ids = Object.values(U).map(u => `'${u.id}'`).join(',');
  sql(`delete from public.options_annonce where owner_id in (${ids}); delete from public.abonnements where owner_id in (${ids});
       delete from public.records where owner_id in (${ids}); delete from public.professionnels where owner_id in (${ids}); delete from public.admins;
       insert into auth.users(id, email) values ${Object.entries(U).map(([e, u]) => `('${u.id}','${e}')`).join(',')} on conflict (id) do update set email = excluded.email;
       insert into public.admins(user_id) values ('${U['admin@test.nc'].id}');
       update public.parametres set valeur = 'off' where cle = 'mode_tarifs';
       insert into public.professionnels(owner_id, role, nom, ridet, metiers) values ('${U['artisan2@test.nc'].id}', 'artisan', 'Plomberie du Lagon', '1234567001', '{plomberie}');
       insert into public.records(collection, id, owner_id, data) values
         ('annonce', '7001', '${U['vendeur@test.nc'].id}', '{"id":7001,"titre":"Villa test modération","type":"Villa","prix":50000000,"ville":"Nouméa","publie":true}'),
         ('annonce_photos', '7001', '${U['vendeur@test.nc'].id}', '{"publie":true,"photos":[]}');
       insert into public.options_annonce(owner_id, annonce_id, option, prix, statut) values ('${U['vendeur@test.nc'].id}', 7001, 'urgent', 1500, 'a_payer');
       insert into public.abonnements(owner_id, role, formule, prix, statut) values ('${U['artisan2@test.nc'].id}', 'art', 'pro', 6900, 'a_payer');`);

  const b = await chromium.launch(), errors = [];
  async function page(email, path) {
    const ctx = await b.newContext({ viewport: { width: 1360, height: 900 } });
    await ctx.addInitScript(`sessionStorage.setItem('__users', ${JSON.stringify(JSON.stringify(U))});` + FAKE);
    await ctx.route('**/*', r => r.request().url().startsWith(BASE) ? r.continue() : r.abort());
    const p = await ctx.newPage(); p.on('pageerror', e => errors.push(email + ' : ' + e.message)); p.on('dialog', d => d.accept(d.type() === 'prompt' ? 'Annonce de test non conforme' : undefined));
    await p.goto(BASE + path); await wait(500);
    if (email) { await p.fill('#le', email); await p.fill('#lp', U[email].password); await p.click('#lf button'); await wait(800); }
    return p;
  }

  // 1. Un compte non administrateur est refusé, et les fonctions lui sont fermées
  const v = await page('vendeur@test.nc', '/admin.html');
  ok('compte non admin : accès refusé', /n'a pas l'accès administrateur/.test(await v.textContent('#app')));
  const direct = await v.evaluate(async id => { const r = await fetch('/__db', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ op: 'rpc', fn: 'admin_commandes', uid: id }) }).then(r => r.json()); return r.error && r.error.message; }, U['vendeur@test.nc'].id);
  ok('appel direct d\'une fonction admin par un non-admin : refusé par la base', /réservé/.test(direct || ''), direct);

  // 2. Administrateur
  const a = await page('admin@test.nc', '/admin.html');
  const nAtt = sql(`select count(*) from public.professionnels where not verifie and refuse_le is null`), nCmd = sql(`select (select count(*) from public.options_annonce where statut = 'a_payer') + (select count(*) from public.abonnements where statut = 'a_payer')`);
  const tabs = (await a.textContent('.tabs')).replace(/\s+/g, '');
  ok('admin : back office ouvert, pros et commandes en attente comptés', tabs.includes('Professionnels' + nAtt) && tabs.includes('Commandesàrégler' + nCmd), tabs);
  // Tableau de bord (onglet par défaut) : chiffres conformes à la base
  await wait(600);
  const enLigne = sql(`select count(*) from public.records where collection = 'annonce' and coalesce((data->>'publie')::boolean, false)`);
  const kt = (await a.innerText('#sec')).replace(/\s+/g, ' ');
  ok('tableau de bord : annonces en ligne et comptes conformes à la base', kt.includes(enLigne + ' en ligne') && kt.includes(sql(`select count(*) from auth.users`) + ' comptes'), kt.slice(0, 160));
  ok('tableau de bord : histogrammes et répartitions affichés', (await a.locator('.cols').count()) === 2 && (await a.locator('.hb').count()) >= 3);
  const aRegler = sql(`select (select coalesce(sum(prix),0) from public.options_annonce where statut='a_payer') + (select coalesce(sum(prix),0) from public.abonnements where statut='a_payer')`);
  const vu = ((kt.match(/([\d ]+) F commandes à régler/) || [])[1] || '').replace(/\D/g, '');
  ok('tableau de bord : montant des commandes à régler conforme', vu === aRegler, vu + ' / ' + aRegler);
  await a.screenshot({ path: (process.argv[3] || '/tmp') + '/admin-kpi.png', fullPage: true });
  const kpiNonAdmin = await v.evaluate(async id => (await fetch('/__db', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ op: 'rpc', fn: 'admin_kpis', uid: id }) }).then(r => r.json())).error, U['vendeur@test.nc'].id);
  ok('indicateurs refusés à un non-admin', !!kpiNonAdmin);
  await a.click('[data-t="pros"]'); await wait(500);
  const proId = sql(`select id from public.professionnels where nom = 'Plomberie du Lagon'`);
  await a.click(`[data-ok="${proId}"]`); await wait(700);
  ok('pro validé', sql(`select verifie from public.professionnels where nom = 'Plomberie du Lagon'`) === 't');
  await a.click('[data-t="cmd"]'); await wait(500);
  ok('commandes : option et abonnement listés', (await a.locator('[data-pay]').count()) === 2);
  await a.selectOption('select[data-mois]', '3');
  await a.click('[data-pay^="abonnement"]'); await wait(700);
  ok('abonnement payé → actif 3 mois', sql(`select statut || ':' || (date_part('month', age(fin, debut)))::int from public.abonnements where owner_id = '${U['artisan2@test.nc'].id}'`) === 'actif:3');
  await a.click('[data-pay^="option"]'); await wait(700);
  ok('option payée → active 30 jours', sql(`select statut || ':' || (fin - debut) from public.options_annonce where annonce_id = 7001`) === 'active:30 days');
  ok('plus aucune commande en attente', /Aucune commande en attente/.test(await a.textContent('#sec')));
  await a.click('[data-t="ann"]'); await wait(700);
  ok('annonces : annonce du vendeur listée avec son email', /Villa test modération/.test(await a.textContent('#al')) && /vendeur@test.nc/.test(await a.textContent('#al')));
  await a.click('[data-ret="7001"]'); await wait(800);
  ok('annonce retirée (annonce + photos), motif enregistré', sql(`select string_agg(collection || ':' || (data->>'publie') || ':' || coalesce(data->>'modere','') , ',' order by collection) from public.records where id = '7001'`) === 'annonce:false:true,annonce_photos:false:true'
    && /non conforme/.test(sql(`select data->>'motif' from public.records where collection = 'annonce' and id = '7001'`)));
  // l'auteur tente de la remettre en ligne : la base l'en empêche
  const rep = await v.evaluate(async id => fetch('/__db', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ op: 'update', table: 'records', patch: { data: { id: 7001, titre: 'Villa test modération', publie: true } }, filters: [['collection', 'annonce'], ['id', '7001']], uid: id }) }).then(r => r.json()), U['vendeur@test.nc'].id);
  ok('l\'auteur ne peut pas republier une annonce retirée par la modération', sql(`select data->>'publie' from public.records where collection = 'annonce' and id = '7001'`) === 'false', JSON.stringify(rep));
  const pub = await (await page(null, '/immo360-global.html')).evaluate(async () => { await new Promise(r => setTimeout(r, 1200)); return BIENS_DATA.some(x => x.id === 7001); });
  ok('annonce retirée invisible pour les visiteurs', pub === false);
  await a.click('[data-rest="7001"]'); await wait(800);
  ok('rétablie par l\'admin', sql(`select data->>'publie' from public.records where collection = 'annonce' and id = '7001'`) === 'true');
  // 3. Interrupteur
  await a.click('[data-t="mode"]'); await wait(500);
  await a.check('input[name=md][value=lancement]'); await a.click('#md-go'); await wait(700);
  ok('interrupteur : mode lancement enregistré dans la base', sql(`select valeur from public.parametres where cle = 'mode_tarifs'`) === 'lancement');
  const visiteur = await page(null, '/immo360-global.html'); await wait(800);
  ok('le site lit le mode dans la base (lien Tarifs visible)', await visiteur.evaluate(() => IMMO_TARIFS.MODE === 'lancement' && !document.getElementById('lp-tarifs').hidden));
  sql(`update public.parametres set valeur = 'off' where cle = 'mode_tarifs'`);
  ok('aucune erreur JavaScript', errors.length === 0, errors.join(' | '));
  await b.close();
})().catch(e => { console.error(e); process.exitCode = 1; });
