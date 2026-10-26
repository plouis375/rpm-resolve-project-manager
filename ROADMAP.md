# Feuille de route RPM

Liste des ajouts et améliorations à faire après la v0.20.0, du plus utile au moins urgent.
Coche chaque point une fois livré, avec la version correspondante.

## Règles de travail

- **Une version mineure par fonction ajoutée** (v0.21.0, v0.22.0…), une version de patch pour un correctif seul. À chaque version : `plugin/package.json` (le build recopie la version dans le manifeste et le pied de page ; `plugin/manifest.xml` et `plugin/index.html` restent alignés, un test le vérifie), une entrée en tête de `CHANGELOG.md` et les deux README si le comportement change. Tout nouveau texte visible passe par `t('texte français')` avec sa traduction dans `plugin/i18n/en.js` (un test vérifie la couverture).
- La logique va dans `plugin/lib/` (sans Electron ni Resolve) et se teste avec `npm test`, en passant par le faux Resolve de `tests/create-project.test.js`.
- Un appel Resolve qui bloque ou échoue ne doit jamais bloquer la création : délai avec `withTimeout`, log avec `warnResolve`, avertissement dans le rapport final.
- Vérifier chaque fonction de l'API dans la doc installée : `/Library/Application Support/Blackmagic Design/DaVinci Resolve/Developer/Scripting/` (`README.md`, `CHANGELOG.md`, `DaVinciResolveScript.pyi`). Les constantes `resolve.*` se lisent sur l'objet Resolve, comme `readResolveConstants()` dans `plugin/main.js`.
- Respecter `PRODUCT.md` et `DESIGN.md`. Un point qui va contre (marqué ⚠️) demande d'abord l'accord de l'auteur.
- Publier : `bash package.command`, puis le tag et la release GitHub avec le `.pkg`.

## Déjà livré

- [x] Synchro du son direct par timecode ou forme d'onde, jour par jour (v0.20.0)
- [x] Ordre des plans dans les timelines par timecode ou par heure d'enregistrement (v0.20.0)

## 1. Fonctions à fort impact

### 1.1 Clips multicam par jour
- [x] `MediaPool.CreateMulticamClip` (v0.21.0, un angle par fichier ; `AutoAlignClips` n’est pas nécessaire).
- Option « Créer un clip multicam par jour » : un angle par caméra, alignés par timecode (ou par son), plus le son direct synchronisé.
- Lire les options exactes dans `DaVinciResolveScript.pyi` (types `MulticamClipOptions` / `AutoAlignOptions`).

### 1.2 Métadonnées et couleurs de clip dans Resolve
- [x] ~~`MediaPoolItem.SetMetadata({...})`~~ : retiré en v0.33.4 à la demande de l’auteur (risque de modifier les métadonnées des clips). Fait en v0.23.0 : clés standard Camera Type, Camera #, Date Recorded, Description ; pas de profil couleur). Le Media Pool devient filtrable et on peut faire des smart bins.
- [x] `MediaPoolItem.SetClipColor(...)` : une couleur par caméra, stable d'un projet à l'autre (v0.22.0, hachage marque + modèle).
- Lister les clés de métadonnées valides dans la doc avant de les écrire.

### 1.3 Chutier « Son » pour le son direct
- [x] (v0.24.0) Aujourd'hui les WAV et AIFF vont dans « Musiques ». Ajouter un chutier de base « Son » et y classer par défaut les formats d'enregistreur (`SYNC_AUDIO` dans `plugin/lib/media.js`). Les MP3, AAC et autres restent dans Musiques.
- Rendre la date des fichiers son modifiable à l'étape Sources : elle sert à la synchro jour par jour.

## 2. Couleur

### 2.1 Gestion couleur en option, à la place des nodes CST
- [x] (v0.25.0, mode v2 uniquement, pas ACES) En mode DaVinci YRGB Color Managed, régler `Input Color Space` sur chaque clip (`SetClipProperty`, propriété documentée dans `DaVinciResolveScript.pyi`). En ACES, régler `IDT`.
- C'est presque instantané, ça s'applique à toutes les timelines et ça ne dépend plus de la création d'une timeline.
- Garder le mode node CST (`.drx`) au choix. Régler les paramètres de gestion couleur du projet avec `SetSetting`.

