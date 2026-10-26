#!/bin/bash
set -euo pipefail

ROOT="$(cd "$(dirname "$0")" && pwd)"
SDK_PLUGIN="/Library/Application Support/Blackmagic Design/DaVinci Resolve/Developer/Workflow Integrations/Examples/SamplePlugin/WorkflowIntegration.node"
BUNDLED_PLUGIN="$ROOT/plugin/WorkflowIntegration.node"
if [ -f "$BUNDLED_PLUGIN" ]; then
  WORKFLOW_PLUGIN="$BUNDLED_PLUGIN"
elif [ -f "$SDK_PLUGIN" ]; then
  WORKFLOW_PLUGIN="$SDK_PLUGIN"
else
  printf 'Module Workflow Integration introuvable dans l’archive et dans Resolve.\n' >&2
  exit 1
fi
DIST_ROOT="$ROOT/dist"
DEST="$DIST_ROOT/com.idolatry.resolveprojectcreationtool"

mkdir -p "$DIST_ROOT"
STAGING="$(mktemp -d "$DIST_ROOT/.rpc-tool.XXXXXX")"
trap 'rm -rf "$STAGING"' EXIT
cp -R "$ROOT/plugin/." "$STAGING/plugin/"
# Version unique : package.json fait foi, le manifeste et le pied de page de l'interface la reprennent.
VERSION="$(sed -n 's/.*"version": *"\([^"]*\)".*/\1/p' "$ROOT/plugin/package.json" | head -1)"
sed -i '' "s#<Version>[^<]*</Version>#<Version>$VERSION</Version>#" "$STAGING/plugin/manifest.xml"
sed -i '' "s#v[0-9][0-9.]* · <button class=\"link-button\" id=\"uninstallPlugin\"#v$VERSION · <button class=\"link-button\" id=\"uninstallPlugin\"#" "$STAGING/plugin/index.html"
# Resolve tourne sous le compte de l’utilisateur : le plugin doit être lisible par tous,
# indépendamment des permissions locales du dépôt (sinon il n’apparaît pas dans Resolve).
find "$STAGING/plugin" -type d -exec chmod 755 {} +
find "$STAGING/plugin" -type f -exec chmod 644 {} +
chmod 755 "$STAGING/plugin/ffprobe" "$STAGING/plugin/WorkflowIntegration.node"
cp "$WORKFLOW_PLUGIN" "$STAGING/plugin/WorkflowIntegration.node"

if [ -e "$DEST" ]; then
  rm -rf "$DEST"
fi
mv "$STAGING/plugin" "$DEST"
printf 'Plugin prêt : %s\n' "$DEST"
