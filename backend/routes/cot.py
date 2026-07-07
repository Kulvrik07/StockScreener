"""
COT-Endpoint – Commitment of Traders Report.
GET /cot/{ticker} → Long/Short-Positionen der Trader-Gruppen
"""
from fastapi import APIRouter
from backend.services import cot_service
from cachetools import TTLCache
import threading

router = APIRouter(tags=["COT"])

_cache      = TTLCache(maxsize=50, ttl=3600)   # 1h Cache (wöchentliche Daten)
_cache_lock = threading.Lock()


@router.get("/cot/{ticker}")
def get_cot(ticker: str):
    key = f"cot:{ticker.upper()}"
    with _cache_lock:
        cached = _cache.get(key)
    if cached is not None:
        return {**cached, "from_cache": True}

    data = cot_service.get_cot_report(ticker.upper())
    with _cache_lock:
        _cache[key] = data
    return {**data, "from_cache": False}
