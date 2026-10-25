#!/bin/bash
set -euo pipefail

ROOT="$(cd "$(dirname "$0")" && pwd)"
PLUGIN_ID="com.idolatry.resolveprojectcreationtool"
PLUGIN_ROOT="/Library/Application Support/Blackmagic Design/DaVinci Resolve/Workflow Integration Plugins"
VERSION="0.16.0"
PKG="$ROOT/dist/Resolve-Project-Creation-Tool-v0.16.pkg"

"$ROOT/build.command"
STAGING="$(mktemp -d "$ROOT/work/.rpc-pkg.XXXXXX")"
trap 'rm -rf "$STAGING"' EXIT
mkdir -p "$STAGING/payload/$PLUGIN_ID" "$STAGING/scripts"
cp -R "$ROOT/dist/$PLUGIN_ID/." "$STAGING/payload/$PLUGIN_ID/"
chmod 755 "$STAGING/payload/$PLUGIN_ID/ffprobe"
cp "$ROOT/package-scripts/preinstall" "$STAGING/scripts/preinstall"
cp "$ROOT/package-scripts/postinstall" "$STAGING/scripts/postinstall"
chmod 755 "$STAGING/scripts/preinstall" "$STAGING/scripts/postinstall"
find "$STAGING/payload" "$STAGING/scripts" -name '._*' -delete
find "$STAGING/payload" "$STAGING/scripts" -name '.DS_Store' -delete

pkgbuild \
  --root "$STAGING/payload" \
  --filter '(^|/)\\.DS_Store$' \
  --filter '(^|/)CVS(/|$)' \
  --filter '(^|/)\\.svn(/|$)' \
  --scripts "$STAGING/scripts" \
  --identifier "$PLUGIN_ID" \
  --version "$VERSION" \
  --install-location "$PLUGIN_ROOT" \
  --ownership recommended \
  "$PKG"

printf 'Installeur créé : %s\n' "$PKG"
printf 'Le paquet n’est pas signé/notarié; macOS peut demander une autorisation lors de son ouverture.\n'
