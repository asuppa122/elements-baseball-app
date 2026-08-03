#!/bin/bash
set -e
TARGET="$HOME/Desktop/elements-baseball-app"

if [ ! -d "$TARGET" ]; then
  echo "Project not found at $TARGET"
  read -n 1 -s -r -p "Press any key to close..."
  exit 1
fi

cd "$TARGET"
echo "Starting Elements Baseball locally..."
echo "Keep this Terminal window open while testing."
echo
npm run dev
