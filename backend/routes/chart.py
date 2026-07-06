"""
Chart-Endpoint – OHLCV-Daten für Candlestick-Chart.
GET /chart/{ticker}?range=1D|1W|1M|1Y|5Y
"""
from fastapi import APIRouter, Query, HTTPException
from backend.services import yfinance_service
from backend.services.cache_service import chart_cache, cache_lock

router = APIRouter(prefix="/chart", tags=["Chart"])

from backend.services.yfinance_service import RANGE_MAP
VALID_RANGES = set(RANGE_MAP.keys())


@router.get("/{ticker}")
def get_chart(ticker: str, range: str = Query("1M", description="1D, 1W, 1M, 1Y, 5Y")):
    ticker = ticker.upper()
    if range not in VALID_RANGES:
        raise HTTPException(status_code=400, detail=f"Ungültiger Zeitrahmen. Erlaubt: {VALID_RANGES}")

    cache_key = f"{ticker}:{range}"
    with cache_lock:
        cached = chart_cache.get(cache_key)
    if cached:
        return {**cached, "from_cache": True}

    try:
        data = yfinance_service.get_chart_data(ticker, range)
        with cache_lock:
            chart_cache[cache_key] = data
        return data
    except Exception as e:
        raise HTTPException(status_code=502, detail=f"Fehler beim Laden der Chart-Daten: {e}")
