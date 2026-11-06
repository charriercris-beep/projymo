/* Immo360 NC — Espace Banquier / courtier (et simulateur « Capacité d'achat » côté acheteur)
 * Simulateur de capacité d'emprunt NC, frais d'acquisition selon le barème calédonien,
 * éligibilité indicative aux dispositifs (droits réduits RP, PTZ-NC, aides Province Sud),
 * dossiers de financement avec pièces et étapes, attestation de capacité imprimable,
 * barèmes datés et modifiables. Sources et niveaux de fiabilité : docs/fiches-metiers.md.
 * Dépend des globales : esc, go, APP_STATE, S.
 */
(function () {
  'use strict';

  const $ = id => document.getElementById(id);
  const E = v => (typeof esc === 'function' ? esc(v) : String(v == null ? '' : v));
  const F = n => Math.round(n || 0).toLocaleString('fr-FR') + ' F';
  const P = (n, d = 2) => (n * 100).toFixed(d).replace('.', ',') + ' %';
  const BKEY = 'immo360.baremes.v1', DKEY = 'immo360.fin.v1';
  const store = { get(k, d) { try { return JSON.parse(localStorage.getItem(k)) ?? d; } catch (_) { return d; } }, set(k, v) { try { localStorage.setItem(k, JSON.stringify(v)); } catch (_) { /* stockage indisponible */ } } };

  /* ---------- Barèmes : chaque valeur est datée et sourcée, jamais figée dans la logique ---------- */
  const SRC = {
    gnc2019: 'https://gouv.nc/sites/default/files/atoms/files/2019.02.19_cp_tarifs_notaire.pdf',
    lp2025: 'https://legales.lnc.nc/articles/18/les-mesures-fiscales-de-la-loi-du-pays-du-12-aout-2025-instaurant-des-dispositifs-fiscaux-de-soutien-economique',
    ptz2018: 'https://gouv.nc/actualites/03-10-2018/le-pret-taux-zero-revisite',
    ptz2011: 'https://gouv.nc/sites/default/files/atoms/files/14600005.PDF',
    laps2018: 'https://www.province-sud.nc/sites/default/files/1829396/Code%20des%20aides%20%C3%A0%20l%27habitat%20%20LAPS.pdf'
  };
  const DEFAULTS = {
    droitsCommun: { v: 0.04, t: 'pct', g: 'Frais d\'acquisition', l: 'Droits d\'enregistrement — droit commun', d: '2019', s: SRC.gnc2019, f: 'ok' },
    droitsRP: { v: 0.005, t: 'pct', g: 'Frais d\'acquisition', l: 'Droits d\'enregistrement — résidence principale (personne physique)', d: 'LP 2025-12, jusqu\'au 31/12/2027', s: SRC.lp2025, f: 'mid', fin: '2027-12-31' },
    centProv: { v: 0.02, t: 'pct', g: 'Frais d\'acquisition', l: 'Centimes additionnels provinciaux', d: '2019', s: SRC.gnc2019, f: 'ok' },
    centComm: { v: 0.03, t: 'pct', g: 'Frais d\'acquisition', l: 'Centimes additionnels communaux', d: '2019', s: SRC.gnc2019, f: 'ok' },
    taxeHypo: { v: 0.003, t: 'pct', g: 'Frais d\'acquisition', l: 'Taxe hypothécaire', d: '2019', s: SRC.gnc2019, f: 'ok' },
    csi: { v: 0.00075, t: 'pct', g: 'Frais d\'acquisition', l: 'Contribution de sécurité immobilière', d: '2019', s: SRC.gnc2019, f: 'ok' },
    emoluments: { v: 0.0098, t: 'pct', g: 'Frais d\'acquisition', l: 'Émoluments du notaire (approximation)', d: 'exemple officiel 2019 (292 602 F sur 30 M F)', s: SRC.gnc2019, f: 'mid' },
    endettementMax: { v: 0.35, t: 'pct', g: 'Crédit', l: 'Taux d\'endettement maximal retenu', d: 'borne haute LAPS 2018 ; pratique bancaire à confirmer', s: SRC.laps2018, f: 'mid' },
    tauxNominal: { v: 0.04, t: 'pct', g: 'Crédit', l: 'Taux nominal par défaut (exemple — saisir le taux du jour)', d: 'non sourcé', s: '', f: 'low' },
    assurance: { v: 0.003, t: 'pct', g: 'Crédit', l: 'Assurance emprunteur par défaut (%/an du capital, exemple)', d: 'non sourcé', s: '', f: 'low' },
    ptzMax: { v: 15000000, t: 'F', g: 'PTZ-NC', l: 'Montant maximal du PTZ', d: '2011 (à mettre à jour)', s: SRC.ptz2011, f: 'low' },
    ptzPlafond4: { v: 567728, t: 'F', g: 'PTZ-NC', l: 'Plafond de ressources mensuel — foyer de 4 personnes', d: '01/01/2019 (indexé sur l\'inflation depuis)', s: SRC.ptz2018, f: 'mid' },
    lapsApport: { v: 300000, t: 'F', g: 'Aides Province Sud (LAPS)', l: 'Apport personnel minimal', d: 'brochure 2018', s: SRC.laps2018, f: 'mid' },
    lapsEndMin: { v: 0.25, t: 'pct', g: 'Aides Province Sud (LAPS)', l: 'Taux d\'endettement minimal', d: 'brochure 2018', s: SRC.laps2018, f: 'mid' },
    lapsEndMax: { v: 0.35, t: 'pct', g: 'Aides Province Sud (LAPS)', l: 'Taux d\'endettement maximal', d: 'brochure 2018', s: SRC.laps2018, f: 'mid' },
    lapsDureeMin: { v: 19, t: 'ans', g: 'Aides Province Sud (LAPS)', l: 'Durée minimale d\'emprunt', d: 'brochure 2018', s: SRC.laps2018, f: 'mid' },
    lapsP1: { v: 300000, t: 'F', g: 'Aides Province Sud (LAPS)', l: 'Plafond mensuel — personne seule', d: '01/05/2018 (actualisé chaque 1er janvier)', s: SRC.laps2018, f: 'mid' },
    lapsP2: { v: 370000, t: 'F', g: 'Aides Province Sud (LAPS)', l: 'Plafond mensuel — couple', d: '01/05/2018', s: SRC.laps2018, f: 'mid' },
    lapsP3: { v: 490000, t: 'F', g: 'Aides Province Sud (LAPS)', l: 'Plafond mensuel — 1 personne à charge', d: '01/05/2018', s: SRC.laps2018, f: 'mid' },
    lapsP4: { v: 540000, t: 'F', g: 'Aides Province Sud (LAPS)', l: 'Plafond mensuel — 2 personnes à charge', d: '01/05/2018', s: SRC.laps2018, f: 'mid' },
    lapsP5: { v: 590000, t: 'F', g: 'Aides Province Sud (LAPS)', l: 'Plafond mensuel — 3 personnes à charge ou plus', d: '01/05/2018', s: SRC.laps2018, f: 'mid' }
  };
  let overrides = store.get(BKEY, {});
  const B = k => (k in overrides ? overrides[k] : DEFAULTS[k].v);
  const FIAB = { ok: ['ok', 'Source officielle'], mid: ['warn', 'À confirmer'], low: ['bad', 'Exemple / non sourcé'] };

  /* ---------- Calculs (fonctions pures, testables) ---------- */
  function mensualiteFacteur(tauxAnnuel, mois) { const i = tauxAnnuel / 12; return i === 0 ? 1 / mois : i / (1 - Math.pow(1 + i, -mois)); }
  function fraisAcquisition(prix, opts) {
    const droitsReduits = opts.usage === 'rp' && opts.personnePhysique && new Date() <= new Date((DEFAULTS.droitsRP.fin || '2999-12-31') + 'T23:59:59');
    const base = opts.type === 'construction' ? (opts.prixTerrain || 0) : prix; // les droits portent sur l'acquisition (le terrain), pas sur la construction
    const lignes = [
      ['Droits d\'enregistrement', droitsReduits ? B('droitsRP') : B('droitsCommun')],
      ['Centimes additionnels provinciaux', B('centProv')], ['Centimes additionnels communaux', B('centComm')],
      ['Taxe hypothécaire', B('taxeHypo')], ['Contribution de sécurité immobilière', B('csi')], ['Émoluments du notaire (approx.)', B('emoluments')]
    ].map(([l, t]) => ({ l, t, m: Math.round(base * t) }));
    return { base, droitsReduits, lignes, total: lignes.reduce((a, x) => a + x.m, 0), taux: lignes.reduce((a, x) => a + x.t, 0) };
  }
  function capacite(x) {
    const mois = Math.round(x.duree * 12), fac = mensualiteFacteur(x.taux, mois) + x.assurance / 12;
    const mensualiteMax = Math.max(0, x.revenus * x.endettement - x.charges);
    const capital = fac > 0 ? mensualiteMax / fac : 0;
    // Budget d'achat : prix + frais = apport + capital ; frais = taux × base (base = prix, ou terrain si construction)
    const f0 = fraisAcquisition(1e6, x), tauxF = f0.taux;
    let prixMax;
    if (x.type === 'construction') prixMax = x.apport + capital - Math.round((x.prixTerrain || 0) * tauxF);
    else prixMax = (x.apport + capital) / (1 + tauxF);
    prixMax = Math.max(0, prixMax);
    const frais = fraisAcquisition(prixMax, x);
    const mensualite = capital * mensualiteFacteur(x.taux, mois), assuranceM = capital * x.assurance / 12;
    const coutCredit = (mensualite + assuranceM) * mois - capital;
    const endettementReel = x.revenus ? (mensualite + assuranceM + x.charges) / x.revenus : 0;
    return { mois, mensualiteMax, capital: Math.round(capital), prixMax: Math.round(prixMax), frais, mensualite: Math.round(mensualite), assuranceM: Math.round(assuranceM), coutCredit: Math.round(coutCredit), endettementReel };
  }
  function eligibilites(x, c) {
    const out = [];
    // Droits réduits résidence principale (LP 2025-12)
    out.push(x.usage === 'rp' && x.personnePhysique
      ? { k: c.frais.droitsReduits ? 'ok' : 'idle', t: 'Droits d\'enregistrement réduits (résidence principale)', d: c.frais.droitsReduits ? `Taux de ${P(B('droitsRP'), 1)} au lieu de ${P(B('droitsCommun'), 0)} jusqu'au 31/12/2027 (loi du pays 2025-12).` : 'Dispositif échu à la date du jour : vérifier s\'il a été prolongé.' }
      : { k: 'no', t: 'Droits d\'enregistrement réduits', d: 'Réservés à l\'achat d\'une résidence principale par une personne physique (pas une SCI ni un investissement locatif).' });
    // PTZ-NC
    const nbPers = x.adultes + x.charges_pers;
    const ptzBlocages = [];
    if (x.usage !== 'rp') ptzBlocages.push('réservé à la résidence principale');
    if (!x.primo) ptzBlocages.push('réservé aux primo-accédants (n\'avoir jamais été propriétaire de sa résidence principale, depuis 2018)');
    if (ptzBlocages.length) out.push({ k: 'no', t: 'Prêt à taux zéro (PTZ-NC)', d: 'Non éligible : ' + ptzBlocages.join(' ; ') + '.' });
    else {
      const ref4 = B('ptzPlafond4');
      const note = nbPers === 4 ? (x.revenus <= ref4 ? `Revenus sous le plafond de référence (${F(ref4)}/mois en 2019, revalorisé depuis).` : `Revenus au-dessus du plafond de référence 2019 (${F(ref4)}/mois) : à vérifier avec le barème actuel.`) : `Plafond pour un foyer de ${nbPers} personne(s) non renseigné dans nos barèmes : à vérifier auprès de la banque.`;
      out.push({ k: 'check', t: 'Prêt à taux zéro (PTZ-NC)', d: `Potentiellement éligible. ${note} Le prix du bien est aussi plafonné (plafonds différents neuf / ancien depuis 2018). Distribué par BCI, BNC, BNP Paribas NC et SGCB ; montant fixé par la banque.` });
    }
    // Aides Province Sud (LAPS) : construction d'une villa clé en main, primo-accédant, province Sud
    if (x.type !== 'construction') out.push({ k: 'no', t: 'Logement aidé Province Sud (LAPS)', d: 'Concerne la construction d\'une villa clé en main sur un terrain dont on est propriétaire.' });
    else {
      const pl = [B('lapsP1'), B('lapsP2'), B('lapsP3'), B('lapsP4'), B('lapsP5')];
      const idx = x.charges_pers >= 3 ? 4 : x.charges_pers === 2 ? 3 : x.charges_pers === 1 ? 2 : x.adultes >= 2 ? 1 : 0;
      const pb = [];
      if (!x.primo) pb.push('jamais propriétaire d\'un logement');
      if (!x.residenceSud) pb.push('résider en province Sud depuis au moins 2 ans');
      if (x.revenus > pl[idx]) pb.push(`revenus mensuels ≤ ${F(pl[idx])} (dispositions générales ; plafonds plus élevés en ZAC ou centralité urbaine)`);
      if (x.apport < B('lapsApport')) pb.push(`apport ≥ ${F(B('lapsApport'))}`);
      if (x.duree < B('lapsDureeMin')) pb.push(`durée d'emprunt ≥ ${B('lapsDureeMin')} ans`);
      if (c.endettementReel < B('lapsEndMin') || c.endettementReel > B('lapsEndMax')) pb.push(`endettement entre ${P(B('lapsEndMin'), 0)} et ${P(B('lapsEndMax'), 0)} (actuel ${P(c.endettementReel, 0)})`);
      out.push(pb.length ? { k: 'no', t: 'Logement aidé Province Sud (LAPS)', d: 'Conditions non remplies : ' + pb.join(' ; ') + '.' }
        : { k: 'check', t: 'Logement aidé Province Sud (LAPS)', d: 'Conditions principales remplies (barème 2018). Aide de 200 000 à 2 000 000 F selon le dossier ; engagement d\'occuper le logement 15 ans sans le louer. À instruire auprès de la Maison de l\'habitat.' });
    }
    // Déduction des intérêts (LP 2025-12) : RP dans le Grand Nouméa
    const gn = ['Nouméa', 'Dumbéa', 'Mont-Dore', 'Païta'].includes(x.commune);
    out.push(x.usage === 'rp' && gn ? { k: 'check', t: 'Déduction des intérêts d\'emprunt', d: 'Résidence principale à Nouméa, Dumbéa, Mont-Dore ou Païta : intérêts déductibles pour les prêts contractés du 21/08/2025 au 31/12/2027 (loi du pays 2025-12). Montant à confirmer avec les services fiscaux.' }
      : { k: 'no', t: 'Déduction des intérêts d\'emprunt (Grand Nouméa)', d: 'Concerne une résidence principale à Nouméa, Dumbéa, Mont-Dore ou Païta.' });
    return out;
  }

  /* ---------- Styles ---------- */
  function injectStyle() {
    if ($('bnk-style')) return;
    const c = document.createElement('style'); c.id = 'bnk-style';
    c.textContent = `
.bk-wrap{max-width:1180px;margin:0 auto}.bk-head h2{font-family:'Playfair Display',serif;font-size:24px;margin:0 0 4px}.bk-head p{color:var(--mid);font-size:13px;margin:0 0 18px}
.bk-grid{display:grid;grid-template-columns:360px 1fr;gap:20px;align-items:start}
.bk-f{display:flex;flex-direction:column;gap:4px;margin-bottom:10px}.bk-f label,.bk-lab{font-size:11px;font-weight:600;color:var(--mid);text-transform:uppercase;letter-spacing:.06em}
.bk-f input,.bk-f select,.bk-f textarea{border:1px solid rgba(28,26,22,.15);border-radius:8px;padding:8px 10px;font:14px 'DM Sans',sans-serif;background:#fff;width:100%;box-sizing:border-box}
.bk-2{display:grid;grid-template-columns:1fr 1fr;gap:10px}
.bk-chk{display:flex;align-items:center;gap:8px;font:400 13px 'DM Sans',sans-serif;color:var(--dark);margin:6px 0;cursor:pointer;text-transform:none;letter-spacing:0}.bk-chk input{width:16px;height:16px;accent-color:var(--gold);margin:0}
.bk-kpis{display:grid;grid-template-columns:repeat(3,1fr);gap:12px;margin-bottom:16px}
.bk-kpi{background:#fff;border:1px solid rgba(28,26,22,.08);border-radius:12px;padding:14px 16px}.bk-kpi small{display:block;font-size:11px;color:var(--mid);text-transform:uppercase;letter-spacing:.06em;margin-bottom:6px}.bk-kpi b{font:700 22px 'Playfair Display',serif}.bk-kpi em{display:block;font-style:normal;font-size:12px;color:var(--mid);margin-top:3px}
.bk-kpi.dark{background:var(--dark)}.bk-kpi.dark small,.bk-kpi.dark em{color:rgba(255,255,255,.6)}.bk-kpi.dark b{color:var(--gold-light)}
.bk-rows div{display:flex;justify-content:space-between;padding:7px 0;border-bottom:1px solid rgba(28,26,22,.07);font-size:13px}.bk-rows div span:first-child{color:var(--mid)}.bk-rows .t{font-weight:700;border-bottom:0}
.bk-el .bk-tag{align-self:start;margin-top:1px;text-align:center;min-width:86px}
.bk-el{display:grid;grid-template-columns:auto 1fr;gap:10px;padding:10px 0;border-top:1px solid rgba(28,26,22,.07);font-size:13px;line-height:1.5}.bk-el b{display:block}
.bk-tag{display:inline-block;font-size:11px;font-weight:600;padding:2px 9px;border-radius:99px;white-space:nowrap}.bk-tag.ok{background:#E6F4EA;color:#1E6B3A}.bk-tag.check,.bk-tag.warn{background:#FEF3C7;color:#7A4A0A}.bk-tag.no,.bk-tag.bad{background:#FDE8E4;color:#8E2A1D}.bk-tag.idle{background:#EEF2F6;color:#475569}
.bk-note{font-size:12px;color:var(--mid);background:var(--warm);border-radius:8px;padding:9px 12px;line-height:1.5;margin:10px 0}
.bk-tbl{width:100%;border-collapse:collapse;font-size:13px}.bk-tbl th{text-align:left;font-size:11px;text-transform:uppercase;letter-spacing:.05em;color:var(--mid);padding:6px}.bk-tbl td{padding:8px 6px;border-top:1px solid rgba(28,26,22,.07);vertical-align:top}.bk-tbl input{width:120px;border:1px solid rgba(28,26,22,.15);border-radius:6px;padding:5px 8px;font:13px 'DM Sans',sans-serif}
.bk-tbl tr.grp td{background:var(--cream);font-weight:700;font-size:12px;text-transform:uppercase;letter-spacing:.06em;color:var(--mid)}
.bk-dos{display:grid;grid-template-columns:1fr auto;gap:10px;padding:14px 16px;border:1px solid rgba(28,26,22,.1);border-radius:12px;background:#fff;margin-bottom:10px;cursor:pointer}.bk-dos:hover{border-color:var(--gold)}.bk-dos h4{margin:0 0 3px;font-size:15px}.bk-dos p{margin:0;font-size:12px;color:var(--mid)}
.bk-steps{display:flex;flex-wrap:wrap;gap:6px;margin:6px 0 14px}.bk-steps button{border:1px solid rgba(28,26,22,.15);background:#fff;border-radius:99px;padding:6px 12px;font:500 12px 'DM Sans',sans-serif;cursor:pointer}.bk-steps button.on{background:var(--dark);color:#fff;border-color:var(--dark)}.bk-steps button.done{background:#E6F4EA;border-color:#B7DEC2}
.bk-back{background:none;border:0;color:var(--mid);cursor:pointer;font:500 13px 'DM Sans',sans-serif;padding:0;margin-bottom:12px}
@media(max-width:980px){.bk-grid{grid-template-columns:1fr}.bk-kpis{grid-template-columns:1fr}.bk-2{grid-template-columns:1fr}}
`;
    document.head.appendChild(c);
  }

  /* ---------- Simulateur (banquier et acheteur) ---------- */
  const COMMUNES = ['Nouméa', 'Dumbéa', 'Mont-Dore', 'Païta', 'Boulouparis', 'La Foa', 'Bourail', 'Koné', 'Voh', 'Poindimié', 'Lifou', 'Maré', 'Autre'];
  const SIM0 = () => ({ revenus: 650000, charges: 0, adultes: 2, charges_pers: 1, apport: 3000000, taux: B('tauxNominal'), duree: 25, assurance: B('assurance'), endettement: Math.min(0.33, B('endettementMax')), type: 'ancien', usage: 'rp', prixTerrain: 0, personnePhysique: true, primo: true, residenceSud: true, commune: 'Nouméa' });
  let sim = store.get('immo360.sim.v1', null) || SIM0();

  function buildSimu(el, mode) {
    injectStyle();
    // Une seule instance du simulateur dans la page (identifiants uniques)
    ['panel-capacite', 'panel-bnk-simu'].forEach(id => { const p = $(id); if (p && p !== el) p.innerHTML = ''; });
    const client = mode === 'client';
    el.innerHTML = `<div class="bk-wrap"><div class="bk-head"><h2>${client ? 'Ma capacité d\'achat' : 'Simulateur de financement'}</h2>
      <p>Capacité d'emprunt, budget d'achat frais inclus selon le barème calédonien, et dispositifs auxquels ${client ? 'vous pourriez' : 'le client pourrait'} prétendre.</p></div>
      <div class="bk-grid"><aside class="card">
        <div class="card-title">Ménage</div>
        <div class="bk-2"><div class="bk-f"><label>Revenus nets / mois</label><input id="fs-revenus" type="number" min="0" step="10000"></div><div class="bk-f"><label>Crédits en cours / mois</label><input id="fs-charges" type="number" min="0" step="5000"></div></div>
        <div class="bk-2"><div class="bk-f"><label>Adultes</label><select id="fs-adultes"><option value="1">1</option><option value="2">2</option></select></div><div class="bk-f"><label>Personnes à charge</label><input id="fs-charges_pers" type="number" min="0" max="10"></div></div>
        <div class="bk-f"><label>Apport personnel</label><input id="fs-apport" type="number" min="0" step="100000"></div>
        <div class="card-title" style="margin-top:8px">Projet</div>
        <div class="bk-f"><label>Type de projet</label><select id="fs-type"><option value="ancien">Achat dans l'ancien</option><option value="neuf">Achat dans le neuf (VEFA)</option><option value="construction">Terrain + construction</option></select></div>
        <div class="bk-f" id="fs-terrain-w"><label>Prix du terrain</label><input id="fs-prixTerrain" type="number" min="0" step="100000"></div>
        <div class="bk-2"><div class="bk-f"><label>Usage</label><select id="fs-usage"><option value="rp">Résidence principale</option><option value="locatif">Investissement locatif</option><option value="secondaire">Résidence secondaire</option></select></div><div class="bk-f"><label>Commune</label><select id="fs-commune">${COMMUNES.map(c => `<option>${E(c)}</option>`).join('')}</select></div></div>
        <label class="bk-chk"><input type="checkbox" id="fs-personnePhysique">Achat en nom propre (pas en SCI)</label>
        <label class="bk-chk"><input type="checkbox" id="fs-primo">Jamais propriétaire de sa résidence principale</label>
        <label class="bk-chk"><input type="checkbox" id="fs-residenceSud">Résident en province Sud depuis 2 ans ou plus</label>
        <div class="card-title" style="margin-top:8px">Crédit</div>
        <div class="bk-2"><div class="bk-f"><label>Taux nominal (%)</label><input id="fs-taux" type="number" min="0" max="15" step="0.05"></div><div class="bk-f"><label>Durée (ans)</label><input id="fs-duree" type="number" min="5" max="30"></div></div>
        <div class="bk-2"><div class="bk-f"><label>Assurance (%/an)</label><input id="fs-assurance" type="number" min="0" max="2" step="0.01"></div><div class="bk-f"><label>Endettement visé (%)</label><input id="fs-endettement" type="number" min="10" max="50" step="1"></div></div>
        <div class="bk-note">Taux et assurance par défaut : exemples à remplacer par les conditions du jour.</div>
      </aside><section>
        <div class="bk-kpis" id="fs-kpis"></div>
        <div class="card"><div class="card-title">Détail</div><div class="bk-2"><div class="bk-rows" id="fs-credit"></div><div class="bk-rows" id="fs-frais"></div></div></div>
        <div class="card"><div class="card-title">Dispositifs et aides</div><div id="fs-elig"></div>
          <div class="bk-note">Indications à titre informatif, établies à partir de barèmes publics datés (voir l'onglet Barèmes${client ? ' de votre conseiller' : ''}). Seule la banque ou l'organisme instructeur peut confirmer l'éligibilité.</div></div>
        <div style="display:flex;gap:8px;flex-wrap:wrap">${client ? '<button type="button" class="btn btn-gold" id="fs-send">Demander une étude à un conseiller</button>' : '<button type="button" class="btn btn-gold" id="fs-newdos">Créer un dossier client avec cette simulation</button>'}<button type="button" class="btn btn-outline" id="fs-print">Imprimer l'attestation de capacité</button></div>
      </section></div></div>`;
    const NUM = ['revenus', 'charges', 'charges_pers', 'apport', 'duree', 'prixTerrain'], PCT = ['taux', 'assurance', 'endettement'], BOOL = ['personnePhysique', 'primo', 'residenceSud'], SEL = ['adultes', 'type', 'usage', 'commune'];
    NUM.forEach(k => { $('fs-' + k).value = sim[k]; }); PCT.forEach(k => { $('fs-' + k).value = +(sim[k] * 100).toFixed(2); }); BOOL.forEach(k => { $('fs-' + k).checked = !!sim[k]; }); SEL.forEach(k => { $('fs-' + k).value = String(sim[k]); });
    const read = () => {
      NUM.forEach(k => { sim[k] = Math.max(0, parseFloat($('fs-' + k).value) || 0); });
      PCT.forEach(k => { sim[k] = Math.max(0, parseFloat($('fs-' + k).value) || 0) / 100; });
      BOOL.forEach(k => { sim[k] = $('fs-' + k).checked; }); SEL.forEach(k => { sim[k] = $('fs-' + k).value; });
      sim.adultes = parseInt(sim.adultes, 10) || 1; sim.duree = Math.min(30, Math.max(5, sim.duree || 20));
      store.set('immo360.sim.v1', sim);
    };
    const render = () => {
      read();
      $('fs-terrain-w').style.display = sim.type === 'construction' ? '' : 'none';
      const c = capacite(sim);
      $('fs-kpis').innerHTML = `<div class="bk-kpi dark"><small>Budget d'achat maximal</small><b>${F(c.prixMax)}</b><em>frais d'acquisition inclus</em></div>
        <div class="bk-kpi"><small>Capacité d'emprunt</small><b>${F(c.capital)}</b><em>sur ${sim.duree} ans</em></div>
        <div class="bk-kpi"><small>Mensualité</small><b>${F(c.mensualite + c.assuranceM)}</b><em>assurance incluse · endettement ${P(c.endettementReel, 0)}</em></div>`;
      $('fs-credit').innerHTML = `<div><span>Apport</span><span>${F(sim.apport)}</span></div><div><span>Capital emprunté</span><span>${F(c.capital)}</span></div><div><span>Mensualité hors assurance</span><span>${F(c.mensualite)}</span></div><div><span>Assurance / mois</span><span>${F(c.assuranceM)}</span></div><div class="t"><span>Coût total du crédit</span><span>${F(c.coutCredit)}</span></div>`;
      $('fs-frais').innerHTML = `${c.frais.lignes.map(l => `<div><span>${E(l.l)} (${P(l.t, l.t < 0.01 ? 3 : 1)})</span><span>${F(l.m)}</span></div>`).join('')}<div class="t"><span>Frais d'acquisition${sim.type === 'construction' ? ' (sur le terrain)' : ''}</span><span>${F(c.frais.total)}</span></div>`;
      const TAG = { ok: 'Applicable', check: 'À vérifier', no: 'Non éligible', idle: 'Échu' };
      $('fs-elig').innerHTML = eligibilites(sim, c).map(e => `<div class="bk-el"><span class="bk-tag ${e.k}">${TAG[e.k]}</span><div><b>${E(e.t)}</b>${E(e.d)}</div></div>`).join('');
      el._last = c;
    };
    el.querySelectorAll('input,select').forEach(i => i.addEventListener('input', render));
    render();
    $('fs-print').onclick = () => attestation({ nom: APP_STATE?.user?.nom || '', sim: { ...sim }, c: el._last });
    if ($('fs-newdos')) $('fs-newdos').onclick = () => { const id = newDossier({ client: '', source: 'simulation' }); go('bnk-dossiers'); openDossier($('panel-bnk-dossiers'), id); };
    if ($('fs-send')) $('fs-send').onclick = () => {
      const u = (typeof APP_STATE !== 'undefined' && APP_STATE.user) || {};
      newDossier({ client: u.nom || 'Client', email: u.email || '', tel: u.tel || '', source: 'acheteur', etape: 'contact' });
      toast('Demande transmise. Un conseiller vous recontactera.');
    };
  }

  /* ---------- Dossiers de financement ---------- */
  const ETAPES = [['contact', 'Premier contact'], ['pieces', 'Pièces à réunir'], ['etude', 'Étude'], ['accord', 'Accord de principe'], ['offre', 'Offre émise'], ['signe', 'Signée / débloquée'], ['refus', 'Refusé']];
  const PIECES = ['Pièce d\'identité', 'Justificatif de domicile', '3 derniers bulletins de salaire', 'Dernier avis d\'imposition', 'Relevés de compte (3 mois)', 'Justificatif d\'apport', 'Compromis de vente / contrat de construction', 'Tableaux d\'amortissement des crédits en cours'];
  let dossiers = store.get(DKEY, []);
  const saveD = () => { store.set(DKEY, dossiers); if (window.IMMO_SYNC) IMMO_SYNC.saved(DKEY, dossiers); };
  function newDossier(o) {
    dossiers = store.get(DKEY, []); // toujours repartir du stockage (jamais d'une copie en mémoire périmée)
    const d = { id: 'f' + Date.now(), date: new Date().toISOString().slice(0, 10), client: o.client || '', email: o.email || '', tel: o.tel || '', source: o.source || 'manuel', etape: o.etape || 'contact', pieces: {}, sim: { ...sim }, offreFin: '', notes: '' };
    dossiers.unshift(d); saveD(); return d.id;
  }
  const etapeLabel = k => (ETAPES.find(e => e[0] === k) || [k, k])[1];
  const joursAvant = iso => iso ? Math.ceil((new Date(iso + 'T23:59:59') - new Date()) / 86400000) : null;

  function buildDossiers(el) {
    injectStyle();
    el.innerHTML = `<div class="bk-wrap"><div class="bk-head" style="display:flex;justify-content:space-between;align-items:flex-start;gap:12px"><div><h2>Dossiers de financement</h2><p>${dossiers.length} dossier(s).</p></div><button type="button" class="btn btn-gold" id="bk-new">Nouveau dossier</button></div>
      ${dossiers.length ? dossiers.map(d => { const c = capacite(d.sim), j = joursAvant(d.offreFin), pc = Object.values(d.pieces).filter(Boolean).length;
        return `<div class="bk-dos" data-dos="${E(d.id)}"><div><h4>${E(d.client || 'Client sans nom')}</h4><p>${E(etapeLabel(d.etape))} · pièces ${pc}/${PIECES.length} · capacité ${F(c.capital)}${d.source === 'acheteur' ? ' · demande en ligne' : ''}</p></div>
          <div style="text-align:right">${j != null && d.etape === 'offre' ? `<span class="bk-tag ${j < 0 ? 'bad' : j <= 15 ? 'warn' : 'ok'}">${j < 0 ? 'Offre expirée' : 'Offre : ' + j + ' j'}</span>` : `<span class="bk-tag idle">${E(etapeLabel(d.etape))}</span>`}</div></div>`; }).join('')
      : '<div class="card"><p style="margin:0;color:var(--mid);font-size:13px">Aucun dossier. Créez-en un, ou partez d\'une simulation.</p></div>'}</div>`;
    $('bk-new').onclick = () => { const id = newDossier({}); openDossier(el, id); };
    el.querySelectorAll('[data-dos]').forEach(b => b.onclick = () => openDossier(el, b.dataset.dos));
  }

  function openDossier(el, id) {
    const d = dossiers.find(x => x.id === id); if (!d || !el) return;
    const c = capacite(d.sim);
    el.innerHTML = `<div class="bk-wrap"><button type="button" class="bk-back" id="bk-back">← Retour aux dossiers</button>
      <div class="card"><div class="card-title">Dossier ${E(d.client || '')}</div>
        <div class="bk-2"><div class="bk-f"><label>Client</label><input id="bd-client" value="${E(d.client)}"></div><div class="bk-f"><label>Téléphone</label><input id="bd-tel" value="${E(d.tel)}"></div></div>
        <span class="bk-lab">Étape</span><div class="bk-steps">${ETAPES.map(([k, l], i) => { const cur = ETAPES.findIndex(e => e[0] === d.etape); return `<button type="button" data-et="${k}" class="${k === d.etape ? 'on' : (k !== 'refus' && i < cur && d.etape !== 'refus' ? 'done' : '')}">${E(l)}</button>`; }).join('')}</div>
        <div class="bk-2"><div class="bk-f"><label>Fin de validité de l'offre</label><input id="bd-offre" type="date" value="${E(d.offreFin)}"></div><div></div></div>
        <div class="bk-f"><label>Notes</label><textarea id="bd-notes" rows="3">${E(d.notes)}</textarea></div></div>
      <div class="card"><div class="card-title">Pièces du dossier</div>${PIECES.map((p, i) => `<label class="bk-chk"><input type="checkbox" data-pc="${i}"${d.pieces[i] ? ' checked' : ''}>${E(p)}</label>`).join('')}</div>
      <div class="card"><div class="card-title">Simulation rattachée</div><div class="bk-rows">
        <div><span>Revenus / mois</span><span>${F(d.sim.revenus)}</span></div><div><span>Apport</span><span>${F(d.sim.apport)}</span></div>
        <div><span>Capacité d'emprunt</span><span>${F(c.capital)}</span></div><div><span>Budget d'achat maximal</span><span>${F(c.prixMax)}</span></div>
        <div class="t"><span>Mensualité (assurance incluse)</span><span>${F(c.mensualite + c.assuranceM)}</span></div></div>
        <div style="display:flex;gap:8px;flex-wrap:wrap;margin-top:12px"><button type="button" class="btn btn-gold" id="bd-save">Enregistrer</button><button type="button" class="btn btn-outline" id="bd-resim">Remplacer par la simulation en cours</button><button type="button" class="btn btn-outline" id="bd-print">Attestation de capacité</button>${window.IMMO_MIS ? '<button type="button" class="btn btn-outline" id="bd-ass">Demander une assurance emprunteur</button>' : ''}<button type="button" class="btn btn-outline" id="bd-del">Supprimer</button></div></div></div>`;
    // Conserver la saisie en cours (y compris les pièces cochées) avant tout changement d'étape
    const collect = () => { d.client = $('bd-client').value.trim(); d.tel = $('bd-tel').value.trim(); d.offreFin = $('bd-offre').value; d.notes = $('bd-notes').value.slice(0, 2000); el.querySelectorAll('[data-pc]').forEach(i => { d.pieces[i.dataset.pc] = i.checked; }); };
    el.querySelectorAll('[data-et]').forEach(b => b.onclick = () => { collect(); d.etape = b.dataset.et; saveD(); openDossier(el, id); });
    $('bk-back').onclick = () => buildDossiers(el);
    $('bd-save').onclick = () => { collect(); saveD(); toast('Dossier enregistré.'); openDossier(el, id); };
    $('bd-resim').onclick = () => { collect(); d.sim = { ...sim }; saveD(); openDossier(el, id); };
    $('bd-print').onclick = () => { collect(); saveD(); attestation({ nom: d.client, sim: d.sim, c }); };
    if ($('bd-ass')) $('bd-ass').onclick = () => { collect(); saveD(); IMMO_MIS.request('ass', { source: 'banquier', ref: d.client || d.id, client: d.client, tel: d.tel, type: 'Assurance emprunteur', montant: c.capital }); toast('Demande d\'assurance emprunteur transmise.'); };
    $('bd-del').onclick = () => { if (confirm('Supprimer ce dossier ?')) { dossiers = dossiers.filter(x => x.id !== id); saveD(); buildDossiers(el); } };
  }

  function attestation({ nom, sim: s, c }) {
    const w = window.open('', '_blank'); if (!w) { alert('Autorisez les fenêtres pop-up pour afficher l\'attestation.'); return; }
    const conseiller = (typeof S !== 'undefined' && S.profile === 'bnk' && APP_STATE?.user?.nom) ? APP_STATE.user.nom : '';
    w.document.write(`<!doctype html><meta charset="utf-8"><title>Attestation de capacité de financement</title><style>body{font:14px/1.6 Arial,sans-serif;margin:40px;color:#111;max-width:720px}h1{font-size:20px}table{width:100%;border-collapse:collapse;margin:16px 0}td{padding:6px 0;border-bottom:1px solid #ddd}td:last-child{text-align:right}.n{font-size:12px;color:#555;border:1px solid #ccc;padding:10px;border-radius:6px}</style>
<h1>Attestation de capacité de financement (indicative)</h1><p>Établie le ${new Date().toLocaleDateString('fr-FR')}${nom ? ' pour <b>' + E(nom) + '</b>' : ''}${conseiller ? ', par ' + E(conseiller) : ''}.</p>
<table><tr><td>Revenus nets mensuels déclarés</td><td>${F(s.revenus)}</td></tr><tr><td>Apport personnel</td><td>${F(s.apport)}</td></tr><tr><td>Capacité d'emprunt estimée (${s.duree} ans, taux ${P(s.taux)})</td><td>${F(c.capital)}</td></tr><tr><td><b>Budget d'achat estimé, frais d'acquisition inclus</b></td><td><b>${F(c.prixMax)}</b></td></tr><tr><td>Mensualité estimée (assurance incluse)</td><td>${F(c.mensualite + c.assuranceM)}</td></tr></table>
<p class="n">Ce document est une estimation établie sur la base d'informations déclaratives. Il ne constitue ni une offre de prêt, ni un accord de financement, qui restent soumis à l'étude complète du dossier par l'établissement prêteur.</p><script>onload=()=>setTimeout(()=>print(),300)<\/script>`);
    w.document.close();
  }

  /* ---------- Barèmes ---------- */
  function buildBaremes(el) {
    injectStyle();
    let g = '';
    el.innerHTML = `<div class="bk-wrap"><div class="bk-head"><h2>Barèmes</h2><p>Toutes les valeurs utilisées par le simulateur, avec leur date et leur source. Mettez à jour celles marquées « à confirmer » ou « exemple ».</p></div>
      <div class="card"><table class="bk-tbl"><thead><tr><th>Paramètre</th><th>Valeur</th><th>Date / origine</th><th>Fiabilité</th></tr></thead><tbody>
      ${Object.entries(DEFAULTS).map(([k, d]) => { const head = d.g !== g ? `<tr class="grp"><td colspan="4">${E(d.g)}</td></tr>` : ''; g = d.g; const v = B(k), shown = d.t === 'pct' ? +(v * 100).toFixed(4) : v, fb = FIAB[d.f];
        return head + `<tr><td>${E(d.l)}</td><td><input data-b="${k}" type="number" step="any" value="${shown}"> ${d.t === 'pct' ? '%' : d.t === 'ans' ? 'ans' : 'F'}${k in overrides ? ' <span class="bk-tag idle">modifié</span>' : ''}</td><td>${E(d.d)}${d.s ? ` · <a href="${E(d.s)}" target="_blank" rel="noopener">source</a>` : ''}</td><td><span class="bk-tag ${fb[0]}">${fb[1]}</span></td></tr>`; }).join('')}
      </tbody></table>
      <div style="display:flex;gap:8px;margin-top:12px"><button type="button" class="btn btn-gold" id="bb-save">Enregistrer</button><button type="button" class="btn btn-outline" id="bb-reset">Revenir aux valeurs sourcées</button></div>
      <div class="bk-note">Les modifications sont enregistrées dans ce navigateur. Une gestion centralisée (par l'équipe Immo360, avec historique) est prévue avec la base de données.</div></div></div>`;
    $('bb-save').onclick = () => { el.querySelectorAll('[data-b]').forEach(i => { const k = i.dataset.b, d = DEFAULTS[k], raw = parseFloat(i.value); if (!isFinite(raw)) return; const v = d.t === 'pct' ? raw / 100 : raw; if (Math.abs(v - d.v) > 1e-12) overrides[k] = v; else delete overrides[k]; }); store.set(BKEY, overrides); toast('Barèmes enregistrés.'); buildBaremes(el); };
    $('bb-reset').onclick = () => { if (confirm('Revenir aux valeurs sourcées ?')) { overrides = {}; store.set(BKEY, overrides); buildBaremes(el); } };
  }

  /* ---------- Tableau de bord banquier ---------- */
  function renderDashboard(dash) {
    injectStyle(); dossiers = store.get(DKEY, []);
    const actifs = dossiers.filter(d => !['signe', 'refus'].includes(d.etape));
    const expirent = dossiers.filter(d => d.etape === 'offre' && (j => j != null && j <= 15)(joursAvant(d.offreFin)));
    const enLigne = dossiers.filter(d => d.source === 'acheteur' && d.etape === 'contact');
    const aVerifier = Object.values(DEFAULTS).filter((d, i) => d.f !== 'ok' && !(Object.keys(DEFAULTS)[i] in overrides)).length;
    const nom = (typeof APP_STATE !== 'undefined' && APP_STATE.user?.nom) || '';
    dash.innerHTML = `<div class="bk-wrap"><div class="bk-head"><h2>Bonjour ${E(nom)}</h2><p>Votre activité de financement.</p></div>
      ${enLigne.length ? `<div class="bk-note" style="background:#E8EEFB;color:#2A4A7A">${enLigne.length} nouvelle(s) demande(s) d'étude reçue(s) en ligne.</div>` : ''}
      ${expirent.length ? `<div class="bk-note" style="background:#FEF3C7;color:#7A4A0A">${expirent.length} offre(s) de prêt expire(nt) dans moins de 15 jours.</div>` : ''}
      <div class="bk-kpis"><div class="bk-kpi"><small>Dossiers actifs</small><b>${actifs.length}</b></div>
        <div class="bk-kpi"><small>Accords de principe</small><b>${dossiers.filter(d => d.etape === 'accord').length}</b></div>
        <div class="bk-kpi"><small>Offres émises</small><b>${dossiers.filter(d => d.etape === 'offre').length}</b></div></div>
      <div class="card"><div class="card-title" style="justify-content:space-between">Dossiers récents <button type="button" class="btn btn-sm btn-outline" data-bgo="bnk-dossiers">Tous les dossiers</button></div>
        ${actifs.slice(0, 4).map(d => `<div class="bk-dos" data-dos="${E(d.id)}"><div><h4>${E(d.client || 'Client sans nom')}</h4><p>${E(etapeLabel(d.etape))}</p></div><div>${F(capacite(d.sim).capital)}</div></div>`).join('') || '<p style="margin:0;color:var(--mid);font-size:13px">Aucun dossier actif.</p>'}</div>
      ${aVerifier ? `<div class="bk-note">${aVerifier} valeur(s) de barème sont à confirmer ou à mettre à jour. <a href="#" data-bgo="bnk-baremes" style="color:inherit;font-weight:600">Voir les barèmes</a></div>` : ''}</div>`;
    dash.querySelectorAll('[data-bgo]').forEach(b => b.onclick = e => { e.preventDefault(); go(b.dataset.bgo); });
    dash.querySelectorAll('[data-dos]').forEach(b => b.onclick = () => { go('bnk-dossiers'); openDossier($('panel-bnk-dossiers'), b.dataset.dos); });
  }

  function toast(t) { const n = document.createElement('div'); n.setAttribute('role', 'status'); n.className = 'immo-toast'; document.querySelectorAll('.immo-toast').forEach(x => x.remove()); n.style.cssText = 'position:fixed;bottom:20px;right:20px;background:var(--dark);color:#fff;padding:12px 18px;border-radius:10px;font-size:13px;z-index:3000'; n.textContent = t; document.body.appendChild(n); setTimeout(() => n.remove(), 3500); }

  // Enregistrement dans les registres communs des espaces métiers
  window.addEventListener('immo360:purge', () => { dossiers = []; sim = null; sim = store.get('immo360.sim.v1', null) || SIM0(); });
  window.IMMO_PANELS = Object.assign(window.IMMO_PANELS || {}, {
    'bnk-simu': el => { dossiers = store.get(DKEY, []); buildSimu(el, 'pro'); },
    'bnk-dossiers': el => { dossiers = store.get(DKEY, []); buildDossiers(el); },
    'bnk-baremes': buildBaremes,
    'capacite': el => buildSimu(el, 'client')
  });
  window.IMMO_DASH = Object.assign(window.IMMO_DASH || {}, { bnk: renderDashboard });
  window.IMMO_BNK = { capacite, fraisAcquisition, eligibilites, mensualiteFacteur, DEFAULTS }; // exposé pour les tests
})();
