#!/usr/bin/env bash

set -euo pipefail

cd "$(dirname "$0")"
PORT="${PORT:-8123}"

echo "Batch rename tool is starting on 0.0.0.0:${PORT}"
echo "Open from another device with: http://<this-computer-ip>:${PORT}"
if command -v node >/dev/null 2>&1; then
  PORT="$PORT" node server.js
else
  python3 -m http.server "$PORT" --bind 0.0.0.0 --directory .
fi
