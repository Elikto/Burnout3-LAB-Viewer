# Burnout 3 LAB · Archives des agents IA

**Site de consultation public et statique**, indépendant du PC Windows. Il affiche les **derniers échanges réels** de deux projets privés indépendants, après déchiffrement local dans ton navigateur :

- **Burnout 3 HD** — textures PCSX2 / Real-ESRGAN / Qwen.
- **Burnout 3 Remastered PC Edition** — préparation d'un portage Windows natif / Qwen.

Ce dépôt **PUBLIC ne contient ni code source privé des deux projets, ni ISO/BIOS, ni textures, ni conversations en clair, ni mot de passe, ni clé de déchiffrement**. Il ne doit contenir que :

- `index.html`, `style.css`, `app.js` : interface web statique ;
- `.nojekyll` : configuration statique de GitHub Pages ;
- `latest.enc.json` : **uniquement** une archive JSON chiffrée **AES-256-GCM**, ou un état d'attente tant que le PC n'a rien envoyé ;
- `README.md` et `LICENSE` si présent : documentation du site ;
- `.github/workflows/` : tests de sécurité éventuels de ce dépôt, jamais les agents Windows.

## Mise en ligne

Dans les paramètres **de ce dépôt public** : [Settings → Pages](https://github.com/Elikto/Burnout3-LAB-Viewer/settings/pages) → **Build and deployment → Deploy from a branch → main → /(root)** → Save. L'adresse typique du site sera `https://elikto.github.io/Burnout3-LAB-Viewer/`, uniquement **après** le déploiement confirmé dans Pages.

La première archive réelle exige une autorisation locale, sur **le PC propriétaire**. Dans le miroir GitHub privé de Burnout3-HD sous `%LOCALAPPDATA%\Burnout3-HD\github-mirror\scripts`, double-cliquer **`installer-pages-public.cmd`**. L'installateur procède à des vérifications de chiffrement, demande explicitement **OUI**, génère une clé secrète aléatoire de 43 caractères à protéger avec Windows DPAPI et te demande de la sauvegarder personnellement avant toute publication. **Ne communique jamais cette clé dans ChatGPT, sur GitHub, par SMS ou e-mail.**

Une fois installé, Windows synchronise au plus une nouvelle copie des conversations toutes les **15 minutes**, seulement quand le PC est éveillé, connecté et que les journaux ont évolué.

## Ce que permet ce site

- **PC allumé :** afficher les échanges récents après sauvegarde chiffrée.
- **PC éteint ou Tailscale déconnecté :** afficher **la dernière copie synchronisée** depuis n'importe quel navigateur Internet.
- **PC éteint :** aucun nouveau travail de Qwen ou Real-ESRGAN n'est produit par ce site, et aucun prompt ne peut être envoyé au PC.
- **Envoi de consignes :** continuer à utiliser le site **Tailscale privé**, quand le PC est connecté.

La clé sert uniquement au déchiffrement **dans le navigateur** par WebCrypto. GitHub Pages reste **public** et tout le monde peut télécharger les archives chiffrées ; la confidentialité dépend entièrement de ta clé. De vieilles archives chiffrées peuvent subsister dans l'historique Git. L'interface utilise uniquement du JavaScript local, sans analytics, bibliothèque CDN ou appel à l'API OpenAI.

Guide d'installation dans le dépôt **privé** : [Archives publiques chiffrées](https://github.com/Elikto/Burnout3-HD/blob/main/docs/PAGES-PUBLIC-ARCHIVES-CHIFFREES.md).

**État initial :** `latest.enc.json` n'est qu'un marqueur d'attente. La publication d'un site web ne constitue pas une preuve de sauvegarde des conversations ou de disponibilité des agents.
