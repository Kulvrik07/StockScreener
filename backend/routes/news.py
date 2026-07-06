"""
News-Endpoint – Finnhub Company News mit 3-Minuten-Cache.
GET /news/{ticker}?days=7
"""
from fastapi import APIRouter, Query
from backend.services import finnhub_service
from backend.services.cache_service import news_cache, cache_lock

router = APIRouter(prefix="/news", tags=["News"])


@router.get("/{ticker}")
def get_news(ticker: str, days: int = Query(7, ge=1, le=30)):
    ticker = ticker.upper()
    cache_key = f"{ticker}:{days}"
    with cache_lock:
        cached = news_cache.get(cache_key)
    if cached:
        return {"ticker": ticker, "items": cached, "from_cache": True}

    items = finnhub_service.get_news(ticker, days)
    with cache_lock:
        news_cache[cache_key] = items
    return {"ticker": ticker, "items": items, "from_cache": False}
