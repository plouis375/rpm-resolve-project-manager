#!/bin/bash
# Envoie le code sur GitHub (branche courante + main). Connexion par navigateur au premier lancement.
cd "$(dirname "$0")" || exit 1
source tools/github-auth.sh || { read -n 1 -s -r -p "Échec. Appuie sur une touche…"; exit 1; }
BRANCH="$(git branch --show-current)"
git push origin "HEAD:$BRANCH" && git push origin HEAD:main && echo && echo "✅ C'est envoyé sur GitHub." || echo "❌ L'envoi a échoué : copie ce message à Claude."
read -n 1 -s -r -p "Appuie sur une touche pour fermer…"
