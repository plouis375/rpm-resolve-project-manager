# Historique des versions

## v0.33.3 — 26 octobre 2026

- **Correctif d’affichage** : l’en-tête et la barre d’étapes pouvaient remonter hors de la fenêtre, laissant un écran gris. Un élément en « overflow: hidden » reste défilable par programme (focus d’une case, sélection) ; le cadre de l’application utilise désormais « overflow: clip », qui l’interdit, avec un garde-fou qui remet le défilement à zéro.

## v0.33.2 — 26 octobre 2026

- **Gestion couleur du projet, réglages définitifs** : DaVinci YRGB Color Managed avec « Automatic color management » activé, mode de traitement SDR et espace de sortie SDR Rec.709 (réglages `isAutoColorManage` = 1 et `rcmPresetMode` = SDR). Le choix de sortie Rec.709-A / Gamma 2.4 ne s’applique plus à cette méthode (il reste pour le node CST). La case « Enable OpenFX Color Management » n’a pas de réglage documenté dans l’API : elle n’est pas touchée.

## v0.33.1 — 26 octobre 2026

- **Gestion couleur du projet corrigée** : le projet passe en *DaVinci YRGB Color Managed* (et non plus la v2), avec « Automatic color management » désactivé et le mode de traitement « SDR Rec.709 ». Pour la sortie Rec.709-A, l’espace de sortie est réglé en plus ; Gamma 2.4 correspond déjà au mode SDR Rec.709. L’espace de timeline n’est plus forcé.
- **Fenêtre grise** : le rendu matériel d’Electron est désactivé (l’interface est légère), la fenêtre s’affiche même si l’événement « prête » n’arrive pas, et un rendu interrompu recharge l’interface. Les incidents d’affichage sont notés dans `rpm-diagnostic.log` (dossier de données du plugin) pour t’aider à les identifier s’il en reste.

## v0.33.0 — 26 octobre 2026

- **Copie des cartes avec vérification** (étape Sources) : « Copier une carte avec vérification » utilise le Clone Tool de Resolve (`MediaStorage.StartCloneMedia`). Tu choisis la carte, le dossier de destination (et une seconde copie de sauvegarde si tu le souhaites) et le type de vérification (MD5 par défaut, SHA-256, xxHash 64 ou taille seule). L’avancement s’affiche, la copie peut être arrêtée, puis la copie vérifiée est ajoutée aux sources et analysée. La carte d’origine n’est jamais modifiée.
- Les copies n’ont lieu que sur demande : rien n’est copié automatiquement, et sans cette fonction les médias restent à leur emplacement d’origine. PRODUCT.md est mis à jour en conséquence.

## v0.32.0 — 26 octobre 2026

- **Interface en anglais.** L’assistant existe en français et en anglais. Il suit la langue de macOS (`app.getLocale()`) : français si le système est en français, anglais sinon. Une liste **Langue** à la première étape permet de choisir (Automatique, Français, English) ; le choix est mémorisé.
- Les textes sont sortis dans `plugin/i18n/` : le texte français sert de clé, `plugin/i18n/en.js` contient les traductions. Les messages du rapport final, les avertissements Resolve, le rapport exporté et les boîtes de dialogue suivent aussi la langue. Les noms des chutiers de base sont traduits (Rushes, Sound, Elements, Sequences, Music) ; une structure préférée déjà enregistrée garde ses noms.
- Un README en anglais (`README.en.md`) est ajouté. Des tests vérifient que chaque texte de l’interface et du code a sa traduction.

## v0.31.1 — 26 octobre 2026

- Interne : l’analyse des médias (lecture ffprobe et Spotlight, parcours des dossiers, enrichissement des fichiers, comparaison des doublons par empreinte) est sortie de `main.js` vers `plugin/lib/scan.js` et couverte par des tests avec des sorties ffprobe et mdls enregistrées (`tests/scan.test.js`). Aucun changement de comportement.
- Interne : un workflow GitHub Actions lance `npm test` à chaque push et à chaque PR ; `build.command` reprend la version de `plugin/package.json` pour le manifeste et le pied de page de l’interface (un test vérifie aussi que les fichiers du dépôt concordent) ; le `.pkg` ne contient plus de fichiers AppleDouble `._*` (attributs étendus retirés avant `pkgbuild`) ; dates ajoutées aux versions v0.18.2 à v0.19.0.

