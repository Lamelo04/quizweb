# Quiz Web

Mini quiz en HTML, CSS et JavaScript, avec un petit serveur Node.js pour garder la clé Gemini hors du navigateur.

## Lancer le projet

1. Installer Node.js 18 ou une version plus récente.
2. Si `.env` n'existe pas, copier `.env.example` vers `.env`.
3. Ouvrir `.env` et y définir votre clé `GEMINI_API_KEY` (si le fichier existe déjà, le modifier sans le remplacer).
4. Dans ce dossier, lancer `npm start`.
5. Ouvrir <http://localhost:3000> dans le navigateur.

La clé reste dans `.env`, qui est ignoré par Git. Ne la collez pas dans `script.js`, ne la publiez pas et ne la partagez pas dans une conversation. Les appels à l'API respectent les quotas et les conditions de facturation associés à votre clé Google AI.

Le mode démo fonctionne sans clé API. La génération automatique nécessite une clé et une connexion Internet.

## Fonctionnalités

- Compte à rebours de 20 secondes pour chaque question.
- Score en points : une bonne réponse vaut jusqu'à 100 points, diminués de 5 points par seconde écoulée (minimum 10 points). Une mauvaise réponse ou une réponse expirée vaut zéro.
- Feedback immédiat avec explication.
- Historique des cinq meilleurs scores dans le stockage local du navigateur.
- Rejouer la même série avec une remise à zéro complète, ou revenir à l'accueil pour choisir un autre quiz.
- Questions à choix multiples, vrai/faux ou mélange des deux.
- Barre de progression, transition animée et mode démo local.
- Génération de questions sur un sujet, un niveau et un nombre choisis via l'API Gemini `generateContent`.
- Modèle par défaut : `gemini-3.5-flash-lite`, disponible dans le niveau gratuit selon les quotas actifs du projet.

Le serveur écoute uniquement sur `127.0.0.1` pour l'utilisation locale du mini-projet.
