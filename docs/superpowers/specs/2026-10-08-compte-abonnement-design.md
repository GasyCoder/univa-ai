# Compte, paramètres et abonnement sur PostgreSQL

Date : 2026-10-08. Statut : implémenté en local ; configuration des paiements à compléter.

## But

Un compte UNUVIA a un profil, des paramètres et un abonnement, conservés sur le
serveur. Les données vivent dans PostgreSQL pour pouvoir être hébergées chez
o2switch (`unuvia.gasycoder.com`).

## Ce qui est décidé

- **Base** : PostgreSQL partout (poste de développement, tests, o2switch).
  SQLite et `better-sqlite3` sont retirés. Supabase est écarté (ports sortants
  5432 et 6543 fermés depuis o2switch), Firebase aussi (non relationnel).
- **Paiement** : l'utilisateur paie par Mobile Money ou carte bancaire hors de
  l'application et saisit sa référence ; un administrateur valide. Aucun
  prestataire de paiement n'est intégré dans ce chantier.
- **Prix** : affiché dans la devise du pays du client, en dollars par défaut.
- **Comptes existants** : la base SQLite locale ne contient que des comptes de
  test ; elle n'est pas reprise.

## Étape 1 — PostgreSQL

- `DATABASE_URL` (obligatoire) remplace `AUTH_DATABASE_PATH`.
- `src/lib/db.ts` : un seul `Pool` (`pg`), partagé par Better Auth et par nos
  requêtes. `src/lib/auth.ts` lui passe ce pool ; les migrations Better Auth
  continuent de s'exécuter au premier appel.
- Nos tables sont créées par un module `src/lib/schema.ts` (SQL inclus dans le bundle serveur), exécuté une fois au
  démarrage (`CREATE TABLE IF NOT EXISTS`). Pas d'ORM, pas d'outil de migration :
  quatre tables ne le justifient pas.
- `assistant_rate_limits` et la route `/api/assistant` passent à `pg` (même
  requête `INSERT … ON CONFLICT`, paramètres `$1`).
- `pro_waitlist` et `/api/waitlist` sont supprimés (remplacés par l'étape 3).
- Tests : les API et Playwright utilisent des schémas PostgreSQL temporaires,
  supprimés après chaque exécution. La base de développement reste isolée.

## Étape 2 — Profil et paramètres

Table `profile` (une ligne par compte, créée à la première lecture) :

| colonne                              | sens                                                   |
| ------------------------------------ | ------------------------------------------------------ |
| `user_id`                            | clé primaire, référence `user`, suppression en cascade |
| `role`                               | Student, Faculty, Researcher ou Staff                  |
| `institution`                        | établissement, texte libre, 120 caractères au plus     |
| `country`                            | code pays ISO à deux lettres, sert au prix             |
| `theme`                              | light, dark ou system                                  |
| `default_model`, `default_reasoning` | préférences du composeur                               |

Le nom et la photo restent dans la table `user` de Better Auth.

- `GET` / `PUT /api/account` : lit et enregistre profil et paramètres. Session et
  origine vérifiées comme sur `/api/assistant` ; chaque valeur est validée contre
  sa liste (rôle, thème, modèle, pays).
- Page `/account`, trois onglets : Profil, Paramètres, Abonnement.
- Mot de passe et suppression du compte passent par les fonctions de Better Auth
  (`changePassword`, `deleteUser`), sans code d'authentification maison.
- L'assistant lit le thème, le rôle, le modèle et l'effort depuis le profil au
  lieu du stockage du navigateur.

## Étape 3 — Abonnement

**Offres** (dans `src/lib/plans.ts`, une seule source) :

| offre | modèles                | requêtes      |
| ----- | ---------------------- | ------------- |
| Free  | Claude Sonnet 4.6 Free | 10 par minute |
| Pro   | tous les modèles       | 30 par minute |

**Prix de Pro par mois**, table fixe dans `plans.ts`, sans taux de change en
direct :

| zone             | prix                                                                    |
| ---------------- | ----------------------------------------------------------------------- |
| Madagascar       | prix proposé : 55 000 Ar, à confirmer ; `PRO_PRICE_MGA` vide = prix USD |
| zone euro        | 12 €                                                                    |
| partout ailleurs | 12 $                                                                    |

Le pays vient du profil. S'il est vide, il est proposé d'après la langue du
navigateur (`Accept-Language`), et l'utilisateur peut le changer dans son profil.
Le montant enregistré sur une demande est celui affiché au moment de la demande.

**Tables**

- `subscription` : `user_id` (clé primaire), `plan`, `status` (active, expired,
  cancelled), `current_period_end`. Absence de ligne = Free.
- `payment_request` : `id`, `user_id`, `plan`, `amount`, `currency`, `method`
  (mobile_money ou card), `reference`, `status` (pending, approved, rejected),
  `created_at`, `reviewed_by`, `reviewed_at`, `note`. Une seule demande en
  attente par compte. Jamais supprimée : c'est l'historique.

**Parcours**

1. Onglet Abonnement : offre actuelle, date de fin, historique des demandes.
2. « Passer à Pro » : instructions de paiement, choix du moyen, saisie de la
   référence → demande `pending`.
3. `/admin/subscriptions`, réservé aux comptes à email vérifié dans `ADMIN_EMAILS` : liste des
   demandes ; valider (crée ou prolonge l'abonnement de 30 jours), refuser avec
   une note, annuler un abonnement.
4. Renouvellement : même parcours ; valider ajoute 30 jours à la date de fin, ou
   à aujourd'hui si elle est passée.

**Application des limites** : `/api/assistant` lit l'offre du compte et refuse un
modèle hors offre (`model_not_allowed`, 403) ou une requête au-delà du quota. Un
abonnement dont la date de fin est passée vaut Free, sans tâche planifiée.
Le composeur reçoit la liste des modèles permis par l'offre.

## Erreurs

- Base injoignable : les routes répondent 503 avec un message générique ; rien
  n'est écrit dans le navigateur sur la cause.
- Demande en double, référence vide, moyen inconnu : 422 avec le champ fautif.
- Un compte non administrateur sur `/admin/*` : 404.

## Tests

- API : profil (validation, isolation entre comptes), demande de paiement
  (une seule en attente), validation et refus par l'administrateur, accès
  administrateur refusé, modèle hors offre refusé, quota par offre, expiration.
- Playwright : modifier son profil, demander Pro, valider en administrateur,
  constater que les modèles Pro deviennent sélectionnables.

## Hors périmètre

Paiement en ligne automatique, factures, offres pour établissements, sauvegarde
des conversations sur le serveur, mise en ligne sur o2switch (étape séparée,
après accord).

## À confirmer par le propriétaire

- Le prix de 55 000 Ar pour Madagascar (proposition, environ 12 $).
- Les adresses à mettre dans `ADMIN_EMAILS`.
- Les instructions de paiement à afficher (numéro Mobile Money, moyen pour la
  carte).

## Détails de l’implémentation locale

- PostgreSQL 15.17 testé ; ancienne base SQLite conservée, comptes de test non importés.
- `subscription_event` conserve les validations, prolongations et annulations.
- Une référence ne peut pas être réutilisée pour le même moyen de paiement.
- Verrouillage transactionnel : une demande ne peut pas être validée deux fois.
- Les modèles accessibles sont l’intersection entre l’offre UNUVIA et le service connecté.
- Les méthodes de paiement restent désactivées sans instructions réelles.
- Aucun compte administrateur réel ni prix MGA n’est défini sans les informations du propriétaire.
- Aucun déploiement o2switch n’a été effectué.
