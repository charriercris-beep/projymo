/* Immo360 NC — Moteur d'estimation du prix au m² (transparent et sourcé)
 *
 * Trois couches, de la plus locale à la plus générale :
 *  1. Observatoire Immo360 : médiane des annonces publiées sur la plateforme pour le quartier (puis la
 *     commune), par type de bien (appartement / maison), sur une fenêtre de 3 mois élargie à 6 puis 12 mois,
 *     valeurs extrêmes écartées, au moins MIN_REFS références ; fourchette = 1er–3e quartile.
 *  2. Barème de référence (NC_PM2 / NC_MARKET, prix AFFICHÉS relevés en 2025-2026), qui donne la hiérarchie
 *     entre quartiers.
 *  3. Les deux sont ramenés au niveau des prix CONCLUS par une décote affiché → conclu calée sur la
 *     statistique officielle (ISEE, transactions immobilières 2025).
 * Chaque estimation indique sa provenance (source, nombre de références, période).
 * Méthode inspirée de la démarche publique d'observatoires d'annonces ; aucune donnée tierce n'est
 * aspirée ni réutilisée.
 * Dépend des globales : NC_PM2, BIENS_DATA.
 */
(function () {
  'use strict';

  const KEY = 'immo360.estimation.v1';
  // Statistique officielle de référence
  const ISEE = {
    annee: 2025, publication: 'octobre 2026', aptMedianM2: 280000, aptMoyenM2: 298000, maisonMedian: 23000000,
    source: 'ISEE — Transactions immobilières, synthèse annuelle 2025 (sources : Isee, offices notariaux, DSF)',
    url: 'https://isee.nc/transactions-immobilieres-synthese-annuelle-2025'
  };
  const ANNONCES_REF = { aptMedianM2: 340054, source: 'Properstar, médiane des annonces d\'appartements, avril 2026' };
  const DEFAULTS = {
    // 280 000 / 340 054 ≈ 0,823 : écart entre prix conclus (ISEE 2025) et prix affichés (annonces 2026)
    decote: { v: Math.round(ISEE.aptMedianM2 / ANNONCES_REF.aptMedianM2 * 1000) / 1000, l: 'Décote prix affiché → prix conclu',
      d: `${ISEE.aptMedianM2.toLocaleString('fr-FR')} F/m² (ventes 2025, ISEE) ÷ ${ANNONCES_REF.aptMedianM2.toLocaleString('fr-FR')} F/m² (annonces avril 2026) ; appliquée aussi aux maisons par hypothèse`, url: ISEE.url },
    minRefs: { v: 5, l: 'Références minimales pour publier un prix observé', d: 'en dessous : barème de référence' },
    fenetres: { v: [90, 180, 365], l: 'Fenêtres d\'observation (jours)', d: '3 mois, élargie à 6 puis 12 mois si besoin' }
  };
  const read = () => { try { return JSON.parse(localStorage.getItem(KEY)) || {}; } catch (_) { return {}; } };
  const P = k => { const o = read(); return k in o ? o[k] : DEFAULTS[k].v; };

  const classe = t => { const s = String(t || '').toLowerCase(); if (/terrain/.test(s)) return 'terrain'; if (/maison|villa|house/.test(s)) return 'maison'; if (!s) return null; return 'appartement'; };
  const norm = s => String(s || '').toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').trim();
  function quantile(sorted, q) { const pos = (sorted.length - 1) * q, b = Math.floor(pos), r = pos - b; return sorted[b + 1] !== undefined ? sorted[b] + r * (sorted[b + 1] - sorted[b]) : sorted[b]; }

  // Prix au m² observés sur les annonces de la plateforme (prix affichés), filtrés et écrêtés
  function observes(zoneTest, cls, jours) {
    const now = Date.now(), list = (typeof BIENS_DATA !== 'undefined' ? BIENS_DATA : []);
    const v = list.filter(b => b && b._ann && b.statut === 'En vente' && b.surface > 0 && b.prix > 0 && zoneTest(b)
      && (!cls || classe(b.type) === cls) && b.date && (now - new Date(b.date + 'T12:00:00')) / 86400000 <= jours)
      .map(b => b.prix / b.surface).sort((a, b) => a - b);
    if (v.length < 4) return v;
    // écrêtement par l'écart interquartile (valeurs extrêmes écartées)
    const q1 = quantile(v, 0.25), q3 = quantile(v, 0.75), iqr = q3 - q1;
    return v.filter(x => x >= q1 - 1.5 * iqr && x <= q3 + 1.5 * iqr);
  }

  // Estimation du prix au m² CONCLU pour une zone (quartier, commune) et un type de bien
  function pm2(quartier, type, commune) {
    const cls = classe(type), dec = P('decote'), min = P('minRefs');
    const zones = [
      { label: 'quartier ' + quartier, test: b => norm(b.quartier) === norm(quartier) },
      commune ? { label: 'commune ' + commune, test: b => norm(b.ville) === norm(commune) } : null
    ].filter(z => z && quartier !== undefined);
    for (const z of zones) for (const j of P('fenetres')) {
      const v = observes(z.test, cls, j);
      if (v.length >= min) {
        const med = quantile(v, 0.5) * dec;
        return { value: Math.round(med), low: Math.round(quantile(v, 0.25) * dec), high: Math.round(quantile(v, 0.75) * dec), source: 'observatoire', n: v.length, jours: j,
          label: `Médiane de ${v.length} annonces Immo360 (${z.label}${cls ? ', ' + cls + 's' : ''}, ${Math.round(j / 30)} derniers mois), ramenée au prix conclu (× ${String(dec).replace('.', ',')})` };
      }
    }
    const base = (typeof NC_PM2 !== 'undefined' && NC_PM2[quartier]) || 340000;
    const val = base * dec;
    return { value: Math.round(val), low: Math.round(val * 0.9), high: Math.round(val * 1.1), source: 'bareme', n: 0, jours: 0,
      label: `Barème de référence${typeof NC_PM2 !== 'undefined' && NC_PM2[quartier] ? ' du quartier' : ' (quartier non référencé : moyenne)'} ramené au prix conclu (× ${String(dec).replace('.', ',')}, ventes 2025 ISEE)` };
  }

  window.IMMO_EST = { pm2, decote: () => P('decote'), ISEE, DEFAULTS, params: read, setParams: o => { try { localStorage.setItem(KEY, JSON.stringify(o || {})); } catch (_) { /* ignoré */ } }, classe };
  // Raccourci utilisé par les anciens modules d'estimation (remplace NC_PM2[quartier] || 340000)
  window.pm2Ref = (quartier, type, commune) => pm2(quartier, type, commune).value;
})();
