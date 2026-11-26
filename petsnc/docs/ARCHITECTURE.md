# PetsNC (nom de travail) — Dossier d'architecture v0.1

> Statut : **proposition à valider** avant tout développement (Partie 14).
> Les chiffres de coûts, délais et les points réglementaires sont des **estimations / hypothèses à vérifier** ; chaque point non vérifié est marqué ⚠️.
> Nom, logo et couleurs sont des paramètres (table `app_settings` + fichier de thème) : « PetsNC » n'est qu'un nom de travail.

---

## 0. Synthèse et recommandations clés

1. **Le périmètre demandé représente ~3 à 4 produits** (réseau social + annuaire/Maps + régie publicitaire + SaaS d'abonnements + back-office). Livrer tout avant lancement n'est pas réaliste ni prudent. Je propose un **MVP lançable** (§15) et je range le reste derrière des *feature flags* déjà prévus dans le schéma.
2. **Le revenu vient des professionnels, pas du volume d'utilisateurs.** Le marché calédonien est petit (~270 000 habitants) : l'enjeu est la densité locale, pas les téléchargements. La première métrique de succès est le **nombre de professionnels payants**, pas les inscriptions.
3. **Correction d'une erreur de calcul dans votre tableau** : 50 PRO + 20 PREMIUM = 74 500 + 59 800 = **134 300 XPF**, pas 134 500. Les trois autres lignes sont exactes (59 700 / 268 600 / 537 200). Le simulateur utilisera le calcul réel.
4. **Les commissions des boutiques réduisent fortement ces revenus** si l'abonnement est vendu *dans* l'app (Apple/Google : 15 à 30 %). Voir §9 — c'est la décision commerciale la plus importante du projet.
5. **Ce que je ne peux pas faire depuis cet environnement** (Linux cloud) : compiler pour iOS, tester sur appareils physiques, ouvrir les comptes développeur (Apple 99 $/an, Google 25 $ une fois, Samsung gratuit), créer le projet Supabase/EAS à votre place. Le code, les migrations SQL, les tests automatisés et la configuration de build seront produits et testés ici ; les builds iOS et la soumission se font via **EAS Build** avec vos comptes.

---

## 1. Architecture technique

```
┌──────────────────────┐   ┌─────────────────────────┐
│ App mobile (Expo/RN) │   │ Back-office web (admin)  │
│ iOS · Android · Samsung   │ Next.js + TypeScript     │
└─────────┬────────────┘   └───────────┬─────────────┘
          │ supabase-js (JWT)           │ supabase-js (rôle staff) + API routes
          ▼                             ▼
┌────────────────────────────────────────────────────┐
│ Supabase : Auth · Postgres (RLS) · Storage · Realtime│
│ Edge Functions (Deno) : webhooks paiement, push,     │
│ modération, factures, jobs planifiés (pg_cron)       │
└───────┬───────────────┬──────────────┬──────────────┘
        │               │              │
   Expo Push        Stockage médias  Prestataires paiement
   (APNs/FCM)       + CDN + transcodage  (IAP Apple/Google, + web)
```

- **Monorepo** (npm workspaces) : `apps/mobile`, `apps/admin`, `packages/shared` (types, validation Zod, constantes NC), `supabase/` (migrations, fonctions, seed, tests SQL).
- **Principe de sécurité central** : *toute* règle d'accès est dans Postgres (RLS). Le client mobile n'a que la clé `anon` ; la clé `service_role` n'existe que dans les Edge Functions / le serveur admin.
- **Multi-territoire** : table `territories` (NC aujourd'hui ; PF, WF plus tard), `regions` (provinces) et `communes` rattachées. Devise, fuseau, langue et taxes sont des attributs du territoire.
- **Multi-environnements** : trois projets Supabase (`dev`, `staging`, `prod`) + trois profils EAS (`development`, `preview`, `production`). Variables via EAS Secrets / Supabase secrets.

## 2. Choix technologiques et justification

| Besoin | Choix | Pourquoi / alternative écartée |
|---|---|---|
| Mobile | React Native + Expo (SDK courant) + TypeScript + Expo Router | Un code, iOS + Android + Samsung ; EAS gère la compilation cloud (indispensable : pas de Mac ici). |
| Backend | Supabase (Postgres, Auth, Storage, Realtime, Edge Functions) | Vous l'avez demandé ; réduit le coût de départ. Risque : dépendance fournisseur (§12). |
| Back-office | Next.js (App Router) + TS | Réutilise types et validations du monorepo. Alternative : Vite SPA (plus simple, moins sûr côté serveur). |
| Listes / perf | FlashList, expo-image (cache disque), TanStack Query (cache + persistance offline) | Indispensable pour connexions instables. |
| Vidéo | Upload via TUS (reprise), transcodage serveur en HLS basse définition (≈ 480p/720p) | ⚠️ Le transcodage n'est pas fourni par Supabase : prévoir un service (ex. Cloudflare Stream ou Mux) → coût §11. Au MVP : limite 30 s, compression côté client (`react-native-compressor`). |
| Carte | `react-native-maps` (Apple Maps / Google Maps natifs) | Pas de coût de tuiles côté Apple ; Google Maps SDK gratuit pour les cartes mobiles natives (⚠️ vérifier les CGU actuelles). Géocodage des communes : table locale, pas d'API payante. |
| Push | Expo Push → APNs/FCM | Samsung Galaxy Store : FCM fonctionne sur la quasi-totalité des appareils Samsung. |
| Paiement | Voir §9 | — |
| Tests | Jest + React Native Testing Library, pgTAP / tests SQL RLS, Playwright (admin), Maestro (E2E mobile, sur appareil/émulateur) | |
| CI | GitHub Actions : lint, typecheck, tests, migrations à blanc, `eas build` sur tag | |

## 3. Schéma de base de données (PostgreSQL)

Conventions : `uuid` PK, `created_at/updated_at`, suppression logique (`deleted_at`) pour le contenu modérable, textes localisables via `jsonb` ou tables `_i18n` uniquement pour les référentiels.

**Référentiels / configuration**
- `territories(id, code 'NC', name, currency 'XPF', timezone 'Pacific/Noumea', locale 'fr', tax_label 'TGC', tax_rate)`
- `regions(id, territory_id, name)` — Sud, Nord, Îles Loyauté
- `communes(id, region_id, name, lat, lon)` — 33 communes, centroïde (jamais d'adresse de particulier)
- `species(id, slug, name, icon, sort, is_launch_focus)` — chiens, chats… (administrable)
- `breeds / subcategories(id, species_id, name)`
- `app_settings(key, value jsonb)` — nom, logo, couleurs, textes légaux, feature flags
- `feature_flags(key, enabled, rollout)`

**Identité et social**
- `profiles(id = auth.users.id, handle unique, display_name, avatar_url, bio, commune_id, is_private, role, status, locale, deleted_at)`
- `profile_species_interests(profile_id, species_id)`
- `households(id, name)` + `household_members(household_id, profile_id)`
- `pets(id, owner_id, household_id, species_id, breed_id, name, birth_date, sex?, bio, commune_id, avatar_url, is_private)`
- `follows(follower_id, target_type['profile'|'pet'|'business'], target_id)` — unique
- `friendships(a_id, b_id, status['pending','accepted','blocked'], requested_by)` — contrainte `a_id < b_id`
- `blocks(blocker_id, blocked_id)`
- `posts(id, author_id, author_pet_id?, business_id?, kind['photo','video','text','album','ad'], body, visibility, commune_id, species_id, forum_thread_id?, created_at, deleted_at)`
- `post_media(id, post_id, kind, storage_path, width, height, duration, blurhash, variants jsonb, position, processing_status)`
- `post_pet_tags(post_id, pet_id)` · `hashtags(id, tag)` · `post_hashtags(post_id, hashtag_id)`
- `comments(id, post_id, author_id, parent_id, body, deleted_at)` (réponses = `parent_id`, profondeur limitée à 2 côté UI)
- `reactions(user_id, target_type, target_id, kind['like','love','haha','wow','sad'])` — unique
- `saves(user_id, post_id)` · `shares(id, post_id, user_id, channel)`
- `stories(id, author_id, author_pet_id?, kind, media_path, text, sticker jsonb, expires_at = created_at + 24 h)` · `story_views(story_id, viewer_id)` · `story_replies(story_id, sender_id, body)`
- `albums(id, owner_id, pet_id, title)` + `album_items(album_id, post_media_id, position)`

**Communauté**
- `forum_categories(id, species_id?, name, slug, sort)`
- `forum_threads(id, category_id, author_id, title, body, is_locked, is_pinned, best_reply_id)`
- `forum_replies(id, thread_id, author_id, parent_id, body)` — votes via `reactions`
- `thread_follows(user_id, thread_id)`
- `conversations(id, kind['direct'], created_at)` · `conversation_members(conversation_id, user_id, last_read_at)` · `messages(id, conversation_id, sender_id, body, media_path, created_at)` — indicateur de lecture = `last_read_at`
- `notifications(id, user_id, type, payload jsonb, read_at)` · `push_tokens(user_id, token, platform)`
- `events(id, organizer_id, business_id?, title, starts_at, ends_at, commune_id, description, status)` · `event_rsvps`
- `contests(id, title, rules_text, starts_at, ends_at, conditions jsonb, status)` · `contest_entries(contest_id, post_id, user_id)`
- `news_articles(id, title, body, featured_until)` · `featured_items(target_type, target_id, slot, starts_at, ends_at)`

**Professionnels et revenus**
- `business_categories(id, slug, name)` (vétérinaire, toiletteur… ; table, donc administrable)
- `businesses(id, owner_id, name, category_id, logo_url, description, address_text, commune_id, geo (point), service_area_commune_ids[], phone, email, website, opening_hours jsonb, status['draft','pending','verified','suspended'], verified_at, verified_by, is_founding_partner, founding_terms jsonb)`
- `business_species(business_id, species_id)` · `business_media(...)` · `business_members(business_id, profile_id, role)`
- `business_reviews(id, business_id, author_id, rating, body, status)` — un avis par membre/pro, modérés, signalables
- `contact_requests(id, business_id, sender_id, message, status)`
- `business_stats_daily(business_id, day, views, phone_taps, web_taps, contact_requests, directions_taps)` — agrégé (pas de log brut nominatif)
- `plans(id, code 'discover|pro|premium', name, price_monthly_xpf, price_yearly_xpf, trial_days, limits jsonb, features jsonb, is_active)` — **tout est éditable en admin**
- `subscriptions(id, business_id, plan_id, interval, status['trialing','active','past_due','canceled','expired'], provider['apple','google','samsung','web_manual'], provider_ref, current_period_end, cancel_at_period_end)`
- `payments(id, subscription_id, amount_xpf, tax_xpf, fee_xpf, provider, provider_ref, status, paid_at)` · `invoices(id, payment_id, number, pdf_path, issued_at)` · `payment_events(id, provider, raw jsonb, processed_at)` (journal idempotent des webhooks)
- `promo_codes(code, kind, value, plan_scope, starts_at, ends_at, max_uses, used)` · `founding_program(id, config jsonb)` (ex. 3 mois PRO offerts, durée du badge, tarif préférentiel)
- `ad_campaigns(id, business_id, objective, creative jsonb, budget_xpf, spent_xpf, starts_at, ends_at, targeting jsonb{communes,regions,species,business_category}, status['draft','pending_review','approved','running','paused','ended','rejected'], reviewed_by)` · `ad_events_daily(campaign_id, day, impressions, clicks)`
- `referrals(id, referrer_id, code, invitee_id, status['signed_up','activated','rewarded','fraud'], created_at)` · `ambassadors(profile_id, region_id, status, perks jsonb)`

**Modération et administration**
- `reports(id, reporter_id, target_type, target_id, reason, details, status['open','in_review','actioned','dismissed'], handled_by, handled_at)` · `report_history(report_id, actor_id, action, note, at)`
- `moderation_actions(id, target_type, target_id, action['hide','warn','suspend','ban'], reason, actor_id)`
- `staff_roles(profile_id, role['super_admin','admin','moderator','commercial','partners'])`
- `audit_log(id, actor_id, action, entity, entity_id, diff jsonb, ip, at)` — append-only (pas de UPDATE/DELETE, même pour admin)
- `legal_documents(kind['cgu','privacy','charter','refund'], version, body, published_at)` · `consents(user_id, doc_kind, version, accepted_at)`
- `finance_assumptions(id, name, params jsonb)` — scénarios du simulateur

### Relations principales
`profiles 1—N pets`, `profiles N—N profiles (friendships)`, `profiles/pets/businesses N—N followers (follows polymorphe)`, `posts 1—N post_media / comments`, `posts N—N pets (tags)`, `businesses 1—N subscriptions 1—N payments 1—1 invoices`, `businesses 1—N ad_campaigns`, `species 1—N breeds / forum_categories / business_species`, `territories 1—N regions 1—N communes`.

### Vues et fonctions clés
- `v_feed_*` (pour toi / abonnements / mes animaux / ma région / récents) via fonctions SQL paginées par **curseur** (`created_at, id`), pas par `offset`.
- `fn_nearby_businesses(lat, lon, radius, filters)` (PostGIS).
- `fn_ad_candidates(user_id, slot)` : sélection d'une publicité, plafonnée en fréquence.
- Tâches `pg_cron` : expiration des stories, agrégats de stats, relances d'impayés, fin de période d'essai, purge RGPD des comptes supprimés.

## 4. Règles de sécurité

1. **RLS activée sur 100 % des tables** ; tests automatisés qui échouent si une table du schéma `public` n'a pas de RLS.
2. Lecture : contenu public visible ; profil/animal privé visible seulement des abonnés acceptés ; **tout contenu d'un utilisateur bloqué (dans un sens ou l'autre) est invisible**.
3. Écriture : uniquement sur ses propres lignes (`auth.uid() = author_id`) ; les colonnes sensibles (`role`, `status`, `verified_*`, `is_founding_partner`, `spent_xpf`) ne sont **pas modifiables par le client** (triggers + privilèges de colonnes).
4. Abonnements/paiements : écrits **uniquement** par Edge Functions (webhooks signés). Le client ne peut qu'en lire l'état. Aucune confiance dans un statut envoyé par l'app.
5. **Localisation** : seule la commune des particuliers est stockée (pas de coordonnées précises). Les coordonnées exactes n'existent que pour les adresses professionnelles publiques.
6. Staff : rôles dans `staff_roles`, vérifiés côté base (fonction `has_staff_role()`), 2FA obligatoire pour `super_admin`/`admin`, actions sensibles journalisées dans `audit_log` immuable.
7. Médias : buckets privés + URLs signées pour la messagerie ; buckets publics seulement pour le contenu public ; validation du type MIME et de la taille ; suppression des métadonnées EXIF/GPS **à l'upload**.
8. Abus : limitation de débit (Edge Functions + contraintes SQL), anti-spam (liens, doublons, comptes neufs), CAPTCHA/App Attest/Play Integrity ⚠️ à l'inscription si abus constaté.
9. Aucun secret dans l'app : seules `SUPABASE_URL`, clé `anon` et clés publiques de SDK. Secrets dans EAS Secrets / Supabase secrets ; `.env*` ignorés par Git ; scan de secrets en CI.
10. Suppression de compte : fonction `delete_account()` (exigée par Apple), purge/anonymisation sous 30 jours, avec accès depuis l'app.
11. Sauvegardes : PITR/sauvegardes quotidiennes Supabase (⚠️ offre Pro requise pour PITR), export hebdo chiffré hors plateforme, **test de restauration trimestriel documenté**.

## 5. Organisation des dossiers

```
petsnc/
├─ apps/
│  ├─ mobile/            # Expo Router : app/(tabs)/{index,explorer,publier,communaute,profil}, app/pet/[id], app/pro/[id], app/messages …
│  │  └─ src/{components,features,hooks,lib,theme,i18n}
│  └─ admin/             # Next.js back-office
├─ packages/shared/      # types générés, schémas Zod, constantes NC, theming
├─ supabase/{migrations,functions,seed,tests}/
├─ docs/                 # ARCHITECTURE, SECURITY, PAYMENTS, DEPLOY, USER/ADMIN GUIDES, STORE_SUBMISSION, LAUNCH
├─ .github/workflows/
└─ eas.json · app.config.ts (nom, bundle id, thème lus depuis la config)
```

## 6. Écrans de l'application

- **Onboarding** : accueil → inscription (e-mail / Apple / Google) → pseudo + commune → espèces d'intérêt → (option) ajouter mon animal → fil.
- **Onglets** : *Accueil* (stories horizontales + fil + filtres) · *Explorer* (recherche, annuaire/carte, vidéos courtes, hashtags, événements) · *Publier* (photo/vidéo/texte/story/question forum) · *Communauté* (forums par espèce, groupes futurs, concours, événements, ambassadeurs) · *Profil*.
- **Transverses** : Notifications · Messagerie (liste, conversation) · Recherche globale à onglets · Page animal · Page pro · Détail publication · Visionneuse de stories · Fil vidéo vertical · Fiche forum/sujet.
- **Pro** : créer/revendiquer une fiche, vérification, galerie, publications, demandes de contact, statistiques, abonnement, campagnes publicitaires.
- **Réglages** : confidentialité, utilisateurs bloqués, notifications, langue, charte/CGU/confidentialité, parrainage, suppression de compte, contact.

## 7. Parcours utilisateur (clés)

1. **Particulier** : installation → inscription en < 60 s → choix des espèces → création d'un animal → première publication (assistée) → follow suggéré (commune + espèce) → notification de like/commentaire → rétention.
2. **Professionnel** : inscription → « Je suis professionnel » → fiche DÉCOUVERTE gratuite → demande de vérification → aperçu des fonctions PRO verrouillées + stats limitées → essai/offre fondateur → abonnement.
3. **Découverte d'un pro** : Explorer → carte/filtre commune + activité → fiche → appel / site / message → (stat enregistrée).
4. **Signalement** : « ⋯ » sur tout contenu → motif → accusé de réception → traitement modérateur → décision notifiée → historique conservé.

## 8. Monétisation et abonnements professionnels

- **Gratuit pour les particuliers**, publicité rare : 1 emplacement « Sponsorisé » tous les ~8 éléments du fil, toujours étiqueté, jamais dans la messagerie ni sur les profils d'enfants/refuges ; plafond de fréquence par utilisateur.
- **Plans** (`plans`, modifiables sans déploiement) : DÉCOUVERTE 0 · PRO 1 490 XPF/mois · PREMIUM 2 990 XPF/mois ; tarif annuel, essai, codes promo et offre fondateur paramétrables. Les prix sont des **hypothèses de test**.
- **Droits par fonctionnalité** : colonne `plans.features` + fonction `has_feature(business_id, key)` utilisée par RLS et UI (pas de logique de plan codée en dur).
- **Publicité** : budget prépayé en XPF, facturation à l'impression ou au clic (à décider), validation admin avant diffusion, étiquette « Sponsorisé » obligatoire, plafonds de dépense.
- **Cycle de vie** : essai → actif → échec de paiement (`past_due`, délai de grâce 7 j, relances) → expiré → rétrogradation automatique en DÉCOUVERTE (contenus conservés, fonctions PRO masquées).
- **Revenu net réel** (exemple « Développement » 50 PRO + 20 PREMIUM, brut **134 300 XPF**/mois) :
  - vendu via boutiques à 15 % → ~114 100 XPF ; à 30 % → ~94 000 XPF ;
  - vendu hors boutique (facture/virement/lien web) → brut moins frais bancaires ; **voir §9**.
  - Un point mort réaliste n'est **pas** connu avant d'avoir des coûts réels (§11).

## 9. Système de paiement (point de décision n°1)

**Règle des boutiques** : un abonnement qui débloque des *fonctions numériques dans l'app* doit en principe passer par l'achat intégré (Apple IAP, Google Play Billing, Samsung IAP). Les services *physiques* (ex. un toilettage payé à un pro) peuvent utiliser un autre moyen de paiement. Je ne contournerai pas ces règles.

Options à comparer (⚠️ règles et commissions à re-vérifier à la date de soumission, elles évoluent) :

| Option | Avantages | Limites |
|---|---|---|
| **A. IAP uniquement** (Apple/Google/Samsung) | Conforme, simple pour l'utilisateur, versements chez vous | Commission 15–30 % ; **XPF** : ⚠️ vérifier que la boutique NC propose le prix en XPF et que votre entreprise/banque reçoit les virements depuis NC ; 3 intégrations différentes (RevenueCat peut les unifier, coût en % du CA suivi) |
| **B. Abonnement vendu hors app** (devis/facture/virement, ou site web), l'app lit seulement le statut | Pas de commission, pro vendu en direct (cadre B2B local réaliste : visites, démarchage) | ⚠️ Règles « anti-steering » d'Apple/Google : l'app **ne doit pas inciter** à payer ailleurs sans respecter les exceptions applicables ; analyse juridique avant soumission |
| **C. Hybride** (recommandé comme point de départ) | Phase 1 : partenaires fondateurs gratuits puis facturation manuelle (facture TGC, virement) ; Phase 2 : IAP intégré une fois le modèle validé | Plus de travail de rapprochement manuel au début |

**Prestataires de paiement locaux/web** : je **ne présume pas** qu'un acteur (Stripe, PayPal, banques locales, etc.) accepte une société calédonienne, facture en XPF ou verse sur un compte NC. Action requise de votre côté : demander aux banques locales et aux acteurs envisagés les conditions d'éligibilité, la devise, les délais de versement et les frais. Le code utilisera une interface `PaymentProvider` ; le choix final n'est pas bloquant pour le MVP (option C).

**Fiscalité** : ⚠️ la Nouvelle-Calédonie applique la **TGC** (pas la TVA métropolitaine) ; factures numérotées, mentions légales, taux selon la nature du service à valider avec un expert-comptable.

## 10. Back-office

Modules : tableau de bord (KPIs §13), utilisateurs, animaux, publications/commentaires/stories/forums, signalements (file avec statut, priorité, SLA, historique), professionnels (vérification avec pièces), plans/prix/avantages, abonnements/paiements/factures, codes promo, partenaires fondateurs, campagnes (validation), catégories/espèces/sous-catégories, actualités/événements/concours/à la une, paramètres de marque (nom, logo, couleurs), simulateur financier et seuil de rentabilité, journal d'audit.
Rôles : super_admin · admin · moderator · commercial · partners (matrice de permissions testée). 2FA et journalisation des actions sensibles.

**Simulateur** : entrées = tarifs, nb de pros, conversion, résiliation, revenus pub, coûts fixes/variables, commissions boutiques/frais de paiement ; sorties = MRR, marge, projection 12 et 24 mois, point mort. Libellé permanent : « chiffre d'affaires théorique brut avant frais, taxes et impayés ».

## 11. Coûts prévisionnels des services (estimations ⚠️ à confirmer sur les grilles actuelles)

| Poste | Démarrage | Ordre de grandeur |
|---|---|---|
| Compte Apple Developer | ~99 USD/an | fixe |
| Google Play | ~25 USD une fois | fixe |
| Samsung Galaxy Store | gratuit (compte vendeur) | — |
| Supabase | Free pour dev ; **Pro ~25 USD/mois** pour prod (sauvegardes, pas de mise en pause) | + stockage/bande passante au-delà du quota |
| Hébergement vidéo/transcodage | à mesurer | variable, **premier poste de coût à surveiller** ; limiter durée/poids au début |
| Expo EAS | offre gratuite limitée ; ~19–99 USD/mois si builds fréquents | |
| Notifications push | Expo gratuit | — |
| Back-office (Vercel/équivalent) | gratuit à ~20 USD/mois | |
| Domaine, e-mail transactionnel | ~15–30 USD/mois cumulés | |
| Commissions boutiques / frais de paiement | 15–30 % ou frais bancaires | voir §8–9 |
| Légal/comptable (CGU, RGPD, TGC) | à budgéter | hors scope technique |

Ordre de grandeur **mensuel d'exploitation au lancement : ~60–150 USD** hors vidéo intensive, marketing et salaires. Je produirai le tableur de coûts dans le simulateur ; les valeurs réelles remplaceront ces hypothèses.

## 12. Planning (1 développeur-équipe IA + vous pour comptes, décisions, tests terrain)

| Phase | Contenu | Durée indicative |
|---|---|---|
| 0 | Validation de ce dossier, comptes, nom/marque | 1 sem. |
| 1 Fondations | monorepo, schéma + RLS + tests, auth, design system, navigation, profils, animaux, espèces | 3–4 sem. |
| 2 Réseau social | fil, publications photo/vidéo, likes/commentaires, amis/abonnements, stories | 4–5 sem. |
| 3 Communauté | forums, recherche, messagerie, notifications | 3–4 sem. |
| 4 Pros | fiches, annuaire + carte, plans/abonnements (option C), statistiques, publicité (v1) | 4 sem. |
| 5 Admin | back-office, modération, simulateur | 3 sem. |
| 6 Lancement | sécurité, perfs, conformité, builds, tests sur appareils, soumission | 3–4 sem. (+ délais de revue boutiques, plusieurs jours à semaines) |

≈ **5 à 6 mois** pour tout, **≈ 3,5 mois** pour le MVP (§15). Ces délais supposent des décisions rapides de votre part et des tests sur vrais téléphones.

## 13. Indicateurs

Tables d'événements anonymisés + vues SQL pour : inscriptions, DAU/MAU, rétention J7/J30, animaux, publications, interactions ; fiches créées/vérifiées, conversion gratuit→PRO/PREMIUM, churn ; MRR, CA, revenus pub, coûts, marge, point mort ; temps de chargement, erreurs, plantages (Sentry), signalements et délai moyen de traitement. Tableau de bord dans le back-office.

## 14. Risques techniques

| Risque | Mitigation |
|---|---|
| Périmètre trop large → lancement retardé | MVP + feature flags (§15) |
| Coût/complexité vidéo (transcodage, bande passante NC) | limites de durée/poids, HLS bas débit, compression client, reprise TUS ; décision de service vidéo en phase 2 |
| Connexions instables / latence vers l'hémisphère nord | cache agressif, mode dégradé, pagination par curseur, images en variantes ; ⚠️ choisir la région Supabase la plus proche (probablement Sydney) |
| Démarrage à froid : réseau social vide | contenus fondateurs/ambassadeurs/refuges avant lancement public ; annuaire utile même sans communauté |
| Paiements (3 boutiques + XPF + banque locale) | option hybride C, `PaymentProvider`, RevenueCat à évaluer |
| Rejet boutiques (UGC) | signalement, blocage, filtrage, suppression de compte, politiques publiques **dès le MVP** |
| Dépendance Supabase | pas de logique propriétaire non portable ; SQL standard ; export régulier |
| Fraude parrainage / faux pros | récompense seulement après activation réelle ; vérification des pros |
| Impossible de tester iOS ici | EAS Build + TestFlight + appareils physiques de votre côté |

## 15. Points réglementaires (⚠️ à valider avec un juriste local — je ne fournis pas d'avis juridique)

- **Données personnelles** : applicabilité exacte à la Nouvelle-Calédonie (RGPD/Loi Informatique et Libertés) à confirmer ; dans tous les cas, appliquer les standards (consentement, minimisation, droit d'accès/suppression, registre de traitements). Mineurs : âge minimum 15–16 ans à définir.
- **Animaux** : règles de **vente/cession d'animaux** et de **maltraitance** (codes de l'environnement provinciaux, réglementation territoriale) ; interdire les annonces de vente d'animaux au MVP ou n'autoriser que les éleveurs/associations déclarés avec champs obligatoires. Espèces protégées/NAC : ne pas permettre le commerce.
- **Avis clients** : transparence (avis vérifiables, pas de faux avis), droit de réponse.
- **Publicité** : mention « Sponsorisé », pas de publicité trompeuse.
- **Concours** : règlement, dates, remise des lots, loteries interdites sans cadre légal.
- **Fiscalité** : TGC, facturation, statut de l'éditeur (société/entreprise individuelle), mentions légales.
- **Boutiques** : Apple 1.2 (UGC : filtrage, signalement, blocage, contact), 5.1.1(v) (suppression de compte), 3.1 (achats intégrés) ; Google (UGC, Data safety, suppression de compte avec lien web) ; Samsung (conditions vendeur, IAP Samsung). Textes à re-lire à la soumission.

## 16. Stratégie de lancement

1. **T-12 à T-6 sem.** : recruter 15–25 **partenaires fondateurs** (vétos, toiletteurs, animaleries, refuges, pensions, centres équestres) sur le Grand Nouméa ; offre configurable (ex. 3 mois PRO, badge, mise en avant) ; contrat simple.
2. **T-6 à T-0** : bêta fermée (TestFlight + test interne Play) avec 100–300 propriétaires via refuges/associations/groupes Facebook locaux ; recueil de retours ; ambassadeurs (5–10).
3. **Lancement public Province Sud** : QR codes en cabinet/animalerie, parrainage par lien, concours photo « plus beau chien/chat du mois », journées d'adoption.
4. **Provinces Nord et Îles** après validation de la rétention ; extension territoriale (PF, WF) via `territories`.
5. **Métrique de passage** : ex. > 1 000 inscrits actifs sur 30 jours **et** ≥ 15 pros PRO/PREMIUM payants (seuils à fixer ensemble).

## 17. Périmètre MVP proposé vs plus tard

**MVP (lançable)** : auth + suppression compte, profils + animaux, espèces, fil + photos + courtes vidéos (limite), likes/commentaires, abonnements, stories (v1), recherche, annuaire + carte + fiches pro (DÉCOUVERTE/PRO), forum basique, messagerie texte+photo, notifications, signalement/blocage/modération, back-office essentiel, option paiement C, simulateur.
**Après MVP** : publicités en self-service, boosts/crédits, messagerie vidéo, vidéos longues, groupes privés, événements/concours complets, recommandations, IAP automatisés (selon décision §9), nouvelles langues.

---

## Décisions dont j'ai besoin de vous

1. Nom de travail OK (« PetsNC ») ou autre nom ?
2. Paiement : approuvez-vous l'**option hybride C** (facturation manuelle des pros fondateurs d'abord) ?
3. Périmètre : approuvez-vous le **MVP du §17** ?
4. Dossier : ce dépôt héberge déjà *Immo360 NC*. Je propose `petsnc/` en sous-dossier ; sinon, un dépôt dédié (recommandé à terme, car deux apps distinctes avec comptes boutiques distincts).
5. Comptes : disposez-vous (ou prévoyez-vous) d'un compte Supabase, Apple Developer, Google Play et Expo ?
6. Ventes d'animaux : interdites au MVP (recommandé) ?
