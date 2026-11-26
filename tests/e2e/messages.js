// Messagerie réelle : un acheteur écrit et demande une visite depuis la fiche, le vendeur reçoit et répond,
// l'acheteur voit la réponse. Sécurité : destinataire fixé par la base, pas d'envoi anonyme ni à un tiers.
// Fenêtre de financement au-dessus de la fiche, demande d'étude reçue par un courtier vérifié.
// ⚠️ BASE DE TEST UNIQUEMENT. Lancer après server.js : node tests/e2e/messages.js $PG [dossier captures]
const { chromium } = require('playwright');
const { execFileSync } = require('child_process');
const fs = require('fs');
const PGHOST = process.argv[2], OUT = process.argv[3] || '/tmp', BASE = 'http://localhost:8125';
const FAKE = fs.readFileSync(__dirname + '/fake-supabase.js', 'utf8');
const sql = q => execFileSync('psql', ['-h', PGHOST, '-p', '54329', '-U', 'postgres', '-X', '-q', '-A', '-t', '-c', q], { encoding: 'utf8' }).trim();
const U = {
  'vendeur.msg@test.nc': { id: 'aa000000-0000-0000-0000-0000000000a1', password: 'motdepasse1', nom: 'Victor Vendeur', profil: 'sell' },
  'acheteur.msg@test.nc': { id: 'aa000000-0000-0000-0000-0000000000a2', password: 'motdepasse1', nom: 'Alice Acheteuse', profil: 'buy' },
  'tiers.msg@test.nc': { id: 'aa000000-0000-0000-0000-0000000000a3', password: 'motdepasse1', nom: 'Tiers', profil: 'buy' },
  'courtier.msg@test.nc': { id: 'aa000000-0000-0000-0000-0000000000a4', password: 'motdepasse1', nom: 'Courtier NC', profil: 'bnk' }
};
const ok = (label, cond, extra) => { console.log((cond ? 'OK   ' : 'ÉCHEC') + ' ' + label + (extra !== undefined ? ' → ' + extra : '')); if (!cond) process.exitCode = 1; };
const wait = ms => new Promise(r => setTimeout(r, ms));
const V = U['vendeur.msg@test.nc'].id, A = U['acheteur.msg@test.nc'].id, T = U['tiers.msg@test.nc'].id, C = U['courtier.msg@test.nc'].id;

