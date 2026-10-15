# Burnout 3 LAB · Centre de contrôle des deux agents

Site public : https://elikto.github.io/Burnout3-LAB-Viewer/

## Fonctionnalités

- **Accueil** : barres de progression calculées uniquement à partir d'objectifs réellement enregistrés, tâche actuelle ou dernière tâche, prochaine tâche si connue, résumés des derniers échanges et date de sauvegarde.
- **Cliquer sur une tâche** : actions accomplies d'après le journal, dernier signal horodaté et étapes restantes. Aucun pourcentage n'est inventé.
- **Menu latéral** : Burnout 3 HD (textures PCSX2) et Burnout 3 Remastered PC Edition (recherche sur portage natif PAL) avec de grandes conversations séparées.
- **Historique intégral** : déchiffrement AES-256-GCM dans le navigateur avec la clé personnelle de 43 caractères, jamais sauvegardée sur le site ou GitHub.
- **Faire un prompt en se connectant** : ouvrir une issue préremplie dans le dépôt GitHub privé du projet choisi. GitHub vérifie la connexion et demande de confirmer Submit new issue. Seules les demandes du compte Elikto et au format strict PROMPT WEB sont mises en file par les workflows des dépôts privés. L'agent local les traite à sa prochaine synchronisation. Le clic sur le bouton du site ne soumet pas encore l'issue : la confirmation GitHub est obligatoire.
- **PC éteint** : dernier état consultable ; les prompts éventuellement déposés dans GitHub attendent la reconnexion du PC.

## Sécurité

Ce dépôt est PUBLIC mais ne contient que :
- index.html, style.css, app.js et .nojekyll : site statique.
- public-status.json : compteurs, titres de tâches prédéfinis, dates et résumés d'événements prédéfinis (aucun prompt complet, aucune réponse Qwen ou donnée personnelle).
- latest.enc.json : archive des deux conversations entièrement chiffrée AES-256-GCM ou marqueur d'attente.
- README et workflows de tests propres à ce viewer.

**Elikto/Burnout3-HD et Elikto/Burnout3-Remastered-PC-Edition restent PRIVÉS.** Les workflows ne convertissent en tâches que les issues déposées par le compte propriétaire GitHub. Aucune clé GitHub, API OpenAI ou Ollama n'est incluse dans le navigateur.

Les pourcentages HD se rapportent à des lots de textures, pas au jeu entier. Les éventuels pourcentages PC Edition correspondent à la réalisation d'un plan de recherche, pas à une compilation réussie ou un jeu PC jouable.

## Synchronisation et mise à jour

Le dépôt privé HD contient les programmes Windows de publication. Après accord initial et création de la clé DPAPI, la tâche publie une archive chiffrée et un résumé public sans texte brut, au maximum toutes les 15 minutes lorsque les sources changent.

- Première installation : lancer scripts/installer-pages-public.cmd depuis le miroir HD privé après synchronisation, sauvegarder la clé personnelle, confirmer OUI.
- Si les sauvegardes étaient déjà installées : lancer scripts/mettre-a-jour-tableau-public.cmd après synchronisation. Celui-ci teste les sources, demande OUI, sauvegarde les copies précédentes et actualise le viewer sans changer les agents.

Guide privé HD : https://github.com/Elikto/Burnout3-HD/blob/main/docs/PAGES-PUBLIC-ARCHIVES-CHIFFREES.md

GitHub Pages est statique. Il ne dispose d'aucune session OAuth GitHub intégrée ni d'un serveur d'inférence. Une messagerie avec envoi direct sans confirmation sur GitHub nécessiterait un véritable backend authentifié supplémentaire.
