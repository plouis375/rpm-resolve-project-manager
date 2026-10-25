#!/bin/bash
# Prépare GitHub CLI (gh) et la connexion par navigateur — fonctionne avec un compte GitHub lié à Google.
GH_DIR="$HOME/.rpm-tools/gh"
find_gh() { command -v gh 2>/dev/null || { [ -x "$GH_DIR/bin/gh" ] && echo "$GH_DIR/bin/gh"; }; }
GH="$(find_gh)"
if [ -z "$GH" ]; then
  echo "Installation de GitHub CLI (une seule fois)…"
  URL="$(curl -fsSL https://api.github.com/repos/cli/cli/releases/latest | grep -o 'https://[^"]*macOS_universal\.zip' | head -1)"
  [ -n "$URL" ] || { echo "Impossible de trouver GitHub CLI en ligne."; exit 1; }
  TMP="$(mktemp -d)"; curl -fsSL "$URL" -o "$TMP/gh.zip" && ditto -x -k "$TMP/gh.zip" "$TMP/x"
  mkdir -p "$GH_DIR"; ditto "$(dirname "$(dirname "$(find "$TMP/x" -type f -name gh -path '*/bin/*' | head -1)")")" "$GH_DIR"
  rm -rf "$TMP"; GH="$GH_DIR/bin/gh"
fi
export PATH="$(dirname "$GH"):$PATH"
if ! gh auth status >/dev/null 2>&1; then
  echo
  echo "Connexion à GitHub : un code va s'afficher, puis ton navigateur s'ouvre."
  echo "Colle le code, puis connecte-toi comme d'habitude (avec Google)."
  echo
  gh auth login --hostname github.com --git-protocol https --web --scopes repo || exit 1
fi
gh auth setup-git >/dev/null 2>&1
