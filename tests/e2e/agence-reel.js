// Espaces réels : aucune donnée inventée pour un vrai compte, données de l'agence privées et conservées,
// exemples seulement en démonstration, plus de faux envois, statistiques réelles des annonces.
// ⚠️ BASE DE TEST UNIQUEMENT. Lancer après server.js : node tests/e2e/agence-reel.js $PG [dossier captures]
const { chromium } = require('playwright');
const { execFileSync } = require('child_process');
const fs = require('fs');
const PGHOST = process.argv[2], OUT = process.argv[3] || '/tmp', BASE = 'http://localhost:8125';
const FAKE = fs.readFileSync(__dirname + '/fake-supabase.js', 'utf8');
const sql = q => execFileSync('psql', ['-h', PGHOST, '-p', '54329', '-U', 'postgres', '-X', '-q', '-A', '-t', '-c', q], { encoding: 'utf8' }).trim();
const U = {
  'agence1@test.nc': { id: 'ab000000-0000-0000-0000-0000000000b1', password: 'motdepasse1', nom: 'Agence Une', profil: 'agt' },
  'agence2@test.nc': { id: 'ab000000-0000-0000-0000-0000000000b2', password: 'motdepasse1', nom: 'Agence Deux', profil: 'agt' },
  'acheteur.ag@test.nc': { id: 'ab000000-0000-0000-0000-0000000000b3', password: 'motdepasse1', nom: 'Bruno Acheteur', profil: 'buy' }
};
const ok = (label, cond, extra) => { console.log((cond ? 'OK   ' : 'ÉCHEC') + ' ' + label + (extra !== undefined ? ' → ' + extra : '')); if (!cond) process.exitCode = 1; };
const wait = ms => new Promise(r => setTimeout(r, ms));
const A1 = U['agence1@test.nc'].id, A2 = U['agence2@test.nc'].id, B = U['acheteur.ag@test.nc'].id;
const FICTIF = /Bernard Laurent|Marie Lecomte|Famille Roux|Isabelle Fontaine|Thomas Gérard|Me Dupont|2 847|Immobilier\.nc|SMS envoyé|signature électronique/;

