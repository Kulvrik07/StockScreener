#!/bin/bash
# deploy.sh – Setzt die Render-Backend-URL in netlify.toml
# Aufruf: ./deploy.sh https://stockscreener-api.onrender.com

set -e

if [ -z "$1" ]; then
  echo "Usage: ./deploy.sh https://deine-render-url.onrender.com"
  exit 1
fi

BACKEND_URL="${1%/}"   # trailing slash entfernen

sed -i '' "s|https://DEINE-RENDER-URL.onrender.com|${BACKEND_URL}|g" netlify.toml

echo "✓ netlify.toml aktualisiert mit: ${BACKEND_URL}"
echo ""
echo "Nächste Schritte:"
echo "  1. git add . && git commit -m 'deploy' && git push"
echo "  2. Netlify: Site importieren → Build dir: frontend, kein Build-Command nötig"
echo "  3. Render: render.yaml wird automatisch erkannt"
