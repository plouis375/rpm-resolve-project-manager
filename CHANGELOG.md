# Historique des versions

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