## v0.31.0 — 26 octobre 2026

- **Vérification des mises à jour.** À l’ouverture, le plugin interroge la dernière release GitHub et affiche un bandeau discret sur la première étape si une version plus récente existe. L’appel se fait depuis le processus principal (la politique de sécurité de l’interface reste inchangée), avec un délai de 5 s : hors ligne ou en cas d’erreur, rien ne s’affiche. Le lien ne s’ouvre que sur une page du dépôt du plugin.

## v0.30.0 — 26 octobre 2026

- **Exporter le rapport** : un bouton à l’étape Terminé enregistre le rapport en TXT ou en CSV (séparateur « ; » et UTF-8, ouvert directement par Excel). Il liste chaque fichier avec son statut (importé, échec, à vérifier), les plans sans CST ou refusés, les jours de synchro non confirmés, les multicams, proxies et métadonnées refusés.
- Les avertissements Resolve jusqu’ici visibles seulement dans la console (`warnResolve`) remontent dans ce rapport.

## v0.29.0 — 26 octobre 2026

- **Proxies existants liés automatiquement.** L’analyse repère un sous-dossier `proxy` (celui de Blackmagic Proxy Generator) contenant un fichier du même nom que le rush, avec n’importe quelle extension vidéo. Après l’import, chaque proxy trouvé est associé au plan avec `MediaPoolItem.LinkProxyMedia`. Le rapport indique le nombre de proxies liés, et signale ceux que Resolve refuse. Les dossiers `proxy` restent exclus de la liste des médias.

## v0.28.0 — 26 octobre 2026

- **Preset de réglages de projet** : à l’étape Organisation, une liste propose tes presets de réglages de projet Resolve (`Project.GetProjectSettingsPresetList`). Le preset choisi est appliqué à la création (`SetProjectSettingsPreset`), avant le format de timeline et la gestion couleur demandés dans l’assistant. La liste n’apparaît que si tu as au moins un preset. Un preset refusé par Resolve est signalé dans le rapport.

## v0.27.0 — 26 octobre 2026

- **Détection du profil depuis le fichier.** Le gamma lu dans les XML (Sony, et Canon quand le XML l’indique) détermine désormais Canon Log 2 et 3 en plus de S-Log3, ainsi que V-Log, F-Log, N-Log, D-Log, LogC, Log3G10 et Film Gen 5 : un C70 tourné en Canon Log 3 n’est plus classé selon son seul modèle.
- Sans XML, la fonction de transfert lue par ffprobe écarte les fichiers HLG et PQ (pas de CST) et reconnaît Apple Log. « bt709 » ne prouve rien (beaucoup de caméras étiquettent ainsi leurs fichiers log) : dans ce cas le modèle de la caméra décide, comme avant.
- Le format exact du gamma dans les XML Canon n’a pas été vérifié sur de vrais fichiers : les motifs sont tolérants (« canon-log3 », « c-log3 »…). À confirmer avec un XML de C70.

## v0.26.0 — 26 octobre 2026

- **Plus de caméras et de profils log.** Sony S-Log3 sur davantage de modèles (FX30, A7S III, A7 IV, A1, A7R V, ZV-E1, FR7) : le gamma lu dans le XML Sony décide toujours en premier. Dix nouveaux profils à choisir à la main dans la colonne « Profil couleur » : Panasonic V-Log, Fujifilm F-Log et F-Log2, Nikon N-Log, DJI D-Log, Apple Log, ARRI LogC3 et LogC4, RED Log3G10, Blackmagic Film Gen 5.
- Ces dix profils n'ont pas de preset `.drx` : ils fonctionnent avec la méthode « Gestion couleur du projet » (le nom de l'espace d'entrée suffit). En mode node CST, leurs plans sont signalés comme non étalonnés. Les noms d'espaces suivent l'interface de Resolve et sont à valider sur ta version.

## v0.25.0 — 26 octobre 2026

- **Gestion couleur du projet, au choix à la place des nodes CST** : en cochant « Appliquer un Color Space Transform », la nouvelle liste « Méthode » propose « Gestion couleur du projet ». Le projet passe en DaVinci YRGB Color Managed v2 (timeline en DaVinci WG/Intermediate, sortie Rec.709-A ou Gamma 2.4 selon le choix existant) et chaque clip reçoit son espace d’entrée (`Input Color Space`) selon sa colonne « Profil couleur ». Presque instantané, et sans besoin de timeline. Le mode « node CST » reste le défaut.
- Le rapport signale les clips et les réglages que Resolve refuse. Les noms d’espaces suivent l’interface de Resolve et sont à valider sur ta version.