(async () => {
  const ids = Object.values(U).map(u => `'${u.id}'`).join(',');
  sql(`delete from public.records where owner_id in (${ids}) or assignee in (${ids}); delete from public.professionnels where owner_id in (${ids});
       insert into auth.users(id, email, raw_user_meta_data) values ${Object.entries(U).map(([e, u]) => `('${u.id}','${e}','{"nom":"${u.nom}"}')`).join(',')} on conflict (id) do update set raw_user_meta_data = excluded.raw_user_meta_data;
       insert into public.professionnels(owner_id, role, nom, metiers, verifie) values ('${C}', 'courtier', 'Courtier NC', '{}', true);
       insert into public.records(collection, id, owner_id, data) values ('annonce', '880001', '${V}', '{"id":880001,"titre":"F3 Anse Vata test messagerie","type":"Appartement","surface":70,"pieces":3,"chambres":2,"prix":35000000,"ville":"Nouméa","quartier":"Anse Vata","publie":true,"date":"2026-11-20"}');`);
  const b = await chromium.launch(), errors = [];
  async function user(email) {
    const ctx = await b.newContext({ viewport: { width: 1300, height: 900 } });
    await ctx.addInitScript(`sessionStorage.setItem('__users', ${JSON.stringify(JSON.stringify(U))});` + FAKE);
    await ctx.route('**/*', r => r.request().url().startsWith(BASE) ? r.continue() : r.abort());
    const p = await ctx.newPage(); p.on('pageerror', e => errors.push(email + ' : ' + e.message)); p.on('dialog', d => d.dismiss());
    await p.goto(BASE + '/immo360-global.html'); await wait(1500);
    if (email) {
      await p.evaluate(async ([em, pw]) => { document.getElementById('login-email-existing').value = em; document.getElementById('login-password').value = pw; await doLoginExisting(); doLoginConfirm(); }, [email, U[email].password]);
      await wait(1500);
    }
    return p;
  }

  // 0. Visiteur sans compte : la fenêtre s'ouvre au-dessus de la fiche et invite à créer un compte
  const anon = await user(null);
  await anon.evaluate(() => IMMO_ANN.refreshPublic()); await wait(500);
  await anon.evaluate(() => openLandingBien(880001)); await wait(300);
  await anon.click('.fiche-ov >> text=Demander une visite'); await wait(300);
  ok('visiteur : fenêtre au-dessus de la fiche (la fiche reste ouverte)', await anon.isVisible('#ctc-mod') && await anon.isVisible('.fiche-ov'));
  ok('visiteur : invitation à créer un compte', (await anon.textContent('#ctc-mod')).includes('Créer un compte'));
  await anon.click('.ctc-x');
  await anon.click('.fiche-ov >> text=Simuler le financement'); await wait(300);
  ok('financement : fenêtre au-dessus de la fiche, mensualité calculée', await anon.isVisible('#fpp-mod') && await anon.isVisible('.fiche-ov') && /\d/.test(await anon.textContent('#fpp-mens')), await anon.textContent('#fpp-mens'));
  const m1 = await anon.textContent('#fpp-mens'); await anon.fill('#fpp-apport', '10000000'); await anon.dispatchEvent('#fpp-apport', 'input'); await wait(100);
  ok('financement : la mensualité suit l\'apport', (await anon.textContent('#fpp-mens')) !== m1);
  await anon.locator('#fpp-mod .fp-in').screenshot({ path: OUT + '/fin-popup.png' });
  const anonRpc = await anon.evaluate(async () => (await fetch('/__db', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ op: 'rpc', fn: 'envoyer_message', args: { p_annonce: '880001', p_texte: 'spam' } }) }).then(r => r.json())).error);
  ok('envoi anonyme refusé par la base', !!anonRpc, anonRpc);

  // 1. L'acheteur écrit et demande une visite depuis la fiche
  const ach = await user('acheteur.msg@test.nc');
  await ach.evaluate(() => IMMO_ANN.refreshPublic()); await wait(500);
  ok('l\'annonce connaît son vendeur réel', await ach.evaluate(() => BIENS_DATA.find(b => b.id === 880001)._owner) === V);
  await ach.evaluate(() => openLandingBien(880001)); await wait(300);
  await ach.click('.fiche-ov >> text=Envoyer un message'); await wait(300);
  await ach.fill('#ctc-txt', 'Bonjour, le bien est-il toujours disponible ?'); await ach.click('[data-ctc="envoi"]'); await wait(900);
  ok('message envoyé, confirmation dans la fenêtre', (await ach.textContent('#ctc-mod')).includes('Message envoyé'));
  await ach.screenshot({ path: OUT + '/msg-envoye.png' });
  await ach.click('[data-ctc="fermer"]');
  await ach.click('.fiche-ov >> text=Demander une visite'); await wait(300);
  await ach.click('[data-ctc="envoi"]'); await wait(200);
  ok('visite : date obligatoire', (await ach.textContent('.ctc-err')).includes('date'));
  await ach.fill('[data-cd="1"]', '2026-12-05'); await ach.selectOption('[data-cp="1"]', { index: 2 }); await ach.click('[data-ctc="envoi"]'); await wait(900);
  ok('demande de visite envoyée', (await ach.textContent('#ctc-mod')).includes('Demande de visite envoyée'));
  ok('base : 2 messages au vendeur, destinataire fixé par la base', sql(`select count(*) from public.records where collection = 'message' and owner_id = '${A}' and assignee = '${V}' and parent_id = '880001:${A}'`) === '2');
  ok('base : créneau enregistré', /décembre/.test(sql(`select data->>'creneaux' from public.records where collection = 'message' and data->>'type' = 'visite'`)));

  // 2. Le vendeur reçoit dans Messages et répond
  const ven = await user('vendeur.msg@test.nc');
  await ven.evaluate(() => go('messagerie')); await wait(2500);
  const liste = await ven.textContent('#conv-list');
  ok('vendeur : conversation reçue, plus de conversations inventées', liste.includes('Alice Acheteuse') && !/Marie L\.|Paul M\./.test(liste), liste.replace(/\s+/g, ' ').slice(0, 120));
  ok('vendeur : 2 non lus', await ven.evaluate(() => CONVERSATIONS[0].unread) === 2);
  await ven.evaluate(() => openConversation(CONVERSATIONS[0].id)); await wait(800);
  ok('vendeur : la demande de visite et le créneau s\'affichent', (await ven.textContent('#msg-body')).includes('Demande de visite'));
  ok('vendeur : messages marqués lus en base', sql(`select count(*) from public.records where collection = 'message' and assignee = '${V}' and (data->>'lu')::boolean`) === '2');
  await ven.fill('#msg-input', 'Bonjour Alice, oui, le 5 décembre après-midi me convient.'); await ven.click('.msg-send'); await wait(1200);
  ok('vendeur : réponse envoyée à l\'acheteuse', sql(`select count(*) from public.records where collection = 'message' and owner_id = '${V}' and assignee = '${A}'`) === '1');
  ok('plus de réponse automatique inventée', !(await ven.textContent('#msg-body')).includes('je reviens vers vous rapidement'));
  await ven.screenshot({ path: OUT + '/msg-vendeur.png' });

  // 3. L'acheteuse voit la réponse
  await ach.evaluate(() => { document.querySelectorAll('.ctc-mod,.fiche-ov').forEach(x => x.remove()); go('messagerie'); IMMO_MSG.charger(); }); await wait(1500);
  await ach.evaluate(() => openConversation(CONVERSATIONS[0].id)); await wait(500);
  ok('acheteuse : réponse du vendeur reçue', (await ach.textContent('#msg-body')).includes('le 5 décembre après-midi'));

  // 4. Sécurité : un tiers ne voit rien et ne peut pas écrire à l'acheteuse en se faisant passer pour le vendeur
  const tiers = await user('tiers.msg@test.nc');
  const vus = await tiers.evaluate(async () => (await IMMO_SYNC.fetchAll('message')).length);
  ok('un tiers ne lit aucun message', vus === 0, vus);
  const usurp = await tiers.evaluate(async a => (await IMMO_SYNC.client.rpc('envoyer_message', { p_annonce: '880001', p_texte: 'x', p_acheteur: a })).error, A);
  ok('un tiers qui vise l\'acheteuse écrit en fait au vendeur (jamais à elle)', sql(`select count(*) from public.records where collection = 'message' and owner_id = '${T}' and assignee = '${A}'`) === '0', usurp && usurp.message);
  const direct = await tiers.evaluate(async a => (await IMMO_SYNC.client.from('records').insert({ collection: 'message', id: 'pirate', owner_id: IMMO_SYNC.uid, assignee: a, parent_id: 'x', data: { texte: 'pirate' } })).error, A);
  ok('insertion directe d\'un message vers un tiers refusée', !!direct);

  // 5. Demande d'étude de financement depuis la fiche : reçue par un courtier vérifié
  await ach.evaluate(() => { openLandingBien(880001); }); await wait(300);
  await ach.click('.fiche-ov >> text=Simuler le financement'); await wait(300);
  await ach.click('#fpp-send'); await wait(1500);
  ok('financement : demande envoyée', (await ach.textContent('#fpp-msg')).includes('envoyé'));
  await wait(1500);
  const vu = sql(`select count(*) from public.records where collection = 'fin' and owner_id = '${A}' and audience_role = 'banquier'`);
  ok('financement : dossier en base pour les banques', vu === '1', vu);
  const crt = await user('courtier.msg@test.nc');
  const recu = await crt.evaluate(async () => (await IMMO_SYNC.fetchAll('fin')).length);
  ok('financement : le courtier vérifié voit la demande', recu >= 1, recu);

  ok('aucune erreur JavaScript', errors.length === 0, errors.join(' | '));
  await b.close();
})();
