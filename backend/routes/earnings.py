"""
Earnings-Endpoint – Quartalsergebnisse, Überraschungen, nächster Termin.
GET /earnings/{ticker}          → EPS-History + Beat/Miss
GET /earnings/{ticker}/next     → nächster Earnings-Termin
"""
from fastapi import APIRouter
from backend.services import finnhub_service
from cachetools import TTLCache
import threading

router = APIRouter(prefix="/earnings", tags=["Earnings"])

_cache      = TTLCache(maxsize=200, ttl=3600)   # 1h Cache
_cache_lock = threading.Lock()


@router.get("/{ticker}")
def get_earnings(ticker: str):
    key = f"hist:{ticker.upper()}"
    with _cache_lock:
        cached = _cache.get(key)
    if cached is not None:
        return {"data": cached, "from_cache": True}

    data = finnhub_service.get_earnings(ticker.upper())
    with _cache_lock:
        _cache[key] = data
    return {"data": data, "from_cache": False}


@router.get("/{ticker}/next")
def get_next_earnings(ticker: str):
    key = f"next:{ticker.upper()}"
    with _cache_lock:
        cached = _cache.get(key)
    if cached is not None:
        return {"data": cached, "from_cache": True}

    data = finnhub_service.get_earnings_calendar(ticker.upper())
    with _cache_lock:
        _cache[key] = data
    return {"data": data, "from_cache": False}