(async () => {
  const ids = Object.values(U).map(u => `'${u.id}'`).join(',');
  sql(`delete from public.records where owner_id in (${ids}) or assignee in (${ids}); delete from public.evenements where detail = '990001';
       insert into auth.users(id, email, raw_user_meta_data) values ${Object.entries(U).map(([e, u]) => `('${u.id}','${e}','{"nom":"${u.nom}"}')`).join(',')} on conflict (id) do update set raw_user_meta_data = excluded.raw_user_meta_data;
       insert into public.records(collection, id, owner_id, data) values ('annonce', '990001', '${A1}', '{"id":990001,"titre":"Villa test statistiques","type":"Villa","surface":150,"prix":80000000,"ville":"Nouméa","quartier":"Tina","publie":true,"date":"2026-11-20"}');
       insert into public.evenements(nom, profil, appareil, detail) select 'fiche_vue', 'visiteur', 'mobile', '990001' from generate_series(1, 7);`);
  const b = await chromium.launch(), errors = [], dialogs = [];
  async function user(email) {
    const ctx = await b.newContext({ viewport: { width: 1300, height: 900 } });
    await ctx.addInitScript(`sessionStorage.setItem('__users', ${JSON.stringify(JSON.stringify(U))});` + FAKE);
    await ctx.route('**/*', r => r.request().url().startsWith(BASE) ? r.continue() : r.abort());
    const p = await ctx.newPage(); p.on('pageerror', e => errors.push(e.message)); p.on('dialog', d => { dialogs.push(d.message()); d.dismiss(); });
    await p.goto(BASE + '/immo360-global.html'); await wait(1500);
    if (email) { await p.evaluate(async ([em, pw]) => { document.getElementById('login-email-existing').value = em; document.getElementById('login-password').value = pw; await doLoginExisting(); doLoginConfirm(); }, [email, U[email].password]); await wait(1800); }
    return p;
  }
  const txt = async (p, k) => { await p.evaluate(k => go(k), k); await wait(600); return p.innerText('.panel.active'); };

  // 1. Démonstration : exemples, avec bandeau
  const demo = await user(null);
  await demo.evaluate(() => loginAs('agt')); await wait(300);
  const td = await txt(demo, 'mandats');
  ok('démo : exemples affichés avec le bandeau « Exemples de démonstration »', /Exemples de démonstration/.test(td) && /Bernard Laurent/.test(td));

  // 2. Vrai compte agence : rien d'inventé, nulle part
  const a1 = await user('agence1@test.nc');
  await a1.evaluate(() => setProfile('agt', null)); await wait(400);
  for (const k of ['mandats', 'notaire', 'crm', 'matching', 'visites', 'statsannonces']) {
    const t = await txt(a1, k); const m = t.match(FICTIF);
    ok(`vrai compte : « ${k} » sans donnée inventée`, !m, m && m[0]);
  }
  // 3. Données de l'agence enregistrées, privées, conservées
  await a1.evaluate(() => { go('mandats'); MANDATS.push({ id: 1, type: 'exclusif', bien: 'Maison test Tina', vendeur: 'M. Vrai Vendeur', tel: '+687 12 34 56', prix: 50000000, honoraires: 4, debut: '2026-11-01', fin: '2027-05-01', statut: 'actif', signe: false, conditions: '' }); buildMandats(); });
  await wait(3500);
  ok('mandat enregistré en base, privé (collection agt_mandat)', sql(`select count(*) from public.records where collection = 'agt_mandat' and owner_id = '${A1}' and data->>'vendeur' = 'M. Vrai Vendeur'`) === '1');
  ok('identifiant unique attribué (pas de collision entre agences)', Number(sql(`select id from public.records where collection = 'agt_mandat' and owner_id = '${A1}' limit 1`)) > 1e12);
  const a2 = await user('agence2@test.nc');
  await a2.evaluate(() => setProfile('agt', null)); await wait(400);
  ok('une autre agence ne voit pas ce mandat', !/Vrai Vendeur/.test(await txt(a2, 'mandats')));
  const a1b = await user('agence1@test.nc');
  await a1b.evaluate(() => setProfile('agt', null)); await wait(400);
  ok('mandat retrouvé à la reconnexion (autre navigateur)', /Vrai Vendeur/.test(await txt(a1b, 'mandats')));
  // 4. Plus de faux envois : mandat → document à imprimer, SMS → message préparé
  dialogs.length = 0;
  const [pop] = await Promise.all([a1b.waitForEvent('popup'), a1b.evaluate(() => signerMandat(MANDATS[0].id))]);
  await pop.waitForLoadState(); const doc = await pop.textContent('body');
  ok('mandat : document imprimable (pas de prétendu email)', /Mandat de vente exclusif/.test(doc) && /Vrai Vendeur/.test(doc) && !dialogs.some(d => /email/.test(d)), dialogs.join(' | '));
  // 5. Statistiques réelles
  const st = await txt(a1b, 'statsannonces');
  ok('statistiques réelles : 7 fiches vues de la villa', /Villa test statistiques/.test(st) && /\b7\b/.test(st), st.replace(/\s+/g, ' ').slice(0, 160));
  await a1b.screenshot({ path: OUT + '/stats-reelles.png' });
  // 6. Acheteur : « Mon achat » et « Biens pour moi » sans inventions
  const ach = await user('acheteur.ag@test.nc');
  await ach.evaluate(() => setProfile('buy', null)); await wait(400);
  const ma = await txt(ach, 'suiviachat');
  ok('Mon achat : pas de notification inventée', !/3 nouveaux biens|Taux immobilier NC|undefined/.test(ma) && /Prochaine étape conseillée/.test(ma), ma.replace(/\s+/g, ' ').slice(0, 140));
  const bm = await txt(ach, 'matching');
  ok('Biens pour moi : propre à l\'acheteur (plus de liste d\'acheteurs d\'agence)', /Biens pour moi/.test(bm) && !/Marie Lecomte|Acheteurs enregistrés/.test(bm));
  ok('aucune erreur JavaScript', errors.length === 0, errors.join(' | '));
  await b.close();
})();
