"""
Fundamentaldaten-Endpoint mit 1-Stunden-Cache.
GET /fundamentals/{ticker}
"""
from fastapi import APIRouter, HTTPException
from backend.services import yfinance_service
from backend.services.cache_service import fundamentals_cache, cache_lock

router = APIRouter(prefix="/fundamentals", tags=["Fundamentals"])


@router.get("/{ticker}")
def get_fundamentals(ticker: str):
    ticker = ticker.upper()
    with cache_lock:
        cached = fundamentals_cache.get(ticker)
    if cached:
        return {**cached, "from_cache": True}

    try:
        data = yfinance_service.get_fundamentals(ticker)
        with cache_lock:
            fundamentals_cache[ticker] = data
        return data
    except Exception as e:
        raise HTTPException(status_code=502, detail=f"Fehler beim Laden der Fundamentaldaten: {e}")
