#!/bin/bash
set -euo pipefail

# L’installation écrit dans /Library : relance le script avec les droits administrateur.
if [ "$(id -u)" -ne 0 ]; then
  printf 'Mot de passe administrateur requis pour écrire dans /Library.\n'
  exec sudo /bin/bash "$0" "$@"
fi

PLUGIN="/Library/Application Support/Blackmagic Design/DaVinci Resolve/Workflow Integration Plugins/com.idolatry.resolveprojectcreationtool"
if [ -d "$PLUGIN" ]; then
  rm -rf "$PLUGIN"
  printf 'RPM - Resolve Project Manager retiré.\n'
else
  printf 'Plugin absent.\n'
fi
