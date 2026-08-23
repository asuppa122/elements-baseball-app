#!/bin/bash
set -e
TARGET="$(cd "$(dirname "$0")" && pwd)"

if [ ! -d "$TARGET/.git" ]; then
  echo "Git repository not found at $TARGET/.git"
  echo "Run RESTORE_GIT.command once, then retry."
  read -n 1 -s -r -p "Press any key to close..."
  exit 1
fi

cd "$TARGET"
echo "Current Git status:"
git status

echo
read -r -p "Have you tested desktop + mobile and both normal app + /demo locally? Type YES to continue: " CONFIRM
if [ "$CONFIRM" != "YES" ]; then
  echo "Push cancelled."
  read -n 1 -s -r -p "Press any key to close..."
  exit 0
fi

DEFAULT_MSG="Publish v1.3.2 mobile parity and home cleanup"
read -r -p "Commit message [$DEFAULT_MSG]: " MSG
MSG=${MSG:-$DEFAULT_MSG}

git add .
if git diff --cached --quiet; then
  echo "Nothing new to commit."
else
  git commit -m "$MSG"
fi

git push origin main

echo
echo "Push complete. Wait for Vercel to show Ready, then test:"
echo "League: https://elements-baseball.vercel.app"
echo "Demo:   https://elements-baseball.vercel.app/demo"
read -n 1 -s -r -p "Press any key to close..."
echo
