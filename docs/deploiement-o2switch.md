# Déployer UNUVIA sur o2switch

Objectif : mettre en ligne `https://unuvia.gasycoder.com` depuis votre poste. Comptez
environ une heure la première fois.

Ce guide a été préparé sans accès à votre cPanel. Le fichier de démarrage `app.js` a été
testé en local ; les écrans cPanel et le comportement de l'hébergeur ne l'ont pas été.
Les points à vérifier sur place sont signalés par « À vérifier ».

## État au 9 octobre 2026

Le site est déployé et répond sur `https://unuvia.gasycoder.com`. L'application est dans
`~/unuvia-app`, ses réglages dans `~/unuvia-app/.env.production.local` et son journal dans
`~/logs/unuvia-app.log`. Les étapes 1 à 6 ci-dessous décrivent ce qui a été fait ; pour une
nouvelle version, allez directement à « Mettre à jour plus tard ».

Les réglages sont dans le fichier `.env.production.local`, pas dans l'écran « Environment
variables » de cPanel. Modifiez ce fichier, puis cliquez **Restart**.

## Avant de commencer

Il vous faut :

- le sous-domaine `unuvia.gasycoder.com` créé dans cPanel, avec son certificat HTTPS ;
- la base `flbe7109_unuvia` et son utilisateur `flbe7109_unuvax` (déjà créés) ;
- la boîte `contact@gasycoder.com` (déjà créée) ;
- une clé API créée sur platform.claude.com ;
- Node.js 22 : vérifié le 2026-10-09, le serveur propose les versions 22 et 24.

Le serveur de base de données est en PostgreSQL 9.6, alors que le développement se fait en
version 15. **À vérifier** au premier démarrage : la création des tables doit réussir.

## 1. Préparer l'archive sur votre poste

```bash
npm run deploy:pack
```

La commande compile l'application et crée `unuvia-deploy.tar.gz` (environ 12 Mo). L'archive
contient l'application compilée, `public/`, `app.js`, `package.json`, `package-lock.json`,
`next.config.ts` et le script de vérification. Elle ne contient aucun secret et n'inclut
pas `.env.local`.

La compilation se fait sur votre poste parce qu'un hébergement mutualisé manque souvent de
mémoire pour `next build`.

## 2. Créer l'application Node.js dans cPanel

Dans cPanel, ouvrez **Setup Node.js App**, puis **Create Application** :

| Champ                    | Valeur                 |
| ------------------------ | ---------------------- |
| Node.js version          | 22 ou plus récent      |
| Application mode         | Production             |
| Application root         | `unuvia-app`           |
| Application URL          | `unuvia.gasycoder.com` |
| Application startup file | `app.js`               |

Validez. cPanel crée le dossier `~/unuvia-app`. Il est volontairement en dehors de
`public_html` : les fichiers de l'application ne doivent pas être accessibles depuis le web.

## 3. Envoyer les fichiers

1. Dans le **Gestionnaire de fichiers**, ouvrez `~/unuvia-app`.
2. Envoyez `unuvia-deploy.tar.gz`, puis faites **Extraire**.
3. Vérifiez que `app.js`, `package.json` et le dossier `.next` sont directement dans
   `~/unuvia-app`. Activez « Afficher les fichiers cachés » pour voir `.next`.

## 4. Renseigner les variables d'environnement

Dans la page de l'application, section **Environment variables**, ajoutez :

| Nom                  | Valeur                                                                     |
| -------------------- | -------------------------------------------------------------------------- |
| `BETTER_AUTH_URL`    | `https://unuvia.gasycoder.com`                                             |
| `BETTER_AUTH_SECRET` | une chaîne aléatoire, voir ci-dessous                                      |
| `DATABASE_URL`       | `postgresql://flbe7109_unuvax:MOT_DE_PASSE@127.0.0.1:5432/flbe7109_unuvia` |
| `ANTHROPIC_API_KEY`  | votre clé Claude                                                           |
| `SMTP_HOST`          | `mail.gasycoder.com`                                                       |
| `SMTP_PORT`          | `465`                                                                      |
| `SMTP_USER`          | `contact@gasycoder.com`                                                    |
| `SMTP_PASSWORD`      | le mot de passe de la boîte                                                |
| `ADMIN_EMAILS`       | votre adresse d'administrateur                                             |

Trois précautions :

- **Secret** : générez-le sur votre poste avec `openssl rand -hex 48`. Ne réutilisez pas
  celui de développement, et ne le changez plus ensuite : le changer déconnecte tout le
  monde.
