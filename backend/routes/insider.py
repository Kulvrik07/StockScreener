"""
Insider-Transaktionen – SEC Form 4 via Finnhub.
GET /insider/{ticker}
"""
from fastapi import APIRouter
from backend.services import finnhub_service
from cachetools import TTLCache
import threading

router = APIRouter(prefix="/insider", tags=["Insider"])

_cache      = TTLCache(maxsize=200, ttl=3600)   # 1h Cache
_cache_lock = threading.Lock()


@router.get("/{ticker}")
def get_insider(ticker: str):
    key = ticker.upper()
    with _cache_lock:
        cached = _cache.get(key)
    if cached is not None:
        return {"data": cached, "from_cache": True}

    data = finnhub_service.get_insider_transactions(key)
    with _cache_lock:
        _cache[key] = data
    return {"data": data, "from_cache": False}


@router.get("/{ticker}/recommendations")
def get_recommendations(ticker: str):
    key = f"rec:{ticker.upper()}"
    with _cache_lock:
        cached = _cache.get(key)
    if cached is not None:
        return {"data": cached, "from_cache": True}

    data = finnhub_service.get_recommendation_trends(ticker.upper())
    with _cache_lock:
        _cache[key] = data
    return {"data": data, "from_cache": False}
