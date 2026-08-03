#!/bin/bash
set -e
TARGET="$HOME/Desktop/elements-baseball-app"

if [ ! -d "$TARGET/.git" ]; then
  echo "Git repository not found at $TARGET/.git"
  read -n 1 -s -r -p "Press any key to close..."
  exit 1
fi

cd "$TARGET"
echo "Current Git status:"
git status

echo
read -r -p "Have you tested both the normal app and /demo locally? Type YES to continue: " CONFIRM
if [ "$CONFIRM" != "YES" ]; then
  echo "Push cancelled."
  read -n 1 -s -r -p "Press any key to close..."
  exit 0
fi

DEFAULT_MSG="Clean project and finalize feedback fixes"
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
