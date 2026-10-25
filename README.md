# RPM - Resolve Project Manager — v0.18

Assistant macOS intégré à **DaVinci Resolve Studio** pour créer un projet, trier les médias dans le Media Pool et préparer le montage. Il s’ouvre depuis le menu de Resolve, guide la préparation, puis se ferme quand le projet est prêt.

Depuis la v0.14, son interface adopte une direction graphique brutaliste : papier clair, grands titres noirs et accent corail. La v0.15 permet de choisir la résolution et la fréquence d’images de la timeline d’assemblage. La v0.17 applique automatiquement un Color Space Transform adapté à la caméra sur chaque plan de cette timeline.

[Télécharger la dernière version](https://github.com/plouis375/rpm-resolve-project-manager/releases/latest) · [Voir les versions et leurs changements](https://github.com/plouis375/rpm-resolve-project-manager/releases)

## Prérequis

- macOS et DaVinci Resolve Studio installés.
- Une bibliothèque de projets Resolve accessible.
- Les médias source accessibles depuis ce Mac, sur disque local ou volume monté.
- `ffprobe` est inclus dans l’archive, en version universelle Intel et Apple Silicon; aucune installation supplémentaire n’est nécessaire. Si cet outil ne peut pas être lancé, l’application essaie aussi une analyse partielle avec Spotlight.

Le plugin a été vérifié avec DaVinci Resolve Studio 21.1.1 sur macOS. Le fonctionnement peut varier avec d’autres versions de Resolve.

## Installation

### Installeur graphique

1. Télécharge `RPM-Resolve-Project-Manager-v0.18.0.pkg` depuis la [dernière version](https://github.com/plouis375/rpm-resolve-project-manager/releases/latest).
2. Ferme DaVinci Resolve, puis ouvre le `.pkg` par double-clic et suis les étapes de l’installeur macOS. Il demande un mot de passe administrateur pour copier le plugin dans le dossier partagé de Resolve.
3. Si macOS bloque le paquet parce qu’il n’est pas signé, ouvre **Réglages Système → Confidentialité et sécurité**, puis choisis **Ouvrir quand même** pour ce paquet. Ce paquet n’est pas signé ni notarié faute de compte développeur Apple.
4. Rouvre Resolve et choisis **Workspace → Workflow Integrations → RPM - Resolve Project Manager**.

Une sauvegarde horodatée de la version précédente est conservée dans `.backups`, à l’intérieur du dossier des intégrations Resolve.

Après une mise à jour, redémarre Resolve avant d’ouvrir le plugin. Pour le retirer, clique sur **Désinstaller** en bas de la première étape du plugin, puis redémarre Resolve. Cette désinstallation ne supprime pas les projets ni les médias.

## Utilisation pas à pas

1. **Projet** — Saisis le nom du projet dans le champ vide « Nom du projet ». Il sera créé dans la bibliothèque et le dossier actuellement sélectionnés dans Resolve.
2. **Sources** — Ajoute un ou plusieurs dossiers. L’analyse parcourt leurs sous-dossiers et présente les médias reconnus, leur taille, leur durée et leur destination dans Resolve. Tu peux chercher un fichier, changer sa catégorie ou l’exclure. Ajouter un dossier analyse uniquement ses nouveaux médias; retirer un dossier met à jour la sélection sans refaire l’analyse des autres. Le bouton **Actualiser** relit tous les dossiers sélectionnés pour repérer les nouveaux médias et les fichiers retirés. Les corrections manuelles et les choix d’inclusion sont conservés; les doublons probables sont recalculés.
3. **Organisation** — Renomme, ajoute ou retire les chutiers du Media Pool pour ce projet. Un chutier contenant des médias ne peut être retiré qu’après avoir reclassé ses fichiers à l’étape Sources. Tu peux enregistrer explicitement la structure comme préférence locale pour les prochains projets ou revenir au modèle de base. L’aperçu montre l’arborescence qui sera créée, y compris les dossiers caméra. Des noms de caméra proches peuvent être regroupés après confirmation. Choisis aussi si tu veux créer une timeline d’assemblage et, si oui, règle sa résolution et sa fréquence indépendamment ou laisse l’un des réglages en automatique. Avec la timeline, tu peux activer **Appliquer un Color Space Transform** : chaque plan reçoit un node CST selon sa caméra (Sony FX3, FX6, FX9, Burano en S-Log3 ; Canon C50, C70 en Canon Log 2 ; Canon R5 en Canon Log 3), avec une sortie Rec.709-A ou Gamma 2.4. Les plans d’autres caméras restent sans étalonnage et sont signalés. Aucun réglage de rendu n’est appliqué au chutier Exports.
4. **Création** — L’outil enregistre le projet déjà ouvert s’il y en a un, crée le nouveau projet, ajoute les chutiers et importe les éléments retenus. Un rapport indique les imports réussis et ceux à vérifier.
5. **Montage** — Le bouton de fin ouvre la page Edit et ferme l’assistant.

## Organisation créée dans Resolve

Le modèle de base crée ces chutiers dans le Media Pool :

```text
Nom du projet
├── Rushs
│   └── Marque de caméra
│       └── Modèle
│           └── Date de tournage
├── Assets
├── Éléments
├── Séquences
├── Musiques
└── Exports
```

Les rushs sont classés par marque, modèle et date. Les autres types de média sont rangés directement dans leur chutier. Cette structure de départ peut être renommée, complétée ou réduite avant la création; les destinations ajoutées sont disponibles à l’étape Sources. Ces choix s’appliquent au projet en cours. Pour les réutiliser par défaut, clique sur **Enregistrer comme structure préférée**. La préférence reste sur ce Mac; **Revenir au modèle de base** la supprime et restaure les six chutiers initiaux. Cette structure est créée **dans Resolve** : l’outil ne crée pas de dossiers Finder et ne déplace ni ne copie les sources.

## Classement et import des médias

- **Rushs vidéo** — MOV, MP4, M4V, MXF, AVI, MPG/MPEG, MKV, MTS/M2TS, BRAW, R3D, ARI, CRM, 3GP et WEBM.
- **Musiques et audio** — WAV, AIF/AIFF, MP3, M4A, AAC, FLAC, OGG, OPUS et WMA.
- **Éléments image** — PNG, JPG/JPEG, TIF/TIFF, BMP, WEBP, HEIC/HEIF, EXR, DPX, DNG, ARW, CR2/CR3, NEF et RAF.
- **Assets graphiques** — PSD, AI, EPS, SVG et PDF.
- **Séquences** — FCPXML, EDL, AAF, DRT, OTIO et XML autonomes.

Les sous-dossiers `Proxy` créés par Blackmagic Proxy Generator sont ignorés pendant le scan; les fichiers originaux restent détectés dans leur emplacement source.

Les fichiers cachés sont ignorés. Quand un fichier vidéo possède un sidecar XML (Canon : `CLIP.XML`, Sony : `C0001M01.XML`), ce XML est traité comme une fiche de métadonnées : sa marque et son modèle peuvent servir au classement, et il n’apparaît pas comme séquence à importer. Les XML sans vidéo associée restent considérés comme des séquences.

L’analyse utilise d’abord le `ffprobe` inclus dans l’archive pour lire les durées, les formats et les métadonnées de plusieurs conteneurs courants. Les champs de caméra non détectés restent modifiables avant la création. Pour la date, l’outil utilise les métadonnées disponibles, puis la date de création du fichier comme repli. Une date de repli est signalée. Le binaire est une compilation FFmpeg LGPL sans modules GPL; les mentions, la licence et le lien vers le code source correspondant se trouvent dans `plugin/FFmpeg-NOTICE.md`.

## Harmoniser les noms de caméra

Avant la création, l’étape Organisation peut suggérer de regrouper des marques ou des modèles dont l’écriture est proche. Chaque proposition indique le nom le plus fréquent comme destination; aucun nom ne change tant que tu ne cliques pas sur **Regrouper**. Les valeurs corrigées sont alors utilisées dans l’arborescence et les chutiers caméra.

## Doublons et vérifications

Les doublons probables sont d’abord repérés rapidement avec le **nom, la taille et la durée**. Les correspondances ultérieures sont exclues par défaut; tu peux les réinclure dans la liste. Pour confirmer les alertes, clique sur **Comparer le contenu des doublons probables** : l’outil calcule une empreinte SHA-256 sur les fichiers des groupes suspects. Les fichiers dont le contenu diffère sont retirés des doublons et réintégrés s’ils avaient été exclus automatiquement. Si un fichier est illisible pendant la comparaison, le groupe reste marqué comme probable et non confirmé. Cette lecture complète peut prendre du temps pour de gros fichiers; elle ne porte que sur les groupes suspects.

L’écran **Sources** regroupe les alertes par type et permet de filtrer la liste : fichiers vides, analyse technique indisponible, caméra à identifier, date de création utilisée et doublons probables. Le scan et la comparaison SHA-256 peuvent être interrompus sans perdre les dossiers sélectionnés ni les résultats précédemment confirmés. Une analyse technique indisponible ne prouve pas que Resolve ne peut pas lire le média. Les alertes n’empêchent pas la création : tu peux garder ou exclure chaque fichier. Les fichiers originaux ne sont ni modifiés ni supprimés.

## Timeline d’assemblage (facultative)

Si l’option est cochée, Resolve crée `Nom du projet — Assemblage` dans le chutier Séquences avec les rushs retenus, bout à bout. Si ce chutier a été retiré, la timeline est créée à la racine du projet. Choisis la résolution (HD, Full HD, 2K/4K DCI, Ultra HD, vertical ou carré) et la fréquence (23,976 à 60 i/s) indépendamment. « Automatique » reprend le format vidéo le plus représenté pour le réglage concerné. En l’absence de format dominant, le repli automatique est 1920 × 1080 (16:9) à 24 i/s.

Cette option prépare une timeline de départ; elle ne crée pas de montage éditorial, ne coupe pas les plans et ne choisit pas de prises.

## Proxies avec Blackmagic Proxy Generator

À l’étape **Organisation**, coche « Préparer la génération de proxies » pour afficher le guide à la fin de la création. Depuis cet écran, le bouton ajoute automatiquement les dossiers sources à la liste des dossiers surveillés, puis ouvre Blackmagic Proxy Generator. Les chemins déjà enregistrés sont conservés; les doublons ne sont pas ajoutés. Vérifie le format et la résolution dans l’application. Si le générateur est déjà ouvert, ferme-le avant de cliquer : l’outil ne modifie pas sa liste pendant qu’il tourne.

Le générateur travaille sur les dossiers surveillés et leurs sous-dossiers; il peut donc traiter des fichiers qui ont été exclus de la liste d’import du plugin. Les proxies sont écrits dans des sous-dossiers `proxy` à côté des médias. Resolve associe automatiquement les proxies reconnus à leurs originaux. L’outil ne change pas le format, la résolution ni le réglage de démarrage du générateur. Selon ce dernier réglage, le traitement peut démarrer automatiquement à l’ouverture. Les dossiers enregistrés restent surveillés jusqu’à ce que tu les retires dans l’application. L’outil met à jour le fichier de préférences local de Blackmagic Proxy Generator; Blackmagic ne documente pas d’API publique pour cette opération, donc une évolution de son format de préférences pourrait nécessiter une mise à jour du plugin.

## Fonctions hors périmètre

- **Archivage** — Aucun archivage de projet n’est proposé; cette fonction n’est pas prévue dans le périmètre actuel.
- **Dossiers Finder et sauvegarde des médias** — Le plugin organise les chutiers Resolve et conserve les médias à leur emplacement. Il ne crée pas une arborescence disque et ne réalise pas de copie de sauvegarde.
- **Espace disque des proxies** — L’outil n’estime pas l’espace requis; consulte l’indication dans Blackmagic Proxy Generator.
- **Exports** — Le chutier Exports est créé, mais les presets, noms et réglages de rendu restent à configurer dans Resolve.

## Dépannage

- **Le plugin n’apparaît pas dans Workspace** — Vérifie qu’il a été installé avec DaVinci Resolve Studio, puis redémarre Resolve.
- **Resolve refuse la connexion** — Ferme puis rouvre Resolve. Si le problème persiste, relance le `.pkg` de la dernière version.
- **La caméra est « À identifier »** — Vérifie l’alerte d’analyse, puis corrige la marque et le modèle dans la liste avant de créer le projet. Les XML Canon associés sont lus automatiquement.
- **Un fichier n’est pas importé** — Consulte le rapport final et vérifie que son volume source est toujours monté et que le format est pris en charge par ta version de Resolve.

## Développement et versions

- Code source du plugin : [`plugin/`](plugin/) — la logique de classement pure est dans [`plugin/lib/media.js`](plugin/lib/media.js).
- Tests : `npm test` (Node 20+, sans Resolve). Les rushs d’exemple de `rush test/` restent locaux et ne sont pas versionnés.
- Historique des changements : [`CHANGELOG.md`](CHANGELOG.md)
- Chaque nouvelle version du plugin reçoit un numéro `v0.xx`, inscrit dans le manifeste et le paquet, puis publié comme tag et release GitHub.
- L’archive de release contient `WorkflowIntegration.node` signé par Blackmagic et `ffprobe` universel. Depuis le dépôt de développement, `build.command` peut encore reprendre le module Workflow Integration depuis l’installation locale de Resolve.

## Publier une nouvelle version (développeur)

1. Augmente la version dans `plugin/package.json` et `plugin/manifest.xml`, et ajoute une entrée dans `CHANGELOG.md`.
2. Double-clique sur **Publier une version.command**. Au premier lancement, il installe GitHub CLI et ouvre ton navigateur pour te connecter à GitHub.
3. Le `.pkg` apparaît dans les Releases du dépôt, prêt à partager.
