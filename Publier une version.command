#!/bin/bash
# Publie une version : fabrique le .pkg, envoie le code, crée la release GitHub avec le .pkg en téléchargement.
set -uo pipefail
cd "$(dirname "$0")" || exit 1
pause() { read -n 1 -s -r -p "Appuie sur une touche pour fermer…"; }
source tools/github-auth.sh || { pause; exit 1; }
VERSION="$(sed -n 's/.*"version": *"\([^"]*\)".*/\1/p' plugin/package.json | head -1)"
TAG="v$VERSION"
if [ -n "$(git status --porcelain)" ]; then echo "❌ Il reste des modifications non committées. Demande à Claude de les committer."; pause; exit 1; fi
if gh release view "$TAG" >/dev/null 2>&1; then echo "❌ La release $TAG existe déjà. Augmente le numéro de version."; pause; exit 1; fi
echo "Publication de $TAG…"
RPM_NO_REVEAL=1 ./package.command || { echo "❌ Fabrication du .pkg impossible."; pause; exit 1; }
PKG="dist/RPM-Resolve-Project-Manager-$TAG.pkg"
git tag -f "$TAG" >/dev/null
git push origin "HEAD:$(git branch --show-current)" && git push origin HEAD:main && git push -f origin "$TAG" || { echo "❌ Envoi du code impossible."; pause; exit 1; }
NOTES="$(awk -v v="## ${TAG%.0}" 'index($0,v)==1{f=1;next} /^## /{if(f)exit} f' CHANGELOG.md)"
[ -n "$NOTES" ] || NOTES="Version $TAG"
gh release create "$TAG" "$PKG" --title "RPM - Resolve Project Manager $TAG" --notes "$NOTES" --latest && echo && echo "✅ Release $TAG publiée avec le .pkg." || echo "❌ Création de la release impossible : copie ce message à Claude."
pause