- **Mot de passe de la base** : dans `DATABASE_URL`, remplacez chaque `+` par `%2B`, chaque
  `@` par `%40` et chaque `/` par `%2F`.
- **Mot de passe SMTP** : saisissez-le tel quel dans cPanel. L'échappement `\$` ne sert que
  dans un fichier `.env`.

Ajoutez aussi, quand vous serez prêt à encaisser :
`PAYMENT_MOBILE_MONEY_INSTRUCTIONS`, `PAYMENT_CARD_INSTRUCTIONS` et `PRO_PRICE_MGA`. Tant
qu'elles sont vides, l'onglet Plan indique que les paiements ne sont pas disponibles.

Pour la connexion Google, ajoutez `GOOGLE_CLIENT_ID` et `GOOGLE_CLIENT_SECRET`, puis
autorisez dans Google Cloud l'adresse de retour
`https://unuvia.gasycoder.com/api/auth/callback/google`.

## 5. Installer les dépendances et vérifier

1. Dans la page de l'application, cliquez **Run NPM Install**.
2. Ouvrez le **Terminal** de cPanel. Copiez la commande « Enter to the virtual
   environment » affichée en haut de la page de l'application et exécutez-la.
3. Lancez la vérification :

```bash
node scripts/prod-check.mjs
```

**À vérifier** : si toutes les lignes sont en `FAIL` avec « missing », le terminal ne voit
pas les variables saisies dans cPanel. Créez alors un fichier `~/unuvia-app/.env.production.local`
avec les mêmes lignes `NOM=valeur` (ici le `$` d'un mot de passe s'écrit `\$`), et relancez.

Le script teste la version de Node.js, le secret, l'adresse publique, la connexion à
PostgreSQL et le droit de créer des tables, la clé Claude et ses quatre modèles, et la
connexion SMTP. Il n'affiche aucun secret. Corrigez chaque ligne `FAIL` avant de continuer.

## 6. Démarrer et tester

Cliquez **Restart** dans la page de l'application, puis ouvrez
`https://unuvia.gasycoder.com`. Les tables sont créées à la première connexion.

Testez dans cet ordre :

1. La page d'accueil s'affiche en HTTPS.
2. Créez un compte : l'e-mail de vérification arrive.
3. Posez une question dans l'assistant. **À vérifier** : la réponse doit s'afficher mot à
   mot. Si elle n'apparaît qu'en un bloc à la fin, le serveur web met la réponse en
   tampon ; l'application fonctionne quand même, et le support o2switch peut désactiver ce
   tampon pour le sous-domaine.
4. « Forgot your password? » envoie bien un lien.
5. Connectez-vous avec l'adresse listée dans `ADMIN_EMAILS` et ouvrez
   `/admin/subscriptions`. L'adresse doit être vérifiée : cliquez le lien reçu à
   l'inscription, ou connectez-vous avec Google.

## Mettre à jour plus tard

1. Sur votre poste : `npm run deploy:pack`.
2. Dans `~/unuvia-app`, supprimez l'ancien dossier `.next`, envoyez la nouvelle archive et
   extrayez-la.
3. Si `package.json` a changé, cliquez **Run NPM Install**.
4. Cliquez **Restart**.

Les variables d'environnement et la base ne sont pas touchées par une mise à jour.

## En cas de problème

| Symptôme                                      | Cause probable                                                            |
| --------------------------------------------- | ------------------------------------------------------------------------- |
| Page d'erreur 503 ou « Incomplete response »  | L'application n'a pas démarré : lisez `stderr.log` dans `~/unuvia-app`.   |
| « Set BETTER_AUTH_SECRET… » dans le journal   | Variable manquante, ou application non redémarrée après l'ajout.          |
| « Cannot find module 'pg' »                   | **Run NPM Install** n'a pas été lancé, ou a échoué.                       |
| Connexion impossible, erreur d'origine        | `BETTER_AUTH_URL` ne correspond pas exactement à l'adresse du navigateur. |
| « The assistant isn't connected yet »         | `ANTHROPIC_API_KEY` absente.                                              |
| « Your workspace is temporarily unavailable » | `DATABASE_URL` incorrecte : relancez `node scripts/prod-check.mjs`.       |

## Sauvegardes

Activez dans cPanel une sauvegarde régulière de la base `flbe7109_unuvia`. Elle contient
les comptes, les abonnements, les demandes de paiement et la consommation. L'historique des
conversations reste dans le navigateur de chaque utilisateur et n'est pas sauvegardé.
