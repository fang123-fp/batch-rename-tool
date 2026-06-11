#!/usr/bin/env bash

set -euo pipefail

cd "$(dirname "$0")"
PORT="${PORT:-8123}"

echo "Batch rename tool is starting on 0.0.0.0:${PORT}"
echo "Open from another device with: http://<this-computer-ip>:${PORT}"

if command -v node >/dev/null 2>&1; then
  if [ ! -d node_modules ]; then
    if ! command -v npm >/dev/null 2>&1; then
      echo "npm not found. Please install Node.js 18+ first."
      exit 1
    fi
    echo "First launch detected. Installing dependencies..."
    npm install
  fi

  PORT="$PORT" npm start
  exit 0
fi

echo "Node.js not found. Falling back to static mode only (without local backend extraction)."
python3 -m http.server "$PORT" --bind 0.0.0.0 --directory .