### 2.2 Plus de caméras et de profils log
- [x] (v0.26.0) Sony S-Log3 sur tous les modèles (A7S III, FX30, A7 IV, A1…). Aujourd'hui FX30 est exclu volontairement par la regex de `plugin/lib/cst.js`.
- [x] (v0.26.0, choix manuel, gestion couleur seulement : pas de .drx) Panasonic V-Log, Fujifilm F-Log et F-Log2, Nikon N-Log, DJI D-Log et D-Log M, iPhone Apple Log, ARRI LogC3 et LogC4, RED Log3G10, Blackmagic Film Gen 5.
- Pour chaque profil : un preset `.drx` par sortie (Rec.709-A et Gamma 2.4) exporté depuis Resolve dans `plugin/presets/`, l'entrée dans `PROFILES`, le libellé dans `renderer.js` (`COLOR_PROFILES`) et les tests. Avec la gestion couleur (2.1), on n'a besoin que du nom de l'espace d'entrée.

### 2.3 Détection du profil depuis le fichier
- [x] (v0.27.0, motifs à confirmer sur un vrai XML) Lire le gamma dans les XML Canon. Un C70 peut tourner en Canon Log 3, alors qu'aujourd'hui seul le modèle décide.
- [x] (v0.27.0, HLG/PQ → pas de CST, Apple Log) Utiliser `color_transfer` et `color_primaries` de ffprobe (`arib-std-b67` pour le HLG, Apple Log…) pour distinguer log et vidéo sans XML.

## 3. Réglages et proxies

### 3.1 Presets de réglages de projet
- [x] (v0.28.0) `Project.SetProjectSettingsPreset` et les fonctions associées (21.1). À l'étape Organisation, proposer de choisir un preset existant de l'utilisateur, appliqué à la création.

### 3.2 Lier les proxies existants
- [x] (v0.29.0) Le scan ignore les dossiers `proxy`. Quand un proxy correspondant existe, l'associer avec `MediaPoolItem.LinkProxyMedia(path)` après l'import, et le compter dans le rapport.

### 3.3 Copie des cartes avec vérification ⚠️
- [x] (v0.33.0, copie à la demande à l’étape Sources, PRODUCT.md mis à jour) `MediaStorage.StartCloneMedia`, `GetCloneStatus` et `SetCloneToolSettings` (21.1, le Clone Tool de Resolve).
- ⚠️ Va contre PRODUCT.md (« pas de copie des sources ») : demander l'accord de l'auteur avant de commencer.

## 4. Confort et fiabilité

### 4.1 Exporter le rapport
- [x] (v0.30.0) Bouton « Exporter le rapport » à l'étape Terminé : TXT ou CSV avec les imports, les échecs, les plans sans CST et les jours non synchronisés.
- Faire remonter les avertissements Resolve (`warnResolve`, aujourd'hui seulement dans la console) dans ce rapport.

### 4.2 Vérifier les mises à jour
- [x] (v0.31.0, appel depuis main.js, CSP inchangée) À l'ouverture, interroger `https://api.github.com/repos/plouis375/rpm-resolve-project-manager/releases/latest` et afficher un bandeau discret si une version plus récente existe. Ne jamais bloquer, et rester silencieux hors ligne.
- Adapter la CSP de `plugin/index.html` (`connect-src`), ou faire l'appel depuis `main.js`.

### 4.3 Gros volumes
- [x] (testé, aucun changement nécessaire) Le tableau des sources est reconstruit en `innerHTML` à chaque modification (pagination de 160 lignes). Mesuré dans le navigateur avec 5 000 fichiers : rendu du tableau 15 à 20 ms, aperçu du Media Pool 18 ms ; avec 20 000 fichiers : 22 ms et 34 ms. La pagination suffit, la virtualisation n’apporterait rien.

### 4.4 Interface en anglais
- [x] (v0.32.0) Sortir les textes dans un fichier de traductions et choisir la langue selon `app.getLocale()`, avec un sélecteur. Prévoir le README anglais.

## 5. Côté code

- [x] (v0.31.1) **Tester le scan** : sortir de `plugin/main.js` la lecture ffprobe et Spotlight, le parcours des dossiers et le hachage des doublons vers `plugin/lib/`, puis les tester avec des sorties ffprobe enregistrées.
- [x] (v0.31.1) **CI** : un workflow GitHub Actions qui lance `npm test` à chaque push et à chaque PR (macOS ou Ubuntu, Node 20).
- [x] (v0.31.1) **Version unique** : générer `manifest.xml` et le `vX.Y` de `index.html` depuis `plugin/package.json` dans `build.command`.
- [x] (v0.31.1) **CHANGELOG** : ajouter les dates manquantes (v0.18.2 à v0.19.0).
- [x] (v0.31.1) **Paquet** : retirer les fichiers AppleDouble `._*` du `.pkg` (`COPYFILE_DISABLE=1` ou `xattr -cr` sur le payload avant `pkgbuild`).
- [ ] **Signature et notarisation Apple** ⚠️ : demande un compte développeur Apple (99 $ par an). Décision de l'auteur.