## v0.24.0 — 26 octobre 2026

- **Chutier « Son »** : les fichiers WAV et AIFF (formats d’enregistreur) vont par défaut dans un nouveau chutier de base « Son ». Les MP3, AAC et autres formats restent dans Musiques. Si ta structure préférée enregistrée n’a pas de chutier « Son », le son direct retombe dans Musiques.
- **Date du son modifiable** à l’étape Sources : un sélecteur de date apparaît sur chaque fichier WAV ou AIFF. Cette date sert à la synchro du son jour par jour.

## v0.23.0 — 26 octobre 2026

- **Métadonnées des rushs dans Resolve** (option de l’étape Organisation) : « Camera Type » (marque et modèle), « Camera # » (numéro par caméra, dans l’ordre alphabétique), « Date Recorded » (jour de tournage) et « Description » (dossier source), écrits avec `MediaPoolItem.SetMetadata`. Le Media Pool devient filtrable et permet des smart bins. Les clés sont écrites une à une : celles que Resolve refuse sont comptées dans l’avertissement final.

## v0.22.0 — 26 octobre 2026

- **Couleur de clip par caméra** (option de l’étape Organisation) : chaque rush reçoit une couleur de clip Resolve (`MediaPoolItem.SetClipColor`) selon sa marque et son modèle. La couleur est calculée à partir du nom de la caméra : elle reste la même d’un projet à l’autre. Les rushs sans caméra identifiée ne sont pas colorés.

## v0.21.0 — 26 octobre 2026

- **Clip multicam par jour** (option de l’étape Organisation) : après l’import et la synchro du son, un clip multicam par jour de tournage réunit les rushs de toutes les caméras, un angle par fichier (`MediaPool.CreateMulticamClip`). Le calage suit le réglage « Synchroniser par » (timecode ou forme d’onde). Les clips sont rangés dans Séquences et le rapport signale les jours que Resolve n’a pas pu traiter.

## v0.20.0 — 26 octobre 2026

- **Synchro du son enregistré à part** (option de l’étape Organisation) : après l’import, Resolve associe les fichiers WAV et AIFF retenus aux rushs du même jour, par timecode ou par forme d’onde (`MediaPool.AutoSyncAudio`). Le son caméra est conservé, et les timelines d’assemblage reprennent le son synchronisé. Le rapport final indique les jours synchronisés et ceux à vérifier.
- **Ordre des plans dans les timelines** : par timecode (toutes caméras confondues), par heure d’enregistrement, ou par caméra comme avant. Les plans restent rangés jour par jour ; un plan sans timecode est placé selon son heure d’enregistrement.
- L’analyse lit le timecode de départ et l’heure d’enregistrement des rushs (métadonnées, XML Sony et Canon, champs BWF des WAV). Le timecode s’affiche sous la durée à l’étape Sources.
- Ces choix sont mémorisés d’un projet à l’autre.

## v0.19.0 — 26 octobre 2026

- Nouvelle esthétique : thème sombre inspiré de DaVinci Resolve (fond anthracite, filets gris, accent orange) à la place du thème papier.

## v0.18.4 — 26 octobre 2026

- L’option « Appliquer un Color Space Transform » prévient que l’étape peut être longue avec beaucoup de rushs.

## v0.18.3 — 26 octobre 2026

- Correctif : après installation, le plugin n’apparaissait plus dans Resolve. Le paquet contenait des fichiers lisibles seulement par le compte qui l’a fabriqué ; le build force désormais des permissions lisibles par tous.

## v0.18.2 — 26 octobre 2026

- Correctif : un import Resolve bloqué ne fige plus la création. Chaque lot d’import a un délai de 120 s ; un lot sans réponse est signalé « à vérifier » dans le rapport final.
- Les échecs des appels Resolve non bloquants (réglages de timeline, CST, sauvegarde) sont désormais journalisés dans la console au lieu d’être ignorés.
- Interne : la création du projet (chutiers, imports, timelines, CST) est sortie de `main.js` vers `plugin/lib/create-project.js` et testée avec un faux Resolve (`tests/create-project.test.js`).

## v0.18.1 — 26 octobre 2026

