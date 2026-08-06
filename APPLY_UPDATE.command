#!/bin/bash
set -e
PACKAGE_DIR="$(cd "$(dirname "$0")" && pwd)"
TARGET="$HOME/Desktop/elements-baseball-app"

echo "Elements Baseball — Apply Complete Update"
echo "Package: $PACKAGE_DIR"
echo "Target:  $TARGET"
echo

if [ ! -d "$TARGET" ]; then
  echo "The target folder does not exist. Creating it now."
  mkdir -p "$TARGET"
fi

# Copy the complete project while preserving machine-specific/local files.
rsync -a --delete \
  --exclude '.git/' \
  --exclude '.env' \
  --exclude 'node_modules/' \
  --exclude 'json.txt' \
  --exclude 'APPLY_UPDATE.command' \
  --exclude 'RUN_LOCAL.command' \
  --exclude 'PUSH_LIVE.command' \
  --exclude 'START_HERE.md' \
  "$PACKAGE_DIR/" "$TARGET/"

echo
if [ ! -f "$TARGET/.env" ]; then
  echo "WARNING: No .env file was found in the target project."
  echo "Create $TARGET/.env using .env.example before running the app."
else
  echo "Preserved existing .env"
fi

if [ -d "$TARGET/.git" ]; then
  echo "Preserved existing Git repository"
else
  echo "WARNING: No .git folder exists in the target project. Git push will not work until the repository is connected."
fi

if [ -f "$TARGET/json.txt" ]; then
  echo "Preserved existing json.txt import source"
fi

echo
echo "Installing packages..."
cd "$TARGET"
rm -rf node_modules
npm install

echo
echo "Update applied successfully."
echo "Next: double-click RUN_LOCAL.command from this package."
read -n 1 -s -r -p "Press any key to close..."
echo
