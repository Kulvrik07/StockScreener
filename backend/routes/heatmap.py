"""
Heatmap-Endpoint – GICS-Sektor-Performance via SPDR Sector ETFs.
GET /heatmap
"""
from fastapi import APIRouter
from backend.services import yfinance_service
from cachetools import TTLCache
import threading

router = APIRouter(prefix="/heatmap", tags=["Heatmap"])

_cache      = TTLCache(maxsize=5, ttl=300)      # 5min Cache
_cache_lock = threading.Lock()


@router.get("")
def get_heatmap():
    with _cache_lock:
        cached = _cache.get("sectors")
    if cached is not None:
        return {"data": cached, "from_cache": True}

    data = yfinance_service.get_heatmap_data()
    with _cache_lock:
        _cache["sectors"] = data
    return {"data": data, "from_cache": False}