- Correctif : la création ne reste plus figée quand Resolve bloque pendant l’application du CST. Chaque appel CST a un délai de 20 s ; un plan sans CST est signalé dans le message final.
- Le projet est sauvegardé après l’import et après la création de la timeline, avant le CST : un blocage ne fait plus perdre les rushes ni la timeline.
- Désinstallation : le chemin du plugin est passé en argument à osascript, sans concaténation.
- Date des rushes : la regex ignore les suites de chiffres parasites.

## v0.18 — 25 octobre 2026

- Nouvelle colonne **Profil couleur** à l’étape Sources : détectée automatiquement et modifiable plan par plan (S-Log3, Canon Log 2, Canon Log 3, ou aucun CST).
- Lecture du gamma enregistré dans les XML Sony : un plan tourné en S-Log3 reçoit le CST, un plan en Rec.709, HLG ou S-Cinetone n’en reçoit pas.
- Timelines supplémentaires au choix : une par caméra et/ou une par jour de tournage, avec le CST appliqué elles aussi.
- Bouton **Désinstaller** dans le plugin (confirmation et mot de passe macOS). Il remplace `uninstall.command`.
- Publication : `package.command` fabrique le `.pkg` dans `dist/`, puis la release GitHub est créée avec ce fichier en téléchargement.

## v0.17 — 25 octobre 2026

- Applique automatiquement un node Color Space Transform sur chaque plan de la timeline d’assemblage, selon la caméra : Sony FX3, FX6, FX9, Burano (S-Gamut3.Cine / S-Log3), Canon C50, C70 (Cinema Gamut / Canon Log 2), Canon R5 (Cinema Gamut / Canon Log 3).
- Sortie au choix : Rec.709-A (visionnage sur Mac) ou Rec.709 Gamma 2.4 (diffusion). Le choix est mémorisé.
- Presets `.drx` exportés depuis Resolve dans `plugin/presets`, correspondance caméra → profil dans `plugin/lib/cst.js` (testée).
- Les plans de caméras non reconnues restent sans étalonnage et sont listés dans le rapport final.
- Nouvel installeur `.pkg` avec écrans d’accueil en français : les utilisateurs n’ont plus de fichier `.command` à lancer. `package.command` le fabrique (réservé au développeur).
- Le plugin s’appelle désormais **RPM - Resolve Project Manager** (dépôt GitHub `rpm-resolve-project-manager`). L’identifiant technique ne change pas : la mise à jour remplace bien l’ancienne version et conserve tes préférences.

## v0.16 — 25 octobre 2026

- Corrige l’association des clips après import : le rapport d’échecs et la timeline d’assemblage restent justes même si un fichier d’un lot n’est pas importé.
- Applique le format de timeline (résolution, fréquence) avant l’import, réglage par réglage via `SetSetting`. Les fréquences non standard sont ramenées à la plus proche.
- Reconnaît les sidecars XML Sony (`C0001M01.XML`) : ils ne sont plus pris pour des séquences, et leur marque, modèle et date servent au classement.
- Convertit les dates de tournage UTC en heure locale (fin du décalage d’un jour pour les plans tournés autour de minuit).
- Détecte aussi les doublons de fichiers sans durée (images, PDF…).
- Reconnaissance des marques par mots entiers (« red » dans un autre mot ne donne plus RED).
- Comparaison des doublons plus rapide : empreinte des 4 premiers et 4 derniers Mo, lecture complète seulement si nécessaire.
- `install.command` et `uninstall.command` demandent les droits administrateur ; les sauvegardes vont dans `.backups`.
- Politique de sécurité (CSP) dans l’interface, fond de fenêtre assorti au thème clair.
- Logique de classement extraite dans `plugin/lib/media.js` et couverte par des tests (`npm test`).

## v0.15 — 17 octobre 2026

- Permet de choisir indépendamment la résolution et la fréquence d’images de la timeline d’assemblage.
- Propose des formats HD, Full HD, DCI, Ultra HD, vertical et carré, ainsi que des fréquences de 23,976 à 60 i/s.
- Conserve la détection automatique comme valeur initiale et signale si Resolve ne confirme pas les réglages demandés.

## v0.14 — 17 octobre 2026

