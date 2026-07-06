"""
Quote-Endpoints – aktueller Kurs mit Caching.
Prioriät: Finnhub (Echtzeit, wenn API-Key gesetzt) → Yahoo Finance → gecachte Daten
GET /quote/{ticker}          → Einzelkurs
GET /quote?tickers=...       → Mehrere Kurse (für Watchlist-Übersicht)
GET /search?q=...            → Ticker-Suche (Autocomplete)
"""
from fastapi import APIRouter, Query
from backend.services import yfinance_service, finnhub_service
from backend.services.cache_service import quote_cache, cache_lock
import os

router = APIRouter(prefix="/quote", tags=["Quotes"])

_HAS_FINNHUB = bool(os.getenv("FINNHUB_API_KEY", "").strip() and
                    os.getenv("FINNHUB_API_KEY") != "your_finnhub_api_key_here")


def _fetch_quote(ticker: str) -> dict:
    """
    Holt Quote aus Cache oder APIs.
    Reihenfolge: Finnhub (Echtzeit) → Yahoo Finance → gecachte Daten.
    Bei Rate-Limit werden gecachte Daten mit 'stale'-Flag zurückgegeben.
    """
    with cache_lock:
        cached = quote_cache.get(ticker)

    # Finnhub als Primärquelle wenn API-Key gesetzt
    if _HAS_FINNHUB:
        fh = finnhub_service.get_realtime_quote(ticker)
        if fh and fh.get("price", 0) > 0:
            with cache_lock:
                quote_cache[ticker] = fh
            return fh

    # Yahoo Finance als Fallback
    try:
        data = yfinance_service.get_quote(ticker)
        if data.get("price", 0) > 0:
            with cache_lock:
                quote_cache[ticker] = data
            return data
    except Exception:
        pass

    # Gecachte Daten zurückgeben (auch wenn TTL abgelaufen – stale)
    if cached:
        return {**cached, "from_cache": True, "stale": True}

    return {"ticker": ticker, "error": "Keine Daten verfügbar. Bitte Finnhub API-Key in .env setzen.", "price": 0}


@router.get("/{ticker}")
def get_quote(ticker: str):
    return _fetch_quote(ticker.upper())


@router.get("")
def get_batch_quotes(tickers: str = Query(..., description="Komma-getrennte Ticker")):
    ticker_list = [t.strip().upper() for t in tickers.split(",") if t.strip()]
    return [_fetch_quote(t) for t in ticker_list[:50]]  # max. 50 auf einmal


# Suchroute (separat, außerhalb /quote)
search_router = APIRouter(prefix="/search", tags=["Search"])


@search_router.get("")
def search_tickers(q: str = Query(..., min_length=1)):
    results = yfinance_service.search_ticker(q)
    if not results:
        # Fallback: Finnhub Symbol-Suche
        return finnhub_service.search_symbols(q)
    return results
