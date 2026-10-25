#!/bin/bash
set -euo pipefail

# L’installation écrit dans /Library : relance le script avec les droits administrateur.
if [ "$(id -u)" -ne 0 ]; then
  # Le build tourne avec l’utilisateur courant pour ne pas créer de fichiers root dans l’archive.
  "$(cd "$(dirname "$0")" && pwd)/build.command"
  printf 'Mot de passe administrateur requis pour écrire dans /Library.\n'
  exec sudo /bin/bash "$0" "$@"
fi

ROOT="$(cd "$(dirname "$0")" && pwd)"
PLUGIN_ROOT="/Library/Application Support/Blackmagic Design/DaVinci Resolve/Workflow Integration Plugins"
PLUGIN_ID="com.idolatry.resolveprojectcreationtool"
SOURCE="$ROOT/dist/$PLUGIN_ID"
TARGET="$PLUGIN_ROOT/$PLUGIN_ID"
BACKUP=""

[ -d "$SOURCE" ] || { printf 'Build introuvable : %s\n' "$SOURCE" >&2; exit 1; }
mkdir -p "$PLUGIN_ROOT"
if [ -e "$TARGET" ]; then
  mkdir -p "$PLUGIN_ROOT/.backups"
  BACKUP="$PLUGIN_ROOT/.backups/$PLUGIN_ID-$(date +%Y%m%d-%H%M%S)"
  mv "$TARGET" "$BACKUP"
fi

if ! ditto "$SOURCE" "$TARGET"; then
  rm -rf "$TARGET"
  if [ -n "$BACKUP" ] && [ -e "$BACKUP" ]; then mv "$BACKUP" "$TARGET"; fi
  printf 'Installation impossible. Ancienne version restaurée si disponible.\n' >&2
  exit 1
fi

printf 'RPM - Resolve Project Manager installé. Redémarre Resolve pour le charger.\n'
if [ -n "$BACKUP" ]; then printf 'Ancienne version conservée : %s\n' "$BACKUP"; fi
