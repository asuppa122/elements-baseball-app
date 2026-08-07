#!/bin/zsh
set -e
cd "$(dirname "$0")"

if [ -d .git ]; then
  echo "Git metadata already exists. Nothing to restore."
  exit 0
fi

echo "Restoring Git tracking from the published GitHub repository..."
git init
git remote add origin https://github.com/asuppa122/elements-baseball-app.git
git fetch origin main
git reset --mixed origin/main
git branch -M main
git branch --set-upstream-to=origin/main main
echo "Done. Run: git status"
