# Reprise du chantier compte et abonnement UNUVIA

Implémentation locale du 8 octobre 2026.

## Résultat

- PostgreSQL remplace SQLite pour l’authentification, le profil, les paramètres, les abonnements et les limites de requêtes. La base SQLite précédente reste conservée ; ses comptes de test ne sont pas importés.
- `/account` : profil et photo, rôle, établissement, pays, thème et modèle par défaut, changement de mot de passe, suppression du compte, abonnement et historique des demandes.
- `/admin/subscriptions` : validation/refus des paiements, prolongation ou annulation de Pro, historique des actions. Un email administrateur doit être autorisé et vérifié.
- Free : Sonnet 4.6 Free, 10 requêtes/minute. Pro : tous les modèles disponibles auprès du service connecté, 30 requêtes/minute. Les contrôles sont appliqués côté serveur.
- Paiement externe par Mobile Money ou carte, avec référence et validation manuelle. Activation pour 30 jours, renouvellement manuel, retour à Free à l’expiration.
- Pricing, FAQ, liens et thèmes raccordés au nouveau parcours. Streaming, fichiers, panneaux de documents et historique local sont conservés.

## Vérifications

- `npm run check` et `npm run build` réussis.
- 25 tests API PostgreSQL réussis.
- 46 tests navigateur réussis, dont profils/photos, persistance entre sessions, demande/validation Pro, suppression de compte, responsive, streaming/fichiers et accessibilité dans les deux thèmes.
- Tests isolés dans des schémas PostgreSQL temporaires, supprimés après exécution ; aucun crédit de génération réel utilisé.
- Contrôles locaux : accueil, compte et assistant HTTP 200, administration anonyme HTTP 404, API de compte anonyme HTTP 401. Google est configuré ; aucune connexion réelle à un compte Google n’a été effectuée pendant ce chantier.

## Configuration à compléter

- `ADMIN_EMAILS` : email(s) administrateur(s) ; accès réservé aux comptes vérifiés.
- `PAYMENT_MOBILE_MONEY_INSTRUCTIONS` : coordonnées et instructions réelles.
- `PAYMENT_CARD_INSTRUCTIONS` : lien/instructions du paiement externe par carte.
- `PRO_PRICE_MGA` : prix en ariary, après confirmation de la proposition de 55 000 Ar. Sans cette valeur, le prix reste 12 $ à Madagascar. La zone euro utilise 12 €.

Les méthodes de paiement sont désactivées en l’absence d’instructions. Aucun administrateur réel ni destinataire de paiement fictif n’a été configuré. L’accès aux modèles Pro dépend aussi des permissions du service connecté ; la clé actuelle expose Sonnet 4.6 Free. Aucun paiement automatique ni déploiement o2switch n’a été réalisé.

## Fichiers modifiés

- [.env.example](/home/reinia/projects/univa/.env.example)
- [README.md](/home/reinia/projects/univa/README.md)
- [docs/superpowers/specs/2026-10-08-compte-abonnement-design.md](/home/reinia/projects/univa/docs/superpowers/specs/2026-10-08-compte-abonnement-design.md)
- [next.config.ts](/home/reinia/projects/univa/next.config.ts)
- [package-lock.json](/home/reinia/projects/univa/package-lock.json)
- [package.json](/home/reinia/projects/univa/package.json)
- [playwright.config.ts](/home/reinia/projects/univa/playwright.config.ts)
- [src/app/api/assistant/route.ts](/home/reinia/projects/univa/src/app/api/assistant/route.ts)
- [src/app/api/auth/[...all]/route.ts](/home/reinia/projects/univa/src/app/api/auth/[...all]/route.ts)
- [src/app/assistant/page.tsx](/home/reinia/projects/univa/src/app/assistant/page.tsx)
- [src/components/access-dialog.tsx](/home/reinia/projects/univa/src/components/access-dialog.tsx)
- [src/components/assistant-sidebar.tsx](/home/reinia/projects/univa/src/components/assistant-sidebar.tsx)
- [src/components/assistant.tsx](/home/reinia/projects/univa/src/components/assistant.tsx)
- [src/components/chat-composer.tsx](/home/reinia/projects/univa/src/components/chat-composer.tsx)
- [src/components/landing.tsx](/home/reinia/projects/univa/src/components/landing.tsx)
- [src/components/theme-provider.tsx](/home/reinia/projects/univa/src/components/theme-provider.tsx)
- [src/lib/assistant-errors.ts](/home/reinia/projects/univa/src/lib/assistant-errors.ts)
- [src/lib/auth.ts](/home/reinia/projects/univa/src/lib/auth.ts)
- [src/lib/landing-data.ts](/home/reinia/projects/univa/src/lib/landing-data.ts)
- [tests/assistant-api.test.mjs](/home/reinia/projects/univa/tests/assistant-api.test.mjs)
- [tests/univa.spec.ts](/home/reinia/projects/univa/tests/univa.spec.ts)

## Fichiers ajoutés

- [docs/account-implementation.md](/home/reinia/projects/univa/docs/account-implementation.md)
- [scripts/e2e.mjs](/home/reinia/projects/univa/scripts/e2e.mjs)
- [src/app/account/account.css](/home/reinia/projects/univa/src/app/account/account.css)
- [src/app/account/page.tsx](/home/reinia/projects/univa/src/app/account/page.tsx)
- [src/app/admin/subscriptions/page.tsx](/home/reinia/projects/univa/src/app/admin/subscriptions/page.tsx)
- [src/app/api/account/route.ts](/home/reinia/projects/univa/src/app/api/account/route.ts)
- [src/app/api/admin/subscriptions/route.ts](/home/reinia/projects/univa/src/app/api/admin/subscriptions/route.ts)
- [src/app/api/pricing/route.ts](/home/reinia/projects/univa/src/app/api/pricing/route.ts)
- [src/app/api/subscription/route.ts](/home/reinia/projects/univa/src/app/api/subscription/route.ts)
- [src/components/account-settings.tsx](/home/reinia/projects/univa/src/components/account-settings.tsx)
- [src/components/subscription-admin.tsx](/home/reinia/projects/univa/src/components/subscription-admin.tsx)
- [src/lib/account-client.ts](/home/reinia/projects/univa/src/lib/account-client.ts)
- [src/lib/account.ts](/home/reinia/projects/univa/src/lib/account.ts)
- [src/lib/db.ts](/home/reinia/projects/univa/src/lib/db.ts)
- [src/lib/plans.ts](/home/reinia/projects/univa/src/lib/plans.ts)
- [src/lib/schema.ts](/home/reinia/projects/univa/src/lib/schema.ts)
- [tests/account-api.test.mjs](/home/reinia/projects/univa/tests/account-api.test.mjs)
- [tests/account.spec.ts](/home/reinia/projects/univa/tests/account.spec.ts)
- [tests/api-runtime.mjs](/home/reinia/projects/univa/tests/api-runtime.mjs)

## Fichiers supprimés

- `src/app/api/waitlist/route.ts` — remplacé par les demandes d’abonnement.

## Configuration privée locale

`.env.local` a été mis à jour avec `DATABASE_URL`, et le secret de signature local existant a été conservé dans cette configuration privée. `AUTH_DATABASE_PATH` a été retiré. Les identifiants PostgreSQL restent privés ; les informations Google et la clé du service connecté ont été conservées. Ce fichier n’est pas versionné.