- Remplace l’interface sombre par la direction « Brutalisme graphique » choisie : papier clair, typographie affirmée, traits noirs et accent corail.
- Applique le nouveau style aux quatre étapes, aux tableaux, aux alertes, aux contrôles et à l’écran final.
- Laisse le nom du projet vide au démarrage et affiche « Nom du projet » comme indication de saisie.

## v0.13 — 17 octobre 2026

- Permet d’enregistrer localement une structure de chutiers préférée et de rétablir le modèle de base.
- Affiche l’arborescence prévisionnelle du Media Pool, y compris les groupes caméra, modèles et dates.
- Repère les noms de marque ou de modèle proches et propose de les regrouper après confirmation.

## v0.12 — 17 octobre 2026

- Ajoute un bouton pour relire tous les dossiers sources et détecter les nouveaux médias ou les fichiers retirés.
- Conserve les corrections manuelles et les choix d’inclusion pendant l’actualisation.
- Permet de renommer, ajouter et retirer les chutiers avant la création du projet.
- Empêche le retrait d’un chutier qui contient encore des médias et permet d’affecter les médias aux destinations ajoutées.
- Importe les médias et les séquences dans le chutier choisi.

## v0.11 — 17 octobre 2026

- Ajoute ou retire des dossiers sources sans réanalyser les médias déjà examinés.
- Préserve les catégories, les métadonnées caméra et les choix d’inclusion faits manuellement.
- Recalcule les doublons probables après une modification des dossiers sources.

## v0.10 — 17 octobre 2026

- Permet d’interrompre le scan des dossiers et l’analyse des médias; les dossiers sélectionnés restent disponibles pour relancer le scan.
- Permet d’interrompre la comparaison SHA-256; les résultats précédemment confirmés sont conservés.
- Interrompt aussi les opérations en cours lorsque la fenêtre du plugin est fermée.

## v0.09 — 17 octobre 2026

- Ajoute un installeur macOS graphique `.pkg`, à ouvrir par double-clic.
- Sauvegarde la version déjà installée et la restaure si le paquet ne s’installe pas correctement.
- Le paquet n’est pas signé ni notarié faute de certificat Apple Developer ID; macOS peut afficher un avertissement.

## v0.08 — 17 octobre 2026

- Ajoute une comparaison SHA-256 facultative pour confirmer les doublons probables repérés par nom, taille et durée.
- Les fichiers différents sont réintégrés automatiquement s’ils avaient été exclus par le tri initial; les fichiers non lisibles restent signalés sans être confirmés.
- La comparaison lit uniquement les groupes suspects et affiche sa progression.

## v0.07 — 17 octobre 2026

- L’installeur utilise d’abord le module Workflow Integration fourni dans l’archive; le SDK local ne sert plus que de repli pour le dépôt de développement.
- Inclut `ffprobe` universel Intel/Apple Silicon, compilé sans composants GPL et sans dépendance Homebrew.
- Ajoute les mentions LGPL et publie les sources FFmpeg correspondantes avec la release.

## v0.06 — 17 octobre 2026

- Classe les alertes de contrôle par type et permet d’afficher rapidement les fichiers concernés.
- Précise qu’une analyse technique indisponible ne signifie pas que Resolve ne peut pas lire le média; les alertes ne bloquent pas la création.

## v0.05 — 17 octobre 2026

- Ignore les sous-dossiers `Proxy` créés par Blackmagic Proxy Generator lors du scan des médias.

## v0.04 — 17 octobre 2026

- Ajoute automatiquement les dossiers sources à la liste surveillée de Blackmagic Proxy Generator, sans doublons et sans retirer les dossiers existants.
- Refuse la mise à jour de la liste si le générateur est déjà ouvert.

## v0.03 — 17 octobre 2026

- Ajoute une option facultative avec guide et bouton pour ouvrir l’application Blackmagic Proxy Generator depuis l’écran final.
- Affiche les dossiers sources et rappelle que le générateur travaille par dossier surveillé, avec création des proxies près des médias.

## v0.02 — 17 octobre 2026

- Lit la marque et le modèle depuis les sidecars XML Canon.
- N’interprète plus comme séquences les sidecars XML associés aux fichiers vidéo.

## v0.01 — 17 octobre 2026

- Première version fonctionnelle du Resolve Project Creation Tool.
- Création de projet, chutiers fixes, classement Rushs par caméra et date, détection de doublons.
- Import sans déplacer les originaux et création facultative d’une timeline d’assemblage.
- Intégration Resolve Studio via Workflow Integrations.
