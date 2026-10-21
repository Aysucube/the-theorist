#!/bin/bash
# Double-click to run The Theorist on this Mac (macOS 11 Big Sur or newer).
# The first time, it gets what the app needs (including a private copy of
# Node.js if this Mac has none), builds the app, starts it and opens it in
# your browser. Later starts take seconds. Keep the Terminal window open while
# you use the app; close it to stop. The steps live in scripts/start-mac.sh.

printf '\033]0;The Theorist\007'
cd "$(dirname "$0")" || exit 1
if [ ! -f package.json ] || [ ! -f scripts/start-mac.sh ]; then
  echo "This launcher must stay inside the app's folder; it can't find the app here:"
  echo "  $PWD"
  echo "To start it from the Desktop or Dock, use an alias of this file instead of a copy."
  read -r -p "Press Return to close."
  exit 1
fi

bash scripts/start-mac.sh
status=$?
# 0: the app stopped normally. 129, 130, 143: the window was closed or Control-C pressed.
case $status in
  0 | 129 | 130 | 143) exit 0 ;;
esac
echo ""
echo "The Theorist stopped because of the problem above. Fix it, or ask for help with it,"
echo "then double-click this file again."
read -r -p "Press Return to close."
exit 1
