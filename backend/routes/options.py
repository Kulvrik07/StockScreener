"""
Options-Endpoint – Put/Call-Ratio, ATM-IV, Open Interest via Yahoo Finance.
GET /options/{ticker}
GET /short/{ticker}    → Short Interest, Float, Days-to-Cover
"""
from fastapi import APIRouter
from backend.services import yfinance_service
from cachetools import TTLCache
import threading

router = APIRouter(tags=["Options"])

_cache      = TTLCache(maxsize=200, ttl=900)    # 15min Cache
_cache_lock = threading.Lock()


@router.get("/options/{ticker}")
def get_options(ticker: str):
    key = f"opt:{ticker.upper()}"
    with _cache_lock:
        cached = _cache.get(key)
    if cached is not None:
        return {**cached, "from_cache": True}

    data = yfinance_service.get_options_summary(ticker.upper())
    with _cache_lock:
        _cache[key] = data
    return {**data, "from_cache": False}


@router.get("/short/{ticker}")
def get_short_interest(ticker: str):
    key = f"short:{ticker.upper()}"
    with _cache_lock:
        cached = _cache.get(key)
    if cached is not None:
        return {**cached, "from_cache": True}

    data = yfinance_service.get_short_interest(ticker.upper())
    with _cache_lock:
        _cache[key] = data
    return {**data, "from_cache": False}


@router.get("/rs/{ticker}")
def get_relative_strength(ticker: str, range: str = "1D"):
    key = f"rs:{ticker.upper()}:{range}"
    with _cache_lock:
        cached = _cache.get(key)
    if cached is not None:
        return {**cached, "from_cache": True}

    data = yfinance_service.get_relative_strength(ticker.upper(), range)
    with _cache_lock:
        _cache[key] = data
    return {**data, "from_cache": False}
