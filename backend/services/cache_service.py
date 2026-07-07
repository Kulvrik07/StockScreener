"""
Caching-Service – TTL-basierter In-Memory-Cache via cachetools.
Verhindert, dass Free-Tier API-Limits (z.B. Finnhub: 60 Req/Min) überschritten werden.
"""
from cachetools import TTLCache
import threading

# Kursdaten: 15 Sekunden TTL (Polling-Intervall des Frontends)
quote_cache: TTLCache = TTLCache(maxsize=200, ttl=15)

# Fundamentaldaten: 1 Stunde TTL (ändern sich selten)
fundamentals_cache: TTLCache = TTLCache(maxsize=100, ttl=3600)

# Chart-Daten: 15 Sekunden TTL (Intraday-Polling)
chart_cache: TTLCache = TTLCache(maxsize=100, ttl=15)

# News: 3 Minuten TTL
news_cache: TTLCache = TTLCache(maxsize=100, ttl=180)

# Screener-Ergebnisse: 10 Minuten TTL
screener_cache: TTLCache = TTLCache(maxsize=50, ttl=600)

# Thread-Lock für Cache-Zugriffe
cache_lock = threading.Lock()
