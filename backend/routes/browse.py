"""
Browse-Endpoint – Marktübersicht nach Gruppen (Indizes, Sektoren, etc.)
GET /browse          → alle Gruppen
GET /browse/{group}  → einzelne Gruppe
"""
from fastapi import APIRouter, HTTPException
from backend.services import yfinance_service
from backend.services.cache_service import TTLCache, cache_lock
import threading

router = APIRouter(prefix="/browse", tags=["Browse"])

# 5-Minuten-Cache für Browse-Daten
_browse_cache: TTLCache = TTLCache(maxsize=5, ttl=300)


@router.get("")
def get_browse():
    with cache_lock:
        cached = _browse_cache.get("all")
    if cached:
        return {"data": cached, "from_cache": True}

    data = yfinance_service.get_browse_data()
    with cache_lock:
        _browse_cache["all"] = data
    return {"data": data, "from_cache": False}


@router.get("/groups")
def get_groups():
    return {"groups": list(yfinance_service.BROWSE_GROUPS.keys())}
