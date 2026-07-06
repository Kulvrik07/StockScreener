#!/bin/bash
# Startet den StockScreener-Server
# Aufruf: ./start.sh

cd "$(dirname "$0")"

# Virtual Environment aktivieren (beim ersten Start anlegen falls nötig)
if [ ! -d "venv" ]; then
  echo "Erstelle Virtual Environment..."
  python3 -m venv venv
  source venv/bin/activate
  pip install -r requirements.txt
else
  source venv/bin/activate
fi

# .env anlegen falls noch nicht vorhanden
if [ ! -f ".env" ]; then
  cp .env.example .env
  echo "HINWEIS: .env-Datei erstellt. Trage deine API-Keys ein (optional, aber empfohlen für News)."
fi

echo ""
echo "StockScreener läuft auf → http://localhost:8000"
echo "API-Dokumentation      → http://localhost:8000/docs"
echo "Beenden mit Ctrl+C"
echo ""

uvicorn backend.main:app --host 0.0.0.0 --port 8000 --reload
