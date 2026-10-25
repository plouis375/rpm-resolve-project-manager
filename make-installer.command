#!/bin/bash
# Réservé au développeur : fabrique le .pkg à partager (double-clic pour l’utilisateur final).
set -euo pipefail
ROOT="$(cd "$(dirname "$0")" && pwd)"
PLUGIN_ID="com.idolatry.resolveprojectcreationtool"
VERSION="$(sed -n 's/.*"version": *"\([^"]*\)".*/\1/p' "$ROOT/package.json" | head -1)"
OUT="$ROOT/dist/Resolve-Project-Creation-Tool-$VERSION.pkg"
WORK="$(mktemp -d)"; trap 'rm -rf "$WORK"' EXIT

"$ROOT/build.command"
mkdir -p "$WORK/payload" "$WORK/scripts" "$WORK/resources"
ditto "$ROOT/dist/$PLUGIN_ID" "$WORK/payload/$PLUGIN_ID"
find "$WORK/payload" -name '.DS_Store' -delete
cp "$ROOT/package-scripts/preinstall" "$ROOT/package-scripts/postinstall" "$WORK/scripts/"
chmod 755 "$WORK/scripts/"*
cp "$ROOT/installer/resources/"* "$WORK/resources/"
sed "s/__VERSION__/$VERSION/" "$ROOT/installer/distribution.xml" > "$WORK/distribution.xml"

pkgbuild --root "$WORK/payload" --identifier "$PLUGIN_ID" --version "$VERSION" \
  --install-location "/Library/Application Support/Blackmagic Design/DaVinci Resolve/Workflow Integration Plugins" \
  --scripts "$WORK/scripts" "$WORK/plugin.pkg"
productbuild --distribution "$WORK/distribution.xml" --resources "$WORK/resources" --package-path "$WORK" "$OUT"
printf '\nInstalleur prêt : %s\n' "$OUT"
open -R "$OUT"
